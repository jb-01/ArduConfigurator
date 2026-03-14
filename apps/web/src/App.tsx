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
  deriveEscSetupSummary,
  deriveDraftValuesFromParameterBackup,
  deriveArducopterAirframe,
  deriveParameterDraftEntries,
  deriveModeAssignments,
  deriveModeSwitchEstimate,
  deriveOutputMappingSummary,
  deriveRcAxisChannelMap,
  deriveRcAxisObservations,
  deriveRcMapDraftValues,
  detectDominantRcChannelChange,
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
  type RcAxisId,
  type RcAxisObservation,
  type RcRangeExerciseState,
  type ServoOutputKind,
} from '@arduconfig/ardupilot-core'
import {
  arducopterMetadata,
  formatArducopterBatteryFailsafeAction,
  formatArducopterFlightMode,
  formatArducopterThrottleFailsafe,
  normalizeFirmwareMetadata,
  type AppViewId,
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

interface AppViewDescriptor {
  id: AppViewId
  label: string
  description: string
  badge: string
  tone: StatusTone
}

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

type OrientationExerciseStatus = 'idle' | 'running' | 'passed' | 'failed'
type OrientationExerciseStepId = 'level' | 'pitch-forward' | 'roll-right'
type RcMappingStatus = 'idle' | 'running' | 'ready' | 'failed'
type RcCalibrationStatus = 'idle' | 'capturing' | 'ready' | 'failed'
type MotorVerificationStatus = 'idle' | 'running' | 'passed' | 'failed'

interface OrientationExerciseState {
  status: OrientationExerciseStatus
  targetSteps: OrientationExerciseStepId[]
  completedSteps: OrientationExerciseStepId[]
  currentTargetStep?: OrientationExerciseStepId
  startedAtMs?: number
  completedAtMs?: number
  failureReason?: string
}

interface RcCalibrationAxisCapture {
  axisId: RcAxisId
  label: string
  channelNumber: number
  observedMin?: number
  observedMax?: number
  trimPwm?: number
  lowObserved: boolean
  highObserved: boolean
  centeredObserved: boolean
}

interface RcCalibrationSessionState {
  status: RcCalibrationStatus
  captures: Record<RcAxisId, RcCalibrationAxisCapture>
  startedAtMs?: number
  completedAtMs?: number
  failureReason?: string
}

interface RcMappingAxisCapture {
  axisId: RcAxisId
  label: string
  detectedChannelNumber?: number
  deltaUs?: number
}

interface RcMappingSessionState {
  status: RcMappingStatus
  baselineChannels: number[]
  captures: Record<RcAxisId, RcMappingAxisCapture>
  currentTargetAxis?: RcAxisId
  startedAtMs?: number
  completedAtMs?: number
  failureReason?: string
}

interface MotorVerificationState {
  status: MotorVerificationStatus
  targetOutputs: number[]
  verifiedOutputs: number[]
  currentOutputChannel?: number
  currentMotorNumber?: number
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
  refreshRequired: boolean
  changedCount: number
  text: string
}

interface SetupFlowCriterion {
  label: string
  met: boolean
}

type SetupFlowSequenceState = 'locked' | 'current' | 'complete'

interface SetupConfirmationRecord {
  signature: string
  confirmedAtMs: number
}

interface SetupFlowActionDescriptor {
  kind:
    | 'guided'
    | 'scroll'
    | 'mode-switch-exercise'
    | 'rc-range-exercise'
    | 'rc-mapping-exercise'
    | 'confirm-step'
    | 'clear-confirmation'
  label: string
  tone?: 'primary' | 'secondary'
  disabled?: boolean
  actionId?: keyof typeof actionLabels
  panelId?: string
  sectionId?: string
}

interface SetupFlowSectionDescriptor {
  id: string
  title: string
  status: 'attention' | 'in-progress' | 'complete'
  sequenceState: SetupFlowSequenceState
  summary: string
  detail: string
  evidence: string[]
  criteria: SetupFlowCriterion[]
  criteriaMetCount: number
  panelId: string
  panelLabel: string
  actions: SetupFlowActionDescriptor[]
  blockingReason?: string
}

interface SetupFlowFollowUpDescriptor {
  title: string
  tone: StatusTone
  text: string
  actions: SetupFlowActionDescriptor[]
}

const ORIENTATION_EXERCISE_ORDER: OrientationExerciseStepId[] = ['level', 'pitch-forward', 'roll-right']
const ORIENTATION_LABELS: Record<number, string> = {
  0: 'No rotation',
  2: 'Yaw 90',
  4: 'Yaw 180',
  6: 'Yaw 270',
  8: 'Roll 180',
  24: 'Pitch 90',
  25: 'Pitch 270',
  100: 'Custom 1',
  101: 'Custom 2'
}
const RC_CALIBRATION_AXIS_ORDER: RcAxisId[] = ['roll', 'pitch', 'throttle', 'yaw']

function formatConfirmationTime(confirmedAtMs: number | undefined): string {
  if (confirmedAtMs === undefined) {
    return 'Not confirmed'
  }

  return new Date(confirmedAtMs).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  })
}

function formatOrientationLabel(value: number | undefined): string {
  if (value === undefined) {
    return 'Unknown orientation'
  }

  return ORIENTATION_LABELS[value] ?? `Orientation ${value}`
}

function formatDegrees(value: number | undefined): string {
  return value === undefined ? 'Unknown' : `${value.toFixed(1)}°`
}

function createIdleOrientationExerciseState(): OrientationExerciseState {
  return {
    status: 'idle',
    targetSteps: [],
    completedSteps: []
  }
}

function createOrientationExerciseState(snapshot: ConfiguratorSnapshot): OrientationExerciseState {
  if (!snapshot.liveVerification.attitudeTelemetry.verified) {
    return failOrientationExerciseState(createIdleOrientationExerciseState(), 'Live attitude telemetry is not available yet.')
  }

  return {
    status: 'running',
    targetSteps: ORIENTATION_EXERCISE_ORDER,
    completedSteps: [],
    currentTargetStep: ORIENTATION_EXERCISE_ORDER[0],
    startedAtMs: Date.now()
  }
}

function advanceOrientationExerciseState(
  current: OrientationExerciseState,
  snapshot: ConfiguratorSnapshot
): OrientationExerciseState {
  if (current.status !== 'running') {
    return current
  }

  if (!snapshot.liveVerification.attitudeTelemetry.verified) {
    return failOrientationExerciseState(current, 'Lost live attitude telemetry before the orientation exercise completed.')
  }

  const currentTargetStep = current.currentTargetStep
  if (!currentTargetStep) {
    return current
  }

  if (!orientationStepSatisfied(currentTargetStep, snapshot)) {
    return current
  }

  const completedSteps = [...current.completedSteps, currentTargetStep]
  const nextStep = current.targetSteps.find((step) => !completedSteps.includes(step))

  if (!nextStep) {
    return {
      ...current,
      status: 'passed',
      completedSteps,
      currentTargetStep: undefined,
      completedAtMs: Date.now(),
      failureReason: undefined
    }
  }

  return {
    ...current,
    completedSteps,
    currentTargetStep: nextStep
  }
}

function failOrientationExerciseState(current: OrientationExerciseState, reason: string): OrientationExerciseState {
  return {
    ...current,
    status: 'failed',
    failureReason: reason,
    completedAtMs: Date.now()
  }
}

function orientationStepLabel(step: OrientationExerciseStepId): string {
  switch (step) {
    case 'level':
      return 'Level'
    case 'pitch-forward':
      return 'Pitch forward'
    case 'roll-right':
      return 'Roll right'
    default:
      return step
  }
}

function orientationStepInstruction(step: OrientationExerciseStepId | undefined): string {
  switch (step) {
    case 'level':
      return 'Hold the vehicle level and motionless until both roll and pitch are near zero.'
    case 'pitch-forward':
      return 'Tilt the nose forward. Pitch should move negative if board orientation is correct.'
    case 'roll-right':
      return 'Roll the vehicle to the right. Roll should move positive if board orientation is correct.'
    default:
      return 'Start the orientation exercise to verify live horizon behavior.'
  }
}

function orientationStepSatisfied(step: OrientationExerciseStepId, snapshot: ConfiguratorSnapshot): boolean {
  const rollDeg = snapshot.liveVerification.attitudeTelemetry.rollDeg
  const pitchDeg = snapshot.liveVerification.attitudeTelemetry.pitchDeg
  if (rollDeg === undefined || pitchDeg === undefined) {
    return false
  }

  switch (step) {
    case 'level':
      return Math.abs(rollDeg) <= 8 && Math.abs(pitchDeg) <= 8
    case 'pitch-forward':
      return pitchDeg <= -12
    case 'roll-right':
      return rollDeg >= 12
    default:
      return false
  }
}

function createIdleMotorVerificationState(): MotorVerificationState {
  return {
    status: 'idle',
    targetOutputs: [],
    verifiedOutputs: []
  }
}

function createIdleRcCalibrationSessionState(observations: RcAxisObservation[] = []): RcCalibrationSessionState {
  const observationMap = new Map(observations.map((observation) => [observation.axisId, observation]))
  return {
    status: 'idle',
    captures: Object.fromEntries(
      RC_CALIBRATION_AXIS_ORDER.map((axisId) => {
        const observation = observationMap.get(axisId)
        return [
          axisId,
          {
            axisId,
            label: observation?.label ?? formatRcAxisLabel(axisId),
            channelNumber: observation?.channelNumber ?? 0,
            observedMin: observation?.pwm,
            observedMax: observation?.pwm,
            trimPwm: axisId === 'throttle' ? undefined : observation?.pwm,
            lowObserved: observation?.lowDetected ?? false,
            highObserved: observation?.highDetected ?? false,
            centeredObserved: axisId === 'throttle' ? false : observation?.centeredDetected ?? false
          }
        ]
      })
    ) as Record<RcAxisId, RcCalibrationAxisCapture>
  }
}

function createIdleRcMappingSessionState(): RcMappingSessionState {
  return {
    status: 'idle',
    baselineChannels: [],
    captures: Object.fromEntries(
      RC_CALIBRATION_AXIS_ORDER.map((axisId) => [
        axisId,
        {
          axisId,
          label: formatRcAxisLabel(axisId)
        }
      ])
    ) as Record<RcAxisId, RcMappingAxisCapture>
  }
}

function createRcMappingSessionState(snapshot: ConfiguratorSnapshot): RcMappingSessionState {
  if (!snapshot.liveVerification.rcInput.verified) {
    return failRcMappingSessionState(createIdleRcMappingSessionState(), 'Live RC telemetry is not available yet.')
  }

  return {
    ...createIdleRcMappingSessionState(),
    status: 'running',
    baselineChannels: [...snapshot.liveVerification.rcInput.channels],
    currentTargetAxis: RC_CALIBRATION_AXIS_ORDER[0],
    startedAtMs: Date.now()
  }
}

function failRcMappingSessionState(current: RcMappingSessionState, reason: string): RcMappingSessionState {
  return {
    ...current,
    status: 'failed',
    failureReason: reason,
    completedAtMs: Date.now()
  }
}

function rcCalibrationCaptureComplete(capture: RcCalibrationAxisCapture): boolean {
  return capture.axisId === 'throttle'
    ? capture.lowObserved && capture.highObserved
    : capture.lowObserved && capture.highObserved && capture.centeredObserved && capture.trimPwm !== undefined
}

function escCalibrationPathLabel(path: ReturnType<typeof deriveEscSetupSummary>['calibrationPath']): string {
  switch (path) {
    case 'analog-calibration':
      return 'Analog ESC calibration'
    case 'digital-protocol':
      return 'Digital protocol review'
    default:
      return 'Manual ESC review'
  }
}

