import type { ChangeEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  ArduPilotConfiguratorRuntime,
  MAX_MOTOR_TEST_DURATION_SECONDS,
  MAX_MOTOR_TEST_THROTTLE_PERCENT,
  advanceModeSwitchExerciseState,
  advanceRcRangeExerciseState,
  createParameterBackup,
  createIdleModeSwitchExerciseState,
  createIdleRcRangeExerciseState,
  createModeSwitchExerciseState,
  createRcRangeExerciseState,
  deriveDraftValuesFromParameterBackup,
  deriveArducopterAirframe,
  deriveParameterDraftEntries,
  deriveModeAssignments,
  deriveModeSwitchEstimate,
  deriveOutputMappingSummary,
  deriveRcAxisObservations,
  evaluateMotorTestEligibility,
  failModeSwitchExerciseState,
  failRcRangeExerciseState,
  formatModeSlotLabel,
  formatRcAxisLabel,
  groupParameterDraftEntries,
  parseParameterBackup,
  serializeParameterBackup,
  summarizeParameterDraftEntries,
  type ConfiguratorSnapshot,
  type MotorTestRequest,
  type ParameterDraftEntry,
  type ParameterDraftStatus,
  type ParameterState,
  type RcRangeExerciseState,
  type ServoOutputKind,
} from '@arduconfig/ardupilot-core'
import {
  arducopterMetadata,
  formatArducopterBatteryFailsafeAction,
  formatArducopterFlightMode,
  formatArducopterThrottleFailsafe,
  type ParameterDefinition,
  type ParameterValueOption,
  type SessionProfile,
} from '@arduconfig/param-metadata'
import { MavlinkSession, MavlinkV2Codec, createArduCopterMockScenario } from '@arduconfig/protocol-mavlink'
import { MockTransport, WebSerialTransport } from '@arduconfig/transport'
import { KeyValueRow, Panel, StatusBadge, buttonStyle } from '@arduconfig/ui-kit'

const actionLabels = {
  'request-parameters': 'Pull Parameters',
  'calibrate-accelerometer': 'Calibrate Accelerometer',
  'calibrate-compass': 'Calibrate Compass',
  'reboot-autopilot': 'Request Reboot'
} as const

type TransportMode = 'demo' | 'web-serial'
type StatusTone = 'neutral' | 'success' | 'warning' | 'danger'
type ModeSwitchExerciseStatus = 'idle' | 'running' | 'passed' | 'failed'

interface RcChannelDisplay {
  channelNumber: number
  role: string
  pwm?: number
  fillPercent: number
  trimPercent: number
  isModeChannel: boolean
}

interface ModeSwitchActivity {
  previousSlot?: number
  currentSlot: number
  previousPwm?: number
  currentPwm: number
  changedAtMs: number
}

interface ModeSwitchExerciseState {
  status: ModeSwitchExerciseStatus
  targetSlots: number[]
  visitedSlots: number[]
  currentTargetSlot?: number
  unexpectedSlots: number[]
  startedAtMs?: number
  completedAtMs?: number
  failureReason?: string
}

interface ParameterNotice {
  tone: StatusTone
  text: string
}

interface ParameterFollowUp {
  requiresReboot: boolean
  changedCount: number
  text: string
}

function createRuntime(mode: TransportMode): ArduPilotConfiguratorRuntime {
  const transport = (() => {
    if (mode === 'web-serial') {
      return new WebSerialTransport('browser-serial', {
        baudRate: 115200
      })
    }

    const scenario = createArduCopterMockScenario()
    return new MockTransport('mock-arducopter', {
      initialFrames: scenario.initialFrames,
      respondToOutbound: scenario.respondToOutbound,
      frameIntervalMs: 110,
      responseDelayMs: 140,
      chunkSize: 7
    })
  })()
  const session = new MavlinkSession(transport, new MavlinkV2Codec())
  return new ArduPilotConfiguratorRuntime(session, arducopterMetadata)
}

function toneForConnection(kind: ConfiguratorSnapshot['connection']['kind']): StatusTone {
  switch (kind) {
    case 'connected':
      return 'success'
    case 'connecting':
      return 'warning'
    case 'error':
      return 'danger'
    default:
      return 'neutral'
  }
}

function toneForSetup(kind: 'attention' | 'in-progress' | 'complete'): 'warning' | 'neutral' | 'success' {
  switch (kind) {
    case 'complete':
      return 'success'
    case 'in-progress':
      return 'neutral'
    default:
      return 'warning'
  }
}

function toneForGuidedAction(
  kind: ConfiguratorSnapshot['guidedActions'][keyof ConfiguratorSnapshot['guidedActions']]['status']
): StatusTone {
  switch (kind) {
    case 'succeeded':
      return 'success'
    case 'failed':
      return 'danger'
    case 'requested':
    case 'running':
      return 'warning'
    default:
      return 'neutral'
  }
}

function formatParameterSync(snapshot: ConfiguratorSnapshot): string {
  const { status, downloaded, total, progress } = snapshot.parameterStats
  if (status === 'idle') {
    return 'Idle'
  }
  if (status === 'awaiting-vehicle') {
    return 'Waiting for heartbeat'
  }
  if (status === 'requesting') {
    return 'Parameter request sent'
  }
  if (progress === null || total === 0) {
    return `${status} (${downloaded} received)`
  }
  return `${Math.round(progress * 100)}% (${downloaded}/${total})`
}

function formatRcLink(snapshot: ConfiguratorSnapshot): string {
  const { rcInput } = snapshot.liveVerification
  if (!rcInput.verified) {
    return 'No live RC telemetry'
  }

  return `${rcInput.channelCount} channels, RSSI ${rcInput.rssi ?? 'unknown'}`
}

function formatBatteryTelemetry(snapshot: ConfiguratorSnapshot): string {
  const { batteryTelemetry } = snapshot.liveVerification
  if (!batteryTelemetry.verified) {
    return 'No live battery telemetry'
  }

  const remaining = batteryTelemetry.remainingPercent !== undefined ? `, ${batteryTelemetry.remainingPercent}%` : ''
  return `${batteryTelemetry.voltageV ?? 'unknown'} V${remaining}`
}

function hasRunningGuidedAction(snapshot: ConfiguratorSnapshot): boolean {
  return (
    Object.values(snapshot.guidedActions).some((state) => state.status === 'requested' || state.status === 'running') ||
    snapshot.motorTest.status === 'requested' ||
    snapshot.motorTest.status === 'running'
  )
}

function canRunGuidedAction(snapshot: ConfiguratorSnapshot, actionId: keyof typeof actionLabels): boolean {
  if (snapshot.connection.kind !== 'connected') {
    return false
  }

  const currentAction = snapshot.guidedActions[actionId]
  const hasBlockingAction = Object.entries(snapshot.guidedActions).some(
    ([candidateActionId, state]) =>
      candidateActionId !== actionId && (state.status === 'requested' || state.status === 'running')
  )

  if (hasBlockingAction || currentAction.status === 'requested' || currentAction.status === 'running') {
    return false
  }

  if (snapshot.motorTest.status === 'requested' || snapshot.motorTest.status === 'running') {
    return false
  }

  if (actionId === 'request-parameters') {
    return true
  }

  return snapshot.vehicle !== undefined && !snapshot.vehicle.armed && snapshot.parameterStats.status === 'complete'
}

function guidedActionButtonLabel(
  actionId: keyof typeof actionLabels,
  snapshot: ConfiguratorSnapshot,
  busyAction: string | undefined
): string {
  if (busyAction === actionId) {
    return actionId === 'request-parameters' ? 'Requesting…' : 'Sending…'
  }

  const state = snapshot.guidedActions[actionId]
  switch (state.status) {
    case 'requested':
    case 'running':
      return actionId === 'request-parameters' ? 'Syncing…' : 'In Progress…'
    case 'succeeded':
      return actionId === 'request-parameters' ? 'Re-sync Parameters' : 'Run Again'
    case 'failed':
      return 'Retry'
    default:
      return actionLabels[actionId]
  }
}

function readParameterValue(snapshot: ConfiguratorSnapshot, paramId: string): number | undefined {
  return snapshot.parameters.find((parameter) => parameter.id === paramId)?.value
}