function escCalibrationInstructions(escSetup: ReturnType<typeof deriveEscSetupSummary>): string[] {
  switch (escSetup.calibrationPath) {
    case 'analog-calibration':
      return [
        'Remove props and disconnect USB before running the offline all-at-once ESC calibration flow.',
        'After calibration, reconnect, review the PWM range, and rerun motor-order verification before first flight.'
      ]
    case 'digital-protocol':
      return [
        'DShot-style protocols do not use PWM endpoint calibration.',
        'Review MOT_PWM_TYPE and the spin thresholds, then confirm the digital-protocol setup before flight.'
      ]
    default:
      return [
        'Review the ESC protocol and motor-range values manually because the current snapshot does not match a known path.',
        'Only sign off after the protocol, PWM range, and spin thresholds make sense for this build.'
      ]
  }
}

function panelAnchorForSetupSection(sectionId: string): { panelId: string; panelLabel: string } {
  switch (sectionId) {
    case 'link':
      return { panelId: 'setup-panel-link', panelLabel: 'Connection' }
    case 'airframe':
    case 'outputs':
      return { panelId: 'setup-panel-outputs', panelLabel: 'Airframe & Outputs' }
    case 'accelerometer':
    case 'compass':
      return { panelId: 'setup-panel-guided', panelLabel: 'Guided Setup' }
    case 'radio':
    case 'modes':
      return { panelId: 'setup-panel-rc', panelLabel: 'Live RC Inputs' }
    case 'failsafe':
    case 'power':
      return { panelId: 'setup-panel-power', panelLabel: 'Power & Failsafe' }
    default:
      return { panelId: 'setup-panel-guided', panelLabel: 'Guided Setup' }
  }
}