function readRoundedParameter(snapshot: ConfiguratorSnapshot, paramId: string): number | undefined {
  const value = readParameterValue(snapshot, paramId)
  return value === undefined ? undefined : Math.round(value)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function channelRole(channelNumber: number, modeChannelNumber: number | undefined): string {
  if (modeChannelNumber === channelNumber) {
    return 'Mode switch'
  }

  switch (channelNumber) {
    case 1:
      return 'Roll'
    case 2:
      return 'Pitch'
    case 3:
      return 'Throttle'
    case 4:
      return 'Yaw'
    default:
      return `Aux ${channelNumber - 4}`
  }
}

function getModeChannelNumber(snapshot: ConfiguratorSnapshot): number | undefined {
  const configuredChannel = readRoundedParameter(snapshot, 'FLTMODE_CH') ?? readRoundedParameter(snapshot, 'MODE_CH') ?? 5
  return configuredChannel >= 1 && configuredChannel <= 16 ? configuredChannel : undefined
}

function buildRcChannelDisplays(snapshot: ConfiguratorSnapshot, visibleCount = 8): RcChannelDisplay[] {
  const modeChannelNumber = getModeChannelNumber(snapshot)

  return Array.from({ length: visibleCount }, (_, index) => {
    const channelNumber = index + 1
    const pwm = snapshot.liveVerification.rcInput.channels[index]
    const minimum = readParameterValue(snapshot, `RC${channelNumber}_MIN`) ?? 1000
    const maximum = readParameterValue(snapshot, `RC${channelNumber}_MAX`) ?? 2000
    const trim = readParameterValue(snapshot, `RC${channelNumber}_TRIM`) ?? 1500
    const range = Math.max(maximum - minimum, 1)
    const hasLivePwm = typeof pwm === 'number' && pwm !== 0xffff

    return {
      channelNumber,
      role: channelRole(channelNumber, modeChannelNumber),
      pwm: hasLivePwm ? pwm : undefined,
      fillPercent: hasLivePwm ? clamp01((pwm - minimum) / range) * 100 : 0,
      trimPercent: clamp01((trim - minimum) / range) * 100,
      isModeChannel: modeChannelNumber === channelNumber
    }
  })
}

function formatModeAssignment(value: number | undefined): string {
  return formatArducopterFlightMode(value)
}

function toneForModeSwitchExercise(status: ModeSwitchExerciseStatus): StatusTone {
  switch (status) {
    case 'passed':
      return 'success'
    case 'failed':
      return 'danger'
    case 'running':
      return 'warning'
    default:
      return 'neutral'
  }
}

function toneForMotorTestStatus(status: ConfiguratorSnapshot['motorTest']['status']): StatusTone {
  switch (status) {
    case 'succeeded':
      return 'success'
    case 'failed':
      return 'danger'
    case 'requested':
    case 'running':
      return 'warning'
    default:
      return 'neutral'
  }
}

function toneForParameterDraftStatus(status: ParameterDraftStatus): StatusTone {
  switch (status) {
    case 'staged':
      return 'warning'
    case 'invalid':
      return 'danger'
    default:
      return 'neutral'
  }
}

function toneForOutputKind(kind: ServoOutputKind): StatusTone {
  switch (kind) {
    case 'motor':
      return 'success'
    case 'pass-through':
      return 'warning'
    default:
      return 'neutral'
  }
}

function outputKindLabel(kind: ServoOutputKind): string {
  switch (kind) {
    case 'motor':
      return 'Motor'
    case 'pass-through':
      return 'RC pass-through'
    case 'peripheral':
      return 'Peripheral'
    case 'unused':
      return 'Disabled'
    default:
      return 'Other'
  }
}

function describeOutputAssignment(kind: ServoOutputKind, motorNumber: number | undefined): string {
  switch (kind) {
    case 'motor':
      return motorNumber === undefined ? 'Primary motor output.' : `Assigned as motor ${motorNumber}.`
    case 'pass-through':
      return 'Mirrors an incoming RC channel rather than driving an autonomous output function.'
    case 'peripheral':
      return 'Mapped to a non-motor peripheral, actuator, or accessory function.'
    case 'unused':
      return 'Currently disabled.'
    default:
      return 'Configured with a function outside the curated labels used by this setup surface.'
  }
}

function batteryHealthTone(snapshot: ConfiguratorSnapshot): StatusTone {
  const { batteryTelemetry } = snapshot.liveVerification
  if (!batteryTelemetry.verified) {
    return 'warning'
  }

  const remainingPercent = batteryTelemetry.remainingPercent
  if (remainingPercent !== undefined && remainingPercent <= 15) {
    return 'danger'
  }
  if (remainingPercent !== undefined && remainingPercent <= 30) {
    return 'warning'
  }
  return 'success'
}

function batteryHealthLabel(snapshot: ConfiguratorSnapshot): string {
  const { batteryTelemetry } = snapshot.liveVerification
  if (!batteryTelemetry.verified) {
    return 'Waiting for telemetry'
  }

  const remainingPercent = batteryTelemetry.remainingPercent
  if (remainingPercent !== undefined && remainingPercent <= 15) {
    return 'Low battery'
  }
  if (remainingPercent !== undefined && remainingPercent <= 30) {
    return 'Battery caution'
  }
  return 'Battery healthy'
}

function describeBatteryMonitor(value: number | undefined): string {
  if (value === undefined) {
    return 'Unknown'
  }
  if (value <= 0) {
    return 'Disabled'
  }
  return `Enabled (source ${value})`
}

function formatVoltage(value: number | undefined): string {
  return value === undefined ? 'Unknown' : `${value.toFixed(2)} V`
}

function formatCurrent(value: number | undefined): string {
  return value === undefined ? 'Unknown' : `${value.toFixed(2)} A`
}

function formatRemaining(value: number | undefined): string {
  return value === undefined ? 'Unknown' : `${value}%`
}

function formatParameterValue(value: number | undefined, unit: string | undefined = undefined): string {
  if (value === undefined) {
    return 'Unknown'
  }

  return unit ? `${value} ${unit}` : String(value)
}

function findParameterOption(definition: ParameterDefinition | undefined, value: number | undefined): ParameterValueOption | undefined {
  if (definition === undefined || value === undefined) {
    return undefined
  }

  return definition.options?.find((option) => Object.is(option.value, value))
}

function formatParameterDisplayValue(parameter: ParameterState | undefined, value: number | undefined): string {
  if (parameter === undefined) {
    return formatParameterValue(value)
  }

  const option = findParameterOption(parameter.definition, value)
  if (!option) {
    return formatParameterValue(value, parameter.definition?.unit)
  }

  const rawValue = value === undefined ? '' : ` (${formatParameterValue(value, parameter.definition?.unit)})`
  return `${option.label}${rawValue}`
}

function formatParameterDelta(delta: number | undefined, unit: string | undefined = undefined): string {
  if (delta === undefined || Object.is(delta, 0)) {
    return 'no change'
  }

  const prefix = delta > 0 ? '+' : ''
  return unit ? `${prefix}${delta} ${unit}` : `${prefix}${delta}`
}

function canApplyParameterChanges(snapshot: ConfiguratorSnapshot): boolean {
  return (
    snapshot.connection.kind === 'connected' &&
    snapshot.parameterStats.status === 'complete' &&
    snapshot.vehicle !== undefined &&
    !snapshot.vehicle.armed &&
    !hasRunningGuidedAction(snapshot)
  )
}

function formatParameterRange(definition: ParameterDefinition | undefined): string {
  if (definition?.minimum === undefined && definition?.maximum === undefined) {
    return 'No range metadata yet'
  }

  const minimum = definition.minimum === undefined ? 'unbounded' : String(definition.minimum)
  const maximum = definition.maximum === undefined ? 'unbounded' : String(definition.maximum)
  const unitSuffix = definition.unit ? ` ${definition.unit}` : ''
  return `${minimum} to ${maximum}${unitSuffix}`
}

function formatParameterStep(definition: ParameterDefinition | undefined): string {
  if (definition?.step === undefined) {
    return 'No step metadata yet'
  }

  return definition.unit ? `${definition.step} ${definition.unit}` : String(definition.step)
}

function buildParameterBackupFilename(snapshot: ConfiguratorSnapshot): string {
  const vehicleLabel = snapshot.vehicle?.vehicle?.toLowerCase() ?? 'vehicle'
  const dateLabel = new Date().toISOString().replace(/[:]/g, '-').replace(/\..+$/, '')
  return `arduconfig-${vehicleLabel}-params-${dateLabel}.json`
}

function downloadTextFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function App() {
  const [transportMode, setTransportMode] = useState<TransportMode>('demo')
  const [sessionProfile, setSessionProfile] = useState<SessionProfile>('full-power')
  const runtime = useMemo(() => createRuntime(transportMode), [transportMode])
  const [snapshot, setSnapshot] = useState<ConfiguratorSnapshot>(runtime.getSnapshot())
  const [parameterSearch, setParameterSearch] = useState('')
  const [editedValues, setEditedValues] = useState<Record<string, string>>({})
  const [selectedParameterId, setSelectedParameterId] = useState<string>()
  const [parameterNotice, setParameterNotice] = useState<ParameterNotice>()
  const [parameterFollowUp, setParameterFollowUp] = useState<ParameterFollowUp>()
  const [busyAction, setBusyAction] = useState<string>()
  const [modeSwitchActivity, setModeSwitchActivity] = useState<ModeSwitchActivity>()
  const [modeSwitchExercise, setModeSwitchExercise] = useState<ModeSwitchExerciseState>(createIdleModeSwitchExerciseState)
  const [rcRangeExercise, setRcRangeExercise] = useState<RcRangeExerciseState>(createIdleRcRangeExerciseState)
  const [motorTestOutput, setMotorTestOutput] = useState<number>()
  const [motorTestThrottlePercent, setMotorTestThrottlePercent] = useState(7)
  const [motorTestDurationSeconds, setMotorTestDurationSeconds] = useState(1)
  const [propsRemovedAcknowledged, setPropsRemovedAcknowledged] = useState(false)
  const [testAreaAcknowledged, setTestAreaAcknowledged] = useState(false)
  const parameterBackupInputRef = useRef<HTMLInputElement>(null)
  const previousModeSwitchRef = useRef<{ slot?: number; pwm?: number }>({})
  const webSerialSupported = WebSerialTransport.isSupported()
  const parameterSyncWidth = snapshot.parameterStats.progress === null ? 0 : snapshot.parameterStats.progress * 100
  const rcChannelDisplays = buildRcChannelDisplays(snapshot)
  const airframe = deriveArducopterAirframe(snapshot)
  const modeAssignments = deriveModeAssignments(snapshot)
  const modeSwitchEstimate = deriveModeSwitchEstimate(snapshot)
  const outputMapping = deriveOutputMappingSummary(snapshot)
  const rcAxisObservations = deriveRcAxisObservations(snapshot)
  const batteryMonitor = readRoundedParameter(snapshot, 'BATT_MONITOR')
  const batteryCapacity = readRoundedParameter(snapshot, 'BATT_CAPACITY')
  const batteryFailsafe = readRoundedParameter(snapshot, 'BATT_FS_LOW_ACT')
  const throttleFailsafe = readRoundedParameter(snapshot, 'FS_THR_ENABLE')
  const configuredOutputs = [...outputMapping.motorOutputs, ...outputMapping.configuredAuxOutputs].sort(
    (left, right) => left.channelNumber - right.channelNumber
  )
  const visibleDisabledOutputs = outputMapping.disabledOutputs.slice(0, 6)
  const motorTestRequest: Partial<MotorTestRequest> = {
    outputChannel: motorTestOutput,
    throttlePercent: motorTestThrottlePercent,
    durationSeconds: motorTestDurationSeconds
  }
  const motorTestEligibility = evaluateMotorTestEligibility(snapshot, motorTestRequest)
  const motorTestGuardReasons = [
    ...motorTestEligibility.reasons,
    ...(propsRemovedAcknowledged ? [] : ['Confirm that all propellers are removed before enabling a motor test.']),
    ...(testAreaAcknowledged ? [] : ['Confirm the vehicle is restrained and the test area is clear.'])
  ]
  const canRunMotorTest = motorTestGuardReasons.length === 0
  const selectedMotorTestOutputLabel = motorTestEligibility.selectedOutput
    ? `OUT${motorTestEligibility.selectedOutput.channelNumber}${
        motorTestEligibility.selectedOutput.motorNumber !== undefined ? ` / M${motorTestEligibility.selectedOutput.motorNumber}` : ''
      }`
    : undefined
  const canRunModeSwitchExercise =
    snapshot.connection.kind === 'connected' &&
    snapshot.liveVerification.rcInput.verified &&
    modeAssignments.length >= 2 &&
    modeSwitchEstimate.channelNumber !== undefined
  const canRunRcRangeExercise = snapshot.connection.kind === 'connected' && snapshot.liveVerification.rcInput.verified
  const canApplyDraftParameters = canApplyParameterChanges(snapshot)

  useEffect(() => {
    setSnapshot(runtime.getSnapshot())
    const unsubscribe = runtime.subscribe(setSnapshot)
    return () => {
      unsubscribe()
      runtime.destroy()
    }
  }, [runtime])

  useEffect(() => {
    runtime.setSessionProfile(sessionProfile)
  }, [runtime, sessionProfile])

  useEffect(() => {
    if (snapshot.connection.kind !== 'connected') {
      previousModeSwitchRef.current = {}
      setModeSwitchActivity(undefined)
      setModeSwitchExercise(createIdleModeSwitchExerciseState())
      setRcRangeExercise(createIdleRcRangeExerciseState())
      setPropsRemovedAcknowledged(false)
      setTestAreaAcknowledged(false)
      setParameterNotice(undefined)
      setParameterFollowUp(undefined)
      return
    }

    if (modeSwitchEstimate.estimatedSlot === undefined || modeSwitchEstimate.pwm === undefined) {
      return
    }

    const previous = previousModeSwitchRef.current
    const slotChanged = previous.slot !== undefined && previous.slot !== modeSwitchEstimate.estimatedSlot
    const pwmChanged = previous.pwm !== undefined && Math.abs(previous.pwm - modeSwitchEstimate.pwm) >= 40

    if (slotChanged || pwmChanged) {
      setModeSwitchActivity({
        previousSlot: previous.slot,
        currentSlot: modeSwitchEstimate.estimatedSlot,
        previousPwm: previous.pwm,
        currentPwm: modeSwitchEstimate.pwm,
        changedAtMs: Date.now()
      })
    }

    previousModeSwitchRef.current = {
      slot: modeSwitchEstimate.estimatedSlot,
      pwm: modeSwitchEstimate.pwm
    }
  }, [snapshot.connection.kind, modeSwitchEstimate.estimatedSlot, modeSwitchEstimate.pwm])

  useEffect(() => {
    if (outputMapping.motorOutputs.length === 0) {
      setMotorTestOutput(undefined)
      return
    }

    setMotorTestOutput((current) => {
      if (current !== undefined && outputMapping.motorOutputs.some((output) => output.channelNumber === current)) {
        return current
      }

      return outputMapping.motorOutputs[0]?.channelNumber
    })
  }, [outputMapping.motorOutputs])

  useEffect(() => {
    if (modeSwitchExercise.status !== 'running') {
      return
    }

    setModeSwitchExercise((current) => advanceModeSwitchExerciseState(current, snapshot))
  }, [modeSwitchExercise.status, snapshot])

  useEffect(() => {
    if (rcRangeExercise.status !== 'running') {
      return
    }

    setRcRangeExercise((current) => advanceRcRangeExerciseState(current, snapshot))
  }, [rcRangeExercise.status, snapshot])

  const filteredParameters = snapshot.parameters.filter((parameter) => {
    const query = parameterSearch.trim().toLowerCase()
    if (!query) {
      return true
    }

    return parameter.id.toLowerCase().includes(query) || parameter.definition?.label.toLowerCase().includes(query)
  })
  const parameterDraftEntries = useMemo(
    () => deriveParameterDraftEntries(snapshot.parameters, editedValues),
    [editedValues, snapshot.parameters]
  )
  const parameterDraftById = useMemo(
    () => new Map(parameterDraftEntries.map((entry) => [entry.id, entry])),
    [parameterDraftEntries]
  )
  const parameterDraftSummary = useMemo(() => summarizeParameterDraftEntries(parameterDraftEntries), [parameterDraftEntries])
  const stagedParameterDrafts = useMemo(
    () => parameterDraftEntries.filter((entry) => entry.status === 'staged'),
    [parameterDraftEntries]
  )
  const invalidParameterDrafts = useMemo(
    () => parameterDraftEntries.filter((entry) => entry.status === 'invalid'),
    [parameterDraftEntries]
  )
  const stagedParameterGroups = useMemo(
    () => groupParameterDraftEntries(parameterDraftEntries, ['staged']),
    [parameterDraftEntries]
  )
  const invalidParameterGroups = useMemo(
    () => groupParameterDraftEntries(parameterDraftEntries, ['invalid']),
    [parameterDraftEntries]
  )
  const rebootRequiredDrafts = useMemo(
    () => stagedParameterDrafts.filter((draft) => draft.definition?.rebootRequired),
    [stagedParameterDrafts]
  )
  const canApplyAllDraftParameters =
    canApplyDraftParameters && stagedParameterDrafts.length > 0 && invalidParameterDrafts.length === 0
  const selectedParameter =
    filteredParameters.find((parameter) => parameter.id === selectedParameterId) ?? filteredParameters[0]
  const selectedParameterDraft = selectedParameter ? parameterDraftById.get(selectedParameter.id) : undefined
  const selectedParameterOption = selectedParameterDraft?.nextValue !== undefined
    ? findParameterOption(selectedParameter?.definition, selectedParameterDraft.nextValue)
    : findParameterOption(selectedParameter?.definition, selectedParameter?.value)
  const recentModeSwitchChange = modeSwitchActivity && Date.now() - modeSwitchActivity.changedAtMs < 3000
  const modeSwitchExerciseProgress =
    modeSwitchExercise.targetSlots.length === 0 ? 0 : (modeSwitchExercise.visitedSlots.length / modeSwitchExercise.targetSlots.length) * 100
  const rcRangeExerciseCompletedCount = Object.values(rcRangeExercise.axisProgress).filter((axis) => axis.completed).length
  const rcRangeExerciseProgress =
    rcRangeExercise.targetAxes.length === 0 ? 0 : (rcRangeExerciseCompletedCount / rcRangeExercise.targetAxes.length) * 100

  useEffect(() => {
    if (filteredParameters.length === 0) {
      setSelectedParameterId(undefined)
      return
    }

    if (!selectedParameterId || !filteredParameters.some((parameter) => parameter.id === selectedParameterId)) {
      setSelectedParameterId(filteredParameters[0]?.id)
    }
  }, [filteredParameters, selectedParameterId])

  async function handleConnect(): Promise<void> {
    setBusyAction('connect')
    try {
      await runtime.connect()
      await runtime.requestParameterList()
    } finally {
      setBusyAction(undefined)
    }
  }

  async function handleDisconnect(): Promise<void> {
    setBusyAction('disconnect')
    try {
      await runtime.disconnect()
    } finally {
      setBusyAction(undefined)
    }
  }

  async function handleGuidedAction(actionId: keyof typeof actionLabels): Promise<void> {
    setBusyAction(actionId)
    try {
      await runtime.runGuidedAction(actionId)
    } finally {
      setBusyAction(undefined)
    }
  }

  function handleDiscardParameterDraft(paramId: string): void {
    setEditedValues((existing) => {
      if (!(paramId in existing)) {
        return existing
      }

      const next = { ...existing }
      delete next[paramId]
      return next
    })
  }

  function handleDiscardAllParameterDrafts(): void {
    setEditedValues({})
    setParameterNotice({
      tone: 'neutral',
      text: 'Cleared all local parameter drafts.'
    })
  }

  async function handleApplyParameterDraft(draft: ParameterDraftEntry): Promise<void> {
    if (!canApplyDraftParameters || draft.status !== 'staged' || draft.nextValue === undefined) {
      return
    }

    setBusyAction(`param:${draft.id}`)
    try {
      const result = await runtime.setParameter(draft.id, draft.nextValue)
      handleDiscardParameterDraft(draft.id)
      const confirmedParameter = snapshot.parameters.find((parameter) => parameter.id === result.paramId)
      const requiresReboot = Boolean(draft.definition?.rebootRequired)
      setParameterNotice({
        tone: 'success',
        text: `Verified ${result.paramId} = ${formatParameterDisplayValue(confirmedParameter, result.confirmedValue)}.`
      })
      setParameterFollowUp({
        requiresReboot,
        changedCount: 1,
        text: requiresReboot
          ? 'This applied change is marked as reboot-required. Request a reboot, then pull parameters again before continuing guided setup.'
          : 'Pull parameters again if you want a freshly confirmed post-write snapshot.'
      })
    } catch (error) {
      setParameterNotice({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Parameter write failed.'
      })
    } finally {
      setBusyAction(undefined)
    }
  }

  async function handleApplyAllParameterDrafts(): Promise<void> {
    if (!canApplyAllDraftParameters) {
      return
    }

    const appliedParamIds: string[] = []
    setBusyAction('param:apply-all')
    try {
      const applyingRebootRequiredCount = stagedParameterDrafts.filter((draft) => draft.definition?.rebootRequired).length
      const result = await runtime.setParameters(
        stagedParameterDrafts
          .filter((draft) => draft.nextValue !== undefined)
          .map((draft) => ({
            paramId: draft.id,
            paramValue: draft.nextValue as number
          }))
      )
      appliedParamIds.push(...result.applied.map((entry) => entry.paramId))
      setParameterNotice({
        tone: 'success',
        text:
          result.applied.length === 0
            ? 'No staged parameter changes needed to be written.'
            : `Verified ${result.applied.length} staged parameter change(s).`
      })
      setParameterFollowUp({
        requiresReboot: applyingRebootRequiredCount > 0,
        changedCount: result.applied.length,
        text:
          applyingRebootRequiredCount > 0
            ? `${applyingRebootRequiredCount} applied change(s) are marked as reboot-required. Request a reboot, then refresh parameters before continuing setup.`
            : 'Refresh parameters after the batch write if you want a clean post-write snapshot.'
      })
    } catch (error) {
      setParameterNotice({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Batch parameter write failed.'
      })
    } finally {
      if (appliedParamIds.length > 0) {
        setEditedValues((existing) => {
          const next = { ...existing }
          appliedParamIds.forEach((paramId) => {
            delete next[paramId]
          })
          return next
        })
      }

      setBusyAction(undefined)
    }
  }

  function handleExportParameterBackup(): void {
    const backup = createParameterBackup(snapshot)
    downloadTextFile(buildParameterBackupFilename(snapshot), serializeParameterBackup(backup))
    setParameterNotice({
      tone: 'success',
      text: `Exported ${backup.parameterCount} parameters to a local backup file.`
    })
  }

  function handleOpenParameterBackup(): void {
    parameterBackupInputRef.current?.click()
  }

  async function handleImportParameterBackup(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const backup = parseParameterBackup(await file.text())
      const restore = deriveDraftValuesFromParameterBackup(snapshot.parameters, backup)
      setEditedValues(restore.draftValues)
      setParameterFollowUp(undefined)
      setParameterNotice({
        tone: restore.changedCount > 0 ? 'warning' : 'neutral',
        text:
          restore.changedCount > 0
            ? `Loaded ${restore.changedCount} differing parameter value(s) from backup.${restore.unknownParameterIds.length > 0 ? ` Ignored ${restore.unknownParameterIds.length} unknown parameter(s).` : ''}`
            : `Backup matched the current synced values.${restore.unknownParameterIds.length > 0 ? ` Ignored ${restore.unknownParameterIds.length} unknown parameter(s).` : ''}`
      })
    } catch (error) {
      setParameterNotice({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Failed to import parameter backup.'
      })
    } finally {
      event.target.value = ''
    }
  }

  async function handleRunMotorTest(): Promise<void> {
    if (!canRunMotorTest || motorTestOutput === undefined) {
      return
    }

    setBusyAction('motor-test')
    try {
      await runtime.runMotorTest({
        outputChannel: motorTestOutput,
        throttlePercent: motorTestThrottlePercent,
        durationSeconds: motorTestDurationSeconds
      })
    } finally {
      setBusyAction(undefined)
    }
  }

  function handleStartModeSwitchExercise(): void {
    if (!canRunModeSwitchExercise) {
      return
    }

    setModeSwitchExercise(createModeSwitchExerciseState(snapshot))
  }

  function handleResetModeSwitchExercise(): void {
    setModeSwitchExercise(createIdleModeSwitchExerciseState())
  }

  function handleFailModeSwitchExercise(): void {
    setModeSwitchExercise((current) =>
      current.status === 'running'
        ? failModeSwitchExerciseState(current, `Did not observe ${formatModeSlotLabel(snapshot, current.currentTargetSlot)} on the live mode channel.`)
        : current
    )
  }

  function handleStartRcRangeExercise(): void {
    if (!canRunRcRangeExercise) {
      return
    }

    setRcRangeExercise(createRcRangeExerciseState(snapshot))
  }

  function handleResetRcRangeExercise(): void {
    setRcRangeExercise(createIdleRcRangeExerciseState())
  }

  function handleFailRcRangeExercise(): void {
    setRcRangeExercise((current) =>
      current.status === 'running'
        ? failRcRangeExerciseState(
            current,
            `Did not complete ${current.currentTargetAxis ? formatRcAxisLabel(current.currentTargetAxis) : 'the current'} stick exercise target.`
          )
        : current
    )
  }

  const modeSwitchExerciseSummary = (() => {
    if (modeSwitchExercise.status === 'passed') {
      return `Observed all configured switch positions on CH${modeSwitchEstimate.channelNumber ?? '?'}.`
    }
    if (modeSwitchExercise.status === 'failed') {
      return modeSwitchExercise.failureReason ?? 'Mode switch exercise failed.'
    }
    if (modeSwitchExercise.status === 'running') {
      return modeSwitchExercise.currentTargetSlot === undefined
        ? 'All configured switch positions have been observed.'
        : `Move the switch to ${formatModeSlotLabel(snapshot, modeSwitchExercise.currentTargetSlot)}.`
    }
    if (!snapshot.liveVerification.rcInput.verified) {
      return 'Waiting for live RC telemetry before starting the switch exercise.'
    }
    if (modeAssignments.length < 2) {
      return 'At least two configured FLTMODEn positions are needed for a useful switch exercise.'
    }
    return 'Start the switch exercise to walk through the configured flight-mode positions.'
  })()

  const modeSwitchExerciseInstructions =
    modeSwitchExercise.status === 'running'
      ? [
          `Current position: ${formatModeSlotLabel(snapshot, modeSwitchEstimate.estimatedSlot)}.`,
          `Visited ${modeSwitchExercise.visitedSlots.length} of ${modeSwitchExercise.targetSlots.length} configured positions.`
        ]
      : modeSwitchExercise.status === 'passed'
        ? ['The mode channel moved through every configured position that the app expected to see.']
        : modeSwitchExercise.status === 'failed'
          ? ['Check the radio mapping, `FLTMODE_CH`/`MODE_CH`, and switch endpoints, then run the exercise again.']
          : ['The app will watch the live mode channel and mark each configured position as it is observed.']

  const rcRangeExerciseSummary = (() => {
    if (rcRangeExercise.status === 'passed') {
      return 'Observed the expected min/max stick travel, plus center return on roll, pitch, and yaw.'
    }
    if (rcRangeExercise.status === 'failed') {
      return rcRangeExercise.failureReason ?? 'Stick range exercise failed.'
    }
    if (rcRangeExercise.status === 'running') {
      return rcRangeExercise.currentTargetAxis === undefined
        ? 'All primary stick axes have satisfied their expected movement checks.'
        : `Move ${formatRcAxisLabel(rcRangeExercise.currentTargetAxis)} through its required range.`
    }
    if (!snapshot.liveVerification.rcInput.verified) {
      return 'Waiting for live RC telemetry before starting the stick range exercise.'
    }
    return 'Run the stick range exercise to verify low/high travel on roll, pitch, yaw, and throttle.'
  })()

  const rcRangeExerciseInstructions =
    rcRangeExercise.status === 'running'
      ? [
          rcRangeExercise.currentTargetAxis === 'throttle'
            ? 'Move throttle fully low, then fully high.'
            : `Move ${formatRcAxisLabel(rcRangeExercise.currentTargetAxis ?? 'roll')} fully low, fully high, then back to center.`,
          `Completed ${rcRangeExerciseCompletedCount} of ${rcRangeExercise.targetAxes.length} axis checks.`
        ]
      : rcRangeExercise.status === 'passed'
        ? ['All four primary control axes were exercised against live receiver input.']
        : rcRangeExercise.status === 'failed'
          ? ['Check receiver mapping, stick endpoints, trims, and calibration values, then rerun the exercise.']
          : ['The app will watch each primary control axis and mark it complete after the expected movements are observed.']

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Prototype Vertical Slice</p>
          <h1>ArduConfigurator</h1>
          <p className="lede">
            Shared ArduCopter runtime first, guided setup first, browser and desktop adapters later.
          </p>
        </div>
        <StatusBadge tone={toneForConnection(snapshot.connection.kind)}>{snapshot.connection.kind}</StatusBadge>
      </header>

      <section className="grid two-up">
        <Panel
          title="Connection"
          subtitle="The runtime waits for heartbeat, tracks sync progress, and can switch between full-power and USB-bench setup semantics."
          actions={
            <div className="button-row">
              <select
                value={transportMode}
                onChange={(event) => setTransportMode(event.target.value as TransportMode)}
                disabled={busyAction !== undefined || snapshot.connection.kind === 'connected'}
              >
                <option value="demo">Demo transport</option>
                <option value="web-serial" disabled={!webSerialSupported}>
                  Browser serial{webSerialSupported ? '' : ' (unsupported)'}
                </option>
              </select>
              <select value={sessionProfile} onChange={(event) => setSessionProfile(event.target.value as SessionProfile)}>
                <option value="full-power">Full power</option>
                <option value="usb-bench">USB bench</option>
              </select>
              <button
                style={buttonStyle('primary')}
                onClick={() => void handleConnect()}
                disabled={busyAction !== undefined || snapshot.connection.kind === 'connected'}
              >
                Connect
              </button>
              <button
                style={buttonStyle()}
                onClick={() => void handleDisconnect()}
                disabled={busyAction !== undefined || snapshot.connection.kind !== 'connected'}
              >
                Disconnect
              </button>
            </div>
          }
        >
          <KeyValueRow
            label="Transport"
            value={transportMode === 'demo' ? 'Demo MAVLink stream' : webSerialSupported ? 'Browser Web Serial' : 'Unavailable'}
          />
          <KeyValueRow label="Session" value={snapshot.sessionProfile === 'usb-bench' ? 'USB Bench' : 'Full Power'} />
          <KeyValueRow label="Vehicle" value={snapshot.vehicle?.vehicle ?? 'Waiting for heartbeat'} />
          <KeyValueRow label="Firmware" value={snapshot.vehicle?.firmware ?? 'Unknown'} />
          <KeyValueRow label="Mode" value={snapshot.vehicle?.flightMode ?? 'Unknown'} />
          <KeyValueRow label="RC Link" value={formatRcLink(snapshot)} />
          <KeyValueRow label="Battery" value={formatBatteryTelemetry(snapshot)} />
          <KeyValueRow label="Sync" value={formatParameterSync(snapshot)} />
          <KeyValueRow label="Duplicate Frames" value={String(snapshot.parameterStats.duplicateFrames)} />
          <div className="sync-meter" aria-hidden="true">
            <div
              className="sync-meter__fill"
              style={{ width: `${parameterSyncWidth}%` }}
            />
          </div>
        </Panel>

        <Panel title="Status Log" subtitle="Recent autopilot status text from the shared runtime.">
          <div className="status-log">
            {snapshot.statusTexts.length === 0 ? <p>No status text received yet.</p> : null}
            {snapshot.statusTexts.map((entry) => (
              <div key={`${entry.severity}-${entry.text}`} className={`status-entry ${entry.severity}`}>
                <strong>{entry.severity}</strong>
                <span>{entry.text}</span>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid two-up">
        <Panel
          title="Live RC Inputs"
          subtitle="Receiver telemetry, calibrated channel bars, and an estimated flight-mode switch position from the current RC stream."
        >
          <div className="telemetry-stack">
            <div className="telemetry-header">
              <div>
                <h3>Receiver status</h3>
                <p>
                  {snapshot.liveVerification.rcInput.verified
                    ? `Showing the first ${rcChannelDisplays.length} channels from a ${snapshot.liveVerification.rcInput.channelCount}-channel stream.`
                    : 'Waiting for live receiver telemetry before promoting radio and mode setup.'}
                </p>
              </div>
              <StatusBadge tone={snapshot.liveVerification.rcInput.verified ? 'success' : 'warning'}>
                {snapshot.liveVerification.rcInput.verified ? `${snapshot.liveVerification.rcInput.channelCount} channels live` : 'No RC telemetry'}
              </StatusBadge>
            </div>

            <div className="mode-estimate-card">
              <div className="mode-estimate-card__header">
                <strong>Flight mode switch</strong>
                <StatusBadge tone={recentModeSwitchChange ? 'warning' : modeSwitchEstimate.estimatedSlot !== undefined ? 'success' : 'neutral'}>
                  {recentModeSwitchChange ? 'Switch moved' : modeSwitchEstimate.estimatedSlot !== undefined ? 'Stable' : 'Waiting'}
                </StatusBadge>
              </div>
              <p>
                {modeSwitchEstimate.channelNumber === undefined
                  ? 'Mode channel is not configured yet.'
                  : modeSwitchEstimate.pwm === undefined
                    ? `Configured for CH${modeSwitchEstimate.channelNumber}, waiting for that channel to stream.`
                    : `Estimated slot ${modeSwitchEstimate.estimatedSlot} on CH${modeSwitchEstimate.channelNumber} at ${modeSwitchEstimate.pwm} us.`}
              </p>
              <small>
                {modeSwitchEstimate.configuredParamId && modeSwitchEstimate.configuredValue !== undefined
                  ? `${modeSwitchEstimate.configuredParamId} = ${formatModeAssignment(modeSwitchEstimate.configuredValue)}`
                  : `Heartbeat mode: ${snapshot.vehicle?.flightMode ?? 'Unknown'}`}
              </small>
              {modeSwitchActivity ? (
                <small>
                  {modeSwitchActivity.previousSlot !== undefined && modeSwitchActivity.previousSlot !== modeSwitchActivity.currentSlot
                    ? `Last slot change: ${formatModeAssignment(readRoundedParameter(snapshot, `FLTMODE${modeSwitchActivity.previousSlot}`))} -> ${formatModeAssignment(
                        readRoundedParameter(snapshot, `FLTMODE${modeSwitchActivity.currentSlot}`)
                      )}`
                    : `Last switch movement: ${modeSwitchActivity.previousPwm ?? modeSwitchActivity.currentPwm} us -> ${modeSwitchActivity.currentPwm} us`}
                </small>
              ) : null}
            </div>

            <div className="switch-exercise-card">
              <div className="switch-exercise-card__header">
                <div>
                  <strong>Switch exercise</strong>
                  <p>{modeSwitchExerciseSummary}</p>
                </div>
                <StatusBadge tone={toneForModeSwitchExercise(modeSwitchExercise.status)}>{modeSwitchExercise.status}</StatusBadge>
              </div>

              <div className="switch-exercise-progress" aria-hidden="true">
                <div className="switch-exercise-progress__fill" style={{ width: `${modeSwitchExerciseProgress}%` }} />
              </div>

              <div className="config-pills">
                {(modeSwitchExercise.status === 'idle' ? modeAssignments.map((assignment) => assignment.slot) : modeSwitchExercise.targetSlots).map((slot) => {
                  const visited = modeSwitchExercise.visitedSlots.includes(slot)
                  const isTarget = modeSwitchExercise.status === 'running' && modeSwitchExercise.currentTargetSlot === slot
                  const classes = [visited ? 'is-complete' : undefined, isTarget ? 'is-target' : undefined]
                    .filter((value): value is string => value !== undefined)
                    .join(' ')

                  return (
                    <span key={slot} className={classes || undefined}>
                      {formatModeSlotLabel(snapshot, slot)}
                    </span>
                  )
                })}
              </div>

              {modeSwitchExercise.unexpectedSlots.length > 0 ? (
                <p className="switch-exercise-warning">
                  Observed unconfigured positions: {modeSwitchExercise.unexpectedSlots.map((slot) => `slot ${slot}`).join(', ')}
                </p>
              ) : null}

              <ol className="switch-exercise-instructions">
                {modeSwitchExerciseInstructions.map((instruction) => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ol>

              <div className="switch-exercise-controls">
                <button
                  style={buttonStyle('primary')}
                  onClick={handleStartModeSwitchExercise}
                  disabled={!canRunModeSwitchExercise || modeSwitchExercise.status === 'running'}
                >
                  {modeSwitchExercise.status === 'passed' ? 'Run Again' : 'Start Exercise'}
                </button>
                <button
                  style={buttonStyle()}
                  onClick={handleResetModeSwitchExercise}
                  disabled={modeSwitchExercise.status === 'idle'}
                >
                  Reset
                </button>
                <button
                  style={buttonStyle('secondary')}
                  onClick={handleFailModeSwitchExercise}
                  disabled={modeSwitchExercise.status !== 'running'}
                >
                  Mark Failed
                </button>
              </div>
            </div>

            <div className="rc-range-card">
              <div className="switch-exercise-card__header">
                <div>
                  <strong>Stick range exercise</strong>
                  <p>{rcRangeExerciseSummary}</p>
                </div>
                <StatusBadge tone={toneForModeSwitchExercise(rcRangeExercise.status)}>{rcRangeExercise.status}</StatusBadge>
              </div>

              <div className="switch-exercise-progress" aria-hidden="true">
                <div className="switch-exercise-progress__fill" style={{ width: `${rcRangeExerciseProgress}%` }} />
              </div>

              <div className="rc-range-axis-grid">
                {rcAxisObservations.map((axis) => {
                  const progress = rcRangeExercise.axisProgress[axis.axisId]
                  return (
                    <article
                      key={axis.axisId}
                      className={`rc-range-axis-card${rcRangeExercise.currentTargetAxis === axis.axisId ? ' rc-range-axis-card--target' : ''}${progress.completed ? ' rc-range-axis-card--complete' : ''}`}
                    >
                      <div className="rc-range-axis-card__header">
                        <strong>{axis.label}</strong>
                        <span>CH{axis.channelNumber}</span>
                      </div>
                      <p>{axis.pwm !== undefined ? `${axis.pwm} us live` : 'No live data'}</p>
                      <div className="config-pills">
                        <span className={progress.lowObserved ? 'is-complete' : undefined}>Low</span>
                        <span className={progress.highObserved ? 'is-complete' : undefined}>High</span>
                        {axis.axisId !== 'throttle' ? (
                          <span className={progress.centeredObserved ? 'is-complete' : undefined}>Center</span>
                        ) : null}
                      </div>
                    </article>
                  )
                })}
              </div>

              <ol className="switch-exercise-instructions">
                {rcRangeExerciseInstructions.map((instruction) => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ol>

              <div className="switch-exercise-controls">
                <button
                  style={buttonStyle('primary')}
                  onClick={handleStartRcRangeExercise}
                  disabled={!canRunRcRangeExercise || rcRangeExercise.status === 'running'}
                >
                  {rcRangeExercise.status === 'passed' ? 'Run Again' : 'Start Exercise'}
                </button>
                <button
                  style={buttonStyle()}
                  onClick={handleResetRcRangeExercise}
                  disabled={rcRangeExercise.status === 'idle'}
                >
                  Reset
                </button>
                <button
                  style={buttonStyle('secondary')}
                  onClick={handleFailRcRangeExercise}
                  disabled={rcRangeExercise.status !== 'running'}
                >
                  Mark Failed
                </button>
              </div>
            </div>

            {modeAssignments.length > 0 ? (
              <div className="config-pills">
                {modeAssignments.map((assignment) => (
                  <span
                    key={assignment.slot}
                    className={assignment.slot === modeSwitchEstimate.estimatedSlot ? 'is-active' : undefined}
                  >
                    FLTMODE{assignment.slot} = {formatModeAssignment(assignment.value)}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="rc-channel-grid">
              {rcChannelDisplays.map((channel) => (
                  <article
                    key={channel.channelNumber}
                    className={`rc-channel-card${channel.isModeChannel ? ' rc-channel-card--mode' : ''}${channel.isModeChannel && recentModeSwitchChange ? ' rc-channel-card--active' : ''}`}
                  >
                  <div className="rc-channel-card__header">
                    <strong>CH{channel.channelNumber}</strong>
                    <span>{channel.role}</span>
                  </div>
                  <div className="rc-bar" aria-hidden="true">
                    <div className="rc-bar__trim" style={{ left: `${channel.trimPercent}%` }} />
                    <div className="rc-bar__fill" style={{ width: `${channel.fillPercent}%` }} />
                  </div>
                  <div className="rc-channel-card__footer">
                    <span>{channel.pwm !== undefined ? `${channel.pwm} us` : 'No data'}</span>
                    <span>{channel.isModeChannel ? 'Mode channel' : 'Live input'}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </Panel>

        <Panel
          title="Power & Failsafe"
          subtitle="Live battery telemetry plus the key power- and failsafe-related settings already present on the vehicle."
        >
          <div className="telemetry-stack">
            <div className="telemetry-header">
              <div>
                <h3>Battery monitor</h3>
                <p>
                  {snapshot.liveVerification.batteryTelemetry.verified
                    ? 'Live power telemetry is present, so battery and failsafe setup can move beyond parameter-only review.'
                    : 'Battery monitor telemetry has not been verified yet. Keep the power train and battery sensing path active.'}
                </p>
              </div>
              <StatusBadge tone={batteryHealthTone(snapshot)}>{batteryHealthLabel(snapshot)}</StatusBadge>
            </div>

            <div className="telemetry-metric-grid">
              <article className="telemetry-metric-card">
                <span>Voltage</span>
                <strong>{formatVoltage(snapshot.liveVerification.batteryTelemetry.voltageV)}</strong>
              </article>
              <article className="telemetry-metric-card">
                <span>Current</span>
                <strong>{formatCurrent(snapshot.liveVerification.batteryTelemetry.currentA)}</strong>
              </article>
              <article className="telemetry-metric-card">
                <span>Remaining</span>
                <strong>{formatRemaining(snapshot.liveVerification.batteryTelemetry.remainingPercent)}</strong>
              </article>
              <article className="telemetry-metric-card">
                <span>Capacity</span>
                <strong>{batteryCapacity !== undefined ? `${batteryCapacity} mAh` : 'Unknown'}</strong>
              </article>
            </div>

            <div className="config-pills">
              <span>Battery monitor: {describeBatteryMonitor(batteryMonitor)}</span>
              <span>Low battery action: {formatArducopterBatteryFailsafeAction(batteryFailsafe)}</span>
              <span>Throttle failsafe: {formatArducopterThrottleFailsafe(throttleFailsafe)}</span>
            </div>

            <p className="telemetry-note">
              The setup checklist now treats these sections as truly complete only when both the configuration values and the live telemetry agree.
            </p>
          </div>
        </Panel>
      </section>

      <Panel
        title="Airframe & Outputs"
        subtitle="Review frame geometry and primary motor/peripheral assignments before any output testing. This surface stays read-only for now."
      >
        <div className="telemetry-stack">
          <div className="telemetry-metric-grid">
            <article className="telemetry-metric-card">
              <span>Frame class</span>
              <strong>{airframe.frameClassLabel}</strong>
            </article>
            <article className="telemetry-metric-card">
              <span>Frame type</span>
              <strong>{airframe.frameTypeLabel}</strong>
            </article>
            <article className="telemetry-metric-card">
              <span>Expected motors</span>
              <strong>{airframe.expectedMotorCount ?? 'Specialized'}</strong>
            </article>
            <article className="telemetry-metric-card">
              <span>Mapped motors</span>
              <strong>
                {outputMapping.motorOutputs.length}
                {airframe.expectedMotorCount !== undefined ? ` / ${airframe.expectedMotorCount}` : ''}
              </strong>
            </article>
          </div>

          <div className="config-pills">
            <span>{outputMapping.configuredAuxOutputs.length} configured non-motor outputs</span>
            <span>{outputMapping.disabledOutputs.length} disabled outputs in SERVO1-16</span>
          </div>

          <div className="output-card-grid">
            {configuredOutputs.length > 0 ? (
              configuredOutputs.map((output) => (
                <article key={output.paramId} className={`output-card output-card--${output.kind}`}>
                  <div className="output-card__header">
                    <div>
                      <strong>OUT{output.channelNumber}</strong>
                      <small>
                        {output.paramId} = {output.functionValue}
                      </small>
                    </div>
                    <StatusBadge tone={toneForOutputKind(output.kind)}>{outputKindLabel(output.kind)}</StatusBadge>
                  </div>
                  <p>{output.functionLabel}</p>
                  <small>{describeOutputAssignment(output.kind, output.motorNumber)}</small>
                </article>
              ))
            ) : (
              <div className="output-card output-card--other">
                <div className="output-card__header">
                  <div>
                    <strong>No configured outputs</strong>
                    <small>Inspecting SERVO1-16</small>
                  </div>
                  <StatusBadge tone="warning">Review needed</StatusBadge>
                </div>
                <p>No motor or peripheral outputs were detected in the inspected SERVO function range.</p>
                <small>Pull parameters again or verify that the controller exposes SERVOx_FUNCTION parameters on this target.</small>
              </div>
            )}
          </div>

          <ul className="output-note-list">
            {outputMapping.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>

          <div className="motor-test-card">
            <div className="switch-exercise-card__header">
              <div>
                <strong>Motor test guardrails</strong>
                <p>{snapshot.motorTest.summary}</p>
              </div>
              <StatusBadge tone={toneForMotorTestStatus(snapshot.motorTest.status)}>{snapshot.motorTest.status}</StatusBadge>
            </div>

            <div className="motor-test-grid">
              <label>
                <span>Output</span>
                <select
                  value={motorTestOutput ?? ''}
                  onChange={(event) => setMotorTestOutput(event.target.value ? Number(event.target.value) : undefined)}
                  disabled={busyAction !== undefined || snapshot.motorTest.status === 'requested' || snapshot.motorTest.status === 'running'}
                >
                  <option value="">Select output</option>
                  {outputMapping.motorOutputs.map((output) => (
                    <option key={output.paramId} value={output.channelNumber}>
                      OUT{output.channelNumber}
                      {output.motorNumber !== undefined ? ` / M${output.motorNumber}` : ''} · {output.functionLabel}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Throttle %</span>
                <input
                  type="number"
                  min={1}
                  max={MAX_MOTOR_TEST_THROTTLE_PERCENT}
                  step={1}
                  value={motorTestThrottlePercent}
                  onChange={(event) => setMotorTestThrottlePercent(Number(event.target.value))}
                  disabled={busyAction !== undefined || snapshot.motorTest.status === 'requested' || snapshot.motorTest.status === 'running'}
                />
              </label>

              <label>
                <span>Duration (s)</span>
                <input
                  type="number"
                  min={0.1}
                  max={MAX_MOTOR_TEST_DURATION_SECONDS}
                  step={0.1}
                  value={motorTestDurationSeconds}
                  onChange={(event) => setMotorTestDurationSeconds(Number(event.target.value))}
                  disabled={busyAction !== undefined || snapshot.motorTest.status === 'requested' || snapshot.motorTest.status === 'running'}
                />
              </label>
            </div>

            <div className="config-pills">
              <span>Single output only</span>
              <span>Board order only</span>
              <span>Auto-stop after {motorTestDurationSeconds.toFixed(1)}s</span>
              <span>Throttle capped at {MAX_MOTOR_TEST_THROTTLE_PERCENT}%</span>
              {selectedMotorTestOutputLabel ? <span>Selected: {selectedMotorTestOutputLabel}</span> : null}
            </div>

            <div className="motor-test-acknowledgments">
              <label>
                <input
                  type="checkbox"
                  checked={propsRemovedAcknowledged}
                  onChange={(event) => setPropsRemovedAcknowledged(event.target.checked)}
                  disabled={busyAction !== undefined || snapshot.motorTest.status === 'requested' || snapshot.motorTest.status === 'running'}
                />
                <span>All propellers are removed.</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={testAreaAcknowledged}
                  onChange={(event) => setTestAreaAcknowledged(event.target.checked)}
                  disabled={busyAction !== undefined || snapshot.motorTest.status === 'requested' || snapshot.motorTest.status === 'running'}
                />
                <span>The vehicle is restrained and the test area is clear.</span>
              </label>
            </div>

            <ul className="output-note-list">
              {motorTestGuardReasons.length > 0
                ? motorTestGuardReasons.map((reason) => <li key={reason}>{reason}</li>)
                : snapshot.motorTest.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}
            </ul>

            <div className="switch-exercise-controls">
              <button
                style={buttonStyle('secondary')}
                onClick={() => void handleRunMotorTest()}
                disabled={!canRunMotorTest || busyAction !== undefined || snapshot.motorTest.status === 'requested' || snapshot.motorTest.status === 'running'}
              >
                {busyAction === 'motor-test' ? 'Sending…' : 'Run Motor Test'}
              </button>
            </div>
          </div>

          {visibleDisabledOutputs.length > 0 ? (
            <p className="telemetry-note">
              Disabled outputs in view: {visibleDisabledOutputs.map((output) => `OUT${output.channelNumber}`).join(', ')}
              {outputMapping.disabledOutputs.length > visibleDisabledOutputs.length
                ? `, plus ${outputMapping.disabledOutputs.length - visibleDisabledOutputs.length} more.`
                : '.'}
            </p>
          ) : null}
        </div>
      </Panel>

      <Panel
        title="Guided Setup"
        subtitle="Initial alpha priority: setup and calibration workflows for ArduCopter. Live operator prompts now stay attached to the action that generated them."
      >
        <div className="setup-grid">
          {snapshot.setupSections.map((section) => (
            <article key={section.id} className="setup-card">
              <div className="setup-card-header">
                <div>
                  <h3>{section.title}</h3>
                  <p>{section.description}</p>
                </div>
                <StatusBadge tone={toneForSetup(section.status)}>{section.status}</StatusBadge>
              </div>

              {section.notes.length > 0 ? (
                <ul className="notes">
                  {section.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : (
                <p className="success-copy">No outstanding blockers in the current mock state.</p>
              )}

              {section.parameters.length > 0 ? (
                <div className="parameter-pills">
                  {section.parameters.map((parameter) => (
                    <span key={parameter.id}>
                      {parameter.id}: {parameter.value}
                    </span>
                  ))}
                </div>
              ) : null}

              {section.actions.length > 0 ? (
                <div className="guided-actions">
                  {section.actions.map((action) => {
                    const actionState = snapshot.guidedActions[action]

                    return (
                      <div key={action} className="guided-action-card">
                        <div className="guided-action-header">
                          <strong>{actionLabels[action]}</strong>
                          <StatusBadge tone={toneForGuidedAction(actionState.status)}>{actionState.status}</StatusBadge>
                        </div>
                        <p className="guided-action-summary">{actionState.summary}</p>

                        {actionState.instructions.length > 0 ? (
                          <ol className="guided-instructions">
                            {actionState.instructions.map((instruction) => (
                              <li key={instruction}>{instruction}</li>
                            ))}
                          </ol>
                        ) : null}

                        {actionState.statusTexts.length > 0 ? (
                          <div className="guided-action-log">
                            {actionState.statusTexts.map((text) => (
                              <span key={text}>{text}</span>
                            ))}
                          </div>
                        ) : null}

                        <button
                          style={buttonStyle(action === 'request-parameters' ? 'primary' : 'secondary')}
                          onClick={() => void handleGuidedAction(action)}
                          disabled={busyAction !== undefined || !canRunGuidedAction(snapshot, action)}
                        >
                          {guidedActionButtonLabel(action, snapshot, busyAction)}
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </Panel>

      <Panel title="Parameter Editor" subtitle="Stage changes locally, review the diff, then apply them through the shared runtime.">
        <div className="parameter-toolbar">
          <input
            value={parameterSearch}
            onChange={(event) => setParameterSearch(event.target.value)}
            placeholder="Search parameters"
          />
        </div>

        <div className="parameter-review">
          <input
            ref={parameterBackupInputRef}
            className="parameter-backup-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void handleImportParameterBackup(event)}
          />
          <div className="parameter-review__summary">
            <div className="parameter-review__stats">
              <StatusBadge tone={parameterDraftSummary.stagedCount > 0 ? 'warning' : 'neutral'}>
                {parameterDraftSummary.stagedCount} staged
              </StatusBadge>
              <StatusBadge tone={parameterDraftSummary.invalidCount > 0 ? 'danger' : 'neutral'}>
                {parameterDraftSummary.invalidCount} invalid
              </StatusBadge>
              <p className="parameter-review__hint">
                {parameterDraftSummary.totalEntries === 0
                  ? 'Edit values below to stage local drafts before writing anything to the controller.'
                  : parameterDraftSummary.invalidCount > 0
                    ? 'Fix or discard invalid drafts before applying the full staged set.'
                    : parameterDraftSummary.stagedCount > 0
                      ? 'Review the staged diff below, then apply individual rows or the whole set.'
                      : 'Current drafts match the live controller values and will not write anything.'}
              </p>
            </div>

            <div className="button-row">
              <button style={buttonStyle()} onClick={handleExportParameterBackup} disabled={busyAction !== undefined || snapshot.parameters.length === 0}>
                Export Backup
              </button>
              <button
                style={buttonStyle()}
                onClick={handleOpenParameterBackup}
                disabled={busyAction !== undefined || snapshot.parameters.length === 0}
              >
                Import Backup
              </button>
              <button
                style={buttonStyle('primary')}
                onClick={() => void handleApplyAllParameterDrafts()}
                disabled={busyAction !== undefined || !canApplyAllDraftParameters}
              >
                {busyAction === 'param:apply-all' ? 'Applying…' : `Apply All (${stagedParameterDrafts.length})`}
              </button>
              <button
                style={buttonStyle()}
                onClick={handleDiscardAllParameterDrafts}
                disabled={busyAction !== undefined || parameterDraftSummary.totalEntries === 0}
              >
                Discard All
              </button>
            </div>
          </div>

          {parameterNotice ? (
            <div className="parameter-review__notice">
              <StatusBadge tone={parameterNotice.tone}>{parameterNotice.tone}</StatusBadge>
              <p>{parameterNotice.text}</p>
            </div>
          ) : null}

          {rebootRequiredDrafts.length > 0 ? (
            <div className="parameter-follow-up parameter-follow-up--warning">
              <StatusBadge tone="warning">reboot</StatusBadge>
              <p>
                {rebootRequiredDrafts.length} staged change(s) are marked as reboot-required if applied. Plan to reboot and refresh the
                parameter snapshot before continuing setup.
              </p>
            </div>
          ) : null}

          {parameterFollowUp ? (
            <div className="parameter-follow-up">
              <StatusBadge tone={parameterFollowUp.requiresReboot ? 'warning' : 'neutral'}>
                {parameterFollowUp.requiresReboot ? 'follow-up' : 'refresh'}
              </StatusBadge>
              <p>{parameterFollowUp.text}</p>
              <div className="button-row">
                {parameterFollowUp.requiresReboot ? (
                  <button
                    style={buttonStyle()}
                    onClick={() => void handleGuidedAction('reboot-autopilot')}
                    disabled={busyAction !== undefined || !canRunGuidedAction(snapshot, 'reboot-autopilot')}
                  >
                    Request Reboot
                  </button>
                ) : null}
                <button
                  style={buttonStyle()}
                  onClick={() => void handleGuidedAction('request-parameters')}
                  disabled={busyAction !== undefined || !canRunGuidedAction(snapshot, 'request-parameters')}
                >
                  Pull Parameters
                </button>
                <button style={buttonStyle()} onClick={() => setParameterFollowUp(undefined)} disabled={busyAction !== undefined}>
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}

          {parameterDraftSummary.stagedCategories.length > 0 ? (
            <small className="parameter-review__hint">
              Categories in review: {parameterDraftSummary.stagedCategories.join(', ')}
            </small>
          ) : null}

          {stagedParameterGroups.length > 0 ? (
            <div className="parameter-diff-grid">
              {stagedParameterGroups.map((group) => (
                <section key={group.category} className="parameter-diff-group">
                  <header>
                    <strong>{group.category}</strong>
                    <span>{group.entries.length} staged</span>
                  </header>

                  {group.entries.map((draft) => (
                    <div key={draft.id} className="parameter-diff-item">
                      <span>
                        <strong>{draft.id}</strong>
                        <small>{draft.label}</small>
                      </span>
                      <span className="parameter-diff-values">
                        {formatParameterValue(draft.currentValue, draft.definition?.unit)} to{' '}
                        {formatParameterValue(draft.nextValue, draft.definition?.unit)}
                      </span>
                      <span className="parameter-diff-delta">{formatParameterDelta(draft.delta, draft.definition?.unit)}</span>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          ) : null}

          {invalidParameterGroups.length > 0 ? (
            <div className="parameter-diff-grid parameter-diff-grid--invalid">
              {invalidParameterGroups.map((group) => (
                <section key={`invalid:${group.category}`} className="parameter-diff-group parameter-diff-group--invalid">
                  <header>
                    <strong>{group.category}</strong>
                    <span>{group.entries.length} invalid</span>
                  </header>

                  {group.entries.map((draft) => (
                    <div key={draft.id} className="parameter-diff-item">
                      <span>
                        <strong>{draft.id}</strong>
                        <small>{draft.label}</small>
                      </span>
                      <span className="parameter-diff-values">{draft.rawValue || 'Empty draft'}</span>
                      <span className="parameter-diff-delta">{draft.reason ?? 'Invalid value'}</span>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          ) : null}
        </div>

        {selectedParameter ? (
          <div className="parameter-details">
            <div className="parameter-details__header">
              <div>
                <h3>{selectedParameter.definition?.label ?? selectedParameter.id}</h3>
                <p>{selectedParameter.definition?.description ?? 'Metadata coverage for this parameter is still limited.'}</p>
              </div>
              <StatusBadge tone={toneForParameterDraftStatus(selectedParameterDraft?.status ?? 'unchanged')}>
                {selectedParameterDraft?.status ?? 'unchanged'}
              </StatusBadge>
            </div>

            <div className="parameter-details__grid">
              <div className="parameter-details__metric">
                <small>Current value</small>
                <strong>{formatParameterDisplayValue(selectedParameter, selectedParameter.value)}</strong>
              </div>
              <div className="parameter-details__metric">
                <small>Staged value</small>
                <strong>
                  {selectedParameterDraft?.nextValue !== undefined
                    ? formatParameterDisplayValue(selectedParameter, selectedParameterDraft.nextValue)
                    : 'No staged change'}
                </strong>
              </div>
              <div className="parameter-details__metric">
                <small>Category</small>
                <strong>{selectedParameter.definition?.category ?? 'uncategorized'}</strong>
              </div>
              <div className="parameter-details__metric">
                <small>Range</small>
                <strong>{formatParameterRange(selectedParameter.definition)}</strong>
              </div>
              <div className="parameter-details__metric">
                <small>Step</small>
                <strong>{formatParameterStep(selectedParameter.definition)}</strong>
              </div>
              <div className="parameter-details__metric">
                <small>Reboot</small>
                <strong>{selectedParameter.definition?.rebootRequired ? 'Required after change' : 'No reboot note available'}</strong>
              </div>
            </div>

            {selectedParameterOption ? (
              <p className="parameter-details__option">
                Active enum label: <strong>{selectedParameterOption.label}</strong>
                {selectedParameterOption.description ? `, ${selectedParameterOption.description}` : ''}
              </p>
            ) : null}

            {selectedParameter.definition?.notes && selectedParameter.definition.notes.length > 0 ? (
              <ul className="notes">
                {selectedParameter.definition.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}

            {selectedParameter.definition?.options && selectedParameter.definition.options.length > 0 ? (
              <div className="parameter-option-list">
                {selectedParameter.definition.options.slice(0, 12).map((option) => (
                  <span key={`${selectedParameter.id}:${option.value}`}>
                    {option.value}: {option.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="parameter-table">
          <div className="parameter-row parameter-row--header">
            <span>Parameter</span>
            <span>Description</span>
            <span>Current</span>
            <span>Draft</span>
            <span>Actions</span>
          </div>
          {filteredParameters.map((parameter) => {
            const draft = parameterDraftById.get(parameter.id)
            const rowClassName =
              draft?.status === 'staged'
                ? 'parameter-row parameter-row--staged'
                : draft?.status === 'invalid'
                  ? 'parameter-row parameter-row--invalid'
                  : 'parameter-row'

            return (
              <div
                key={parameter.id}
                className={`${rowClassName}${selectedParameter?.id === parameter.id ? ' parameter-row--selected' : ''}`}
                onClick={() => setSelectedParameterId(parameter.id)}
              >
                <span>
                  <strong>{parameter.id}</strong>
                  <small>{parameter.definition?.category ?? 'uncategorized'}</small>
                </span>
                <span>
                  {parameter.definition?.description ?? 'Metadata to be expanded from upstream ArduPilot bundles.'}
                  {parameter.definition?.unit ? <small>Unit: {parameter.definition.unit}</small> : null}
                </span>
                <span className="parameter-row__value">
                  <strong>{formatParameterValue(parameter.value, parameter.definition?.unit)}</strong>
                  <small>
                    {draft?.status === 'staged'
                      ? `Delta ${formatParameterDelta(draft.delta, parameter.definition?.unit)}`
                      : 'Live controller value'}
                  </small>
                </span>
                <span className="parameter-row__value">
                  <input
                    type="number"
                    value={editedValues[parameter.id] ?? String(parameter.value)}
                    onChange={(event) =>
                      setEditedValues((existing) => ({
                        ...existing,
                        [parameter.id]: event.target.value
                      }))
                    }
                  />
                  <small
                    className={`parameter-status-copy${
                      draft ? ` parameter-status-copy--${draft.status}` : ' parameter-status-copy--idle'
                    }`}
                  >
                    {draft?.status === 'staged'
                      ? `Staged ${formatParameterValue(draft.nextValue, parameter.definition?.unit)}`
                      : draft?.reason ?? 'Edit locally to stage a parameter change.'}
                  </small>
                </span>
                <span>
                  <div className="parameter-actions">
                    {draft?.status === 'staged' ? (
                      <>
                        <button
                          style={buttonStyle('primary')}
                          onClick={() => void handleApplyParameterDraft(draft)}
                          disabled={busyAction !== undefined || !canApplyDraftParameters}
                        >
                          {busyAction === `param:${parameter.id}` ? 'Writing…' : 'Apply'}
                        </button>
                        <button
                          style={buttonStyle()}
                          onClick={() => handleDiscardParameterDraft(parameter.id)}
                          disabled={busyAction !== undefined}
                        >
                          Discard
                        </button>
                      </>
                    ) : draft ? (
                      <>
                        <StatusBadge tone={toneForParameterDraftStatus(draft.status)}>{draft.status}</StatusBadge>
                        <button
                          style={buttonStyle()}
                          onClick={() => handleDiscardParameterDraft(parameter.id)}
                          disabled={busyAction !== undefined}
                        >
                          Clear
                        </button>
                      </>
                    ) : (
                      <span className="parameter-actions__idle">No local draft</span>
                    )}
                  </div>
                </span>
              </div>
            )
          })}
        </div>
        {filteredParameters.length === 0 ? <p className="parameter-empty-state">No parameters match the current filter.</p> : null}
      </Panel>
    </main>
  )
}