function appViewForPanel(panelId: string): AppViewId {
  switch (panelId) {
    case 'setup-panel-link':
    case 'setup-panel-guided':
      return 'setup'
    case 'setup-panel-rc':
      return 'receiver'
    case 'setup-panel-outputs':
      return 'outputs'
    case 'setup-panel-power':
      return 'power'
    default:
      return 'parameters'
  }
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

function toneForSetupSequence(state: SetupFlowSequenceState): StatusTone {
  switch (state) {
    case 'complete':
      return 'success'
    case 'current':
      return 'warning'
    default:
      return 'neutral'
  }
}

function deriveSetupStatusFromCriteria(criteria: SetupFlowCriterion[]): 'attention' | 'in-progress' | 'complete' {
  if (criteria.length === 0) {
    return 'attention'
  }

  const criteriaMetCount = criteria.filter((criterion) => criterion.met).length
  if (criteriaMetCount === criteria.length) {
    return 'complete'
  }

  return criteriaMetCount === 0 ? 'attention' : 'in-progress'
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
  const metadataCatalog = useMemo(() => normalizeFirmwareMetadata(arducopterMetadata), [])
  const [transportMode, setTransportMode] = useState<TransportMode>('demo')
  const [sessionProfile, setSessionProfile] = useState<SessionProfile>('full-power')
  const [activeViewId, setActiveViewId] = useState<AppViewId>('setup')
  const runtime = useMemo(() => createRuntime(transportMode), [transportMode])
  const [snapshot, setSnapshot] = useState<ConfiguratorSnapshot>(runtime.getSnapshot())
  const [parameterSearch, setParameterSearch] = useState('')
  const [editedValues, setEditedValues] = useState<Record<string, string>>({})
  const [selectedParameterId, setSelectedParameterId] = useState<string>()
  const [parameterNotice, setParameterNotice] = useState<ParameterNotice>()
  const [parameterFollowUp, setParameterFollowUp] = useState<ParameterFollowUp>()
  const [busyAction, setBusyAction] = useState<string>()
  const [orientationExercise, setOrientationExercise] = useState<OrientationExerciseState>(createIdleOrientationExerciseState)
  const [modeSwitchActivity, setModeSwitchActivity] = useState<ModeSwitchActivity>()
  const [modeSwitchExercise, setModeSwitchExercise] = useState<ModeSwitchExerciseState>(createIdleModeSwitchExerciseState)
  const [rcRangeExercise, setRcRangeExercise] = useState<RcRangeExerciseState>(createIdleRcRangeExerciseState)
  const [rcMappingSession, setRcMappingSession] = useState<RcMappingSessionState>(createIdleRcMappingSessionState)
  const [rcCalibrationSession, setRcCalibrationSession] = useState<RcCalibrationSessionState>(createIdleRcCalibrationSessionState)
  const [motorTestOutput, setMotorTestOutput] = useState<number>()
  const [motorTestThrottlePercent, setMotorTestThrottlePercent] = useState(7)
  const [motorTestDurationSeconds, setMotorTestDurationSeconds] = useState(1)
  const [motorVerification, setMotorVerification] = useState<MotorVerificationState>(createIdleMotorVerificationState)
  const [propsRemovedAcknowledged, setPropsRemovedAcknowledged] = useState(false)
  const [testAreaAcknowledged, setTestAreaAcknowledged] = useState(false)
  const [selectedSetupSectionId, setSelectedSetupSectionId] = useState<string>()
  const [setupConfirmations, setSetupConfirmations] = useState<Record<string, SetupConfirmationRecord>>({})
  const parameterBackupInputRef = useRef<HTMLInputElement>(null)
  const previousModeSwitchRef = useRef<{ slot?: number; pwm?: number }>({})
  const webSerialSupported = WebSerialTransport.isSupported()
  const parameterSyncWidth = snapshot.parameterStats.progress === null ? 0 : snapshot.parameterStats.progress * 100
  const rcChannelDisplays = buildRcChannelDisplays(snapshot)
  const airframe = deriveArducopterAirframe(snapshot)
  const modeAssignments = deriveModeAssignments(snapshot)
  const modeSwitchEstimate = deriveModeSwitchEstimate(snapshot)
  const outputMapping = deriveOutputMappingSummary(snapshot)
  const escSetup = deriveEscSetupSummary(snapshot)
  const currentRcAxisChannelMap = deriveRcAxisChannelMap(snapshot)
  const rcAxisObservations = deriveRcAxisObservations(snapshot)
  const batteryMonitor = readRoundedParameter(snapshot, 'BATT_MONITOR')
  const batteryCapacity = readRoundedParameter(snapshot, 'BATT_CAPACITY')
  const batteryFailsafe = readRoundedParameter(snapshot, 'BATT_FS_LOW_ACT')
  const boardOrientation = readRoundedParameter(snapshot, 'AHRS_ORIENTATION')
  const throttleFailsafe = readRoundedParameter(snapshot, 'FS_THR_ENABLE')
  const activePreArmIssues = snapshot.preArmStatus.issues
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
  const canRunRcMappingExercise = snapshot.connection.kind === 'connected' && snapshot.liveVerification.rcInput.verified
  const canRunOrientationExercise = snapshot.connection.kind === 'connected' && snapshot.liveVerification.attitudeTelemetry.verified
  const canCaptureRcCalibration = snapshot.connection.kind === 'connected' && snapshot.liveVerification.rcInput.verified
  const canRunMotorVerification =
    snapshot.connection.kind === 'connected' &&
    snapshot.parameterStats.status === 'complete' &&
    snapshot.vehicle !== undefined &&
    !snapshot.vehicle.armed &&
    snapshot.sessionProfile === 'full-power' &&
    outputMapping.motorOutputs.length > 0
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
    setParameterNotice(undefined)
    setParameterFollowUp(undefined)
    setSetupConfirmations({})
  }, [runtime])

  useEffect(() => {
    runtime.setSessionProfile(sessionProfile)
  }, [runtime, sessionProfile])

  useEffect(() => {
    if (snapshot.connection.kind !== 'connected') {
      previousModeSwitchRef.current = {}
      setModeSwitchActivity(undefined)
      setOrientationExercise(createIdleOrientationExerciseState())
      setModeSwitchExercise(createIdleModeSwitchExerciseState())
      setRcRangeExercise(createIdleRcRangeExerciseState())
      setRcMappingSession(createIdleRcMappingSessionState())
      setRcCalibrationSession(createIdleRcCalibrationSessionState())
      setMotorVerification(createIdleMotorVerificationState())
      setPropsRemovedAcknowledged(false)
      setTestAreaAcknowledged(false)
      setParameterNotice(undefined)
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
    if (orientationExercise.status !== 'running') {
      return
    }

    setOrientationExercise((current) => advanceOrientationExerciseState(current, snapshot))
  }, [orientationExercise.status, snapshot])

  useEffect(() => {
    if (rcRangeExercise.status !== 'running') {
      return
    }

    setRcRangeExercise((current) => advanceRcRangeExerciseState(current, snapshot))
  }, [rcRangeExercise.status, snapshot])

  useEffect(() => {
    if (rcCalibrationSession.status !== 'capturing') {
      return
    }

    setRcCalibrationSession((current) => {
      if (current.status !== 'capturing') {
        return current
      }

      let changed = false
      const nextCaptures = { ...current.captures }

      rcAxisObservations.forEach((observation) => {
        const existing = nextCaptures[observation.axisId]
        if (!existing) {
          return
        }

        const pwm = observation.pwm
        const nextCapture: RcCalibrationAxisCapture = {
          ...existing,
          channelNumber: observation.channelNumber,
          observedMin: pwm !== undefined ? Math.min(existing.observedMin ?? pwm, pwm) : existing.observedMin,
          observedMax: pwm !== undefined ? Math.max(existing.observedMax ?? pwm, pwm) : existing.observedMax,
          trimPwm:
            observation.axisId === 'throttle'
              ? undefined
              : observation.centeredDetected
                ? observation.pwm
                : existing.trimPwm ?? observation.pwm,
          lowObserved: existing.lowObserved || observation.lowDetected,
          highObserved: existing.highObserved || observation.highDetected,
          centeredObserved:
            observation.axisId === 'throttle'
              ? false
              : existing.centeredObserved || observation.centeredDetected || existing.trimPwm !== undefined
        }

        if (
          nextCapture.channelNumber !== existing.channelNumber ||
          nextCapture.observedMin !== existing.observedMin ||
          nextCapture.observedMax !== existing.observedMax ||
          nextCapture.trimPwm !== existing.trimPwm ||
          nextCapture.lowObserved !== existing.lowObserved ||
          nextCapture.highObserved !== existing.highObserved ||
          nextCapture.centeredObserved !== existing.centeredObserved
        ) {
          nextCaptures[observation.axisId] = nextCapture
          changed = true
        }
      })

      const completed = RC_CALIBRATION_AXIS_ORDER.every((axisId) => rcCalibrationCaptureComplete(nextCaptures[axisId]))
      if (completed) {
        return {
          ...current,
          status: 'ready',
          captures: nextCaptures,
          completedAtMs: Date.now(),
          failureReason: undefined
        }
      }

      return changed ? { ...current, captures: nextCaptures } : current
    })
  }, [rcAxisObservations, rcCalibrationSession.status])

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
  const rcMappingCandidate = useMemo(() => {
    if (rcMappingSession.status !== 'running' || rcMappingSession.currentTargetAxis === undefined) {
      return undefined
    }

    const excludedChannelNumbers = Object.values(rcMappingSession.captures)
      .map((capture) => capture.detectedChannelNumber)
      .filter((channelNumber): channelNumber is number => channelNumber !== undefined)

    return detectDominantRcChannelChange(snapshot.liveVerification.rcInput.channels, rcMappingSession.baselineChannels, {
      excludedChannelNumbers
    })
  }, [rcMappingSession, snapshot.liveVerification.rcInput.channels])
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
      if (actionId === 'reboot-autopilot') {
        setParameterFollowUp((current) =>
          current?.requiresReboot
            ? {
                ...current,
                requiresReboot: false,
                refreshRequired: true,
                text: 'Reboot requested. Reconnect if needed, then pull parameters again before continuing guided setup.'
              }
            : current
        )
      }
      if (actionId === 'request-parameters') {
        await runtime.waitForParameterSync()
        setParameterFollowUp((current) => (current?.refreshRequired ? undefined : current))
      }
    } finally {
      setBusyAction(undefined)
    }
  }

  function scrollToPanel(panelId: string): void {
    const targetViewId = appViewForPanel(panelId)
    if (targetViewId !== activeViewId) {
      setActiveViewId(targetViewId)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.getElementById(panelId)?.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          })
        })
      })
      return
    }

    document.getElementById(panelId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })
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
        refreshRequired: true,
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
        refreshRequired: true,
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

  function handleStartOrientationExercise(): void {
    if (!canRunOrientationExercise) {
      return
    }

    setOrientationExercise(createOrientationExerciseState(snapshot))
  }

  function handleResetOrientationExercise(): void {
    setOrientationExercise(createIdleOrientationExerciseState())
  }

  function handleFailOrientationExercise(): void {
    setOrientationExercise((current) =>
      current.status === 'running'
        ? failOrientationExerciseState(
            current,
            `Did not observe the expected ${orientationStepLabel(current.currentTargetStep ?? 'level')} horizon response.`
          )
        : current
    )
  }

  function handleStartRcMappingExercise(): void {
    if (!canRunRcMappingExercise) {
      return
    }

    setRcMappingSession(createRcMappingSessionState(snapshot))
    clearSetupSectionConfirmation('radio')
  }

  function handleResetRcMappingExercise(): void {
    setRcMappingSession(createIdleRcMappingSessionState())
  }

  function handleConfirmRcMappingCandidate(): void {
    if (rcMappingSession.status !== 'running' || rcMappingSession.currentTargetAxis === undefined) {
      return
    }

    if (!rcMappingCandidate) {
      setParameterNotice({
        tone: 'warning',
        text: `Move the ${formatRcAxisLabel(rcMappingSession.currentTargetAxis)} axis by itself until one receiver channel clearly dominates.`
      })
      return
    }

    setRcMappingSession((current) => {
      if (current.status !== 'running' || current.currentTargetAxis === undefined) {
        return current
      }

      const captures: Record<RcAxisId, RcMappingAxisCapture> = {
        ...current.captures,
        [current.currentTargetAxis]: {
          ...current.captures[current.currentTargetAxis],
          detectedChannelNumber: rcMappingCandidate.channelNumber,
          deltaUs: rcMappingCandidate.deltaUs
        }
      }
      const nextTargetAxis = RC_CALIBRATION_AXIS_ORDER.find((axisId) => captures[axisId].detectedChannelNumber === undefined)

      return nextTargetAxis === undefined
        ? {
            ...current,
            status: 'ready',
            captures,
            currentTargetAxis: undefined,
            completedAtMs: Date.now(),
            failureReason: undefined
          }
        : {
            ...current,
            captures,
            currentTargetAxis: nextTargetAxis
          }
    })
    clearSetupSectionConfirmation('radio')
  }

  function handleFailRcMappingExercise(): void {
    setRcMappingSession((current) =>
      current.status === 'running' && current.currentTargetAxis !== undefined
        ? failRcMappingSessionState(
            current,
            `Did not get a clear dominant channel while moving ${formatRcAxisLabel(current.currentTargetAxis)}.`
          )
        : current
    )
  }

  function handleStageRcMappingDrafts(): void {
    if (rcMappingSession.status !== 'ready') {
      return
    }

    const detectedChannelMap = Object.fromEntries(
      RC_CALIBRATION_AXIS_ORDER.map((axisId) => [axisId, rcMappingSession.captures[axisId].detectedChannelNumber])
    ) as Partial<Record<RcAxisId, number>>
    const nextDrafts = deriveRcMapDraftValues(detectedChannelMap, currentRcAxisChannelMap)
    const draftIds = Object.keys(nextDrafts)

    if (draftIds.length === 0) {
      setParameterNotice({
        tone: 'neutral',
        text: 'Observed RC mapping already matches the current RCMAP_* values.'
      })
      return
    }

    setEditedValues((current) => ({
      ...current,
      ...nextDrafts
    }))
    clearSetupSectionConfirmation('radio')
    setSelectedParameterId(draftIds[0] ?? selectedParameterId)
    setParameterNotice({
      tone: 'warning',
      text: `Staged ${draftIds.length} RCMAP_* change(s). Apply them, reboot, refresh parameters, then rerun RC endpoint capture.`
    })
  }

  function handleStartRcCalibrationCapture(): void {
    if (!canCaptureRcCalibration) {
      return
    }

    setRcCalibrationSession({
      ...createIdleRcCalibrationSessionState(rcAxisObservations),
      status: 'capturing',
      startedAtMs: Date.now(),
      completedAtMs: undefined,
      failureReason: undefined
    })
    clearSetupSectionConfirmation('radio')
  }

  function handleResetRcCalibrationCapture(): void {
    setRcCalibrationSession(createIdleRcCalibrationSessionState(rcAxisObservations))
  }

  function handleStageRcCalibrationDrafts(): void {
    if (rcCalibrationSession.status !== 'ready') {
      return
    }

    const nextDrafts: Record<string, string> = {}
    RC_CALIBRATION_AXIS_ORDER.forEach((axisId) => {
      const capture = rcCalibrationSession.captures[axisId]
      if (capture.observedMin !== undefined) {
        nextDrafts[`RC${capture.channelNumber}_MIN`] = String(Math.round(capture.observedMin))
      }
      if (capture.observedMax !== undefined) {
        nextDrafts[`RC${capture.channelNumber}_MAX`] = String(Math.round(capture.observedMax))
      }
      if (axisId !== 'throttle' && capture.trimPwm !== undefined) {
        nextDrafts[`RC${capture.channelNumber}_TRIM`] = String(Math.round(capture.trimPwm))
      }
    })

    setEditedValues((current) => ({
      ...current,
      ...nextDrafts
    }))
    clearSetupSectionConfirmation('radio')
    setSelectedParameterId(Object.keys(nextDrafts)[0] ?? selectedParameterId)
    setParameterNotice({
      tone: 'warning',
      text: `Staged ${Object.keys(nextDrafts).length} RC calibration value(s) for review in the parameter editor.`
    })
  }

  function handleStartMotorVerification(): void {
    if (!canRunMotorVerification) {
      return
    }

    const targetOutputs = outputMapping.motorOutputs.map((output) => output.channelNumber)
    const firstOutput = outputMapping.motorOutputs[0]
    setMotorVerification({
      status: 'running',
      targetOutputs,
      verifiedOutputs: [],
      currentOutputChannel: firstOutput?.channelNumber,
      currentMotorNumber: firstOutput?.motorNumber,
      startedAtMs: Date.now()
    })
    setMotorTestOutput(firstOutput?.channelNumber)
    clearSetupSectionConfirmation('outputs')
  }

  function handleResetMotorVerification(): void {
    setMotorVerification(createIdleMotorVerificationState())
  }

  function handleConfirmMotorVerification(): void {
    setMotorVerification((current) => {
      if (current.status !== 'running' || current.currentOutputChannel === undefined) {
        return current
      }

      const verifiedOutputs = current.verifiedOutputs.includes(current.currentOutputChannel)
        ? current.verifiedOutputs
        : [...current.verifiedOutputs, current.currentOutputChannel]
      const nextOutput = outputMapping.motorOutputs.find((output) => !verifiedOutputs.includes(output.channelNumber))

      setMotorTestOutput(nextOutput?.channelNumber)

      if (!nextOutput) {
        return {
          ...current,
          status: 'passed',
          verifiedOutputs,
          currentOutputChannel: undefined,
          currentMotorNumber: undefined,
          completedAtMs: Date.now(),
          failureReason: undefined
        }
      }

      return {
        ...current,
        verifiedOutputs,
        currentOutputChannel: nextOutput.channelNumber,
        currentMotorNumber: nextOutput.motorNumber
      }
    })
  }

  function handleFailMotorVerification(): void {
    setMotorVerification((current) =>
      current.status === 'running'
        ? {
            ...current,
            status: 'failed',
            failureReason: `Motor verification failed on OUT${current.currentOutputChannel ?? '?'}. Check motor order, direction, and output mapping before flight.`,
            completedAtMs: Date.now()
          }
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

  const orientationExerciseSummary = (() => {
    if (orientationExercise.status === 'passed') {
      return 'Observed level, forward pitch, and right-roll horizon responses from the live attitude stream.'
    }
    if (orientationExercise.status === 'failed') {
      return orientationExercise.failureReason ?? 'Orientation exercise failed.'
    }
    if (orientationExercise.status === 'running') {
      return orientationStepInstruction(orientationExercise.currentTargetStep)
    }
    if (!snapshot.liveVerification.attitudeTelemetry.verified) {
      return 'Waiting for live attitude telemetry before starting orientation verification.'
    }
    return 'Run the orientation exercise to confirm that the live horizon responds correctly to pitch and roll movement.'
  })()

  const orientationExerciseInstructions =
    orientationExercise.status === 'running'
      ? [
          orientationStepInstruction(orientationExercise.currentTargetStep),
          `Completed ${orientationExercise.completedSteps.length} of ${orientationExercise.targetSteps.length} orientation checks.`
        ]
      : orientationExercise.status === 'passed'
        ? ['The live attitude stream matched the expected level, forward-pitch, and right-roll behavior.']
        : orientationExercise.status === 'failed'
          ? ['Check AHRS_ORIENTATION and board mounting, then rerun the orientation exercise.']
          : ['The app will verify level, forward pitch, and right roll against the live ATTITUDE stream.']

  const rcMappingSummary = (() => {
    if (rcMappingSession.status === 'ready') {
      return 'Detected one receiver channel for each primary axis and ready to stage RCMAP_* drafts if needed.'
    }
    if (rcMappingSession.status === 'failed') {
      return rcMappingSession.failureReason ?? 'RC mapping exercise failed.'
    }
    if (rcMappingSession.status === 'running') {
      return rcMappingSession.currentTargetAxis === undefined
        ? 'RC mapping exercise is ready for review.'
        : `Move ${formatRcAxisLabel(rcMappingSession.currentTargetAxis)} by itself until one channel clearly dominates.`
    }
    if (!snapshot.liveVerification.rcInput.verified) {
      return 'Waiting for live RC telemetry before channel remapping can start.'
    }
    return 'Run the RC mapping exercise to detect which receiver channels actually carry roll, pitch, throttle, and yaw.'
  })()

  const rcMappingInstructions =
    rcMappingSession.status === 'running'
      ? [
          `Current target: ${formatRcAxisLabel(rcMappingSession.currentTargetAxis ?? 'roll')}.`,
          rcMappingCandidate
            ? `Current dominant channel: CH${rcMappingCandidate.channelNumber} (${Math.round(rcMappingCandidate.deltaUs)}us delta).`
            : 'Move only the requested axis until one channel clearly dominates.'
        ]
      : rcMappingSession.status === 'ready'
        ? ['Stage any needed RCMAP_* changes, then reboot and refresh before rerunning endpoint capture.']
        : rcMappingSession.status === 'failed'
          ? ['Center the sticks, move only one axis at a time, and rerun the mapping exercise.']
          : ['The app watches raw RC channel movement directly, independent of the current RCMAP_* parameters.']

  const rcCalibrationSummary = (() => {
    if (rcCalibrationSession.status === 'ready') {
      return 'Observed full stick travel and ready-to-stage RC endpoint values.'
    }
    if (rcCalibrationSession.status === 'capturing') {
      return 'Move each primary axis through its full range to capture new RC endpoints.'
    }
    if (rcCalibrationSession.status === 'failed') {
      return rcCalibrationSession.failureReason ?? 'RC calibration capture failed.'
    }
    if (!snapshot.liveVerification.rcInput.verified) {
      return 'Waiting for live RC telemetry before RC calibration capture can start.'
    }
    return 'Capture fresh RC endpoint values from live stick movement, then stage them in the parameter editor.'
  })()

  const motorVerificationSummary = (() => {
    if (motorVerification.status === 'passed') {
      return 'Every mapped motor output was stepped through and operator-confirmed.'
    }
    if (motorVerification.status === 'failed') {
      return motorVerification.failureReason ?? 'Motor verification failed.'
    }
    if (motorVerification.status === 'running') {
      return motorVerification.currentOutputChannel === undefined
        ? 'Motor verification is awaiting the next output.'
        : `Spin OUT${motorVerification.currentOutputChannel}${motorVerification.currentMotorNumber !== undefined ? ` / M${motorVerification.currentMotorNumber}` : ''}, then confirm the correct motor and direction.`
    }
    if (snapshot.sessionProfile === 'usb-bench') {
      return 'Motor order and direction verification is deferred in USB bench sessions.'
    }
    return 'Use guarded single-output motor tests to verify motor order and direction before the first props-on flight.'
  })()

  const escReviewSummary = (() => {
    if (escSetup.calibrationPath === 'analog-calibration') {
      return 'This output protocol still needs the offline ESC calibration review before first flight.'
    }
    if (escSetup.calibrationPath === 'digital-protocol') {
      return 'Digital motor outputs do not use PWM endpoint calibration, but the motor range still needs review.'
    }
    return 'ESC protocol and motor-range settings need a manual review before first flight.'
  })()

  const setupConfirmationSignatures = useMemo<Record<string, string>>(
    () => ({
      airframe: JSON.stringify({
        frameClassValue: airframe.frameClassValue,
        frameTypeValue: airframe.frameTypeValue,
        frameTypeIgnored: airframe.frameTypeIgnored
      }),
      outputs: JSON.stringify({
        expectedMotorCount: airframe.expectedMotorCount,
        motorOutputs: outputMapping.motorOutputs.map((output) => ({
          channelNumber: output.channelNumber,
          functionValue: output.functionValue,
          motorNumber: output.motorNumber
        })),
        auxOutputs: outputMapping.configuredAuxOutputs.map((output) => ({
          channelNumber: output.channelNumber,
          functionValue: output.functionValue
        })),
        notes: outputMapping.notes
      }),
      'esc-range': JSON.stringify({
        calibrationPath: escSetup.calibrationPath,
        pwmTypeValue: escSetup.pwmTypeValue,
        notes: escSetup.notes,
        relevantParameters: escSetup.relevantParameters
      }),
      accelerometer: JSON.stringify({
        status: snapshot.guidedActions['calibrate-accelerometer'].status,
        completedAtMs: snapshot.guidedActions['calibrate-accelerometer'].completedAtMs
      }),
      compass: JSON.stringify({
        status: snapshot.guidedActions['calibrate-compass'].status,
        completedAtMs: snapshot.guidedActions['calibrate-compass'].completedAtMs
      }),
      radio: JSON.stringify({
        rcMap: currentRcAxisChannelMap,
        detectedMap:
          rcMappingSession.status === 'ready'
            ? RC_CALIBRATION_AXIS_ORDER.map((axisId) => ({
                axisId,
                channelNumber: rcMappingSession.captures[axisId].detectedChannelNumber
              }))
            : undefined,
        mappings: rcAxisObservations.map((observation) => ({
          axisId: observation.axisId,
          channelNumber: observation.channelNumber
        })),
        params: rcAxisObservations.map((observation) => ({
          channelNumber: observation.channelNumber,
          minimum: readRoundedParameter(snapshot, `RC${observation.channelNumber}_MIN`),
          maximum: readRoundedParameter(snapshot, `RC${observation.channelNumber}_MAX`),
          trim: readRoundedParameter(snapshot, `RC${observation.channelNumber}_TRIM`)
        }))
      }),
      failsafe: JSON.stringify({
        throttleFailsafe,
        batteryFailsafe,
        rcVerified: snapshot.liveVerification.rcInput.verified,
        batteryVerified: snapshot.liveVerification.batteryTelemetry.verified
      }),
      power: JSON.stringify({
        batteryMonitor,
        batteryCapacity,
        batteryVerified: snapshot.liveVerification.batteryTelemetry.verified,
        preArmIssues: snapshot.preArmStatus.issues.map((issue) => issue.text)
      })
    }),
    [
      airframe.expectedMotorCount,
      airframe.frameClassValue,
      airframe.frameTypeIgnored,
      airframe.frameTypeValue,
      batteryCapacity,
      batteryFailsafe,
      batteryMonitor,
      currentRcAxisChannelMap,
      escSetup.calibrationPath,
      escSetup.notes,
      escSetup.pwmTypeValue,
      escSetup.relevantParameters,
      outputMapping.configuredAuxOutputs,
      outputMapping.motorOutputs,
      outputMapping.notes,
      rcAxisObservations,
      rcMappingSession.captures,
      rcMappingSession.status,
      snapshot.preArmStatus.issues,
      snapshot.guidedActions,
      snapshot.liveVerification.batteryTelemetry.verified,
      snapshot.liveVerification.rcInput.verified,
      throttleFailsafe
    ]
  )

  function getSetupConfirmationRecord(sectionId: string): SetupConfirmationRecord | undefined {
    const record = setupConfirmations[sectionId]
    const signature = setupConfirmationSignatures[sectionId]
    if (!record || signature === undefined || record.signature !== signature) {
      return undefined
    }

    return record
  }

  const escReviewConfirmation = getSetupConfirmationRecord('esc-range')

  function confirmSetupSection(sectionId: string): void {
    const signature = setupConfirmationSignatures[sectionId]
    if (signature === undefined) {
      return
    }

    setSetupConfirmations((current) => ({
      ...current,
      [sectionId]: {
        signature,
        confirmedAtMs: Date.now()
      }
    }))
  }

  function clearSetupSectionConfirmation(sectionId: string): void {
    setSetupConfirmations((current) => {
      if (!(sectionId in current)) {
        return current
      }

      const next = { ...current }
      delete next[sectionId]
      return next
    })
  }

  const setupFlowFollowUp = useMemo<SetupFlowFollowUpDescriptor | undefined>(() => {
    if (!parameterFollowUp) {
      return undefined
    }

    const actions: SetupFlowActionDescriptor[] = []
    if (parameterFollowUp.requiresReboot) {
      actions.push({
        kind: 'guided',
        label: guidedActionButtonLabel('reboot-autopilot', snapshot, busyAction),
        tone: 'secondary',
        actionId: 'reboot-autopilot',
        disabled: busyAction !== undefined || !canRunGuidedAction(snapshot, 'reboot-autopilot')
      })
    } else if (parameterFollowUp.refreshRequired) {
      actions.push({
        kind: 'guided',
        label: guidedActionButtonLabel('request-parameters', snapshot, busyAction),
        tone: 'primary',
        actionId: 'request-parameters',
        disabled: busyAction !== undefined || !canRunGuidedAction(snapshot, 'request-parameters')
      })
    }

    return {
      title: parameterFollowUp.requiresReboot
        ? 'Pending reboot before later setup steps unlock'
        : 'Pending parameter refresh before later setup steps unlock',
      tone: parameterFollowUp.requiresReboot ? 'warning' : 'neutral',
      text: parameterFollowUp.text,
      actions
    }
  }, [busyAction, parameterFollowUp, snapshot])

  const setupFlowSections = useMemo<SetupFlowSectionDescriptor[]>(() => {
    const airframeConfirmation = getSetupConfirmationRecord('airframe')
    const outputsConfirmation = getSetupConfirmationRecord('outputs')
    const escRangeConfirmation = getSetupConfirmationRecord('esc-range')
    const accelerometerConfirmation = getSetupConfirmationRecord('accelerometer')
    const compassConfirmation = getSetupConfirmationRecord('compass')
    const radioConfirmation = getSetupConfirmationRecord('radio')
    const failsafeConfirmation = getSetupConfirmationRecord('failsafe')
    const powerConfirmation = getSetupConfirmationRecord('power')

    const baseSections = snapshot.setupSections.map((section) => {
      const panel = panelAnchorForSetupSection(section.id)
      const actions: SetupFlowActionDescriptor[] = [
        {
          kind: 'scroll',
          label: `Open ${panel.panelLabel}`,
          panelId: panel.panelId
        }
      ]
      let summary = section.description
      let detail = section.notes[0] ?? `Use the ${panel.panelLabel} panel to continue this part of setup.`
      let evidence: string[] = []
      let criteria: SetupFlowCriterion[] = []

      switch (section.id) {
        case 'link':
          criteria = [
            {
              label: 'Heartbeat and vehicle identity detected',
              met: snapshot.connection.kind === 'connected' && snapshot.vehicle !== undefined
            },
            {
              label: 'Initial parameter snapshot synced',
              met: snapshot.parameterStats.status === 'complete'
            },
            {
              label: 'No pending reboot or refresh follow-up',
              met: !parameterFollowUp?.refreshRequired
            }
          ]
          summary = parameterFollowUp
            ? parameterFollowUp.requiresReboot
              ? 'A reboot and fresh parameter pull are required before setup can continue.'
              : 'Pull parameters again to confirm the controller state before moving on.'
            : snapshot.connection.kind !== 'connected'
              ? 'Connect to the vehicle and request the first parameter snapshot.'
              : snapshot.parameterStats.status === 'complete'
                ? `Initial sync complete at ${snapshot.parameterStats.downloaded}/${snapshot.parameterStats.total}.`
                : formatParameterSync(snapshot)
          detail = parameterFollowUp?.text
            ?? (snapshot.connection.kind !== 'connected'
              ? 'Use the Connection panel first, then pull parameters once heartbeat is visible.'
              : 'Re-run parameter sync whenever you need a fresh snapshot before continuing guided setup.')
          evidence = [
            `Link: ${snapshot.connection.kind}`,
            `Sync: ${formatParameterSync(snapshot)}`,
            parameterFollowUp
              ? `Follow-up: ${parameterFollowUp.requiresReboot ? 'reboot + refresh pending' : 'refresh pending'}`
              : 'Follow-up: clear'
          ]
          actions.unshift({
            kind: 'guided',
            label: guidedActionButtonLabel('request-parameters', snapshot, busyAction),
            tone: 'primary',
            actionId: 'request-parameters',
            disabled: busyAction !== undefined || !canRunGuidedAction(snapshot, 'request-parameters')
          })
          break
        case 'airframe':
          criteria = [
            {
              label: 'Frame class detected',
              met: airframe.frameClassValue !== undefined
            },
            {
              label: 'Frame type identified or intentionally ignored for this frame class',
              met: airframe.frameTypeIgnored || airframe.frameTypeValue !== undefined
            },
            {
              label: 'Board orientation parameter is present',
              met: boardOrientation !== undefined
            },
            {
              label: 'Live attitude telemetry is present',
              met: snapshot.liveVerification.attitudeTelemetry.verified
            },
            {
              label: 'Orientation exercise passed',
              met: orientationExercise.status === 'passed'
            },
            {
              label: 'Operator confirmed the detected frame geometry matches the build',
              met: airframeConfirmation !== undefined
            }
          ]
          summary = `${airframe.frameClassLabel} / ${airframe.frameTypeLabel}`
          detail = 'Confirm the detected frame geometry, verify the live horizon behavior against the board orientation, then explicitly sign off before moving on to output review or motor testing.'
          evidence = [
            `Expected motors: ${airframe.expectedMotorCount ?? 'specialized frame'}`,
            `Mapped motors: ${outputMapping.motorOutputs.length}`,
            `Orientation: ${formatOrientationLabel(boardOrientation)}`,
            `Review: ${airframeConfirmation ? `confirmed at ${formatConfirmationTime(airframeConfirmation.confirmedAtMs)}` : 'pending operator confirmation'}`
          ]
          actions.unshift({
            kind: airframeConfirmation ? 'clear-confirmation' : 'confirm-step',
            label: airframeConfirmation ? 'Clear Review Confirmation' : 'Confirm Airframe Review',
            tone: 'primary',
            sectionId: 'airframe',
            disabled: airframe.frameClassValue === undefined || (!airframe.frameTypeIgnored && airframe.frameTypeValue === undefined)
          })
          actions.unshift({
            kind: 'scroll',
            label: orientationExercise.status === 'passed' ? 'Review Orientation Check' : 'Run Orientation Check',
            panelId: panel.panelId
          })
          break
        case 'outputs':
          criteria = [
            {
              label: 'At least one motor output is mapped',
              met: outputMapping.motorOutputs.length > 0
            },
            {
              label: 'Motor output count matches the expected frame geometry',
              met:
                airframe.expectedMotorCount === undefined || outputMapping.motorOutputs.length === airframe.expectedMotorCount
            },
            {
              label: 'No missing motor assignments are reported in the current mapping',
              met: !outputMapping.notes.some((note) => note.startsWith('Missing motor assignments:'))
            },
            {
              label: 'Operator reviewed the output map before any props-on activity',
              met: outputsConfirmation !== undefined
            },
            {
              label:
                escSetup.calibrationPath === 'analog-calibration'
                  ? 'ESC calibration and motor-range review confirmed'
                  : 'Motor protocol and range review confirmed',
              met: escRangeConfirmation !== undefined
            },
            {
              label:
                snapshot.sessionProfile === 'usb-bench'
                  ? 'Motor order verification deferred in USB bench sessions'
                  : 'Motor order and direction verification passed',
              met: snapshot.sessionProfile === 'usb-bench' || motorVerification.status === 'passed'
            }
          ]
          summary = `${outputMapping.motorOutputs.length} mapped motor outputs, ${outputMapping.configuredAuxOutputs.length} configured auxiliary outputs.`
          detail =
            outputMapping.notes[0]
            ?? 'Review the output map, verify motor order, then confirm the ESC calibration or motor-range path before any props-on activity.'
          evidence = [
            ...outputMapping.notes.slice(0, 2),
            `Motor verification: ${motorVerification.status}`,
            `Output review: ${outputsConfirmation ? `confirmed at ${formatConfirmationTime(outputsConfirmation.confirmedAtMs)}` : 'pending operator confirmation'}`,
            `ESC review: ${escRangeConfirmation ? `confirmed at ${formatConfirmationTime(escRangeConfirmation.confirmedAtMs)}` : 'pending operator confirmation'}`
          ].slice(0, 4)
          actions.unshift({
            kind: outputsConfirmation ? 'clear-confirmation' : 'confirm-step',
            label: outputsConfirmation ? 'Clear Output Review' : 'Confirm Output Review',
            tone: 'primary',
            sectionId: 'outputs',
            disabled:
              outputMapping.motorOutputs.length === 0 ||
              outputMapping.notes.some((note) => note.startsWith('Missing motor assignments:')) ||
              (airframe.expectedMotorCount !== undefined && outputMapping.motorOutputs.length !== airframe.expectedMotorCount)
          })
          actions.splice(1, 0, {
            kind: escRangeConfirmation ? 'clear-confirmation' : 'confirm-step',
            label:
              escRangeConfirmation
                ? 'Clear ESC Review'
                : escSetup.calibrationPath === 'analog-calibration'
                  ? 'Confirm ESC Calibration Review'
                  : 'Confirm ESC Range Review',
            tone: 'secondary',
            sectionId: 'esc-range',
            disabled: outputMapping.motorOutputs.length === 0
          })
          actions.unshift({
            kind: 'scroll',
            label:
              motorVerification.status === 'passed'
                ? 'Review Motor Verification'
                : snapshot.sessionProfile === 'usb-bench'
                  ? 'Review Motor Verification Requirements'
                  : 'Run Motor Verification',
            panelId: panel.panelId
          })
          break
        case 'accelerometer': {
          const actionState = snapshot.guidedActions['calibrate-accelerometer']
          criteria = [
            {
              label: 'Accelerometer calibration completed successfully',
              met: actionState.status === 'succeeded' || section.status === 'complete'
            },
            {
              label: 'Operator confirmed the posture prompts were completed cleanly',
              met: accelerometerConfirmation !== undefined
            }
          ]
          summary = actionState.summary
          detail =
            actionState.status === 'succeeded'
              ? 'Accelerometer calibration completed successfully in the shared runtime. Confirm that all posture prompts were completed cleanly before proceeding.'
              : actionState.instructions[0] ?? 'Run the accelerometer calibration and follow each posture prompt in order.'
          evidence = [
            ...actionState.statusTexts.slice(-2),
            ...section.notes,
            `Review: ${accelerometerConfirmation ? `confirmed at ${formatConfirmationTime(accelerometerConfirmation.confirmedAtMs)}` : 'pending operator confirmation'}`
          ].slice(0, 4)
          actions.unshift({
            kind: 'guided',
            label: guidedActionButtonLabel('calibrate-accelerometer', snapshot, busyAction),
            tone: 'primary',
            actionId: 'calibrate-accelerometer',
            disabled: busyAction !== undefined || !canRunGuidedAction(snapshot, 'calibrate-accelerometer')
          })
          actions.splice(1, 0, {
            kind: accelerometerConfirmation ? 'clear-confirmation' : 'confirm-step',
            label: accelerometerConfirmation ? 'Clear Calibration Confirmation' : 'Confirm Calibration Complete',
            tone: 'secondary',
            sectionId: 'accelerometer',
            disabled: actionState.status !== 'succeeded'
          })
          break
        }
        case 'compass': {
          const actionState = snapshot.guidedActions['calibrate-compass']
          criteria = [
            {
              label: 'Compass calibration completed successfully',
              met: actionState.status === 'succeeded' || section.status === 'complete'
            },
            {
              label: 'Operator confirmed the full rotation workflow completed cleanly',
              met: compassConfirmation !== undefined
            }
          ]
          summary = actionState.summary
          detail =
            actionState.status === 'succeeded'
              ? 'Compass calibration completed successfully in the shared runtime. Confirm that the full rotation workflow completed cleanly before proceeding.'
              : actionState.instructions[0] ?? 'Run compass calibration when the vehicle is fully powered and magnetometer hardware is available.'
          evidence = [
            ...actionState.statusTexts.slice(-2),
            ...section.notes,
            `Review: ${compassConfirmation ? `confirmed at ${formatConfirmationTime(compassConfirmation.confirmedAtMs)}` : 'pending operator confirmation'}`
          ].slice(0, 4)
          actions.unshift({
            kind: 'guided',
            label: guidedActionButtonLabel('calibrate-compass', snapshot, busyAction),
            tone: 'primary',
            actionId: 'calibrate-compass',
            disabled: busyAction !== undefined || !canRunGuidedAction(snapshot, 'calibrate-compass')
          })
          actions.splice(1, 0, {
            kind: compassConfirmation ? 'clear-confirmation' : 'confirm-step',
            label: compassConfirmation ? 'Clear Calibration Confirmation' : 'Confirm Calibration Complete',
            tone: 'secondary',
            sectionId: 'compass',
            disabled: actionState.status !== 'succeeded'
          })
          break
        }
        case 'radio':
          criteria = [
            {
              label: 'Live RC telemetry is present',
              met: snapshot.liveVerification.rcInput.verified
            },
            {
              label: 'RC mapping exercise captured roll, pitch, throttle, and yaw',
              met: rcMappingSession.status === 'ready'
            },
            {
              label: 'Stick range exercise passed',
              met: rcRangeExercise.status === 'passed'
            },
            {
              label: 'RC endpoint capture completed',
              met: rcCalibrationSession.status === 'ready'
            },
            {
              label: 'Operator reviewed RC mapping and calibration values',
              met: radioConfirmation !== undefined
            }
          ]
          summary =
            rcMappingSession.status === 'running'
              ? rcMappingSummary
              : rcRangeExercise.status === 'running'
                ? rcRangeExerciseSummary
                : rcCalibrationSession.status === 'capturing'
                  ? rcCalibrationSummary
                  : rcRangeExercise.status === 'passed' && rcCalibrationSession.status === 'ready'
                    ? 'RC mapping, stick range, and endpoint capture are ready for operator review.'
                : snapshot.liveVerification.rcInput.verified
                  ? 'Live RC telemetry is present, but the full mapping and calibration flow still needs to complete.'
                  : 'Waiting for live RC telemetry before the RC mapping flow can start.'
          detail =
            rcMappingSession.status === 'failed'
              ? rcMappingSession.failureReason ?? 'RC mapping exercise failed.'
              : rcRangeExercise.status === 'failed'
                ? rcRangeExercise.failureReason ?? 'Stick range exercise failed.'
                : rcCalibrationSession.status === 'failed'
                  ? rcCalibrationSession.failureReason ?? 'RC endpoint capture failed.'
                  : 'Detect the true roll/pitch/throttle/yaw channels first, then verify stick travel, capture endpoints, and sign off the full radio review.'
          evidence = [
            snapshot.liveVerification.rcInput.verified
              ? `${snapshot.liveVerification.rcInput.channelCount} RC channels live`
              : 'No live RC telemetry yet',
            `Mapping: ${rcMappingSession.status}`,
            `Ranges: ${rcRangeExercise.status}`,
            `Endpoints: ${rcCalibrationSession.status}`,
            `Review: ${radioConfirmation ? `confirmed at ${formatConfirmationTime(radioConfirmation.confirmedAtMs)}` : 'pending operator confirmation'}`
          ].slice(0, 4)
          actions.unshift({
            kind: 'rc-mapping-exercise',
            label: rcMappingSession.status === 'ready' ? 'Run RC Mapping Again' : 'Start RC Mapping',
            tone: 'primary',
            disabled: !canRunRcMappingExercise || rcMappingSession.status === 'running'
          })
          actions.unshift({
            kind: 'rc-range-exercise',
            label: rcRangeExercise.status === 'passed' ? 'Run Stick Exercise Again' : 'Start Stick Exercise',
            tone: 'secondary',
            disabled: !canRunRcRangeExercise || rcRangeExercise.status === 'running'
          })
          actions.splice(1, 0, {
            kind: radioConfirmation ? 'clear-confirmation' : 'confirm-step',
            label: radioConfirmation ? 'Clear RC Review' : 'Confirm RC Review',
            tone: 'secondary',
            sectionId: 'radio',
            disabled:
              !snapshot.liveVerification.rcInput.verified ||
              rcMappingSession.status !== 'ready' ||
              rcRangeExercise.status !== 'passed' ||
              rcCalibrationSession.status !== 'ready'
          })
          actions.splice(1, 0, {
            kind: 'scroll',
            label:
              rcCalibrationSession.status === 'ready'
                ? 'Stage RC Calibration'
                : rcMappingSession.status === 'ready'
                  ? 'Run RC Calibration'
                  : 'Review RC Mapping',
            panelId: panel.panelId
          })
          break
        case 'failsafe':
          criteria = [
            {
              label: 'Throttle failsafe setting is present',
              met: throttleFailsafe !== undefined
            },
            {
              label: 'Battery failsafe action is present',
              met: batteryFailsafe !== undefined
            },
            {
              label: 'Live RC link is verified during review',
              met: snapshot.liveVerification.rcInput.verified
            },
            {
              label: 'Live battery telemetry is verified during review',
              met: snapshot.liveVerification.batteryTelemetry.verified
            },
            {
              label: 'Operator reviewed the configured failsafe behavior',
              met: failsafeConfirmation !== undefined
            }
          ]
          summary = `Throttle failsafe ${formatArducopterThrottleFailsafe(throttleFailsafe)}, battery action ${formatArducopterBatteryFailsafeAction(
            batteryFailsafe
          )}.`
          detail =
            snapshot.liveVerification.batteryTelemetry.verified && snapshot.liveVerification.rcInput.verified
              ? 'Failsafe settings are visible with live RC and battery telemetry present.'
              : 'Keep both RC and battery telemetry live while reviewing the failsafe configuration.'
          evidence = [
            snapshot.liveVerification.rcInput.verified ? 'RC link live' : 'RC link not yet verified',
            snapshot.liveVerification.batteryTelemetry.verified ? 'Battery telemetry live' : 'Battery telemetry not yet verified',
            `Review: ${failsafeConfirmation ? `confirmed at ${formatConfirmationTime(failsafeConfirmation.confirmedAtMs)}` : 'pending operator confirmation'}`
          ]
          actions.unshift({
            kind: failsafeConfirmation ? 'clear-confirmation' : 'confirm-step',
            label: failsafeConfirmation ? 'Clear Failsafe Review' : 'Confirm Failsafe Review',
            tone: 'primary',
            sectionId: 'failsafe',
            disabled:
              throttleFailsafe === undefined ||
              batteryFailsafe === undefined ||
              !snapshot.liveVerification.rcInput.verified ||
              !snapshot.liveVerification.batteryTelemetry.verified
          })
          break
        case 'modes':
          criteria = [
            {
              label: 'Mode channel is configured',
              met: modeSwitchEstimate.channelNumber !== undefined
            },
            {
              label: 'At least two flight-mode positions are assigned',
              met: modeAssignments.length >= 2
            },
            {
              label: 'Mode switch exercise passed',
              met: modeSwitchExercise.status === 'passed'
            }
          ]
          summary =
            modeSwitchExercise.status === 'passed'
              ? 'Mode switch exercise passed with all configured positions observed.'
              : modeSwitchExercise.status === 'running'
                ? modeSwitchExerciseSummary
                : modeSwitchEstimate.estimatedSlot !== undefined
                  ? `Live mode switch detected on CH${modeSwitchEstimate.channelNumber ?? '?'}, but the full switch exercise still needs to pass.`
                  : 'Waiting for a configured live mode channel before starting the switch exercise.'
          detail =
            modeSwitchExercise.status === 'failed'
              ? modeSwitchExercise.failureReason ?? 'Mode switch exercise failed.'
              : 'Walk through every configured flight-mode position and confirm the app observes each slot.'
          evidence = [
            modeSwitchEstimate.channelNumber !== undefined ? `Mode channel: CH${modeSwitchEstimate.channelNumber}` : 'Mode channel not configured',
            `Exercise: ${modeSwitchExercise.status}`
          ]
          actions.unshift({
            kind: 'mode-switch-exercise',
            label: modeSwitchExercise.status === 'passed' ? 'Run Switch Exercise Again' : 'Start Switch Exercise',
            tone: 'primary',
            disabled: !canRunModeSwitchExercise || modeSwitchExercise.status === 'running'
          })
          break
        case 'power':
          criteria = [
            {
              label: 'Battery monitor is configured',
              met: batteryMonitor !== undefined && batteryMonitor > 0
            },
            {
              label: 'Live battery telemetry is present',
              met: snapshot.liveVerification.batteryTelemetry.verified
            },
            {
              label: 'Operator confirmed the power and battery readings were reviewed',
              met: powerConfirmation !== undefined
            },
            {
              label: 'No active pre-arm safety issues are present',
              met: snapshot.preArmStatus.healthy
            }
          ]
          summary = snapshot.liveVerification.batteryTelemetry.verified
            ? `${formatVoltage(snapshot.liveVerification.batteryTelemetry.voltageV)} and ${formatRemaining(
                snapshot.liveVerification.batteryTelemetry.remainingPercent
              )}.`
            : 'Battery telemetry has not been verified yet.'
          detail =
            batteryHealthLabel(snapshot) === 'Battery healthy'
              ? 'Power telemetry is live and currently healthy. Reboot is available here when setup changes require it.'
              : 'Use the power panel to verify the battery monitor, remaining estimate, and any required reboot/refresh steps.'
          evidence = [
            `Battery monitor: ${describeBatteryMonitor(batteryMonitor)}`,
            `Health: ${batteryHealthLabel(snapshot)}`,
            snapshot.preArmStatus.healthy ? 'Pre-arm: clear' : `Pre-arm: ${snapshot.preArmStatus.issues.length} issue(s)`,
            `Review: ${powerConfirmation ? `confirmed at ${formatConfirmationTime(powerConfirmation.confirmedAtMs)}` : 'pending operator confirmation'}`
          ]
          actions.unshift({
            kind: 'guided',
            label: guidedActionButtonLabel('reboot-autopilot', snapshot, busyAction),
            tone: 'secondary',
            actionId: 'reboot-autopilot',
            disabled: busyAction !== undefined || !canRunGuidedAction(snapshot, 'reboot-autopilot')
          })
          actions.unshift({
            kind: powerConfirmation ? 'clear-confirmation' : 'confirm-step',
            label: powerConfirmation ? 'Clear Power Review' : 'Confirm Power Review',
            tone: 'primary',
            sectionId: 'power',
            disabled: batteryMonitor === undefined || batteryMonitor <= 0 || !snapshot.liveVerification.batteryTelemetry.verified
          })
          break
        default:
          break
      }

      const status = deriveSetupStatusFromCriteria(criteria)
      const criteriaMetCount = criteria.filter((criterion) => criterion.met).length

      return {
        id: section.id,
        title: section.title,
        status,
        sequenceState: 'locked',
        summary,
        detail,
        evidence,
        criteria,
        criteriaMetCount,
        panelId: panel.panelId,
        panelLabel: panel.panelLabel,
        actions
      }
    })

    let currentIncompleteSectionTitle: string | undefined

    return baseSections.map((section) => {
      if (section.status === 'complete') {
        return {
          ...section,
          sequenceState: 'complete'
        }
      }

      if (!currentIncompleteSectionTitle) {
        currentIncompleteSectionTitle = section.title
        return {
          ...section,
          sequenceState: 'current'
        }
      }

      return {
        ...section,
        sequenceState: 'locked',
        blockingReason: setupFlowFollowUp
          ? setupFlowFollowUp.title
          : `Complete ${currentIncompleteSectionTitle} before moving on to ${section.title}.`
      }
    })
  }, [
    airframe.frameClassValue,
    airframe.frameClassLabel,
    airframe.expectedMotorCount,
    airframe.frameTypeIgnored,
    airframe.frameTypeLabel,
    airframe.frameTypeValue,
    batteryCapacity,
    batteryFailsafe,
    batteryMonitor,
    boardOrientation,
    busyAction,
    canRunModeSwitchExercise,
    canRunRcMappingExercise,
    canRunRcRangeExercise,
    currentRcAxisChannelMap,
    escSetup,
    modeAssignments.length,
    modeSwitchEstimate.channelNumber,
    modeSwitchEstimate.estimatedSlot,
    modeSwitchExercise.failureReason,
    modeSwitchExercise.status,
    modeSwitchExerciseSummary,
    motorVerification.status,
    outputMapping.configuredAuxOutputs.length,
    outputMapping.motorOutputs.length,
    outputMapping.notes,
    parameterFollowUp,
    orientationExercise.status,
    rcCalibrationSession.failureReason,
    rcCalibrationSession.status,
    rcMappingSession.currentTargetAxis,
    rcMappingSession.failureReason,
    rcMappingSession.status,
    rcMappingSummary,
    rcRangeExercise.failureReason,
    rcRangeExercise.status,
    rcRangeExerciseSummary,
    rcAxisObservations,
    setupConfirmations,
    setupFlowFollowUp,
    snapshot,
    snapshot.preArmStatus,
    snapshot.liveVerification.attitudeTelemetry.verified,
    snapshot.sessionProfile,
    snapshot.motorTest.status,
    throttleFailsafe
  ])
  const recommendedSetupSection =
    setupFlowSections.find((section) => section.sequenceState === 'current') ??
    setupFlowSections.find((section) => section.status !== 'complete') ??
    setupFlowSections[0]
  const selectedSetupSectionCandidate = setupFlowSections.find((section) => section.id === selectedSetupSectionId)
  const selectedSetupSection =
    !selectedSetupSectionCandidate || selectedSetupSectionCandidate.sequenceState === 'locked'
      ? recommendedSetupSection
      : selectedSetupSectionCandidate
  const completedSetupSectionCount = setupFlowSections.filter((section) => section.status === 'complete').length
  const setupFlowProgress = setupFlowSections.length === 0 ? 0 : (completedSetupSectionCount / setupFlowSections.length) * 100
  const guidedSetupComplete = setupFlowSections.length > 0 && completedSetupSectionCount === setupFlowSections.length
  const appViews = useMemo<AppViewDescriptor[]>(
    () =>
      metadataCatalog.appViews.map((view) => {
        switch (view.id) {
          case 'setup':
            return {
              id: view.id,
              label: view.label,
              description: view.description,
              badge: `${completedSetupSectionCount}/${setupFlowSections.length || 0}`,
              tone: guidedSetupComplete ? 'success' : 'warning'
            }
          case 'receiver':
            return {
              id: view.id,
              label: view.label,
              description: view.description,
              badge: snapshot.liveVerification.rcInput.verified ? 'live' : 'pending',
              tone: snapshot.liveVerification.rcInput.verified ? 'success' : 'warning'
            }
          case 'outputs':
            return {
              id: view.id,
              label: view.label,
              description: view.description,
              badge: `${outputMapping.motorOutputs.length} motors`,
              tone: outputMapping.motorOutputs.length > 0 ? 'neutral' : 'warning'
            }
          case 'power':
            return {
              id: view.id,
              label: view.label,
              description: view.description,
              badge: snapshot.preArmStatus.healthy ? 'clear' : `${snapshot.preArmStatus.issues.length} issues`,
              tone: snapshot.preArmStatus.healthy ? 'success' : 'warning'
            }
          case 'parameters':
            return {
              id: view.id,
              label: view.label,
              description: view.description,
              badge: stagedParameterDrafts.length > 0 ? `${stagedParameterDrafts.length} staged` : `${snapshot.parameters.length}`,
              tone: stagedParameterDrafts.length > 0 ? 'warning' : 'neutral'
            }
          default:
            return {
              id: view.id,
              label: view.label,
              description: view.description,
              badge: '',
              tone: 'neutral'
            }
        }
      }),
    [
      completedSetupSectionCount,
      guidedSetupComplete,
      metadataCatalog.appViews,
      outputMapping.motorOutputs.length,
      setupFlowSections.length,
      snapshot.liveVerification.rcInput.verified,
      snapshot.parameters.length,
      snapshot.preArmStatus,
      stagedParameterDrafts.length
    ]
  )

  function formatCategoryLabel(categoryId: string | undefined): string {
    if (!categoryId) {
      return 'Uncategorized'
    }

    return metadataCatalog.categoryById[categoryId]?.label ?? categoryId
  }

  useEffect(() => {
    if (!recommendedSetupSection) {
      return
    }

    if (
      !selectedSetupSectionCandidate ||
      selectedSetupSectionCandidate.sequenceState === 'locked'
    ) {
      setSelectedSetupSectionId(recommendedSetupSection.id)
    }
  }, [recommendedSetupSection, selectedSetupSectionCandidate])

  function handleSetupFlowAction(action: SetupFlowActionDescriptor): void {
    if (action.disabled) {
      return
    }

    switch (action.kind) {
      case 'guided':
        if (action.actionId) {
          void handleGuidedAction(action.actionId)
        }
        return
      case 'mode-switch-exercise':
        handleStartModeSwitchExercise()
        scrollToPanel('setup-panel-rc')
        return
      case 'rc-range-exercise':
        handleStartRcRangeExercise()
        scrollToPanel('setup-panel-rc')
        return
      case 'rc-mapping-exercise':
        handleStartRcMappingExercise()
        scrollToPanel('setup-panel-rc')
        return
      case 'confirm-step':
        if (action.sectionId) {
          confirmSetupSection(action.sectionId)
        }
        return
      case 'clear-confirmation':
        if (action.sectionId) {
          clearSetupSectionConfirmation(action.sectionId)
        }
        return
      case 'scroll':
        if (action.panelId) {
          scrollToPanel(action.panelId)
        }
        return
      default:
        return
    }
  }

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

      <div className="workspace-layout">
        <aside className="workspace-sidebar">
          <Panel title="Session" subtitle="Always-visible runtime summary for the active vehicle session.">
            <div className="workspace-sidebar__stack">
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
              </div>
              <div className="button-row">
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
              <div className="workspace-sidebar__meta">
                <strong>{snapshot.vehicle?.vehicle ?? 'Waiting for heartbeat'}</strong>
                <span>{snapshot.vehicle?.flightMode ?? 'No active mode yet'}</span>
              </div>
              <div className="config-pills">
                <span>{snapshot.connection.kind}</span>
                <span>{snapshot.sessionProfile === 'usb-bench' ? 'USB bench' : 'Full power'}</span>
                <span>{snapshot.parameterStats.status === 'complete' ? `${snapshot.parameterStats.downloaded} params` : formatParameterSync(snapshot)}</span>
                <span>{snapshot.preArmStatus.healthy ? 'Pre-arm clear' : `${snapshot.preArmStatus.issues.length} pre-arm`}</span>
              </div>
              <div className="sync-meter" aria-hidden="true">
                <div className="sync-meter__fill" style={{ width: `${parameterSyncWidth}%` }} />
              </div>
            </div>
          </Panel>

          <nav className="workspace-nav" aria-label="Primary configurator views">
            {appViews.map((view) => (
              <button
                key={view.id}
                type="button"
                className={`workspace-nav__item${view.id === activeViewId ? ' is-active' : ''}`}
                onClick={() => setActiveViewId(view.id)}
              >
                <div>
                  <strong>{view.label}</strong>
                  <small>{view.description}</small>
                </div>
                <StatusBadge tone={view.tone}>{view.badge}</StatusBadge>
              </button>
            ))}
          </nav>
        </aside>

        <div className="workspace-main">
      {activeViewId === 'setup' ? (
      <>
      <section className="grid two-up">
        <div id="setup-panel-link">
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
              <div className="sync-meter__fill" style={{ width: `${parameterSyncWidth}%` }} />
            </div>
          </Panel>
        </div>

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

      {selectedSetupSection ? (
        <Panel
          title="Setup Flow"
          subtitle="A stricter guided sequence for the current ArduCopter setup session, with explicit completion criteria and locked later steps until earlier work is verified."
          actions={
            <div className="button-row">
              <StatusBadge tone={completedSetupSectionCount === setupFlowSections.length ? 'success' : 'warning'}>
                {completedSetupSectionCount}/{setupFlowSections.length} complete
              </StatusBadge>
              <button
                style={buttonStyle()}
                onClick={() => setSelectedSetupSectionId(recommendedSetupSection?.id)}
                disabled={!recommendedSetupSection || recommendedSetupSection.id === selectedSetupSection.id}
              >
                Focus Next Incomplete
              </button>
            </div>
          }
        >
          <div className="setup-flow">
            {guidedSetupComplete ? (
              <div className="setup-flow__banner setup-flow__banner--success">
                <div>
                  <strong>Guided setup complete</strong>
                  <p>
                    Every guided setup step for this session has been verified and operator-confirmed. You can move on to parameter refinement,
                    optional motor testing, or backup/export work.
                  </p>
                </div>
              </div>
            ) : null}

            {setupFlowFollowUp ? (
              <div className={`setup-flow__banner setup-flow__banner--${setupFlowFollowUp.tone}`}>
                <div>
                  <strong>{setupFlowFollowUp.title}</strong>
                  <p>{setupFlowFollowUp.text}</p>
                </div>
                {setupFlowFollowUp.actions.length > 0 ? (
                  <div className="setup-flow__actions">
                    {setupFlowFollowUp.actions.map((action) => (
                      <button
                        key={`setup-follow-up:${action.kind}:${action.label}`}
                        style={buttonStyle(action.tone ?? 'secondary')}
                        onClick={() => handleSetupFlowAction(action)}
                        disabled={action.disabled}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="setup-flow__current">
              <div>
                <p className="eyebrow">Current Step</p>
                <h3>{selectedSetupSection.title}</h3>
                <p>{selectedSetupSection.summary}</p>
              </div>
              <div className="setup-flow__current-status">
                <StatusBadge tone={toneForSetupSequence(selectedSetupSection.sequenceState)}>{selectedSetupSection.sequenceState}</StatusBadge>
                <StatusBadge tone={toneForSetup(selectedSetupSection.status)}>
                  {selectedSetupSection.criteriaMetCount}/{selectedSetupSection.criteria.length} criteria
                </StatusBadge>
              </div>
            </div>

            <div className="switch-exercise-progress" aria-hidden="true">
              <div className="switch-exercise-progress__fill" style={{ width: `${setupFlowProgress}%` }} />
            </div>

            <div className="setup-flow__steps">
              {setupFlowSections.map((section, index) => (
                <button
                  key={section.id}
                  type="button"
                  className={`setup-flow-step${section.id === selectedSetupSection.id ? ' is-active' : ''}${section.status === 'complete' ? ' is-complete' : ''}${section.sequenceState === 'current' ? ' is-current' : ''}${section.sequenceState === 'locked' ? ' is-locked' : ''}`}
                  onClick={() => setSelectedSetupSectionId(section.id)}
                  disabled={section.sequenceState === 'locked'}
                >
                  <small className="setup-flow-step__eyebrow">Step {index + 1}</small>
                  <span>{section.title}</span>
                  <small>{section.sequenceState === 'locked' ? section.blockingReason ?? section.summary : section.summary}</small>
                  <div className="setup-flow-step__meta">
                    <StatusBadge tone={toneForSetupSequence(section.sequenceState)}>{section.sequenceState}</StatusBadge>
                    <span>
                      {section.criteriaMetCount}/{section.criteria.length} criteria
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className="setup-flow__detail">
              <div>
                <h3>{selectedSetupSection.title}</h3>
                <p>{selectedSetupSection.detail}</p>
                <div className="setup-flow__criteria">
                  <strong>Completion Criteria</strong>
                  <ul>
                    {selectedSetupSection.criteria.map((criterion) => (
                      <li key={criterion.label} className={criterion.met ? 'is-met' : undefined}>
                        <span>{criterion.met ? 'Complete' : 'Pending'}</span>
                        <span>{criterion.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {selectedSetupSection.evidence.length > 0 ? (
                  <div className="config-pills">
                    {selectedSetupSection.evidence.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                ) : null}
                {selectedSetupSection.blockingReason ? <p className="setup-flow__blocking-copy">{selectedSetupSection.blockingReason}</p> : null}
              </div>

              <div className="setup-flow__actions">
                {selectedSetupSection.actions.map((action) => (
                  <button
                    key={`${selectedSetupSection.id}:${action.kind}:${action.label}`}
                    style={buttonStyle(action.tone ?? 'secondary')}
                    onClick={() => handleSetupFlowAction(action)}
                    disabled={action.disabled}
                  >
                    {action.label}
                  </button>
                ))}
              </div>

              <small>
                Primary surface for this step: {selectedSetupSection.panelLabel}. Use the detailed panels below for the full live context and operator
                prompts.
              </small>
            </div>
          </div>
        </Panel>
      ) : null}
      </>
      ) : null}

      {(activeViewId === 'receiver' || activeViewId === 'power') ? (
      <section className={`grid ${activeViewId === 'receiver' || activeViewId === 'power' ? 'one-up' : 'two-up'}`}>
        {activeViewId === 'receiver' ? (
        <div id="setup-panel-rc">
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

            <div className="rc-mapping-card">
              <div className="switch-exercise-card__header">
                <div>
                  <strong>RC channel mapping</strong>
                  <p>{rcMappingSummary}</p>
                </div>
                <StatusBadge tone={toneForModeSwitchExercise(rcMappingSession.status === 'ready' ? 'passed' : rcMappingSession.status === 'running' ? 'running' : rcMappingSession.status === 'failed' ? 'failed' : 'idle')}>
                  {rcMappingSession.status}
                </StatusBadge>
              </div>

              <div className="config-pills">
                {RC_CALIBRATION_AXIS_ORDER.map((axisId) => {
                  const capture = rcMappingSession.captures[axisId]
                  return (
                    <span
                      key={axisId}
                      className={capture.detectedChannelNumber !== undefined ? 'is-complete' : rcMappingSession.currentTargetAxis === axisId ? 'is-target' : undefined}
                    >
                      {formatRcAxisLabel(axisId)}: RCMAP CH{currentRcAxisChannelMap[axisId]}
                      {capture.detectedChannelNumber !== undefined ? ` -> observed CH${capture.detectedChannelNumber}` : ''}
                    </span>
                  )
                })}
              </div>

              <div className="rc-range-axis-grid">
                {RC_CALIBRATION_AXIS_ORDER.map((axisId) => {
                  const capture = rcMappingSession.captures[axisId]
                  const activeTarget = rcMappingSession.currentTargetAxis === axisId
                  return (
                    <article
                      key={axisId}
                      className={`rc-range-axis-card${activeTarget ? ' rc-range-axis-card--target' : ''}${capture.detectedChannelNumber !== undefined ? ' rc-range-axis-card--complete' : ''}`}
                    >
                      <div className="rc-range-axis-card__header">
                        <strong>{formatRcAxisLabel(axisId)}</strong>
                        <span>RCMAP CH{currentRcAxisChannelMap[axisId]}</span>
                      </div>
                      <p>
                        {capture.detectedChannelNumber !== undefined
                          ? `Observed CH${capture.detectedChannelNumber}${capture.deltaUs !== undefined ? ` (${Math.round(capture.deltaUs)}us delta)` : ''}`
                          : activeTarget
                            ? rcMappingCandidate
                              ? `Current dominant channel CH${rcMappingCandidate.channelNumber} (${Math.round(rcMappingCandidate.deltaUs)}us delta)`
                              : 'Move only this axis until one channel clearly dominates.'
                            : 'Not captured yet'}
                      </p>
                    </article>
                  )
                })}
              </div>

              <ol className="switch-exercise-instructions">
                {rcMappingInstructions.map((instruction) => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ol>

              <div className="switch-exercise-controls">
                <button
                  style={buttonStyle('primary')}
                  onClick={handleStartRcMappingExercise}
                  disabled={!canRunRcMappingExercise || rcMappingSession.status === 'running'}
                >
                  {rcMappingSession.status === 'ready' ? 'Run Again' : 'Start Mapping'}
                </button>
                <button
                  style={buttonStyle('secondary')}
                  onClick={handleConfirmRcMappingCandidate}
                  disabled={rcMappingSession.status !== 'running' || rcMappingCandidate === undefined}
                >
                  Confirm Detected Channel
                </button>
                <button
                  style={buttonStyle('secondary')}
                  onClick={handleStageRcMappingDrafts}
                  disabled={rcMappingSession.status !== 'ready'}
                >
                  Stage RCMAP Changes
                </button>
                <button
                  style={buttonStyle()}
                  onClick={handleResetRcMappingExercise}
                  disabled={rcMappingSession.status === 'idle'}
                >
                  Reset
                </button>
                <button
                  style={buttonStyle('secondary')}
                  onClick={handleFailRcMappingExercise}
                  disabled={rcMappingSession.status !== 'running'}
                >
                  Mark Failed
                </button>
              </div>
            </div>

            <div className="rc-calibration-card">
              <div className="switch-exercise-card__header">
                <div>
                  <strong>RC calibration capture</strong>
                  <p>{rcCalibrationSummary}</p>
                </div>
                <StatusBadge tone={toneForModeSwitchExercise(rcCalibrationSession.status === 'ready' ? 'passed' : rcCalibrationSession.status === 'capturing' ? 'running' : rcCalibrationSession.status === 'failed' ? 'failed' : 'idle')}>
                  {rcCalibrationSession.status}
                </StatusBadge>
              </div>

              <div className="config-pills">
                {rcAxisObservations.map((axis) => (
                  <span key={axis.axisId}>
                    {axis.label}: CH{axis.channelNumber}
                  </span>
                ))}
              </div>

              <div className="rc-range-axis-grid">
                {RC_CALIBRATION_AXIS_ORDER.map((axisId) => {
                  const capture = rcCalibrationSession.captures[axisId]
                  return (
                    <article
                      key={axisId}
                      className={`rc-range-axis-card${rcCalibrationCaptureComplete(capture) ? ' rc-range-axis-card--complete' : ''}`}
                    >
                      <div className="rc-range-axis-card__header">
                        <strong>{capture.label}</strong>
                        <span>CH{capture.channelNumber}</span>
                      </div>
                      <p>
                        Min {capture.observedMin !== undefined ? Math.round(capture.observedMin) : 'Unknown'} us · Max{' '}
                        {capture.observedMax !== undefined ? Math.round(capture.observedMax) : 'Unknown'} us
                      </p>
                      <div className="config-pills">
                        <span className={capture.lowObserved ? 'is-complete' : undefined}>Low</span>
                        <span className={capture.highObserved ? 'is-complete' : undefined}>High</span>
                        {axisId !== 'throttle' ? (
                          <span className={capture.centeredObserved ? 'is-complete' : undefined}>
                            Trim {capture.trimPwm !== undefined ? Math.round(capture.trimPwm) : 'pending'}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  )
                })}
              </div>

              <ol className="switch-exercise-instructions">
                <li>Start capture with the sticks centered and throttle low.</li>
                <li>Move roll, pitch, throttle, and yaw through their full travel.</li>
                <li>Stage the captured values into the parameter editor, then apply and refresh before confirming the radio step.</li>
              </ol>

              <div className="switch-exercise-controls">
                <button
                  style={buttonStyle('primary')}
                  onClick={handleStartRcCalibrationCapture}
                  disabled={!canCaptureRcCalibration || rcCalibrationSession.status === 'capturing'}
                >
                  {rcCalibrationSession.status === 'ready' ? 'Capture Again' : 'Start Capture'}
                </button>
                <button
                  style={buttonStyle()}
                  onClick={handleResetRcCalibrationCapture}
                  disabled={rcCalibrationSession.status === 'idle'}
                >
                  Reset
                </button>
                <button
                  style={buttonStyle('secondary')}
                  onClick={handleStageRcCalibrationDrafts}
                  disabled={rcCalibrationSession.status !== 'ready'}
                >
                  Stage Captured Values
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
        </div>
        ) : null}

        {activeViewId === 'power' ? (
        <div id="setup-panel-power">
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

            <div className="prearm-card">
              <div className="switch-exercise-card__header">
                <div>
                  <strong>Pre-arm safety</strong>
                  <p>
                    {activePreArmIssues.length === 0
                      ? 'No active pre-arm issues are present in the shared runtime state.'
                      : `${activePreArmIssues.length} active pre-arm issue(s) need to be cleared before first flight.`}
                  </p>
                </div>
                <StatusBadge tone={activePreArmIssues.length === 0 ? 'success' : 'warning'}>
                  {activePreArmIssues.length === 0 ? 'Clear' : `${activePreArmIssues.length} issues`}
                </StatusBadge>
              </div>

              {activePreArmIssues.length > 0 ? (
                <ul className="output-note-list">
                  {activePreArmIssues.map((issue) => (
                    <li key={issue.text}>{issue.text}</li>
                  ))}
                </ul>
              ) : (
                <p className="telemetry-note">Keep the FC powered and watch this card for new pre-arm warnings as setup changes are applied.</p>
              )}
            </div>

            <p className="telemetry-note">
              The setup checklist now treats these sections as truly complete only when both the configuration values and the live telemetry agree.
            </p>
          </div>
          </Panel>
        </div>
        ) : null}
      </section>
      ) : null}

      {activeViewId === 'outputs' ? (
      <div id="setup-panel-outputs">
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

          <div className="orientation-card">
            <div className="switch-exercise-card__header">
              <div>
                <strong>Board orientation</strong>
                <p>{orientationExerciseSummary}</p>
              </div>
              <StatusBadge tone={toneForModeSwitchExercise(orientationExercise.status)}>{orientationExercise.status}</StatusBadge>
            </div>

            <div className="telemetry-metric-grid">
              <article className="telemetry-metric-card">
                <span>AHRS_ORIENTATION</span>
                <strong>{formatOrientationLabel(boardOrientation)}</strong>
              </article>
              <article className="telemetry-metric-card">
                <span>Roll</span>
                <strong>{formatDegrees(snapshot.liveVerification.attitudeTelemetry.rollDeg)}</strong>
              </article>
              <article className="telemetry-metric-card">
                <span>Pitch</span>
                <strong>{formatDegrees(snapshot.liveVerification.attitudeTelemetry.pitchDeg)}</strong>
              </article>
              <article className="telemetry-metric-card">
                <span>Yaw</span>
                <strong>{formatDegrees(snapshot.liveVerification.attitudeTelemetry.yawDeg)}</strong>
              </article>
            </div>

            <div className="config-pills">
              {ORIENTATION_EXERCISE_ORDER.map((step) => (
                <span key={step} className={orientationExercise.completedSteps.includes(step) ? 'is-complete' : orientationExercise.currentTargetStep === step ? 'is-target' : undefined}>
                  {orientationStepLabel(step)}
                </span>
              ))}
            </div>

            <ol className="switch-exercise-instructions">
              {orientationExerciseInstructions.map((instruction) => (
                <li key={instruction}>{instruction}</li>
              ))}
            </ol>

            <div className="switch-exercise-controls">
              <button
                style={buttonStyle('primary')}
                onClick={handleStartOrientationExercise}
                disabled={!canRunOrientationExercise || orientationExercise.status === 'running'}
              >
                {orientationExercise.status === 'passed' ? 'Run Again' : 'Start Orientation Check'}
              </button>
              <button
                style={buttonStyle()}
                onClick={handleResetOrientationExercise}
                disabled={orientationExercise.status === 'idle'}
              >
                Reset
              </button>
              <button
                style={buttonStyle('secondary')}
                onClick={handleFailOrientationExercise}
                disabled={orientationExercise.status !== 'running'}
              >
                Mark Failed
              </button>
            </div>
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

          <div className="motor-verification-card">
            <div className="switch-exercise-card__header">
              <div>
                <strong>Motor order & direction</strong>
                <p>{motorVerificationSummary}</p>
              </div>
              <StatusBadge tone={toneForModeSwitchExercise(motorVerification.status)}>{motorVerification.status}</StatusBadge>
            </div>

            <div className="config-pills">
              {outputMapping.motorOutputs.map((output) => {
                const verified = motorVerification.verifiedOutputs.includes(output.channelNumber)
                const targeted = motorVerification.currentOutputChannel === output.channelNumber
                return (
                  <span key={output.paramId} className={verified ? 'is-complete' : targeted ? 'is-target' : undefined}>
                    OUT{output.channelNumber}
                    {output.motorNumber !== undefined ? ` / M${output.motorNumber}` : ''} · {output.functionLabel}
                  </span>
                )
              })}
            </div>

            <ol className="switch-exercise-instructions">
              <li>Remove props, acknowledge the motor-test guardrails, and use full-power mode only.</li>
              <li>Spin the targeted output with the guarded motor test.</li>
              <li>Confirm that the expected motor spins and that direction is correct for the frame.</li>
            </ol>

            <div className="switch-exercise-controls">
              <button
                style={buttonStyle('primary')}
                onClick={handleStartMotorVerification}
                disabled={!canRunMotorVerification || motorVerification.status === 'running'}
              >
                {motorVerification.status === 'passed' ? 'Run Again' : 'Start Verification'}
              </button>
              <button
                style={buttonStyle()}
                onClick={() => setMotorTestOutput(motorVerification.currentOutputChannel)}
                disabled={motorVerification.currentOutputChannel === undefined}
              >
                Target Current Output
              </button>
              <button
                style={buttonStyle('secondary')}
                onClick={handleConfirmMotorVerification}
                disabled={
                  motorVerification.status !== 'running' ||
                  snapshot.motorTest.status !== 'succeeded' ||
                  snapshot.motorTest.selectedOutputChannel !== motorVerification.currentOutputChannel
                }
              >
                Confirm Motor & Direction
              </button>
              <button
                style={buttonStyle('secondary')}
                onClick={handleFailMotorVerification}
                disabled={motorVerification.status !== 'running'}
              >
                Mark Failed
              </button>
              <button
                style={buttonStyle()}
                onClick={handleResetMotorVerification}
                disabled={motorVerification.status === 'idle'}
              >
                Reset
              </button>
            </div>
          </div>

          <div className="esc-review-card">
            <div className="switch-exercise-card__header">
              <div>
                <strong>ESC calibration & motor range</strong>
                <p>{escReviewSummary}</p>
              </div>
              <StatusBadge tone={escReviewConfirmation ? 'success' : escSetup.calibrationPath === 'manual-review' ? 'warning' : 'neutral'}>
                {escReviewConfirmation ? 'confirmed' : escCalibrationPathLabel(escSetup.calibrationPath)}
              </StatusBadge>
            </div>

            <div className="telemetry-metric-grid">
              <article className="telemetry-metric-card">
                <span>Protocol</span>
                <strong>{escSetup.pwmTypeLabel}</strong>
              </article>
              {escSetup.relevantParameters.map((parameter) => (
                parameter.value !== undefined ? (
                  <article key={parameter.id} className="telemetry-metric-card">
                    <span>{parameter.id}</span>
                    <strong>{Number.isInteger(parameter.value) ? parameter.value : parameter.value.toFixed(2).replace(/\.?0+$/, '')}</strong>
                  </article>
                ) : null
              ))}
            </div>

            <ol className="switch-exercise-instructions">
              {escCalibrationInstructions(escSetup).map((instruction) => (
                <li key={instruction}>{instruction}</li>
              ))}
            </ol>

            <ul className="output-note-list">
              {escSetup.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>

            <div className="switch-exercise-controls">
              <button
                style={buttonStyle(escReviewConfirmation ? 'secondary' : 'primary')}
                onClick={() => (escReviewConfirmation ? clearSetupSectionConfirmation('esc-range') : confirmSetupSection('esc-range'))}
                disabled={outputMapping.motorOutputs.length === 0}
              >
                {escReviewConfirmation
                  ? 'Clear ESC Review'
                  : escSetup.calibrationPath === 'analog-calibration'
                    ? 'Confirm ESC Calibration Review'
                    : 'Confirm ESC Range Review'}
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
      </div>
      ) : null}

      {activeViewId === 'setup' ? (
      <div id="setup-panel-guided">
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
      </div>
      ) : null}

      {activeViewId === 'parameters' ? (
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
                {parameterFollowUp.requiresReboot ? 'reboot' : 'refresh'}
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
                  disabled={parameterFollowUp.requiresReboot || busyAction !== undefined || !canRunGuidedAction(snapshot, 'request-parameters')}
                >
                  Pull Parameters
                </button>
              </div>
            </div>
          ) : null}

          {parameterDraftSummary.stagedCategories.length > 0 ? (
            <small className="parameter-review__hint">
              Categories in review: {parameterDraftSummary.stagedCategories.map((categoryId) => formatCategoryLabel(categoryId)).join(', ')}
            </small>
          ) : null}

          {stagedParameterGroups.length > 0 ? (
            <div className="parameter-diff-grid">
              {stagedParameterGroups.map((group) => (
                <section key={group.category} className="parameter-diff-group">
                  <header>
                    <strong>{formatCategoryLabel(group.category)}</strong>
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
                    <strong>{formatCategoryLabel(group.category)}</strong>
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
                <strong>{formatCategoryLabel(selectedParameter.definition?.category)}</strong>
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
                  <small>{formatCategoryLabel(parameter.definition?.category)}</small>
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
      ) : null}
        </div>
      </div>
    </main>
  )
}
