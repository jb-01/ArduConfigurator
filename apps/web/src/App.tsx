import type { ChangeEvent, Dispatch, SetStateAction } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  ArduPilotConfiguratorRuntime,
  MAX_MOTOR_TEST_DURATION_SECONDS,
  MAX_MOTOR_TEST_THROTTLE_PERCENT,
  advanceModeSwitchExerciseState,
  advanceRcRangeExerciseState,
  createParameterBackup,
  createParameterSnapshotLibrary,
  createIdleModeSwitchExerciseState,
  createIdleRcRangeExerciseState,
  createModeSwitchExerciseState,
  createRcRangeExerciseState,
  deriveEscSetupSummary,
  deriveDraftValuesFromParameterBackup,
  deriveDraftValuesFromParameterPreset,
  deriveArducopterAirframe,
  deriveModeExerciseAssignments,
  deriveParameterDraftEntries,
  deriveModeAssignments,
  deriveModeSwitchEstimate,
  deriveOutputMappingSummary,
  deriveRcAxisChannelMap,
  deriveRcAxisObservations,
  deriveRcMapDraftValues,
  detectDominantRcChannelChange,
  evaluateParameterPresetApplicability,
  evaluateMotorTestEligibility,
  failModeSwitchExerciseState,
  failRcRangeExerciseState,
  formatModeExerciseTargetLabel,
  formatModeSlotLabel,
  formatRcAxisLabel,
  groupParameterDraftEntries,
  parseParameterBackup,
  parseParameterSnapshotInput,
  serializeParameterBackup,
  serializeParameterSnapshotLibrary,
  sortParameterSnapshots,
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
  ARDUCOPTER_MSP_OPTION_BIT_LABELS,
  ARDUCOPTER_NOTIFICATION_BUZZER_TYPE_BIT_LABELS,
  ARDUCOPTER_NOTIFICATION_LED_TYPE_BIT_LABELS,
  arducopterMetadata,
  formatArducopterBatteryMonitor,
  formatArducopterBatteryFailsafeAction,
  formatArducopterBatteryVoltageSource,
  formatArducopterFlightModeChannel,
  formatArducopterFlightMode,
  formatArducopterGpsAutoConfig,
  formatArducopterGpsAutoSwitch,
  formatArducopterGpsPrimary,
  formatArducopterGpsRateMs,
  formatArducopterGpsType,
  formatArducopterMspOsdCellCount,
  formatArducopterNotificationLedBrightness,
  formatArducopterNotificationLedOverride,
  formatArducopterOsdChannel,
  formatArducopterOsdSwitchMethod,
  formatArducopterOsdType,
  formatArducopterRssiType,
  formatArducopterSerialBaud,
  formatArducopterSerialProtocol,
  formatArducopterSerialRtscts,
  formatArducopterThrottleFailsafe,
  formatArducopterVtxEnable,
  normalizeFirmwareMetadata,
  type AppViewId,
  type NormalizedFirmwareMetadataBundle,
  type NormalizedPresetDefinition,
  type ParameterDefinition,
  type ParameterValueOption,
  type SessionProfile,
} from '@arduconfig/param-metadata'
import { MavlinkSession, MavlinkV2Codec, createArduCopterMockScenario } from '@arduconfig/protocol-mavlink'
import { MockTransport, WebSerialTransport, WebSocketTransport } from '@arduconfig/transport'
import { Panel, StatusBadge, buttonStyle } from '@arduconfig/ui-kit'

import { getDesktopBridge } from './desktop-bridge'
import { FlightDeckPreview } from './flight-deck-preview'
import { LiveGpsMapCard } from './live-gps-map'
import { RcChannelBars } from './rc-channel-bars'
import { MotorTestSliders } from './motor-test-sliders'
import { RateCurveGraph } from './rate-curve-graph'
import {
  createSavedSnapshot,
  loadStoredSnapshots,
  persistSnapshots,
  type SavedParameterSnapshot,
  type SnapshotStorageLoadResult
} from './snapshot-library'

const actionLabels = {
  'request-parameters': 'Pull Parameters',
  'calibrate-accelerometer': 'Calibrate Accelerometer',
  'calibrate-compass': 'Calibrate Compass',
  'reboot-autopilot': 'Request Reboot'
} as const

const OUTPUT_REVIEW_PARAM_IDS = ['MOT_PWM_TYPE', 'MOT_PWM_MIN', 'MOT_PWM_MAX', 'MOT_SPIN_ARM', 'MOT_SPIN_MIN', 'MOT_SPIN_MAX'] as const
const OUTPUT_NOTIFICATION_PARAM_IDS = [
  'NTF_LED_TYPES',
  'NTF_LED_LEN',
  'NTF_LED_BRIGHT',
  'NTF_LED_OVERRIDE',
  'NTF_BUZZ_TYPES',
  'NTF_BUZZ_VOLUME'
] as const
const PORTS_PERIPHERAL_PARAM_IDS = [
  'GPS_TYPE',
  'GPS_TYPE2',
  'GPS_AUTO_CONFIG',
  'GPS_AUTO_SWITCH',
  'GPS_PRIMARY',
  'GPS_RATE_MS',
  'OSD_TYPE',
  'OSD_CHAN',
  'OSD_SW_METHOD',
  'MSP_OPTIONS',
  'MSP_OSD_NCELLS',
  'VTX_ENABLE',
  'VTX_FREQ',
  'VTX_POWER',
  'VTX_MAX_POWER',
  'VTX_OPTIONS'
] as const
const POWER_REVIEW_PARAM_IDS = [
  'BATT_MONITOR',
  'BATT_CAPACITY',
  'BATT_ARM_VOLT',
  'BATT_ARM_MAH',
  'BATT_FS_VOLTSRC',
  'BATT_LOW_VOLT',
  'BATT_LOW_MAH',
  'BATT_FS_LOW_ACT',
  'BATT_CRT_VOLT',
  'BATT_CRT_MAH',
  'BATT_FS_CRT_ACT',
  'FS_THR_ENABLE',
  'FS_THR_VALUE'
] as const
const RECEIVER_SUPPORT_PARAM_IDS = ['FLTMODE_CH', 'MODE_CH', 'RSSI_TYPE', 'RSSI_CHANNEL', 'RSSI_CHAN_LOW', 'RSSI_CHAN_HIGH'] as const
const TUNING_FLIGHT_FEEL_PARAM_IDS = ['ATC_INPUT_TC', 'ANGLE_MAX', 'PILOT_Y_RATE', 'PILOT_Y_EXPO'] as const
const TUNING_ACRO_PARAM_IDS = ['ACRO_RP_RATE', 'ACRO_Y_RATE', 'ACRO_RP_EXPO', 'ACRO_Y_EXPO'] as const
const TUNING_PARAM_IDS = [...TUNING_FLIGHT_FEEL_PARAM_IDS, ...TUNING_ACRO_PARAM_IDS] as const
const PRESET_AUTO_BACKUP_TAGS = ['auto-backup', 'preset'] as const
const DEFAULT_WEBSOCKET_URL = 'ws://127.0.0.1:14550'

type TransportMode = 'demo' | 'web-serial' | 'websocket'
type ProductMode = 'basic' | 'expert'
type SetupMode = 'overview' | 'wizard'
type StatusTone = 'neutral' | 'success' | 'warning' | 'danger'
type ModeSwitchExerciseStatus = 'idle' | 'running' | 'passed' | 'failed'

const PRODUCT_MODE_STORAGE_KEY = 'arduconfig:product-mode'

interface AppViewDescriptor {
  id: AppViewId
  label: string
  description: string
  badge: string
  tone: StatusTone
}

interface WorkspaceNavSectionDefinition {
  id: 'flight' | 'bench' | 'change' | 'expert'
  label: string
  description: string
  viewIds: AppViewId[]
}

interface WorkspaceNavSection {
  id: WorkspaceNavSectionDefinition['id']
  label: string
  description: string
  views: AppViewDescriptor[]
}

interface RcChannelDisplay {
  channelNumber: number
  role: string
  pwm: number | undefined
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

interface SerialPortViewModel {
  portNumber: number
  label: string
  protocolParameter?: ParameterState
  baudParameter?: ParameterState
  flowControlParameter?: ParameterState
  protocolValue?: number
  baudValue?: number
  flowControlValue?: number
  protocolLabel: string
  baudLabel: string
  flowControlLabel?: string
  usageSummary: string
  notes: string[]
  editable: boolean
}

interface GpsPeripheralViewModel {
  label: string
  parameter?: ParameterState
  value?: number
}

interface AdditionalSettingsGroup {
  categoryId: string
  categoryLabel: string
  categoryDescription: string
  parameters: ParameterState[]
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

function viewMonogram(viewId: AppViewId): string {
  switch (viewId) {
    case 'setup':
      return 'ST'
    case 'ports':
      return 'PR'
    case 'receiver':
      return 'RX'
    case 'outputs':
      return 'OUT'
    case 'power':
      return 'PWR'
    case 'snapshots':
      return 'SNP'
    case 'tuning':
      return 'TUN'
    case 'presets':
      return 'PRE'
    case 'parameters':
      return 'PAR'
    default:
      return 'APP'
  }
}

const WORKSPACE_NAV_SECTIONS: WorkspaceNavSectionDefinition[] = [
  {
    id: 'flight',
    label: 'Flight Deck',
    description: 'Connect, inspect, and keep the aircraft state legible.',
    viewIds: ['setup']
  },
  {
    id: 'bench',
    label: 'Bench Setup',
    description: 'Wire, verify, and harden the aircraft before flight.',
    viewIds: ['ports', 'receiver', 'outputs', 'power']
  },
  {
    id: 'change',
    label: 'Change Control',
    description: 'Manage baselines, presets, and deliberate configuration changes.',
    viewIds: ['snapshots', 'presets', 'tuning']
  },
  {
    id: 'expert',
    label: 'Engineering',
    description: 'Direct parameter access and deep inspection.',
    viewIds: ['parameters']
  }
]

function missionTitleForView(viewId: AppViewId): string {
  switch (viewId) {
    case 'setup':
      return 'Flight Deck'
    case 'ports':
      return 'Ports & Peripheral Routing'
    case 'receiver':
      return 'Receiver Workbench'
    case 'outputs':
      return 'Outputs & Bench Lab'
    case 'power':
      return 'Power & Safety'
    case 'snapshots':
      return 'Snapshots & Restore'
    case 'tuning':
      return 'Flight Feel'
    case 'presets':
      return 'Guided Presets'
    case 'parameters':
      return 'Expert Parameters'
    default:
      return 'Configurator'
  }
}

function missionSectionLabelForView(viewId: AppViewId): string {
  const section = WORKSPACE_NAV_SECTIONS.find((candidate) => candidate.viewIds.includes(viewId))
  return section?.label ?? 'Configurator'
}

function AttitudePreview({
  snapshot,
  compact = false,
  frameClassLabel,
  frameTypeLabel
}: {
  snapshot: ConfiguratorSnapshot
  compact?: boolean
  frameClassLabel?: string
  frameTypeLabel?: string
}) {
  return (
    <FlightDeckPreview
      rollDeg={snapshot.liveVerification.attitudeTelemetry.rollDeg}
      pitchDeg={snapshot.liveVerification.attitudeTelemetry.pitchDeg}
      yawDeg={snapshot.liveVerification.attitudeTelemetry.yawDeg}
      flightMode={snapshot.vehicle?.flightMode}
      verified={snapshot.liveVerification.attitudeTelemetry.verified}
      frameClassLabel={frameClassLabel}
      frameTypeLabel={frameTypeLabel}
      compact={compact}
      testId={compact ? undefined : 'setup-craft-preview'}
    />
  )
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
      return { panelId: 'setup-panel-link', panelLabel: 'Vehicle Link' }
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
    case 'setup-panel-ports':
      return 'ports'
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

function createRuntime(mode: TransportMode, websocketUrl: string): ArduPilotConfiguratorRuntime {
  const transport = (() => {
    if (mode === 'web-serial') {
      return new WebSerialTransport('browser-serial', {
        baudRate: 115200
      })
    }

    if (mode === 'websocket') {
      return new WebSocketTransport('browser-websocket', {
        url: websocketUrl
      })
    }

    const scenario = createArduCopterMockScenario()
    return new MockTransport('mock-arducopter', {
      initialFrames: scenario.initialFrames,
      respondToOutbound: scenario.respondToOutbound,
      frameIntervalMs: 12,
      responseDelayMs: 20,
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

function connectButtonLabel(snapshot: ConfiguratorSnapshot, parameterFollowUp: ParameterFollowUp | undefined): string {
  if (snapshot.connection.kind === 'error' || parameterFollowUp !== undefined || snapshot.vehicle !== undefined) {
    return 'Reconnect'
  }

  return 'Connect'
}

function describeConnectFailure(
  transportMode: TransportMode,
  connection: ConfiguratorSnapshot['connection'],
  error: unknown
): string {
  const message =
    connection.kind === 'error'
      ? connection.message
      : error instanceof Error
        ? error.message
        : 'Unknown connection error.'

  if (message.includes('Timed out waiting for vehicle heartbeat')) {
    return transportMode === 'web-serial'
      ? 'The serial link opened, but no ArduPilot heartbeat arrived in time. Re-select the flight controller port, close any other serial app using it, and try again.'
      : 'The link opened, but no ArduPilot heartbeat arrived in time. Confirm the selected transport is pointed at a live flight controller and try again.'
  }

  if (transportMode === 'web-serial') {
    return `${message} If the flight controller is already plugged in, close any other app using the serial port and reconnect.`
  }

  return message
}

function isExpertOnlyView(viewId: AppViewId): boolean {
  return viewId === 'parameters'
}

function readStoredProductMode(): ProductMode {
  if (typeof window === 'undefined') {
    return 'basic'
  }

  try {
    const stored = window.sessionStorage.getItem(PRODUCT_MODE_STORAGE_KEY)
    return stored === 'expert' ? 'expert' : 'basic'
  } catch {
    return 'basic'
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

function toneForScopedDraftReview(stagedCount: number, invalidCount: number): StatusTone {
  if (invalidCount > 0) {
    return 'danger'
  }
  if (stagedCount > 0) {
    return 'warning'
  }
  return 'success'
}

function toneForPresetApplicability(status: 'ready' | 'caution' | 'blocked'): StatusTone {
  switch (status) {
    case 'blocked':
      return 'danger'
    case 'caution':
      return 'warning'
    default:
      return 'success'
  }
}

function isReceiverReviewParamId(paramId: string): boolean {
  return (
    paramId.startsWith('RCMAP_') ||
    /^RC\d+_(MIN|MAX|TRIM)$/.test(paramId) ||
    /^FLTMODE\d+$/.test(paramId) ||
    RECEIVER_SUPPORT_PARAM_IDS.includes(paramId as (typeof RECEIVER_SUPPORT_PARAM_IDS)[number])
  )
}

function isPortsReviewParamId(paramId: string): boolean {
  return (
    /^SERIAL\d+_(PROTOCOL|BAUD)$/.test(paramId) ||
    /^BRD_SER\d+_RTSCTS$/.test(paramId) ||
    PORTS_PERIPHERAL_PARAM_IDS.includes(paramId as (typeof PORTS_PERIPHERAL_PARAM_IDS)[number])
  )
}

function isPowerReviewParamId(paramId: string): boolean {
  return POWER_REVIEW_PARAM_IDS.includes(paramId as (typeof POWER_REVIEW_PARAM_IDS)[number])
}

function isOutputAssignmentParamId(paramId: string): boolean {
  return /^SERVO([1-9]|1[0-6])_FUNCTION$/.test(paramId)
}

function isTuningReviewParamId(paramId: string): boolean {
  return TUNING_PARAM_IDS.includes(paramId as (typeof TUNING_PARAM_IDS)[number])
}

function serialPortDisplayName(portNumber: number): string {
  switch (portNumber) {
    case 0:
      return 'USB / Console'
    case 1:
      return 'Telemetry 1'
    case 2:
      return 'Telemetry 2'
    case 3:
      return 'GPS / UART3'
    default:
      return `Serial ${portNumber}`
  }
}

function describeSerialPortUsage(protocolValue: number | undefined): string {
  switch (protocolValue) {
    case -1:
      return 'Disabled in the current configuration.'
    case 1:
    case 2:
      return 'Telemetry / companion link.'
    case 5:
      return 'GPS or GNSS receiver.'
    case 16:
      return 'ESC telemetry input.'
    case 20:
    case 21:
      return 'MSP peripheral or sensor link.'
    case 22:
      return 'DisplayPort OSD / display peripheral.'
    case 23:
    case 24:
    case 33:
      return 'Serial receiver / RC input path.'
    case 30:
    case 34:
    case 38:
    case 40:
    case 43:
      return 'VTX control or related video peripheral.'
    case 36:
      return 'ADS-B receiver input.'
    case 41:
      return 'Rangefinder or similar distance peripheral.'
    default:
      return 'Peripheral or accessory link.'
  }
}

function isReceiverSerialProtocol(protocolValue: number | undefined): boolean {
  return protocolValue === 23 || protocolValue === 24 || protocolValue === 33
}

function isVtxControlSerialProtocol(protocolValue: number | undefined): boolean {
  return protocolValue === 30 || protocolValue === 34 || protocolValue === 38 || protocolValue === 40 || protocolValue === 43
}

function isOsdSerialProtocol(protocolValue: number | undefined): boolean {
  return protocolValue === 20 || protocolValue === 22 || protocolValue === 34
}

function isNotificationLedServoFunction(functionValue: number | undefined): boolean {
  return functionValue !== undefined && functionValue >= 120 && functionValue <= 123
}

function parseServoOutputChannelNumber(paramId: string): number | undefined {
  const match = paramId.match(/^SERVO(\d+)_FUNCTION$/)
  return match ? Number(match[1]) : undefined
}

function parseSerialPortNumber(paramId: string): number | undefined {
  const match = paramId.match(/^SERIAL(\d+)_(PROTOCOL|BAUD)$/)
  return match ? Number(match[1]) : undefined
}

function buildSerialPortViewModels(snapshot: ConfiguratorSnapshot): SerialPortViewModel[] {
  const parameterById = new Map(snapshot.parameters.map((parameter) => [parameter.id, parameter]))
  const portNumbers = [...new Set(
    snapshot.parameters
      .map((parameter) => {
        const match = parameter.id.match(/^SERIAL(\d+)_(PROTOCOL|BAUD)$/)
        return match ? Number(match[1]) : undefined
      })
      .filter((portNumber): portNumber is number => portNumber !== undefined)
  )].sort((left, right) => left - right)

  return portNumbers.map((portNumber) => {
    const protocolParameter = parameterById.get(`SERIAL${portNumber}_PROTOCOL`)
    const baudParameter = parameterById.get(`SERIAL${portNumber}_BAUD`)
    const flowControlParameter = portNumber > 0 ? parameterById.get(`BRD_SER${portNumber}_RTSCTS`) : undefined
    const protocolValue = protocolParameter?.value
    const baudValue = baudParameter?.value
    const flowControlValue = flowControlParameter?.value

    const notes = portNumber === 0
      ? ['USB / console is shown for awareness. Leave it on MAVLink unless there is a specific board-level reason to change it.']
      : []

    return {
      portNumber,
      label: serialPortDisplayName(portNumber),
      protocolParameter,
      baudParameter,
      flowControlParameter,
      protocolValue,
      baudValue,
      flowControlValue,
      protocolLabel: formatArducopterSerialProtocol(protocolValue),
      baudLabel: formatArducopterSerialBaud(baudValue),
      flowControlLabel: flowControlParameter ? formatArducopterSerialRtscts(flowControlValue) : undefined,
      usageSummary: describeSerialPortUsage(protocolValue),
      notes,
      editable: portNumber !== 0 && protocolParameter !== undefined && baudParameter !== undefined
    }
  })
}

function buildAdditionalSettingsGroups(
  snapshot: ConfiguratorSnapshot,
  metadataCatalog: NormalizedFirmwareMetadataBundle,
  viewId: AppViewId,
  excludedParameterIds: Set<string>
): AdditionalSettingsGroup[] {
  const parameterById = new Map(snapshot.parameters.map((parameter) => [parameter.id, parameter]))

  return metadataCatalog.categories
    .filter((category) => category.viewId === viewId)
    .map((category) => {
      const parameters = (metadataCatalog.parametersByCategory[category.id] ?? [])
        .map((definition) => parameterById.get(definition.id))
        .filter((parameter): parameter is ParameterState => parameter !== undefined && !excludedParameterIds.has(parameter.id))

      return {
        categoryId: category.id,
        categoryLabel: category.label,
        categoryDescription: category.description,
        parameters
      }
    })
    .filter((group) => group.parameters.length > 0)
}

function buildGpsPeripheralViewModels(snapshot: ConfiguratorSnapshot): GpsPeripheralViewModel[] {
  return [
    {
      label: 'Primary GPS',
      parameter: snapshot.parameters.find((parameter) => parameter.id === 'GPS_TYPE'),
      value: readRoundedParameter(snapshot, 'GPS_TYPE')
    },
    {
      label: 'Secondary GPS',
      parameter: snapshot.parameters.find((parameter) => parameter.id === 'GPS_TYPE2'),
      value: readRoundedParameter(snapshot, 'GPS_TYPE2')
    }
  ].filter((peripheral) => peripheral.parameter !== undefined)
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
  return formatArducopterBatteryMonitor(value)
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

function canApplyParameterChanges(snapshot: ConfiguratorSnapshot, parameterFollowUp?: ParameterFollowUp): boolean {
  return (
    snapshot.connection.kind === 'connected' &&
    snapshot.parameterStats.status === 'complete' &&
    snapshot.vehicle !== undefined &&
    !snapshot.vehicle.armed &&
    !hasRunningGuidedAction(snapshot) &&
    !parameterFollowUp?.refreshRequired
  )
}

function createDraftSignature(entries: readonly ParameterDraftEntry[]): string {
  if (entries.length === 0) {
    return 'none'
  }

  return JSON.stringify(
    entries.map((entry) => ({
      id: entry.id,
      status: entry.status,
      currentValue: entry.currentValue,
      nextValue: entry.nextValue,
      rawValue: entry.rawValue,
      reason: entry.reason
    }))
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

function normalizeBitmaskValue(rawValue: string | undefined, fallbackValue: number | undefined): number {
  const parsed = rawValue === undefined || rawValue === '' ? Number.NaN : Number(rawValue)
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallbackValue ?? 0
}

function hasBitmaskFlag(value: number | undefined, bit: number): boolean {
  if (value === undefined || !Number.isFinite(value)) {
    return false
  }

  return (Math.round(value) & (1 << bit)) !== 0
}

function describeBitmaskSelections(
  value: number | undefined,
  labelMap: Record<number, string>,
  emptyLabel = 'None'
): string {
  if (value === undefined || !Number.isFinite(value)) {
    return 'Unknown'
  }

  const labels = Object.entries(labelMap)
    .map(([bit, label]) => ({ bit: Number(bit), label }))
    .filter(({ bit }) => hasBitmaskFlag(value, bit))
    .map(({ label }) => label)

  return labels.length > 0 ? labels.join(', ') : emptyLabel
}

function formatAngleMaxDegrees(rawValue: number | undefined): string {
  if (rawValue === undefined || !Number.isFinite(rawValue)) {
    return 'Unknown'
  }

  return `${Math.round(rawValue / 100)} deg`
}

function tuningInputValue(parameter: ParameterState, editedValues: Record<string, string>): string {
  const rawValue = editedValues[parameter.id]
  if (parameter.id === 'ANGLE_MAX') {
    if (rawValue === undefined) {
      return String(Math.round(parameter.value / 100))
    }

    const parsed = Number(rawValue)
    return Number.isFinite(parsed) ? String(Math.round(parsed / 100)) : ''
  }

  return rawValue ?? String(parameter.value)
}

function stageTuningInputValue(
  parameter: ParameterState,
  nextValue: string,
  setEditedValues: Dispatch<SetStateAction<Record<string, string>>>
): void {
  if (parameter.id === 'ANGLE_MAX') {
    setEditedValues((existing) => ({
      ...existing,
      [parameter.id]: nextValue.trim().length === 0 ? '' : String(Math.round(Number(nextValue) * 100))
    }))
    return
  }

  setEditedValues((existing) => ({
    ...existing,
    [parameter.id]: nextValue
  }))
}

function buildParameterBackupFilename(snapshot: ConfiguratorSnapshot): string {
  const vehicleLabel = snapshot.vehicle?.vehicle?.toLowerCase() ?? 'vehicle'
  const dateLabel = new Date().toISOString().replace(/[:]/g, '-').replace(/\..+$/, '')
  return `arduconfig-${vehicleLabel}-params-${dateLabel}.json`
}

function buildSnapshotFilename(savedSnapshot: SavedParameterSnapshot): string {
  const label = savedSnapshot.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const dateLabel = savedSnapshot.capturedAt.replace(/[:]/g, '-').replace(/\..+$/, '')
  return `arduconfig-${label || 'snapshot'}-${dateLabel}.json`
}

function formatSnapshotTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString()
}

function buildSnapshotLibraryFilename(): string {
  const dateLabel = new Date().toISOString().replace(/[:]/g, '-').replace(/\..+$/, '')
  return `arduconfig-snapshot-library-${dateLabel}.json`
}

function buildPresetAutoBackupLabel(snapshot: ConfiguratorSnapshot, preset: NormalizedPresetDefinition): string {
  const vehicleLabel = snapshot.vehicle?.vehicle ?? 'Vehicle'
  return `${vehicleLabel} pre-preset ${preset.label}`
}

function buildPresetAutoBackupNote(preset: NormalizedPresetDefinition): string {
  return `Automatically captured before applying preset "${preset.label}".`
}

function parseSnapshotTags(rawValue: string): string[] {
  return rawValue
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
}

function mergeSavedSnapshots(
  existingSnapshots: readonly SavedParameterSnapshot[],
  incomingSnapshots: readonly SavedParameterSnapshot[]
): SavedParameterSnapshot[] {
  const mergedById = new Map(existingSnapshots.map((savedSnapshot) => [savedSnapshot.id, savedSnapshot]))
  incomingSnapshots.forEach((savedSnapshot) => {
    mergedById.set(savedSnapshot.id, savedSnapshot)
  })
  return sortParameterSnapshots([...mergedById.values()])
}

function updateSavedSnapshot(
  snapshots: readonly SavedParameterSnapshot[],
  snapshotId: string,
  transform: (snapshot: SavedParameterSnapshot) => SavedParameterSnapshot
): SavedParameterSnapshot[] {
  return sortParameterSnapshots(
    snapshots.map((savedSnapshot) => (savedSnapshot.id === snapshotId ? transform(savedSnapshot) : savedSnapshot))
  )
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
  const desktopBridge = getDesktopBridge()
  const [transportMode, setTransportMode] = useState<TransportMode>('demo')
  const [websocketUrl, setWebsocketUrl] = useState(DEFAULT_WEBSOCKET_URL)
  const [sessionProfile, setSessionProfile] = useState<SessionProfile>('full-power')
  const [productMode, setProductMode] = useState<ProductMode>(readStoredProductMode)
  const [activeViewId, setActiveViewId] = useState<AppViewId>('setup')
  const runtime = useMemo(() => createRuntime(transportMode, websocketUrl), [transportMode, websocketUrl])
  const initialSnapshotStorage = useMemo<SnapshotStorageLoadResult>(() => loadStoredSnapshots(), [])
  const [snapshot, setSnapshot] = useState<ConfiguratorSnapshot>(runtime.getSnapshot())
  const [savedSnapshots, setSavedSnapshots] = useState<SavedParameterSnapshot[]>(initialSnapshotStorage.snapshots)
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>()
  const [selectedPresetId, setSelectedPresetId] = useState<string>()
  const [desktopSnapshotLibraryPath, setDesktopSnapshotLibraryPath] = useState<string>()
  const [desktopSnapshotLibraryName, setDesktopSnapshotLibraryName] = useState<string>()
  const [snapshotLabelInput, setSnapshotLabelInput] = useState('')
  const [snapshotNoteInput, setSnapshotNoteInput] = useState('')
  const [snapshotTagsInput, setSnapshotTagsInput] = useState('')
  const [snapshotProtectedInput, setSnapshotProtectedInput] = useState(false)
  const [parameterSearch, setParameterSearch] = useState('')
  const [editedValues, setEditedValues] = useState<Record<string, string>>({})
  const [selectedParameterId, setSelectedParameterId] = useState<string>()
  const [parameterNotice, setParameterNotice] = useState<ParameterNotice>()
  const [snapshotNotice, setSnapshotNotice] = useState<ParameterNotice>()
  const [snapshotStorageNotice, setSnapshotStorageNotice] = useState<ParameterNotice | undefined>(() =>
    initialSnapshotStorage.warning
      ? {
          tone: 'warning',
          text: initialSnapshotStorage.warning
        }
      : undefined
  )
  const [presetNotice, setPresetNotice] = useState<ParameterNotice>()
  const [sessionNotice, setSessionNotice] = useState<ParameterNotice>()
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
  const [showAllOutputAssignments, setShowAllOutputAssignments] = useState(false)
  const [showAllSerialPorts, setShowAllSerialPorts] = useState(false)
  const [snapshotRestoreAcknowledged, setSnapshotRestoreAcknowledged] = useState(false)
  const [presetApplyAcknowledged, setPresetApplyAcknowledged] = useState(false)
  const [selectedSetupSectionId, setSelectedSetupSectionId] = useState<string>()
  const [setupMode, setSetupMode] = useState<SetupMode>('overview')
  const [setupConfirmations, setSetupConfirmations] = useState<Record<string, SetupConfirmationRecord>>({})
  const parameterBackupInputRef = useRef<HTMLInputElement>(null)
  const snapshotImportInputRef = useRef<HTMLInputElement>(null)
  const previousModeSwitchRef = useRef<{ slot?: number; pwm?: number }>({})
  const webSerialSupported = WebSerialTransport.isSupported()
  const parameterSyncWidth = snapshot.parameterStats.progress === null ? 0 : snapshot.parameterStats.progress * 100
  const rcChannelDisplays = buildRcChannelDisplays(snapshot)
  const airframe = deriveArducopterAirframe(snapshot)
  const modeAssignments = deriveModeAssignments(snapshot)
  const modeExerciseAssignments = deriveModeExerciseAssignments(snapshot)
  const modeSwitchEstimate = deriveModeSwitchEstimate(snapshot)
  const outputMapping = deriveOutputMappingSummary(snapshot)
  const escSetup = deriveEscSetupSummary(snapshot)
  const currentRcAxisChannelMap = deriveRcAxisChannelMap(snapshot)
  const rcAxisObservations = deriveRcAxisObservations(snapshot)
  const gpsAutoConfig = readRoundedParameter(snapshot, 'GPS_AUTO_CONFIG')
  const gpsAutoSwitch = readRoundedParameter(snapshot, 'GPS_AUTO_SWITCH')
  const gpsPrimary = readRoundedParameter(snapshot, 'GPS_PRIMARY')
  const gpsRateMs = readRoundedParameter(snapshot, 'GPS_RATE_MS')
  const osdType = readRoundedParameter(snapshot, 'OSD_TYPE')
  const osdChannel = readRoundedParameter(snapshot, 'OSD_CHAN')
  const osdSwitchMethod = readRoundedParameter(snapshot, 'OSD_SW_METHOD')
  const mspOptions = readRoundedParameter(snapshot, 'MSP_OPTIONS')
  const mspOsdCellCount = readRoundedParameter(snapshot, 'MSP_OSD_NCELLS')
  const vtxEnabled = readRoundedParameter(snapshot, 'VTX_ENABLE')
  const vtxFrequency = readRoundedParameter(snapshot, 'VTX_FREQ')
  const vtxPower = readRoundedParameter(snapshot, 'VTX_POWER')
  const vtxMaxPower = readRoundedParameter(snapshot, 'VTX_MAX_POWER')
  const vtxOptions = readRoundedParameter(snapshot, 'VTX_OPTIONS')
  const batteryMonitor = readRoundedParameter(snapshot, 'BATT_MONITOR')
  const batteryCapacity = readRoundedParameter(snapshot, 'BATT_CAPACITY')
  const batteryArmVoltage = readParameterValue(snapshot, 'BATT_ARM_VOLT')
  const batteryArmMah = readRoundedParameter(snapshot, 'BATT_ARM_MAH')
  const batteryVoltageSource = readRoundedParameter(snapshot, 'BATT_FS_VOLTSRC')
  const batteryLowVoltage = readParameterValue(snapshot, 'BATT_LOW_VOLT')
  const batteryLowMah = readRoundedParameter(snapshot, 'BATT_LOW_MAH')
  const batteryFailsafe = readRoundedParameter(snapshot, 'BATT_FS_LOW_ACT')
  const batteryCriticalVoltage = readParameterValue(snapshot, 'BATT_CRT_VOLT')
  const batteryCriticalMah = readRoundedParameter(snapshot, 'BATT_CRT_MAH')
  const batteryCriticalFailsafe = readRoundedParameter(snapshot, 'BATT_FS_CRT_ACT')
  const boardOrientation = readRoundedParameter(snapshot, 'AHRS_ORIENTATION')
  const configuredModeChannel = readRoundedParameter(snapshot, 'FLTMODE_CH') ?? readRoundedParameter(snapshot, 'MODE_CH')
  const rssiType = readRoundedParameter(snapshot, 'RSSI_TYPE')
  const rssiChannel = readRoundedParameter(snapshot, 'RSSI_CHANNEL')
  const rssiChannelLow = readRoundedParameter(snapshot, 'RSSI_CHAN_LOW')
  const rssiChannelHigh = readRoundedParameter(snapshot, 'RSSI_CHAN_HIGH')
  const throttleFailsafe = readRoundedParameter(snapshot, 'FS_THR_ENABLE')
  const throttleFailsafeValue = readRoundedParameter(snapshot, 'FS_THR_VALUE')
  const notificationLedTypes = readRoundedParameter(snapshot, 'NTF_LED_TYPES')
  const notificationLedLength = readRoundedParameter(snapshot, 'NTF_LED_LEN')
  const notificationLedBrightness = readRoundedParameter(snapshot, 'NTF_LED_BRIGHT')
  const notificationLedOverride = readRoundedParameter(snapshot, 'NTF_LED_OVERRIDE')
  const notificationBuzzTypes = readRoundedParameter(snapshot, 'NTF_BUZZ_TYPES')
  const notificationBuzzVolume = readRoundedParameter(snapshot, 'NTF_BUZZ_VOLUME')
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
    modeExerciseAssignments.length >= 2 &&
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
  const canApplyDraftParameters = canApplyParameterChanges(snapshot, parameterFollowUp)

  useEffect(() => {
    setSnapshot(runtime.getSnapshot())
    const unsubscribe = runtime.subscribe(setSnapshot)
    return () => {
      unsubscribe()
      void runtime.disconnect().catch(() => {}).finally(() => {
        runtime.destroy()
      })
    }
  }, [runtime])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handlePageHide = () => {
      void runtime.disconnect().catch(() => {})
    }

    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [runtime])

  useEffect(() => {
    setParameterNotice(undefined)
    setPresetNotice(undefined)
    setSessionNotice(undefined)
    setParameterFollowUp(undefined)
    setSetupConfirmations({})
  }, [runtime])

  useEffect(() => {
    if (snapshot.connection.kind === 'connected' && snapshot.vehicle !== undefined) {
      setSessionNotice(undefined)
    }
  }, [snapshot.connection.kind, snapshot.vehicle])

  useEffect(() => {
    if (snapshot.connection.kind === 'error') {
      setSessionNotice({
        tone: 'danger',
        text: snapshot.connection.message
      })
    }
  }, [snapshot.connection])

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
  const selectedSnapshot = useMemo(
    () => savedSnapshots.find((savedSnapshot) => savedSnapshot.id === selectedSnapshotId) ?? savedSnapshots[0],
    [savedSnapshots, selectedSnapshotId]
  )
  const selectedSnapshotRestore = useMemo(
    () => (selectedSnapshot ? deriveDraftValuesFromParameterBackup(snapshot.parameters, selectedSnapshot.backup) : undefined),
    [selectedSnapshot, snapshot.parameters]
  )
  const selectedSnapshotDiffEntries = useMemo(
    () => deriveParameterDraftEntries(snapshot.parameters, selectedSnapshotRestore?.draftValues ?? {}),
    [selectedSnapshotRestore, snapshot.parameters]
  )
  const selectedSnapshotDiffGroups = useMemo(
    () => groupParameterDraftEntries(selectedSnapshotDiffEntries, ['staged']),
    [selectedSnapshotDiffEntries]
  )
  const selectedSnapshotChangedEntries = useMemo(
    () => selectedSnapshotDiffEntries.filter((entry) => entry.status === 'staged'),
    [selectedSnapshotDiffEntries]
  )
  const selectedSnapshotInvalidEntries = useMemo(
    () => selectedSnapshotDiffEntries.filter((entry) => entry.status === 'invalid'),
    [selectedSnapshotDiffEntries]
  )
  const selectedSnapshotDiffSignature = useMemo(
    () => createDraftSignature(selectedSnapshotDiffEntries),
    [selectedSnapshotDiffEntries]
  )
  const selectedSnapshotRebootSensitiveCount = useMemo(
    () => selectedSnapshotChangedEntries.filter((entry) => entry.definition?.rebootRequired).length,
    [selectedSnapshotChangedEntries]
  )
  const presetDefinitions = useMemo(() => metadataCatalog.presets, [metadataCatalog.presets])
  const presetGroups = useMemo(
    () => metadataCatalog.presetGroups.filter((group) => (metadataCatalog.presetsByGroup[group.id] ?? []).length > 0),
    [metadataCatalog.presetGroups, metadataCatalog.presetsByGroup]
  )
  const presetPreviewById = useMemo(
    () =>
      new Map(
        presetDefinitions.map((preset) => [
          preset.id,
          {
            diff: deriveDraftValuesFromParameterPreset(snapshot.parameters, preset),
            applicability: evaluateParameterPresetApplicability(snapshot, preset)
          }
        ])
      ),
    [presetDefinitions, snapshot.parameters, snapshot.vehicle?.vehicle]
  )
  const selectedPreset = useMemo(
    () => presetDefinitions.find((preset) => preset.id === selectedPresetId) ?? presetDefinitions[0],
    [presetDefinitions, selectedPresetId]
  )
  const selectedPresetPreview = selectedPreset ? presetPreviewById.get(selectedPreset.id) : undefined
  const selectedPresetDiff = selectedPresetPreview?.diff
  const selectedPresetApplicability = selectedPresetPreview?.applicability ?? {
    status: 'caution' as const,
    reasons: ['Select a preset to review its compatibility and diff.']
  }
  const selectedPresetDiffEntries = useMemo(
    () => deriveParameterDraftEntries(snapshot.parameters, selectedPresetDiff?.draftValues ?? {}),
    [selectedPresetDiff, snapshot.parameters]
  )
  const selectedPresetDiffGroups = useMemo(
    () => groupParameterDraftEntries(selectedPresetDiffEntries, ['staged']),
    [selectedPresetDiffEntries]
  )
  const selectedPresetChangedEntries = useMemo(
    () => selectedPresetDiffEntries.filter((entry) => entry.status === 'staged'),
    [selectedPresetDiffEntries]
  )
  const selectedPresetInvalidEntries = useMemo(
    () => selectedPresetDiffEntries.filter((entry) => entry.status === 'invalid'),
    [selectedPresetDiffEntries]
  )
  const selectedPresetDiffSignature = useMemo(
    () => createDraftSignature(selectedPresetDiffEntries),
    [selectedPresetDiffEntries]
  )
  const receiverDraftEntries = useMemo(
    () => parameterDraftEntries.filter((entry) => isReceiverReviewParamId(entry.id)),
    [parameterDraftEntries]
  )
  const receiverStagedDrafts = useMemo(
    () => receiverDraftEntries.filter((entry) => entry.status === 'staged'),
    [receiverDraftEntries]
  )
  const receiverInvalidDrafts = useMemo(
    () => receiverDraftEntries.filter((entry) => entry.status === 'invalid'),
    [receiverDraftEntries]
  )
  const portsDraftEntries = useMemo(
    () => parameterDraftEntries.filter((entry) => isPortsReviewParamId(entry.id)),
    [parameterDraftEntries]
  )
  const portsStagedDrafts = useMemo(
    () => portsDraftEntries.filter((entry) => entry.status === 'staged'),
    [portsDraftEntries]
  )
  const portsInvalidDrafts = useMemo(
    () => portsDraftEntries.filter((entry) => entry.status === 'invalid'),
    [portsDraftEntries]
  )
  const powerDraftEntries = useMemo(
    () => parameterDraftEntries.filter((entry) => isPowerReviewParamId(entry.id)),
    [parameterDraftEntries]
  )
  const powerStagedDrafts = useMemo(
    () => powerDraftEntries.filter((entry) => entry.status === 'staged'),
    [powerDraftEntries]
  )
  const powerInvalidDrafts = useMemo(
    () => powerDraftEntries.filter((entry) => entry.status === 'invalid'),
    [powerDraftEntries]
  )
  const tuningDraftEntries = useMemo(
    () => parameterDraftEntries.filter((entry) => isTuningReviewParamId(entry.id)),
    [parameterDraftEntries]
  )
  const tuningStagedDrafts = useMemo(
    () => tuningDraftEntries.filter((entry) => entry.status === 'staged'),
    [tuningDraftEntries]
  )
  const tuningInvalidDrafts = useMemo(
    () => tuningDraftEntries.filter((entry) => entry.status === 'invalid'),
    [tuningDraftEntries]
  )
  const outputReviewDraftEntries = useMemo(
    () => parameterDraftEntries.filter((entry) => OUTPUT_REVIEW_PARAM_IDS.includes(entry.id as (typeof OUTPUT_REVIEW_PARAM_IDS)[number])),
    [parameterDraftEntries]
  )
  const outputReviewStagedDrafts = useMemo(
    () => outputReviewDraftEntries.filter((entry) => entry.status === 'staged'),
    [outputReviewDraftEntries]
  )
  const outputReviewInvalidDrafts = useMemo(
    () => outputReviewDraftEntries.filter((entry) => entry.status === 'invalid'),
    [outputReviewDraftEntries]
  )
  const outputNotificationDraftEntries = useMemo(
    () =>
      parameterDraftEntries.filter((entry) =>
        OUTPUT_NOTIFICATION_PARAM_IDS.includes(entry.id as (typeof OUTPUT_NOTIFICATION_PARAM_IDS)[number])
      ),
    [parameterDraftEntries]
  )
  const outputNotificationStagedDrafts = useMemo(
    () => outputNotificationDraftEntries.filter((entry) => entry.status === 'staged'),
    [outputNotificationDraftEntries]
  )
  const outputNotificationInvalidDrafts = useMemo(
    () => outputNotificationDraftEntries.filter((entry) => entry.status === 'invalid'),
    [outputNotificationDraftEntries]
  )
  const outputAssignmentDraftEntries = useMemo(
    () => parameterDraftEntries.filter((entry) => isOutputAssignmentParamId(entry.id)),
    [parameterDraftEntries]
  )
  const outputAssignmentStagedDrafts = useMemo(
    () => outputAssignmentDraftEntries.filter((entry) => entry.status === 'staged'),
    [outputAssignmentDraftEntries]
  )
  const outputAssignmentInvalidDrafts = useMemo(
    () => outputAssignmentDraftEntries.filter((entry) => entry.status === 'invalid'),
    [outputAssignmentDraftEntries]
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
  const modeAssignmentParameters = useMemo(
    () =>
      Array.from({ length: 6 }, (_, index) => `FLTMODE${index + 1}`)
        .map((paramId) => snapshot.parameters.find((parameter) => parameter.id === paramId))
        .filter((parameter): parameter is ParameterState => parameter !== undefined),
    [snapshot.parameters]
  )
  const serialPortViewModels = useMemo(() => buildSerialPortViewModels(snapshot), [snapshot])
  const prioritizedSerialPortNumbers = useMemo(() => {
    const portNumbers = new Set<number>()

    serialPortViewModels.forEach((port) => {
      if (port.protocolValue !== undefined && port.protocolValue !== 0 && port.protocolValue !== -1) {
        portNumbers.add(port.portNumber)
      }
    })

    portsDraftEntries.forEach((entry) => {
      if (entry.status === 'unchanged') {
        return
      }

      const portNumber = parseSerialPortNumber(entry.id)
      if (portNumber !== undefined) {
        portNumbers.add(portNumber)
      }
    })

    return [...portNumbers].sort((left, right) => left - right)
  }, [portsDraftEntries, serialPortViewModels])
  const visibleSerialPortViewModels = useMemo(() => {
    if (showAllSerialPorts) {
      return serialPortViewModels
    }

    const visiblePorts = serialPortViewModels.filter((port) => prioritizedSerialPortNumbers.includes(port.portNumber))
    return visiblePorts.length > 0 ? visiblePorts : serialPortViewModels.slice(0, Math.min(serialPortViewModels.length, 4))
  }, [prioritizedSerialPortNumbers, serialPortViewModels, showAllSerialPorts])
  const hiddenSerialPortCount = serialPortViewModels.length - visibleSerialPortViewModels.length
  const gpsPeripheralViewModels = useMemo(() => buildGpsPeripheralViewModels(snapshot), [snapshot])
  const portsPeripheralParameters = useMemo(
    () =>
      PORTS_PERIPHERAL_PARAM_IDS.map((paramId) => snapshot.parameters.find((parameter) => parameter.id === paramId)).filter(
        (parameter): parameter is ParameterState => parameter !== undefined
      ),
    [snapshot.parameters]
  )
  const portsPeripheralParameterById = useMemo(
    () => new Map(portsPeripheralParameters.map((parameter) => [parameter.id, parameter])),
    [portsPeripheralParameters]
  )
  const gpsAutoConfigParameter = portsPeripheralParameterById.get('GPS_AUTO_CONFIG')
  const gpsAutoSwitchParameter = portsPeripheralParameterById.get('GPS_AUTO_SWITCH')
  const gpsPrimaryParameter = portsPeripheralParameterById.get('GPS_PRIMARY')
  const gpsRateParameter = portsPeripheralParameterById.get('GPS_RATE_MS')
  const osdTypeParameter = portsPeripheralParameterById.get('OSD_TYPE')
  const osdChannelParameter = portsPeripheralParameterById.get('OSD_CHAN')
  const osdSwitchMethodParameter = portsPeripheralParameterById.get('OSD_SW_METHOD')
  const mspOptionsParameter = portsPeripheralParameterById.get('MSP_OPTIONS')
  const mspOsdCellCountParameter = portsPeripheralParameterById.get('MSP_OSD_NCELLS')
  const vtxEnableParameter = portsPeripheralParameterById.get('VTX_ENABLE')
  const vtxFrequencyParameter = portsPeripheralParameterById.get('VTX_FREQ')
  const vtxPowerParameter = portsPeripheralParameterById.get('VTX_POWER')
  const vtxMaxPowerParameter = portsPeripheralParameterById.get('VTX_MAX_POWER')
  const vtxOptionsParameter = portsPeripheralParameterById.get('VTX_OPTIONS')
  const receiverSupportParameters = useMemo(
    () =>
      RECEIVER_SUPPORT_PARAM_IDS.map((paramId) => snapshot.parameters.find((parameter) => parameter.id === paramId)).filter(
        (parameter): parameter is ParameterState => parameter !== undefined
      ),
    [snapshot.parameters]
  )
  const receiverSupportParameterById = useMemo(
    () => new Map(receiverSupportParameters.map((parameter) => [parameter.id, parameter])),
    [receiverSupportParameters]
  )
  const modeChannelParameter = receiverSupportParameterById.get('FLTMODE_CH') ?? receiverSupportParameterById.get('MODE_CH')
  const rssiTypeParameter = receiverSupportParameterById.get('RSSI_TYPE')
  const rssiChannelParameter = receiverSupportParameterById.get('RSSI_CHANNEL')
  const rssiChannelLowParameter = receiverSupportParameterById.get('RSSI_CHAN_LOW')
  const rssiChannelHighParameter = receiverSupportParameterById.get('RSSI_CHAN_HIGH')
  const receiverLinkPorts = useMemo(
    () => serialPortViewModels.filter((port) => isReceiverSerialProtocol(port.protocolValue)),
    [serialPortViewModels]
  )
  const vtxLinkPorts = useMemo(
    () => serialPortViewModels.filter((port) => isVtxControlSerialProtocol(port.protocolValue)),
    [serialPortViewModels]
  )
  const osdLinkPorts = useMemo(
    () => serialPortViewModels.filter((port) => isOsdSerialProtocol(port.protocolValue)),
    [serialPortViewModels]
  )
  const powerReviewParameters = useMemo(
    () =>
      POWER_REVIEW_PARAM_IDS.map((paramId) => snapshot.parameters.find((parameter) => parameter.id === paramId)).filter(
        (parameter): parameter is ParameterState => parameter !== undefined
      ),
    [snapshot.parameters]
  )
  const powerReviewParameterById = useMemo(
    () => new Map(powerReviewParameters.map((parameter) => [parameter.id, parameter])),
    [powerReviewParameters]
  )
  const batteryMonitorParameter = powerReviewParameterById.get('BATT_MONITOR')
  const batteryCapacityParameter = powerReviewParameterById.get('BATT_CAPACITY')
  const batteryArmVoltageParameter = powerReviewParameterById.get('BATT_ARM_VOLT')
  const batteryArmMahParameter = powerReviewParameterById.get('BATT_ARM_MAH')
  const batteryVoltageSourceParameter = powerReviewParameterById.get('BATT_FS_VOLTSRC')
  const batteryLowVoltageParameter = powerReviewParameterById.get('BATT_LOW_VOLT')
  const batteryLowMahParameter = powerReviewParameterById.get('BATT_LOW_MAH')
  const batteryFailsafeParameter = powerReviewParameterById.get('BATT_FS_LOW_ACT')
  const batteryCriticalVoltageParameter = powerReviewParameterById.get('BATT_CRT_VOLT')
  const batteryCriticalMahParameter = powerReviewParameterById.get('BATT_CRT_MAH')
  const batteryCriticalFailsafeParameter = powerReviewParameterById.get('BATT_FS_CRT_ACT')
  const throttleFailsafeParameter = powerReviewParameterById.get('FS_THR_ENABLE')
  const throttleFailsafeValueParameter = powerReviewParameterById.get('FS_THR_VALUE')
  const tuningParameters = useMemo(
    () =>
      TUNING_PARAM_IDS.map((paramId) => snapshot.parameters.find((parameter) => parameter.id === paramId)).filter(
        (parameter): parameter is ParameterState => parameter !== undefined
      ),
    [snapshot.parameters]
  )
  const flightFeelParameters = useMemo(
    () =>
      TUNING_FLIGHT_FEEL_PARAM_IDS.map((paramId) => tuningParameters.find((parameter) => parameter.id === paramId)).filter(
        (parameter): parameter is ParameterState => parameter !== undefined
      ),
    [tuningParameters]
  )
  const acroTuningParameters = useMemo(
    () =>
      TUNING_ACRO_PARAM_IDS.map((paramId) => tuningParameters.find((parameter) => parameter.id === paramId)).filter(
        (parameter): parameter is ParameterState => parameter !== undefined
      ),
    [tuningParameters]
  )
  const outputReviewParameters = useMemo(
    () =>
      OUTPUT_REVIEW_PARAM_IDS.map((paramId) => snapshot.parameters.find((parameter) => parameter.id === paramId)).filter(
        (parameter): parameter is ParameterState => parameter !== undefined
      ),
    [snapshot.parameters]
  )
  const outputNotificationParameters = useMemo(
    () =>
      OUTPUT_NOTIFICATION_PARAM_IDS.map((paramId) => snapshot.parameters.find((parameter) => parameter.id === paramId)).filter(
        (parameter): parameter is ParameterState => parameter !== undefined
      ),
    [snapshot.parameters]
  )
  const outputNotificationParameterById = useMemo(
    () => new Map(outputNotificationParameters.map((parameter) => [parameter.id, parameter])),
    [outputNotificationParameters]
  )
  const notificationLedTypesParameter = outputNotificationParameterById.get('NTF_LED_TYPES')
  const notificationLedLengthParameter = outputNotificationParameterById.get('NTF_LED_LEN')
  const notificationLedBrightnessParameter = outputNotificationParameterById.get('NTF_LED_BRIGHT')
  const notificationLedOverrideParameter = outputNotificationParameterById.get('NTF_LED_OVERRIDE')
  const notificationBuzzTypesParameter = outputNotificationParameterById.get('NTF_BUZZ_TYPES')
  const notificationBuzzVolumeParameter = outputNotificationParameterById.get('NTF_BUZZ_VOLUME')
  const outputAssignmentParameters = useMemo(
    () =>
      snapshot.parameters
        .filter((parameter) => isOutputAssignmentParamId(parameter.id))
        .sort((left, right) => (parseServoOutputChannelNumber(left.id) ?? 99) - (parseServoOutputChannelNumber(right.id) ?? 99)),
    [snapshot.parameters]
  )
  const prioritizedOutputAssignmentChannels = useMemo(() => {
    const channels = new Set<number>()
    const defaultVisibleMotorCount = Math.max(airframe.expectedMotorCount ?? 0, 4)

    for (let channelNumber = 1; channelNumber <= defaultVisibleMotorCount; channelNumber += 1) {
      channels.add(channelNumber)
    }

    configuredOutputs.forEach((output) => {
      channels.add(output.channelNumber)
    })

    outputAssignmentDraftEntries.forEach((entry) => {
      if (entry.status === 'unchanged') {
        return
      }

      const channelNumber = parseServoOutputChannelNumber(entry.id)
      if (channelNumber !== undefined) {
        channels.add(channelNumber)
      }
    })

    return [...channels].sort((left, right) => left - right)
  }, [airframe.expectedMotorCount, configuredOutputs, outputAssignmentDraftEntries])
  const visibleOutputAssignmentParameters = useMemo(() => {
    if (showAllOutputAssignments) {
      return outputAssignmentParameters
    }

    const visibleParameters = outputAssignmentParameters.filter((parameter) => {
      const channelNumber = parseServoOutputChannelNumber(parameter.id)
      return channelNumber !== undefined && prioritizedOutputAssignmentChannels.includes(channelNumber)
    })

    return visibleParameters.length > 0 ? visibleParameters : outputAssignmentParameters.slice(0, Math.min(outputAssignmentParameters.length, 4))
  }, [outputAssignmentParameters, prioritizedOutputAssignmentChannels, showAllOutputAssignments])
  const hiddenOutputAssignmentCount = outputAssignmentParameters.length - visibleOutputAssignmentParameters.length
  const setupAdditionalGroups = useMemo(
    () => buildAdditionalSettingsGroups(snapshot, metadataCatalog, 'setup', new Set<string>()),
    [metadataCatalog, snapshot]
  )
  const portsAdditionalGroups = useMemo(
    () =>
      buildAdditionalSettingsGroups(
        snapshot,
        metadataCatalog,
        'ports',
        new Set(snapshot.parameters.filter((parameter) => isPortsReviewParamId(parameter.id)).map((parameter) => parameter.id))
      ),
    [metadataCatalog, snapshot]
  )
  const receiverAdditionalGroups = useMemo(
    () =>
      buildAdditionalSettingsGroups(
        snapshot,
        metadataCatalog,
        'receiver',
        new Set(snapshot.parameters.filter((parameter) => isReceiverReviewParamId(parameter.id)).map((parameter) => parameter.id))
      ),
    [metadataCatalog, snapshot]
  )
  const powerAdditionalGroups = useMemo(
    () =>
      buildAdditionalSettingsGroups(
        snapshot,
        metadataCatalog,
        'power',
        new Set(snapshot.parameters.filter((parameter) => isPowerReviewParamId(parameter.id)).map((parameter) => parameter.id))
      ),
    [metadataCatalog, snapshot]
  )
  const outputAdditionalGroups = useMemo(
    () =>
      buildAdditionalSettingsGroups(
        snapshot,
        metadataCatalog,
        'outputs',
        new Set(
          snapshot.parameters
            .filter(
              (parameter) =>
                isOutputAssignmentParamId(parameter.id) ||
                OUTPUT_REVIEW_PARAM_IDS.includes(parameter.id as (typeof OUTPUT_REVIEW_PARAM_IDS)[number]) ||
                OUTPUT_NOTIFICATION_PARAM_IDS.includes(parameter.id as (typeof OUTPUT_NOTIFICATION_PARAM_IDS)[number])
            )
            .map((parameter) => parameter.id)
        )
      ),
    [metadataCatalog, snapshot]
  )
  const setupAdditionalDraftEntries = useMemo(
    () =>
      parameterDraftEntries.filter((entry) =>
        setupAdditionalGroups.some((group) => group.parameters.some((parameter) => parameter.id === entry.id))
      ),
    [parameterDraftEntries, setupAdditionalGroups]
  )
  const portsAdditionalDraftEntries = useMemo(
    () =>
      parameterDraftEntries.filter((entry) =>
        portsAdditionalGroups.some((group) => group.parameters.some((parameter) => parameter.id === entry.id))
      ),
    [parameterDraftEntries, portsAdditionalGroups]
  )
  const receiverAdditionalDraftEntries = useMemo(
    () =>
      parameterDraftEntries.filter((entry) =>
        receiverAdditionalGroups.some((group) => group.parameters.some((parameter) => parameter.id === entry.id))
      ),
    [parameterDraftEntries, receiverAdditionalGroups]
  )
  const powerAdditionalDraftEntries = useMemo(
    () =>
      parameterDraftEntries.filter((entry) =>
        powerAdditionalGroups.some((group) => group.parameters.some((parameter) => parameter.id === entry.id))
      ),
    [parameterDraftEntries, powerAdditionalGroups]
  )
  const outputAdditionalDraftEntries = useMemo(
    () =>
      parameterDraftEntries.filter((entry) =>
        outputAdditionalGroups.some((group) => group.parameters.some((parameter) => parameter.id === entry.id))
      ),
    [parameterDraftEntries, outputAdditionalGroups]
  )
  const setupAdditionalStagedDrafts = useMemo(
    () => setupAdditionalDraftEntries.filter((entry) => entry.status === 'staged'),
    [setupAdditionalDraftEntries]
  )
  const setupAdditionalInvalidDrafts = useMemo(
    () => setupAdditionalDraftEntries.filter((entry) => entry.status === 'invalid'),
    [setupAdditionalDraftEntries]
  )
  const portsAdditionalStagedDrafts = useMemo(
    () => portsAdditionalDraftEntries.filter((entry) => entry.status === 'staged'),
    [portsAdditionalDraftEntries]
  )
  const portsAdditionalInvalidDrafts = useMemo(
    () => portsAdditionalDraftEntries.filter((entry) => entry.status === 'invalid'),
    [portsAdditionalDraftEntries]
  )
  const receiverAdditionalStagedDrafts = useMemo(
    () => receiverAdditionalDraftEntries.filter((entry) => entry.status === 'staged'),
    [receiverAdditionalDraftEntries]
  )
  const receiverAdditionalInvalidDrafts = useMemo(
    () => receiverAdditionalDraftEntries.filter((entry) => entry.status === 'invalid'),
    [receiverAdditionalDraftEntries]
  )
  const powerAdditionalStagedDrafts = useMemo(
    () => powerAdditionalDraftEntries.filter((entry) => entry.status === 'staged'),
    [powerAdditionalDraftEntries]
  )
  const powerAdditionalInvalidDrafts = useMemo(
    () => powerAdditionalDraftEntries.filter((entry) => entry.status === 'invalid'),
    [powerAdditionalDraftEntries]
  )
  const outputAdditionalStagedDrafts = useMemo(
    () => outputAdditionalDraftEntries.filter((entry) => entry.status === 'staged'),
    [outputAdditionalDraftEntries]
  )
  const outputAdditionalInvalidDrafts = useMemo(
    () => outputAdditionalDraftEntries.filter((entry) => entry.status === 'invalid'),
    [outputAdditionalDraftEntries]
  )
  const totalOutputInvalidDrafts =
    outputReviewInvalidDrafts.length +
    outputNotificationInvalidDrafts.length +
    outputAssignmentInvalidDrafts.length +
    outputAdditionalInvalidDrafts.length
  const totalOutputStagedDrafts =
    outputReviewStagedDrafts.length +
    outputNotificationStagedDrafts.length +
    outputAssignmentStagedDrafts.length +
    outputAdditionalStagedDrafts.length
  const editedMspOptions = normalizeBitmaskValue(editedValues.MSP_OPTIONS, mspOptions)
  const editedNotificationLedTypes = normalizeBitmaskValue(editedValues.NTF_LED_TYPES, notificationLedTypes)
  const editedNotificationBuzzTypes = normalizeBitmaskValue(editedValues.NTF_BUZZ_TYPES, notificationBuzzTypes)
  const notificationLedOutputs = useMemo(
    () => configuredOutputs.filter((output) => isNotificationLedServoFunction(output.functionValue)),
    [configuredOutputs]
  )
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
      setSessionNotice(undefined)
      await runtime.connect()
      await runtime.requestParameterList()
      if (parameterFollowUp?.refreshRequired) {
        await runtime.waitForParameterSync()
        setParameterFollowUp(undefined)
      }
    } catch (error) {
      const currentSnapshot = runtime.getSnapshot()
      setSessionNotice({
        tone: 'danger',
        text: describeConnectFailure(transportMode, currentSnapshot.connection, error)
      })
      if (currentSnapshot.connection.kind === 'connected' && currentSnapshot.vehicle === undefined) {
        await runtime.disconnect().catch(() => {})
      }
    } finally {
      setBusyAction(undefined)
    }
  }

  async function handleDisconnect(): Promise<void> {
    setBusyAction('disconnect')
    try {
      setSessionNotice(undefined)
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
    if (panelId === 'setup-panel-guided') {
      setSetupMode('wizard')
    } else if (panelId === 'setup-panel-link') {
      setSetupMode('overview')
    }
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

  function handleDiscardScopedParameterDrafts(paramIds: readonly string[], scopeLabel: string): void {
    const removableIds = paramIds.filter((paramId) => editedValues[paramId] !== undefined)
    if (removableIds.length === 0) {
      return
    }

    setEditedValues((existing) => {
      const next = { ...existing }
      removableIds.forEach((paramId) => {
        delete next[paramId]
      })
      return next
    })
    setParameterNotice({
      tone: 'neutral',
      text: `Cleared ${removableIds.length} ${scopeLabel} draft change(s).`
    })
  }

  async function handleApplyScopedParameterDrafts(
    drafts: readonly ParameterDraftEntry[],
    busyKey: string,
    scopeLabel: string
  ): Promise<void> {
    if (!canApplyDraftParameters) {
      setParameterNotice({
        tone: 'warning',
        text: 'Connect, finish parameter sync, and keep the vehicle disarmed before applying configuration changes.'
      })
      return
    }

    const invalidDrafts = drafts.filter((entry) => entry.status === 'invalid')
    if (invalidDrafts.length > 0) {
      setParameterNotice({
        tone: 'danger',
        text: `${scopeLabel} has ${invalidDrafts.length} invalid value(s). Fix them before applying from this view.`
      })
      return
    }

    const stagedDrafts = drafts.filter((entry) => entry.status === 'staged' && entry.nextValue !== undefined)
    if (stagedDrafts.length === 0) {
      setParameterNotice({
        tone: 'neutral',
        text: `No ${scopeLabel.toLowerCase()} changes are staged in this view.`
      })
      return
    }

    const appliedParamIds: string[] = []
    setBusyAction(busyKey)
    try {
      const rebootRequiredCount = stagedDrafts.filter((entry) => entry.definition?.rebootRequired).length
      const result = await runtime.setParameters(
        stagedDrafts.map((entry) => ({
          paramId: entry.id,
          paramValue: entry.nextValue as number
        }))
      )
      appliedParamIds.push(...result.applied.map((entry) => entry.paramId))
      setParameterNotice({
        tone: 'success',
        text:
          result.applied.length === 0
            ? `No ${scopeLabel.toLowerCase()} changes needed to be written.`
            : `Verified ${result.applied.length} ${scopeLabel.toLowerCase()} change(s) from this view.`
      })
      setParameterFollowUp({
        requiresReboot: rebootRequiredCount > 0,
        refreshRequired: true,
        changedCount: result.applied.length,
        text:
          rebootRequiredCount > 0
            ? `${scopeLabel} changed reboot-sensitive settings. Request a reboot, then pull parameters again before continuing setup.`
            : `${scopeLabel} changed live controller values. Pull parameters again if you want a clean post-write snapshot.`
      })
    } catch (error) {
      setParameterNotice({
        tone: 'danger',
        text: error instanceof Error ? error.message : `${scopeLabel} write failed.`
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

  function clearDesktopSnapshotLibraryLink(): void {
    setDesktopSnapshotLibraryPath(undefined)
    setDesktopSnapshotLibraryName(undefined)
  }

  function applyParsedSnapshotImport(
    parsedInput: ReturnType<typeof parseParameterSnapshotInput>,
    fileNameHint?: string,
    mode: 'merge' | 'replace' = 'merge'
  ): void {
    if (parsedInput.kind === 'library') {
      const importedSnapshots = parsedInput.library.snapshots
      setSavedSnapshots((current) => (mode === 'replace' ? importedSnapshots : mergeSavedSnapshots(current, importedSnapshots)))
      setSelectedSnapshotId(importedSnapshots[0]?.id)
      setSnapshotNotice({
        tone: 'success',
        text:
          mode === 'replace'
            ? `Opened ${importedSnapshots.length} snapshot(s) from desktop library "${parsedInput.library.name}".`
            : `Imported ${importedSnapshots.length} snapshot(s) from library "${parsedInput.library.name}".`
      })
      return
    }

    const backup = parsedInput.backup
    const savedSnapshot = createSavedSnapshot(backup, snapshotLabelInput || fileNameHint?.replace(/\.[^.]+$/, ''), 'imported', {
      note: snapshotNoteInput,
      tags: parseSnapshotTags(snapshotTagsInput),
      protected: snapshotProtectedInput
    })
    setSavedSnapshots((current) => [savedSnapshot, ...current.filter((entry) => entry.id !== savedSnapshot.id)])
    setSelectedSnapshotId(savedSnapshot.id)
    setSnapshotLabelInput('')
    setSnapshotNoteInput('')
    setSnapshotTagsInput('')
    setSnapshotProtectedInput(false)
    setSnapshotNotice({
      tone: 'success',
      text: `Imported snapshot "${savedSnapshot.label}" with ${backup.parameterCount} parameters.`
    })
  }

  function handleCaptureLiveSnapshot(): void {
    if (snapshot.parameters.length === 0) {
      setSnapshotNotice({
        tone: 'warning',
        text: 'Pull parameters before capturing a snapshot.'
      })
      return
    }

    const backup = createParameterBackup(snapshot)
    const savedSnapshot = createSavedSnapshot(backup, snapshotLabelInput, 'captured', {
      note: snapshotNoteInput,
      tags: parseSnapshotTags(snapshotTagsInput),
      protected: snapshotProtectedInput
    })
    setSavedSnapshots((current) => [savedSnapshot, ...current.filter((entry) => entry.id !== savedSnapshot.id)])
    setSelectedSnapshotId(savedSnapshot.id)
    setSnapshotLabelInput('')
    setSnapshotNoteInput('')
    setSnapshotTagsInput('')
    setSnapshotProtectedInput(false)
    setSnapshotNotice({
      tone: 'success',
      text: `Saved snapshot "${savedSnapshot.label}" with ${backup.parameterCount} parameters.`
    })
  }

  function handleOpenSnapshotImport(): void {
    snapshotImportInputRef.current?.click()
  }

  async function handleImportSnapshotFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      clearDesktopSnapshotLibraryLink()
      applyParsedSnapshotImport(parseParameterSnapshotInput(await file.text()), file.name)
    } catch (error) {
      setSnapshotNotice({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Failed to import snapshot or library file.'
      })
    } finally {
      event.target.value = ''
    }
  }

  function handleExportSnapshotLibrary(): void {
    const library = createParameterSnapshotLibrary('Browser Local Snapshot Library', savedSnapshots)
    downloadTextFile(buildSnapshotLibraryFilename(), serializeParameterSnapshotLibrary(library))
    setSnapshotNotice({
      tone: 'success',
      text: `Exported snapshot library with ${library.snapshots.length} saved snapshot(s).`
    })
  }

  async function handleOpenDesktopSnapshotFile(): Promise<void> {
    if (!desktopBridge) {
      return
    }

    try {
      const file = await desktopBridge.openSnapshotFile()
      if (!file) {
        return
      }

      const parsedInput = parseParameterSnapshotInput(file.contents)
      if (parsedInput.kind === 'library') {
        setDesktopSnapshotLibraryPath(file.path)
        setDesktopSnapshotLibraryName(parsedInput.library.name || file.name)
      } else {
        clearDesktopSnapshotLibraryLink()
      }

      applyParsedSnapshotImport(parsedInput, file.name, parsedInput.kind === 'library' ? 'replace' : 'merge')
    } catch (error) {
      setSnapshotNotice({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Failed to open a desktop snapshot file.'
      })
    }
  }

  async function handleSaveDesktopSnapshotLibrary(): Promise<void> {
    if (!desktopBridge) {
      return
    }

    try {
      const library = createParameterSnapshotLibrary(desktopSnapshotLibraryName || 'Desktop Snapshot Library', savedSnapshots)
      const savedFile = await desktopBridge.saveSnapshotLibrary({
        title: desktopSnapshotLibraryPath ? 'Save Snapshot Library' : 'Save Snapshot Library As',
        suggestedName: buildSnapshotLibraryFilename(),
        contents: serializeParameterSnapshotLibrary(library),
        existingPath: desktopSnapshotLibraryPath
      })
      if (!savedFile) {
        return
      }

      setDesktopSnapshotLibraryPath(savedFile.path)
      setDesktopSnapshotLibraryName(library.name)
      setSnapshotNotice({
        tone: 'success',
        text: `Saved snapshot library to ${savedFile.name}.`
      })
    } catch (error) {
      setSnapshotNotice({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Failed to save the desktop snapshot library.'
      })
    }
  }

  async function handleExportSelectedSnapshotToDesktop(): Promise<void> {
    if (!desktopBridge || !selectedSnapshot) {
      return
    }

    try {
      const savedFile = await desktopBridge.saveSnapshotBackup({
        title: 'Export Selected Snapshot',
        suggestedName: buildSnapshotFilename(selectedSnapshot),
        contents: serializeParameterBackup(selectedSnapshot.backup)
      })
      if (!savedFile) {
        return
      }

      setSnapshotNotice({
        tone: 'success',
        text: `Exported snapshot "${selectedSnapshot.label}" to ${savedFile.name}.`
      })
    } catch (error) {
      setSnapshotNotice({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Failed to export the selected snapshot to the desktop shell.'
      })
    }
  }

  function handleExportSelectedSnapshot(): void {
    if (!selectedSnapshot) {
      return
    }

    downloadTextFile(buildSnapshotFilename(selectedSnapshot), serializeParameterBackup(selectedSnapshot.backup))
    setSnapshotNotice({
      tone: 'success',
      text: `Exported snapshot "${selectedSnapshot.label}".`
    })
  }

  function handleDeleteSelectedSnapshot(): void {
    if (!selectedSnapshot) {
      return
    }

    if (selectedSnapshot.protected) {
      setSnapshotNotice({
        tone: 'warning',
        text: `Snapshot "${selectedSnapshot.label}" is protected. Unprotect it before deleting it from the active library.`
      })
      return
    }

    setSavedSnapshots((current) => current.filter((entry) => entry.id !== selectedSnapshot.id))
    setSnapshotNotice({
      tone: 'neutral',
      text: `Deleted snapshot "${selectedSnapshot.label}" from the local browser library.`
    })
  }

  function handleToggleSelectedSnapshotProtection(): void {
    if (!selectedSnapshot) {
      return
    }

    const nextProtected = !selectedSnapshot.protected
    setSavedSnapshots((current) =>
      updateSavedSnapshot(current, selectedSnapshot.id, (savedSnapshot) => ({
        ...savedSnapshot,
        protected: nextProtected
      }))
    )
    setSnapshotNotice({
      tone: 'success',
      text: nextProtected
        ? `Snapshot "${selectedSnapshot.label}" is now protected against deletion.`
        : `Snapshot "${selectedSnapshot.label}" is no longer protected.`
    })
  }

  function handleStageSelectedSnapshotDiff(): void {
    if (!selectedSnapshot || !selectedSnapshotRestore) {
      return
    }

    if (selectedSnapshotChangedEntries.length === 0) {
      setSnapshotNotice({
        tone: 'neutral',
        text: `Snapshot "${selectedSnapshot.label}" already matches the live controller values.`
      })
      return
    }

    setEditedValues(selectedSnapshotRestore.draftValues)
    setSelectedParameterId(selectedSnapshotChangedEntries[0]?.id ?? selectedParameterId)
    setActiveViewId('parameters')
    setSnapshotNotice({
      tone: 'warning',
      text: `Loaded ${selectedSnapshotRestore.changedCount} snapshot change(s) into the Expert parameter editor draft set.`
    })
  }

  async function handleApplySelectedSnapshotRestore(): Promise<void> {
    if (!selectedSnapshot) {
      return
    }

    if (!snapshotRestoreAcknowledged) {
      setSnapshotNotice({
        tone: 'warning',
        text: 'Acknowledge the overwrite warning before applying a snapshot restore.'
      })
      return
    }

    await handleApplyScopedParameterDrafts(selectedSnapshotDiffEntries, 'snapshots:apply', `Snapshot restore: ${selectedSnapshot.label}`)
    setSnapshotRestoreAcknowledged(false)
  }

  function handleStageSelectedPresetDiff(): void {
    if (!selectedPreset || !selectedPresetDiff) {
      return
    }

    if (selectedPresetApplicability.status === 'blocked') {
      setPresetNotice({
        tone: 'danger',
        text: selectedPresetApplicability.reasons[0] ?? 'This preset is not compatible with the current live configuration.'
      })
      return
    }

    if (selectedPresetChangedEntries.length === 0) {
      setPresetNotice({
        tone: 'neutral',
        text: `Preset "${selectedPreset.label}" already matches the current live tuning values.`
      })
      return
    }

    setEditedValues((existing) => ({
      ...existing,
      ...selectedPresetDiff.draftValues
    }))
    setActiveViewId('tuning')
    setParameterNotice({
      tone: 'warning',
      text: `Loaded ${selectedPresetChangedEntries.length} preset change(s) into the Tuning view for manual review.`
    })
    setPresetNotice({
      tone: 'warning',
      text: `Preset "${selectedPreset.label}" was loaded into manual tuning drafts instead of being applied directly.`
    })
  }

  async function handleApplySelectedPreset(): Promise<void> {
    if (!selectedPreset || !selectedPresetDiff) {
      return
    }

    if (!canApplyDraftParameters) {
      setPresetNotice({
        tone: 'warning',
        text: 'Connect, finish parameter sync, and keep the vehicle disarmed before applying a preset.'
      })
      return
    }

    if (selectedPresetApplicability.status === 'blocked') {
      setPresetNotice({
        tone: 'danger',
        text: selectedPresetApplicability.reasons[0] ?? 'This preset is not compatible with the current live configuration.'
      })
      return
    }

    if (!presetApplyAcknowledged) {
      setPresetNotice({
        tone: 'warning',
        text: 'Review the diff and acknowledge the overwrite warning before applying a preset.'
      })
      return
    }

    if (selectedPresetInvalidEntries.length > 0) {
      setPresetNotice({
        tone: 'danger',
        text: `Preset "${selectedPreset.label}" has ${selectedPresetInvalidEntries.length} invalid value(s) in the current metadata set.`
      })
      return
    }

    if (selectedPresetChangedEntries.length === 0) {
      setPresetNotice({
        tone: 'neutral',
        text: `Preset "${selectedPreset.label}" already matches the current live tuning values.`
      })
      return
    }

    const autoBackup = createSavedSnapshot(createParameterBackup(snapshot), buildPresetAutoBackupLabel(snapshot, selectedPreset), 'captured', {
      note: buildPresetAutoBackupNote(selectedPreset),
      tags: [...PRESET_AUTO_BACKUP_TAGS, ...selectedPreset.tags, selectedPreset.id]
    })
    setSavedSnapshots((current) => [autoBackup, ...current.filter((entry) => entry.id !== autoBackup.id)])

    setBusyAction('presets:apply')
    try {
      const rebootRequiredCount = selectedPresetChangedEntries.filter((entry) => entry.definition?.rebootRequired).length
      const result = await runtime.setParameters(
        selectedPresetChangedEntries
          .filter((entry) => entry.nextValue !== undefined)
          .map((entry) => ({
            paramId: entry.id,
            paramValue: entry.nextValue as number
          }))
      )
      setPresetNotice({
        tone: 'success',
        text:
          result.applied.length === 0
            ? `Preset "${selectedPreset.label}" already matched the live controller. Auto-saved snapshot "${autoBackup.label}".`
            : `Applied preset "${selectedPreset.label}" with ${result.applied.length} verified write(s). Auto-saved snapshot "${autoBackup.label}".`
      })
      setParameterFollowUp({
        requiresReboot: rebootRequiredCount > 0,
        refreshRequired: true,
        changedCount: result.applied.length,
        text:
          rebootRequiredCount > 0
            ? `Preset "${selectedPreset.label}" changed reboot-sensitive settings. Request a reboot, then pull parameters again before flying.`
            : `Preset "${selectedPreset.label}" changed live tuning values. Pull parameters again if you want a clean post-write snapshot.`
      })
    } catch (error) {
      setPresetNotice({
        tone: 'danger',
        text: `${error instanceof Error ? error.message : `Preset "${selectedPreset.label}" failed to apply.`} Pre-apply snapshot "${autoBackup.label}" was saved before any writes were attempted.`
      })
    } finally {
      setPresetApplyAcknowledged(false)
      setBusyAction(undefined)
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
        ? failModeSwitchExerciseState(
            current,
            `Did not observe ${formatModeExerciseTargetLabel(snapshot, current.currentTargetSlot)} on the live mode channel.`
          )
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
      text: `Staged ${draftIds.length} RCMAP_* change(s). Review and apply them from the Receiver view, then reboot, refresh parameters, and rerun RC endpoint capture.`
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
      text: `Staged ${Object.keys(nextDrafts).length} RC calibration value(s). Review and apply them from the Receiver view before confirming radio setup.`
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
        : `Move the configured flight-mode control to ${formatModeExerciseTargetLabel(snapshot, modeSwitchExercise.currentTargetSlot)}.`
    }
    if (!snapshot.liveVerification.rcInput.verified) {
      return 'Waiting for live RC telemetry before starting the switch exercise.'
    }
    if (modeExerciseAssignments.length < 2) {
      return 'At least two distinct configured flight-mode positions are needed for a useful switch exercise.'
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
        ? ['The mode channel moved through every distinct configured flight-mode position that the app expected to see.']
        : modeSwitchExercise.status === 'failed'
          ? ['Check the radio mapping, `FLTMODE_CH`/`MODE_CH`, and switch endpoints, then run the exercise again.']
          : ['The app will watch the live mode channel and mark each distinct configured flight-mode position as it is observed.']

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

    return {
      title: parameterFollowUp.requiresReboot
        ? 'Pending sidebar reboot before later setup steps unlock'
        : 'Pending sidebar refresh before later setup steps unlock',
      tone: parameterFollowUp.requiresReboot ? 'warning' : 'neutral',
      text: `${parameterFollowUp.text} Use the sidebar session controls to continue this setup session.`,
      actions: []
    }
  }, [parameterFollowUp])

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
              ? 'Use the sidebar session controls first, then wait for heartbeat and the initial parameter sync.'
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
              label: 'At least two distinct flight-mode positions are assigned',
              met: modeExerciseAssignments.length >= 2
            },
            {
              label: 'Mode switch exercise passed',
              met: modeSwitchExercise.status === 'passed'
            }
          ]
          summary =
            modeSwitchExercise.status === 'passed'
              ? 'Mode switch exercise passed with all distinct configured positions observed.'
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
    modeExerciseAssignments.length,
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
  const selectedSetupSectionIndex = selectedSetupSection
    ? setupFlowSections.findIndex((section) => section.id === selectedSetupSection.id)
    : -1
  const previousSetupSection =
    selectedSetupSectionIndex > 0 ? setupFlowSections[selectedSetupSectionIndex - 1] : undefined
  const nextSetupSection =
    selectedSetupSectionIndex >= 0 && selectedSetupSectionIndex < setupFlowSections.length - 1
      ? setupFlowSections[selectedSetupSectionIndex + 1]
      : undefined
  const completedSetupSectionCount = setupFlowSections.filter((section) => section.status === 'complete').length
  const setupFlowProgress = setupFlowSections.length === 0 ? 0 : (completedSetupSectionCount / setupFlowSections.length) * 100
  const guidedSetupComplete = setupFlowSections.length > 0 && completedSetupSectionCount === setupFlowSections.length
  const guidedSetupPrimaryAction =
    selectedSetupSection?.actions.find((action) => action.tone === 'primary' && action.kind !== 'scroll') ??
    selectedSetupSection?.actions.find((action) => action.kind !== 'scroll') ??
    selectedSetupSection?.actions[0]
  const guidedSetupContextAction =
    selectedSetupSection?.actions.find((action) => action.kind === 'scroll' && action.panelId !== 'setup-panel-guided')
  const guidedSetupSupportActions =
    selectedSetupSection?.actions.filter(
      (action) =>
        action !== guidedSetupPrimaryAction &&
        action !== guidedSetupContextAction &&
        !(action.kind === 'scroll' && action.panelId === 'setup-panel-guided')
    ) ?? []
  const isExpertMode = productMode === 'expert'
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
              badge:
                receiverInvalidDrafts.length + receiverAdditionalInvalidDrafts.length > 0
                  ? `${receiverInvalidDrafts.length + receiverAdditionalInvalidDrafts.length} invalid`
                  : receiverStagedDrafts.length + receiverAdditionalStagedDrafts.length > 0
                    ? `${receiverStagedDrafts.length + receiverAdditionalStagedDrafts.length} staged`
                    : snapshot.liveVerification.rcInput.verified
                      ? 'live'
                      : 'pending',
              tone:
                receiverInvalidDrafts.length + receiverAdditionalInvalidDrafts.length > 0
                  ? 'danger'
                  : receiverStagedDrafts.length + receiverAdditionalStagedDrafts.length > 0
                    ? 'warning'
                    : snapshot.liveVerification.rcInput.verified
                      ? 'success'
                      : 'warning'
            }
          case 'ports':
            return {
              id: view.id,
              label: view.label,
              description: view.description,
              badge:
                portsStagedDrafts.length + portsAdditionalStagedDrafts.length > 0
                  ? `${portsStagedDrafts.length + portsAdditionalStagedDrafts.length} staged`
                  : `${serialPortViewModels.length} ports`,
              tone:
                portsInvalidDrafts.length + portsAdditionalInvalidDrafts.length > 0
                  ? 'danger'
                  : portsStagedDrafts.length + portsAdditionalStagedDrafts.length > 0
                    ? 'warning'
                    : 'neutral'
            }
          case 'outputs':
            return {
              id: view.id,
              label: view.label,
              description: view.description,
              badge:
                totalOutputInvalidDrafts > 0
                  ? `${totalOutputInvalidDrafts} invalid`
                  : totalOutputStagedDrafts > 0
                    ? `${totalOutputStagedDrafts} staged`
                    : `${outputMapping.motorOutputs.length} motors`,
              tone:
                totalOutputInvalidDrafts > 0
                  ? 'danger'
                  : totalOutputStagedDrafts > 0
                    ? 'warning'
                    : outputMapping.motorOutputs.length > 0
                      ? 'neutral'
                      : 'warning'
            }
          case 'power':
            return {
              id: view.id,
              label: view.label,
              description: view.description,
              badge:
                powerInvalidDrafts.length + powerAdditionalInvalidDrafts.length > 0
                  ? `${powerInvalidDrafts.length + powerAdditionalInvalidDrafts.length} invalid`
                  : powerStagedDrafts.length + powerAdditionalStagedDrafts.length > 0
                    ? `${powerStagedDrafts.length + powerAdditionalStagedDrafts.length} staged`
                    : snapshot.preArmStatus.healthy
                      ? 'clear'
                      : `${snapshot.preArmStatus.issues.length} issues`,
              tone:
                powerInvalidDrafts.length + powerAdditionalInvalidDrafts.length > 0
                  ? 'danger'
                  : powerStagedDrafts.length + powerAdditionalStagedDrafts.length > 0
                    ? 'warning'
                    : snapshot.preArmStatus.healthy
                      ? 'success'
                      : 'warning'
            }
          case 'snapshots':
            return {
              id: view.id,
              label: view.label,
              description: view.description,
              badge: selectedSnapshotChangedEntries.length > 0 ? `${selectedSnapshotChangedEntries.length} diff` : `${savedSnapshots.length} saved`,
              tone: selectedSnapshotInvalidEntries.length > 0 ? 'danger' : selectedSnapshotChangedEntries.length > 0 ? 'warning' : 'neutral'
            }
          case 'tuning':
            return {
              id: view.id,
              label: view.label,
              description: view.description,
              badge: tuningStagedDrafts.length > 0 ? `${tuningStagedDrafts.length} staged` : `${tuningParameters.length} controls`,
              tone: tuningInvalidDrafts.length > 0 ? 'danger' : tuningStagedDrafts.length > 0 ? 'warning' : 'neutral'
            }
          case 'presets':
            return {
              id: view.id,
              label: view.label,
              description: view.description,
              badge:
                selectedPresetInvalidEntries.length > 0
                  ? `${selectedPresetInvalidEntries.length} invalid`
                  : selectedPresetChangedEntries.length > 0
                    ? `${selectedPresetChangedEntries.length} diff`
                    : `${presetDefinitions.length} presets`,
              tone:
                selectedPresetApplicability.status === 'blocked'
                  ? 'danger'
                  : selectedPresetApplicability.status === 'caution' || selectedPresetChangedEntries.length > 0
                    ? 'warning'
                    : 'neutral'
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
      outputAssignmentInvalidDrafts.length,
      outputAssignmentStagedDrafts.length,
      outputMapping.motorOutputs.length,
      portsAdditionalInvalidDrafts.length,
      portsAdditionalStagedDrafts.length,
      portsInvalidDrafts.length,
      portsStagedDrafts.length,
      powerAdditionalInvalidDrafts.length,
      powerAdditionalStagedDrafts.length,
      powerInvalidDrafts.length,
      powerStagedDrafts.length,
      receiverAdditionalInvalidDrafts.length,
      receiverAdditionalStagedDrafts.length,
      receiverInvalidDrafts.length,
      receiverStagedDrafts.length,
      serialPortViewModels.length,
      setupFlowSections.length,
      savedSnapshots.length,
      snapshot.liveVerification.rcInput.verified,
      snapshot.parameters.length,
      snapshot.preArmStatus,
      presetDefinitions.length,
      selectedPresetApplicability.status,
      selectedPresetChangedEntries.length,
      selectedPresetInvalidEntries.length,
      selectedSnapshotChangedEntries.length,
      selectedSnapshotInvalidEntries.length,
      totalOutputInvalidDrafts,
      totalOutputStagedDrafts,
      tuningInvalidDrafts.length,
      tuningParameters.length,
      tuningStagedDrafts.length,
      stagedParameterDrafts.length
    ]
  )
  const visibleAppViews = useMemo(
    () => appViews.filter((view) => isExpertMode || !isExpertOnlyView(view.id)),
    [appViews, isExpertMode]
  )
  const activeViewDescriptor = visibleAppViews.find((view) => view.id === activeViewId) ?? visibleAppViews[0]
  const workspaceNavSections = useMemo<WorkspaceNavSection[]>(
    () =>
      WORKSPACE_NAV_SECTIONS.map((section) => ({
        id: section.id,
        label: section.label,
        description: section.description,
        views: section.viewIds
          .map((viewId) => visibleAppViews.find((view) => view.id === viewId))
          .filter((view): view is AppViewDescriptor => view !== undefined)
      })).filter((section) => section.views.length > 0),
    [visibleAppViews]
  )
  const activeWorkspaceSection =
    workspaceNavSections.find((section) => section.views.some((view) => view.id === activeViewId)) ?? workspaceNavSections[0]
  const totalWorkbenchStagedChanges =
    portsStagedDrafts.length +
    receiverStagedDrafts.length +
    outputReviewStagedDrafts.length +
    outputAssignmentStagedDrafts.length +
    outputNotificationStagedDrafts.length +
    powerStagedDrafts.length +
    tuningStagedDrafts.length
  const totalWorkbenchInvalidChanges =
    portsInvalidDrafts.length +
    receiverInvalidDrafts.length +
    outputReviewInvalidDrafts.length +
    outputAssignmentInvalidDrafts.length +
    outputNotificationInvalidDrafts.length +
    powerInvalidDrafts.length +
    tuningInvalidDrafts.length
  const nextFocus = (() => {
    if (parameterFollowUp) {
      return {
        title: parameterFollowUp.requiresReboot ? 'Reboot and refresh the session' : 'Refresh the live baseline',
        detail: parameterFollowUp.text,
        viewId: 'snapshots' as AppViewId,
        actionLabel: parameterFollowUp.requiresReboot ? 'Open Snapshots & Restore' : 'Review Live Drift'
      }
    }

    if (!guidedSetupComplete) {
      return {
        title: `Continue ${selectedSetupSection.title}`,
        detail: selectedSetupSection.detail,
        viewId: 'setup' as AppViewId,
        actionLabel: 'Open Flight Deck'
      }
    }

    if (selectedSnapshotChangedEntries.length > 0) {
      return {
        title: 'Review drift against the active baseline',
        detail: `${selectedSnapshotChangedEntries.length} snapshot difference(s) are active against ${selectedSnapshot?.label ?? 'the selected baseline'}.`,
        viewId: 'snapshots' as AppViewId,
        actionLabel: 'Open Snapshots & Restore'
      }
    }

    if (totalWorkbenchStagedChanges > 0 || stagedParameterDrafts.length > 0) {
      return {
        title: 'Resolve staged changes before moving on',
        detail: `${totalWorkbenchStagedChanges + stagedParameterDrafts.length} staged change(s) are waiting for review or apply.`,
        viewId: activeViewId,
        actionLabel: 'Stay in Current Workspace'
      }
    }

    return {
      title: `Work the ${missionTitleForView(activeViewDescriptor.id)} surface`,
      detail: activeViewDescriptor.description,
      viewId: activeViewDescriptor.id,
      actionLabel: 'Stay Focused Here'
    }
  })()
  function formatCategoryLabel(categoryId: string | undefined): string {
    if (!categoryId) {
      return 'Uncategorized'
    }

    return metadataCatalog.categoryById[categoryId]?.label ?? categoryId
  }

  function renderMetadataParameterField(parameter: ParameterState) {
    const draft = parameterDraftById.get(parameter.id)
    const inputValue = editedValues[parameter.id] ?? String(parameter.value)

    return (
      <label key={parameter.id} className={`scoped-editor-field scoped-editor-field--${draft?.status ?? 'unchanged'}`}>
        <span>{parameter.definition?.label ?? parameter.id}</span>
        {parameter.definition?.options && parameter.definition.options.length > 0 ? (
          <select
            value={inputValue}
            onChange={(event) =>
              setEditedValues((existing) => ({
                ...existing,
                [parameter.id]: event.target.value
              }))
            }
          >
            {parameter.definition.options.map((valueOption) => (
              <option key={`${parameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
                {valueOption.label}
                {valueOption.description ? ` · ${valueOption.description}` : ''}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="number"
            min={parameter.definition?.minimum}
            max={parameter.definition?.maximum}
            step={parameter.definition?.step ?? 1}
            value={inputValue}
            onChange={(event) =>
              setEditedValues((existing) => ({
                ...existing,
                [parameter.id]: event.target.value
              }))
            }
          />
        )}
        <small>
          {draft?.status === 'staged'
            ? `Staged ${formatParameterDisplayValue(parameter, draft.nextValue)}`
            : draft?.reason ??
              `Current ${formatParameterDisplayValue(parameter, parameter.value)}${parameter.definition?.rebootRequired ? ' · reboot after apply' : ''}`}
        </small>
      </label>
    )
  }

  function renderAdditionalSettingsCard(
    title: string,
    description: string,
    groups: AdditionalSettingsGroup[],
    draftEntries: ParameterDraftEntry[],
    stagedDrafts: ParameterDraftEntry[],
    invalidDrafts: ParameterDraftEntry[],
    applyActionId: string,
    applyLabel: string,
    discardScope: string
  ) {
    if (groups.length === 0) {
      return null
    }

    return (
      <div className="scoped-review-card scoped-review-card--compact">
        <div className="switch-exercise-card__header">
          <div>
            <strong>{title}</strong>
            <p>{description}</p>
          </div>
          <StatusBadge tone={toneForScopedDraftReview(stagedDrafts.length, invalidDrafts.length)}>
            {invalidDrafts.length > 0 ? `${invalidDrafts.length} invalid` : stagedDrafts.length > 0 ? `${stagedDrafts.length} staged` : 'in sync'}
          </StatusBadge>
        </div>

        {groups.map((group) => (
          <div key={group.categoryId} className="metadata-settings-section">
            <div className="metadata-settings-section__header">
              <strong>{group.categoryLabel}</strong>
              <p>{group.categoryDescription}</p>
            </div>
            <div className="scoped-editor-grid">{group.parameters.map((parameter) => renderMetadataParameterField(parameter))}</div>
          </div>
        ))}

        <div className="switch-exercise-controls">
          <button
            style={buttonStyle('primary')}
            onClick={() => void handleApplyScopedParameterDrafts(draftEntries, applyActionId, title)}
            disabled={busyAction !== undefined || stagedDrafts.length === 0 || invalidDrafts.length > 0 || !canApplyDraftParameters}
          >
            {busyAction === applyActionId ? 'Applying…' : `${applyLabel} (${stagedDrafts.length})`}
          </button>
          <button
            style={buttonStyle()}
            onClick={() => handleDiscardScopedParameterDrafts(draftEntries.map((entry) => entry.id), discardScope)}
            disabled={busyAction !== undefined || draftEntries.length === 0}
          >
            Discard Additional Changes
          </button>
        </div>
      </div>
    )
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

  function openSetupWizard(sectionId?: string): void {
    if (sectionId) {
      setSelectedSetupSectionId(sectionId)
    } else if (recommendedSetupSection) {
      setSelectedSetupSectionId(recommendedSetupSection.id)
    }
    setSetupMode('wizard')
  }

  function closeSetupWizard(): void {
    setSetupMode('overview')
  }

  function moveSetupWizard(offset: -1 | 1): void {
    if (!selectedSetupSection) {
      return
    }

    const nextIndex = selectedSetupSectionIndex + offset
    if (nextIndex < 0 || nextIndex >= setupFlowSections.length) {
      return
    }

    const targetSection = setupFlowSections[nextIndex]
    if (targetSection.sequenceState === 'locked') {
      return
    }

    setSelectedSetupSectionId(targetSection.id)
  }

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.sessionStorage.setItem(PRODUCT_MODE_STORAGE_KEY, productMode)
    } catch {
      // Ignore session storage failures; the mode still applies for the current render tree.
    }
  }, [productMode])

  useEffect(() => {
    const persistence = persistSnapshots(savedSnapshots)
    setSnapshotStorageNotice(
      persistence.warning
        ? {
            tone: 'warning',
            text: persistence.warning
          }
        : undefined
    )
  }, [savedSnapshots])

  useEffect(() => {
    if (savedSnapshots.length === 0) {
      if (selectedSnapshotId !== undefined) {
        setSelectedSnapshotId(undefined)
      }
      return
    }

    if (!selectedSnapshotId || !savedSnapshots.some((savedSnapshot) => savedSnapshot.id === selectedSnapshotId)) {
      setSelectedSnapshotId(savedSnapshots[0]?.id)
    }
  }, [savedSnapshots, selectedSnapshotId])

  useEffect(() => {
    if (presetDefinitions.length === 0) {
      if (selectedPresetId !== undefined) {
        setSelectedPresetId(undefined)
      }
      return
    }

    if (!selectedPresetId || !presetDefinitions.some((preset) => preset.id === selectedPresetId)) {
      setSelectedPresetId(presetDefinitions[0]?.id)
    }
  }, [presetDefinitions, selectedPresetId])

  useEffect(() => {
    setSnapshotRestoreAcknowledged(false)
  }, [selectedSnapshotDiffSignature])

  useEffect(() => {
    setPresetApplyAcknowledged(false)
    setPresetNotice(undefined)
  }, [selectedPresetDiffSignature])

  useEffect(() => {
    if (isExpertMode || !isExpertOnlyView(activeViewId)) {
      return
    }

    setActiveViewId('setup')
  }, [activeViewId, isExpertMode])

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

  function returnToMissionControl(): void {
    setActiveViewId('setup')
    setSetupMode('overview')
  }

  return (
	    <main className="app-shell">
	      <header className="app-header">
	        <div className="app-header__brand">
            <div className="app-header__mark">AC</div>
	          <span className="app-header__title">ArduConfigurator</span>
	        </div>
          <div className="app-header__summary">
            <div className="app-header__status-group">
              <span className="app-header__status-item is-live">
                <span className={`dot ${snapshot.connection.kind === 'connected' ? 'is-connected' : ''}`} />
                {snapshot.connection.kind}
              </span>
            </div>
            <div className="app-header__status-group">
              <span className="app-header__status-item is-live">{snapshot.vehicle?.vehicle ?? 'No vehicle'}</span>
              <span className="app-header__status-item">{snapshot.vehicle?.flightMode ?? '—'}</span>
              <span className="app-header__status-item">{snapshot.vehicle?.armed ? 'ARMED' : 'DISARMED'}</span>
            </div>
            <div className="app-header__status-group">
              <span className="app-header__status-item">
                {snapshot.parameterStats.status === 'complete' ? `${snapshot.parameterStats.downloaded} params` : formatParameterSync(snapshot)}
              </span>
              <span className="app-header__status-item">{snapshot.sessionProfile === 'usb-bench' ? 'USB' : 'Full'}</span>
              {parameterFollowUp ? <span className="app-header__status-item" style={{ color: 'var(--warning)' }}>{parameterFollowUp.requiresReboot ? 'Reboot req.' : 'Refresh req.'}</span> : null}
            </div>
          </div>
          <div className="app-header__actions">
            <StatusBadge tone={toneForConnection(snapshot.connection.kind)}>{snapshot.connection.kind}</StatusBadge>
          </div>
	      </header>

      <div className="workspace-layout">
        <aside className="workspace-sidebar">
          <div className="workspace-sidebar__shell">
            <section className="workspace-rail-section workspace-rail-section--session">
              <div className="workspace-rail-section__header">
                <strong>Session</strong>
              </div>

              <div className="button-row" style={{ padding: '0 4px' }}>
                <select
                  data-testid="transport-mode-select"
                  value={transportMode}
                  onChange={(event) => setTransportMode(event.target.value as TransportMode)}
                  disabled={busyAction !== undefined || snapshot.connection.kind === 'connected'}
                  style={{ flex: 1 }}
                >
                  <option value="demo">Demo</option>
                  <option value="web-serial" disabled={!webSerialSupported}>
                    Serial{webSerialSupported ? '' : ' (n/a)'}
                  </option>
                  <option value="websocket">WebSocket</option>
                </select>
                <select
                  data-testid="session-profile-select"
                  value={sessionProfile}
                  onChange={(event) => setSessionProfile(event.target.value as SessionProfile)}
                  style={{ flex: 1 }}
                >
                  <option value="full-power">Full power</option>
                  <option value="usb-bench">USB bench</option>
                </select>
              </div>
              {transportMode === 'websocket' ? (
                <label className="scoped-editor-field scoped-editor-field--compact" style={{ margin: '0 4px' }}>
                  <span>WebSocket URL</span>
                  <input
                    data-testid="websocket-url-input"
                    type="text"
                    value={websocketUrl}
                    onChange={(event) => setWebsocketUrl(event.target.value)}
                    disabled={busyAction !== undefined || snapshot.connection.kind === 'connected'}
                    spellCheck={false}
                    placeholder={DEFAULT_WEBSOCKET_URL}
                  />
                </label>
              ) : null}
              <div className="button-row" style={{ padding: '0 4px' }}>
                <button
                  data-testid="connect-button"
                  style={buttonStyle('primary')}
                  onClick={() => void handleConnect()}
                  disabled={busyAction !== undefined || snapshot.connection.kind === 'connected'}
                >
                  {connectButtonLabel(snapshot, parameterFollowUp)}
                </button>
                <button
                  data-testid="disconnect-button"
                  style={buttonStyle()}
                  onClick={() => void handleDisconnect()}
                  disabled={busyAction !== undefined || snapshot.connection.kind !== 'connected'}
                >
                  Disconnect
                </button>
              </div>

              <div className="workspace-sidebar__meta">
                <strong data-testid="session-vehicle-name">{snapshot.vehicle?.vehicle ?? 'No vehicle'}</strong>
              </div>

              <div className="config-pills" style={{ padding: '0 4px' }}>
                <span data-testid="session-parameter-summary">
                  {snapshot.parameterStats.status === 'complete' ? `${snapshot.parameterStats.downloaded} params` : formatParameterSync(snapshot)}
                </span>
              </div>
              <div className="sync-meter" aria-hidden="true" style={{ margin: '0 4px' }}>
                <div className="sync-meter__fill" style={{ width: `${parameterSyncWidth}%` }} />
              </div>
              {sessionNotice ? (
                <div className="session-follow-up session-follow-up--error" data-testid="session-connection-notice">
                  <div className="session-follow-up__header">
                    <strong>Connection issue</strong>
                    <StatusBadge tone={sessionNotice.tone}>{sessionNotice.tone}</StatusBadge>
                  </div>
                  <p>{sessionNotice.text}</p>
                </div>
              ) : null}
              {parameterFollowUp ? (
                <div className="session-follow-up">
                  <div className="session-follow-up__header">
                    <strong>Session action required</strong>
                    <StatusBadge tone={parameterFollowUp.requiresReboot ? 'warning' : 'neutral'}>
                      {parameterFollowUp.requiresReboot ? 'reboot' : 'refresh'}
                    </StatusBadge>
                  </div>
                  <p>
                    {snapshot.connection.kind === 'connected'
                      ? parameterFollowUp.text
                      : `${parameterFollowUp.text} Reconnect from the session controls above to continue.`}
                  </p>
                  {snapshot.connection.kind === 'connected' ? (
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
                  ) : null}
                </div>
              ) : null}
            </section>

            {workspaceNavSections.map((section) => (
              <section key={section.id} className="workspace-rail-section workspace-rail-section--mission">
                <div className="workspace-rail-section__header">
                  <strong>{section.label}</strong>
                </div>

                <nav className="workspace-nav workspace-nav--grouped" aria-label={`${section.label} views`}>
                  {section.views.map((view) => (
                    <button
                      key={view.id}
                      type="button"
                      data-testid={`view-button-${view.id}`}
                      className={`workspace-nav__item${view.id === activeViewId ? ' is-active' : ''}`}
                      onClick={() => setActiveViewId(view.id)}
                    >
                      <div className="workspace-nav__item-copy">
                        <span className="workspace-nav__mark">{viewMonogram(view.id)}</span>
                        <div className="workspace-nav__item-text">
                          <strong>{missionTitleForView(view.id)}</strong>
                        </div>
                      </div>
                    </button>
                  ))}
                </nav>
              </section>
            ))}

            <section className="workspace-rail-section workspace-rail-section--command">
              <div className="workspace-rail-section__header">
                <strong>Changes</strong>
                <StatusBadge tone={totalWorkbenchInvalidChanges > 0 ? 'danger' : totalWorkbenchStagedChanges > 0 || stagedParameterDrafts.length > 0 ? 'warning' : 'success'}>
                  {totalWorkbenchInvalidChanges > 0
                    ? `${totalWorkbenchInvalidChanges} invalid`
                    : totalWorkbenchStagedChanges + stagedParameterDrafts.length > 0
                      ? `${totalWorkbenchStagedChanges + stagedParameterDrafts.length} staged`
                      : 'clean'}
                </StatusBadge>
              </div>

              <div className="workspace-focus-card">
                <div className="workspace-focus-card__header">
                  <strong>Next focus</strong>
                  <StatusBadge tone={nextFocus.viewId === activeViewId ? 'success' : 'warning'}>
                    {missionSectionLabelForView(nextFocus.viewId)}
                  </StatusBadge>
                </div>
                <p>{nextFocus.title}</p>
                <small>{nextFocus.detail}</small>
                <div className="button-row">
                  <button style={buttonStyle('primary')} onClick={() => setActiveViewId(nextFocus.viewId)}>
                    {nextFocus.actionLabel}
                  </button>
                </div>
              </div>

              <div className="change-control-dock">
                <article className="change-control-dock__item">
                  <span>Baseline</span>
                  <strong data-testid={selectedSnapshot ? 'active-baseline-label' : undefined}>
                    {selectedSnapshot ? selectedSnapshot.label : 'No baseline selected'}
                  </strong>
                  <small>
                    {selectedSnapshot
                      ? `${selectedSnapshotChangedEntries.length} drift · ${selectedSnapshotRebootSensitiveCount} reboot-sensitive`
                      : 'Capture or select a snapshot before larger changes.'}
                  </small>
                </article>
                <article className="change-control-dock__item">
                  <span>Workbench drafts</span>
                  <strong>{totalWorkbenchStagedChanges + stagedParameterDrafts.length}</strong>
                  <small>
                    {totalWorkbenchInvalidChanges > 0
                      ? `${totalWorkbenchInvalidChanges} invalid values need attention`
                      : totalWorkbenchStagedChanges + stagedParameterDrafts.length > 0
                        ? 'Staged changes are waiting for apply or discard'
                        : 'No staged changes across the current mission workspaces'}
                  </small>
                </article>
                <article className="change-control-dock__item">
                  <span>Session follow-up</span>
                  <strong>{parameterFollowUp ? (parameterFollowUp.requiresReboot ? 'Reboot required' : 'Refresh required') : 'Clear'}</strong>
                  <small>{parameterFollowUp ? parameterFollowUp.text : 'The live snapshot matches the current session state.'}</small>
                </article>
              </div>

              <div className="button-row">
                <button data-testid="open-snapshots-button" style={buttonStyle('primary')} onClick={() => setActiveViewId('snapshots')}>
                  {selectedSnapshot ? 'Open Snapshots & Restore' : 'Open Snapshots'}
                </button>
                {selectedSnapshotChangedEntries.length > 0 ? (
                  <button style={buttonStyle()} onClick={() => setActiveViewId('snapshots')}>
                    Review Restore Diff
                  </button>
                ) : null}
              </div>
            </section>

            <section className="workspace-rail-section workspace-rail-section--workspace">
              <div className="workspace-rail-section__header">
                <div>
                  <strong>Access Level</strong>
                  <small>Basic stays mission-focused. Expert exposes the low-level parameter workspace.</small>
                </div>
                <StatusBadge tone={isExpertMode ? 'warning' : 'success'}>{isExpertMode ? 'expert' : 'basic'}</StatusBadge>
              </div>

              <div className="mode-toggle mode-toggle--compact" role="tablist" aria-label="Configurator product mode">
                <button
                  type="button"
                  data-testid="product-mode-basic"
                  className={`mode-toggle__option${productMode === 'basic' ? ' is-active' : ''}`}
                  onClick={() => setProductMode('basic')}
                >
                  <strong>Basic</strong>
                </button>
                <button
                  type="button"
                  data-testid="product-mode-expert"
                  className={`mode-toggle__option${productMode === 'expert' ? ' is-active' : ''}`}
                  onClick={() => setProductMode('expert')}
                >
                  <strong>Expert</strong>
                </button>
              </div>

              {!isExpertMode ? (
                <div className="workspace-mode-summary workspace-mode-summary--muted workspace-mode-summary--compact">
                  <StatusBadge tone="neutral">guided</StatusBadge>
                  <p>{appViews.filter((view) => isExpertOnlyView(view.id)).map((view) => missionTitleForView(view.id)).join(', ')} stay tucked away.</p>
                </div>
              ) : null}

              {!isExpertMode && stagedParameterDrafts.length > 0 ? (
                <div className="workspace-mode-summary workspace-mode-summary--warning workspace-mode-summary--compact">
                  <StatusBadge tone="warning">{stagedParameterDrafts.length} staged</StatusBadge>
                  <p>There are advanced parameter drafts in progress. Switch to Expert to review or apply them.</p>
                </div>
              ) : null}
            </section>
          </div>
        </aside>

        <div className="workspace-main">
          {activeViewDescriptor ? (
            <header className="workspace-main__header">
              <div>
                <div className="workspace-main__eyebrow-row">
                  <button
                    type="button"
                    data-testid="return-mission-control-button"
                    className={`workspace-home-button${activeViewId === 'setup' && setupMode === 'overview' ? ' is-active' : ''}`}
                    onClick={returnToMissionControl}
                    aria-label="Return to Mission Control"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4.5 11.4L12 5.25l7.5 6.15" />
                      <path d="M7.5 10.9V18h9v-7.1" />
                      <path d="M10.25 18v-4.75h3.5V18" />
                    </svg>
                    <span>Mission Control</span>
                  </button>
                  <span className="workspace-main__eyebrow">{activeWorkspaceSection?.label ?? missionSectionLabelForView(activeViewDescriptor.id)}</span>
                  <StatusBadge tone={activeViewDescriptor.tone}>{activeViewDescriptor.badge}</StatusBadge>
                </div>
                <h2>{missionTitleForView(activeViewDescriptor.id)}</h2>
                <p>{activeViewDescriptor.description}</p>
              </div>
              <div className="workspace-main__summary">
                <div className="workspace-main__summary-card">
                  <span>Aircraft state</span>
                  <strong>{snapshot.vehicle?.flightMode ?? 'No active mode yet'}</strong>
                  <small>
                    {snapshot.connection.kind === 'connected'
                      ? snapshot.preArmStatus.healthy
                        ? 'Connected, synced, and pre-arm clear'
                        : `${snapshot.preArmStatus.issues.length} pre-arm issue(s) still active`
                      : 'Connect to start working from the live vehicle'}
                  </small>
                </div>
              </div>
            </header>
          ) : null}
	      {activeViewId === 'setup' ? (
	      <>
	      <section className="grid one-up">
	        <Panel
	          title={setupMode === 'wizard' ? 'Guided Setup' : 'Mission Control'}
	          subtitle={
              setupMode === 'wizard'
                ? 'Work one setup step at a time with a single active task, clear evidence, and explicit next actions.'
                : 'Live aircraft state, bench readiness, and setup progress in one integrated operator console.'
            }
	          actions={
	            <div className="button-row">
                {setupMode === 'wizard' && selectedSetupSection ? (
                  <StatusBadge tone={toneForSetup(selectedSetupSection.status)}>
                    Step {selectedSetupSectionIndex + 1}/{setupFlowSections.length}
                  </StatusBadge>
                ) : (
	                <StatusBadge tone={guidedSetupComplete ? 'success' : 'warning'}>
	                  {completedSetupSectionCount}/{setupFlowSections.length} complete
	                </StatusBadge>
                )}
                {setupMode === 'wizard' ? (
                  <button style={buttonStyle()} onClick={closeSetupWizard}>
                    Back to Mission Control
                  </button>
                ) : (
                  <button
                    style={buttonStyle('primary')}
                    onClick={() => openSetupWizard()}
                    disabled={!recommendedSetupSection}
                    data-testid="setup-start-guided-button"
                  >
                    {guidedSetupComplete ? 'Review Guided Setup' : completedSetupSectionCount > 0 ? 'Resume Guided Setup' : 'Start Guided Setup'}
                  </button>
                )}
	            </div>
	          }
	        >
	          <div className="setup-command-center">
              {setupMode === 'overview' ? (
                <>
  	              <div id="setup-panel-link" className="flight-deck-command">
	                <div className="flight-deck-command__main">
	                  <AttitudePreview
	                    snapshot={snapshot}
	                    frameClassLabel={airframe.frameClassLabel}
	                    frameTypeLabel={airframe.frameTypeLabel}
	                  />

                    <div className="flight-deck-command__telemetry-strip">
                      <article className="telemetry-metric-card">
                        <span>Mode</span>
                        <strong>{snapshot.vehicle?.flightMode ?? '—'}</strong>
                      </article>
                      <article className="telemetry-metric-card">
                        <span>Params</span>
                        <strong>
                          {snapshot.parameterStats.status === 'complete'
                            ? `${snapshot.parameterStats.downloaded}`
                            : formatParameterSync(snapshot)}
                        </strong>
                      </article>
                      <article className="telemetry-metric-card">
                        <span>Pre-arm</span>
                        <strong>{snapshot.preArmStatus.healthy ? 'Clear' : `${snapshot.preArmStatus.issues.length}`}</strong>
                      </article>
                      <article className="telemetry-metric-card">
                        <span>Frame</span>
                        <strong>{airframe.frameClassLabel}</strong>
                      </article>
                    </div>

                    <div className="flight-deck-command__signal-strip">
                      <span className={snapshot.liveVerification.rcInput.verified ? 'is-live' : 'is-waiting'}>
                        <span className="dot" />
                        {snapshot.liveVerification.rcInput.verified ? `RC ${snapshot.liveVerification.rcInput.channelCount}ch` : 'RC —'}
                      </span>
                      <span className={snapshot.liveVerification.batteryTelemetry.verified ? 'is-live' : 'is-waiting'}>
                        <span className="dot" />
                        {snapshot.liveVerification.batteryTelemetry.verified ? 'Battery' : 'Batt —'}
                      </span>
                      <span className={snapshot.liveVerification.attitudeTelemetry.verified ? 'is-live' : 'is-waiting'}>
                        <span className="dot" />
                        {snapshot.liveVerification.attitudeTelemetry.verified ? 'Attitude' : 'Att —'}
                      </span>
                      <span className={snapshot.preArmStatus.healthy ? 'is-live' : 'is-warn'}>
                        <span className="dot" />
                        {snapshot.preArmStatus.healthy ? 'Pre-arm OK' : `${snapshot.preArmStatus.issues.length} issues`}
                      </span>
                    </div>

                    {gpsPeripheralViewModels.length > 0 || snapshot.liveVerification.globalPosition.verified ? (
                      <LiveGpsMapCard
                        snapshot={snapshot}
                        title="Aircraft location"
                        subtitle="Live GPS position from the flight controller."
                        compact
                        testId="setup-gps-map-widget"
                      />
                    ) : null}
	                </div>

  	                <div className="flight-deck-command__sidebar">
                      <div className="flight-deck-command__sidebar-section">
                        <div className="flight-deck-command__sidebar-section-title">Vehicle</div>
                        <div className="flight-deck-command__kv-row"><span>Transport</span><strong>{transportMode === 'demo' ? 'Demo' : transportMode === 'web-serial' ? 'Serial' : `WebSocket (${websocketUrl})`}</strong></div>
                        <div className="flight-deck-command__kv-row"><span>Session</span><strong>{snapshot.sessionProfile === 'usb-bench' ? 'USB Bench' : 'Full Power'}</strong></div>
                        <div className="flight-deck-command__kv-row"><span>Vehicle</span><strong>{snapshot.vehicle?.vehicle ?? '—'}</strong></div>
                        <div className="flight-deck-command__kv-row"><span>Firmware</span><strong>{snapshot.vehicle?.firmware ?? '—'}</strong></div>
                        <div className="flight-deck-command__kv-row"><span>RC Link</span><strong>{formatRcLink(snapshot)}</strong></div>
                        <div className="flight-deck-command__kv-row"><span>Battery</span><strong>{formatBatteryTelemetry(snapshot)}</strong></div>
                      </div>

                      <div className="flight-deck-command__sidebar-section">
                        <div className="flight-deck-command__sidebar-section-title">Status Log</div>
                        <div className="flight-deck-command__status-log">
                          {snapshot.statusTexts.length === 0 ? <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>No status text yet</span> : null}
                          {snapshot.statusTexts.slice(0, 5).map((entry) => (
                            <div key={`${entry.severity}-${entry.text}`} className={`status-entry ${entry.severity}`}>
                              <strong>{entry.severity}</strong>
                              <span>{entry.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className={`flight-deck-command__guided-summary${guidedSetupComplete ? ' is-complete' : ''}`}>
                        <strong>{guidedSetupComplete ? 'Setup complete' : `Setup ${completedSetupSectionCount}/${setupFlowSections.length}`}</strong>
                        <p>
                          {guidedSetupComplete
                            ? 'All steps verified. Use navigation for refinement.'
                            : selectedSetupSection
                              ? `Next: ${selectedSetupSection.title}`
                              : 'Start guided setup to begin.'}
                        </p>
                        <button
                          style={buttonStyle('primary')}
                          onClick={() => openSetupWizard()}
                          disabled={!recommendedSetupSection}
                        >
                          {guidedSetupComplete ? 'Review Setup' : completedSetupSectionCount > 0 ? 'Resume Setup' : 'Start Setup'}
                        </button>
                      </div>
                    </div>
  	              </div>

                  {setupFlowFollowUp ? (
                    <div className={`setup-flow__banner setup-flow__banner--${setupFlowFollowUp.tone}`}>
                      <div>
                        <strong>{setupFlowFollowUp.title}</strong>
                        <p>{setupFlowFollowUp.text}</p>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : selectedSetupSection ? (
                <div id="setup-panel-guided" className="setup-wizard" data-testid="setup-wizard">
                  <div className="setup-wizard__header">
                    <div>
                      <p className="eyebrow">Step {selectedSetupSectionIndex + 1} of {setupFlowSections.length}</p>
                      <h3>{selectedSetupSection.title}</h3>
                      <p>{selectedSetupSection.summary}</p>
                    </div>
                    <div className="setup-wizard__header-status">
                      <StatusBadge tone={toneForSetupSequence(selectedSetupSection.sequenceState)}>{selectedSetupSection.sequenceState}</StatusBadge>
                      <StatusBadge tone={toneForSetup(selectedSetupSection.status)}>
                        {selectedSetupSection.criteriaMetCount}/{selectedSetupSection.criteria.length} criteria
                      </StatusBadge>
                    </div>
                  </div>

                  <div className="switch-exercise-progress" aria-hidden="true">
                    <div className="switch-exercise-progress__fill" style={{ width: `${setupFlowProgress}%` }} />
                  </div>

                  <div className="setup-wizard__steps">
                    {setupFlowSections.map((section, index) => (
                      <button
                        key={section.id}
                        type="button"
                        className={`setup-wizard-step${section.id === selectedSetupSection.id ? ' is-active' : ''}${section.status === 'complete' ? ' is-complete' : ''}${section.sequenceState === 'current' ? ' is-current' : ''}${section.sequenceState === 'locked' ? ' is-locked' : ''}`}
                        onClick={() => {
                          setSelectedSetupSectionId(section.id)
                          setSetupMode('wizard')
                        }}
                        disabled={section.sequenceState === 'locked'}
                      >
                        <small>Step {index + 1}</small>
                        <span>{section.title}</span>
                      </button>
                    ))}
                  </div>

                  {setupFlowFollowUp ? (
                    <div className={`setup-flow__banner setup-flow__banner--${setupFlowFollowUp.tone}`}>
                      <div>
                        <strong>{setupFlowFollowUp.title}</strong>
                        <p>{setupFlowFollowUp.text}</p>
                      </div>
                    </div>
                  ) : null}

                  <div className="setup-wizard__body">
                    <div className="setup-wizard__main">
                      <div className="setup-wizard__detail">
                        <div>
                          <h4>What to do</h4>
                          <p>{selectedSetupSection.detail}</p>
                        </div>

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
                          <div className="setup-wizard__evidence">
                            <strong>Live Evidence</strong>
                            <div className="config-pills">
                              {selectedSetupSection.evidence.map((item) => (
                                <span key={item}>{item}</span>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {selectedSetupSection.blockingReason ? <p className="setup-flow__blocking-copy">{selectedSetupSection.blockingReason}</p> : null}
                      </div>

                      {['airframe', 'accelerometer', 'compass'].includes(selectedSetupSection.id)
                        ? renderAdditionalSettingsCard(
                            'Advanced setup settings',
                            'Board orientation, sensor, and related setup parameters stay attached to the guided flow when this step needs them.',
                            setupAdditionalGroups,
                            setupAdditionalDraftEntries,
                            setupAdditionalStagedDrafts,
                            setupAdditionalInvalidDrafts,
                            'setup:additional',
                            'Apply Setup Changes',
                            'advanced setup settings'
                          )
                        : null}
                    </div>

                    <aside className="setup-wizard__aside">
                      <div className="setup-wizard__action-card">
                        <strong>Next Action</strong>
                        <p>
                          {guidedSetupPrimaryAction
                            ? guidedSetupPrimaryAction.label
                            : 'Complete the current criteria or use the workspace navigation for more context.'}
                        </p>
                        {guidedSetupPrimaryAction ? (
                          <button
                            style={buttonStyle(guidedSetupPrimaryAction.tone ?? 'primary')}
                            onClick={() => handleSetupFlowAction(guidedSetupPrimaryAction)}
                            disabled={guidedSetupPrimaryAction.disabled}
                          >
                            {guidedSetupPrimaryAction.label}
                          </button>
                        ) : null}
                        {guidedSetupContextAction ? (
                          <button
                            style={buttonStyle(guidedSetupContextAction.tone ?? 'secondary')}
                            onClick={() => handleSetupFlowAction(guidedSetupContextAction)}
                            disabled={guidedSetupContextAction.disabled}
                          >
                            {guidedSetupContextAction.label}
                          </button>
                        ) : null}
                        {guidedSetupSupportActions.length > 0 ? (
                          <div className="setup-wizard__support-actions">
                            {guidedSetupSupportActions.map((action) => (
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
                        ) : null}
                      </div>

                      <div className="setup-wizard__nav">
                        <button style={buttonStyle()} onClick={() => moveSetupWizard(-1)} disabled={!previousSetupSection}>
                          Previous Step
                        </button>
                        <button
                          style={buttonStyle('primary')}
                          onClick={() => moveSetupWizard(1)}
                          disabled={!nextSetupSection || selectedSetupSection.status !== 'complete'}
                        >
                          {nextSetupSection ? `Continue to ${nextSetupSection.title}` : 'No More Steps'}
                        </button>
                      </div>
                    </aside>
                  </div>
                </div>
              ) : null}
	          </div>
	        </Panel>
	      </section>
	      </>
	      ) : null}

	      {activeViewId === 'ports' ? (
	      <section className="grid one-up">
	        <div id="setup-panel-ports">
	          <Panel
	            title="Ports & Peripherals"
	            subtitle="Assign serial roles, baud rates, GPS drivers, and hardware flow-control settings without dropping into the raw parameter table."
	          >
		          <div className="telemetry-stack telemetry-stack--ports">
		            <div className="ports-workspace">
		              <div className="ports-workspace__main">
	            <div className="telemetry-header">
	              <div>
	                <h3>Serial port role review</h3>
	                <p>
	                  Configure the links that make the rest of setup possible: telemetry radios, serial receivers, GPS modules, and other attached
	                  peripherals.
	                </p>
	              </div>
	              <StatusBadge tone={toneForScopedDraftReview(portsStagedDrafts.length, portsInvalidDrafts.length)}>
	                {portsInvalidDrafts.length > 0
	                  ? `${portsInvalidDrafts.length} invalid`
	                  : portsStagedDrafts.length > 0
	                    ? `${portsStagedDrafts.length} staged`
	                    : 'in sync'}
	              </StatusBadge>
	            </div>

	            {parameterNotice ? (
	              <div className="parameter-review__notice">
	                <StatusBadge tone={parameterNotice.tone}>{parameterNotice.tone}</StatusBadge>
	                <p>{parameterNotice.text}</p>
	              </div>
	            ) : null}

	            <div className="telemetry-metric-grid">
	              <article className="telemetry-metric-card">
	                <span>Detected ports</span>
	                <strong>{serialPortViewModels.length}</strong>
	              </article>
	              <article className="telemetry-metric-card">
	                <span>Staged changes</span>
	                <strong>{portsStagedDrafts.length}</strong>
	              </article>
	              <article className="telemetry-metric-card">
	                <span>Primary GPS</span>
	                <strong>{formatArducopterGpsType(gpsPeripheralViewModels.find((peripheral) => peripheral.label === 'Primary GPS')?.value)}</strong>
	              </article>
	              <article className="telemetry-metric-card">
	                <span>Secondary GPS</span>
	                <strong>{formatArducopterGpsType(gpsPeripheralViewModels.find((peripheral) => peripheral.label === 'Secondary GPS')?.value)}</strong>
	              </article>
	            </div>

	            {serialPortViewModels.length > 0 ? (
                <>
                  <div className="scoped-review-card__disclosure">
                    <small>
                      {showAllSerialPorts
                        ? `Showing all ${serialPortViewModels.length} detected serial ports.`
                        : `Showing ${visibleSerialPortViewModels.length} active or edited port${visibleSerialPortViewModels.length === 1 ? '' : 's'} first${hiddenSerialPortCount > 0 ? `, with ${hiddenSerialPortCount} unused slot${hiddenSerialPortCount === 1 ? '' : 's'} hidden.` : '.'}`}
                    </small>
                    {serialPortViewModels.length > visibleSerialPortViewModels.length || showAllSerialPorts ? (
                      <button
                        style={buttonStyle()}
                        onClick={() => setShowAllSerialPorts((current) => !current)}
                        disabled={busyAction !== undefined}
                      >
                        {showAllSerialPorts ? 'Show Active Ports' : `Show All ${serialPortViewModels.length} Ports`}
                      </button>
                    ) : null}
                  </div>
	              <div className="port-card-grid">
	                {visibleSerialPortViewModels.map((port) => (
	                  <article key={port.portNumber} className="port-card">
	                    <div className="port-card__header">
	                      <div>
	                        <strong>{port.label}</strong>
	                        <small>{port.protocolLabel}</small>
	                      </div>
	                      <StatusBadge tone={port.editable ? 'neutral' : 'warning'}>
	                        {port.editable ? `Port ${port.portNumber}` : 'read only'}
	                      </StatusBadge>
	                    </div>
	                    <p>{port.usageSummary}</p>

	                    <div className="port-card__fields">
	                      {port.protocolParameter ? (() => {
	                        const protocolParameter = port.protocolParameter
	                        return (
	                        <label className="scoped-editor-field scoped-editor-field--compact">
	                          <span>Protocol</span>
	                          <select
	                            value={editedValues[protocolParameter.id] ?? String(port.protocolValue ?? '')}
	                            onChange={(event) =>
	                              setEditedValues((existing) => ({
	                                ...existing,
	                                [protocolParameter.id]: event.target.value
	                              }))
	                            }
	                            disabled={!port.editable}
	                          >
	                            {(protocolParameter.definition?.options ?? []).map((valueOption) => (
	                              <option key={`${protocolParameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
	                                {valueOption.label} ({valueOption.value})
	                              </option>
	                            ))}
	                          </select>
	                        </label>
	                        )
	                      })() : null}

	                      {port.baudParameter ? (() => {
	                        const baudParameter = port.baudParameter
	                        return (
	                        <label className="scoped-editor-field scoped-editor-field--compact">
	                          <span>Baud</span>
	                          <select
	                            value={editedValues[baudParameter.id] ?? String(port.baudValue ?? '')}
	                            onChange={(event) =>
	                              setEditedValues((existing) => ({
	                                ...existing,
	                                [baudParameter.id]: event.target.value
	                              }))
	                            }
	                            disabled={!port.editable}
	                          >
	                            {(baudParameter.definition?.options ?? []).map((valueOption) => (
	                              <option key={`${baudParameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
	                                {valueOption.label} baud
	                              </option>
	                            ))}
	                          </select>
	                        </label>
	                        )
	                      })() : null}

	                      {port.flowControlParameter ? (() => {
	                        const flowControlParameter = port.flowControlParameter
	                        return (
	                        <label className="scoped-editor-field scoped-editor-field--compact">
	                          <span>Flow control</span>
	                          <select
	                            value={editedValues[flowControlParameter.id] ?? String(port.flowControlValue ?? '')}
	                            onChange={(event) =>
	                              setEditedValues((existing) => ({
	                                ...existing,
	                                [flowControlParameter.id]: event.target.value
	                              }))
	                            }
	                            disabled={!port.editable}
	                          >
	                            {(flowControlParameter.definition?.options ?? []).map((valueOption) => (
	                              <option key={`${flowControlParameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
	                                {valueOption.label}
	                              </option>
	                            ))}
	                          </select>
	                        </label>
	                        )
	                      })() : null}
	                    </div>

	                    <div className="config-pills">
	                      <span>{port.protocolLabel}</span>
	                      <span>{port.baudLabel}</span>
	                      {port.flowControlLabel ? <span>{port.flowControlLabel}</span> : null}
	                    </div>

	                    {port.notes.length > 0 ? (
	                      <ul className="output-note-list">
	                        {port.notes.map((note) => (
	                          <li key={note}>{note}</li>
	                        ))}
	                      </ul>
	                    ) : null}
	                  </article>
	                ))}
	              </div>
                </>
	            ) : (
	              <p className="telemetry-note">No `SERIALx_*` parameters were detected in the current snapshot.</p>
	            )}

		              </div>
		              <div className="ports-workspace__sidebar">

		            {gpsPeripheralViewModels.length > 0 ? (
	              <div className="port-card-grid">
	                {gpsPeripheralViewModels.map((peripheral) => (
	                  <article key={peripheral.label} className="port-card">
	                    <div className="port-card__header">
	                      <div>
	                        <strong>{peripheral.label}</strong>
	                        <small>{formatArducopterGpsType(peripheral.value)}</small>
	                      </div>
	                      <StatusBadge tone={peripheral.value === 0 ? 'neutral' : 'success'}>
	                        {peripheral.value === 0 ? 'disabled' : 'configured'}
	                      </StatusBadge>
	                    </div>
	                    <p>Choose the expected GPS/peripheral driver, then verify the live device after reboot and reconnect.</p>

	                    {peripheral.parameter ? (() => {
	                      const parameter = peripheral.parameter
	                      return (
	                      <label className="scoped-editor-field scoped-editor-field--compact">
	                        <span>{parameter.definition?.label ?? parameter.id}</span>
	                        <select
	                          value={editedValues[parameter.id] ?? String(peripheral.value ?? '')}
	                          onChange={(event) =>
	                            setEditedValues((existing) => ({
	                              ...existing,
	                              [parameter.id]: event.target.value
	                            }))
	                          }
	                        >
	                          {(parameter.definition?.options ?? []).map((valueOption) => (
	                            <option key={`${parameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
	                              {valueOption.label} ({valueOption.value})
	                            </option>
	                          ))}
	                        </select>
	                      </label>
	                      )
	                    })() : null}
	                  </article>
	                ))}
	              </div>
	            ) : null}

              {gpsPeripheralViewModels.length > 0 || snapshot.liveVerification.globalPosition.verified ? (
                <LiveGpsMapCard
                  snapshot={snapshot}
                  title="GPS map"
                  subtitle="Verify the live aircraft location once the GPS driver and serial link are configured."
                  testId="ports-gps-map-widget"
                />
              ) : null}

              {gpsAutoConfigParameter || gpsAutoSwitchParameter || gpsPrimaryParameter || gpsRateParameter ? (
                <div className="scoped-review-card scoped-review-card--compact">
                  <div className="switch-exercise-card__header">
                    <div>
                      <strong>GPS behavior</strong>
                      <p>Keep GPS redundancy, auto-configuration, and update-rate settings local to this Ports workflow.</p>
                    </div>
                    <StatusBadge tone={toneForScopedDraftReview(portsStagedDrafts.length, portsInvalidDrafts.length)}>
                      {portsInvalidDrafts.length > 0
                        ? `${portsInvalidDrafts.length} invalid`
                        : portsStagedDrafts.length > 0
                          ? `${portsStagedDrafts.length} staged`
                          : 'in sync'}
                    </StatusBadge>
                  </div>

                  <div className="config-pills">
                    {gpsAutoConfigParameter ? <span>Auto config: {formatArducopterGpsAutoConfig(gpsAutoConfig)}</span> : null}
                    {gpsAutoSwitchParameter ? <span>Auto switch: {formatArducopterGpsAutoSwitch(gpsAutoSwitch)}</span> : null}
                    {gpsPrimaryParameter ? <span>Preferred GPS: {formatArducopterGpsPrimary(gpsPrimary)}</span> : null}
                    {gpsRateParameter ? <span>Update rate: {formatArducopterGpsRateMs(gpsRateMs)}</span> : null}
                  </div>

                  <div className="scoped-editor-grid">
                    {gpsAutoConfigParameter ? (
                      <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(gpsAutoConfigParameter.id)?.status ?? 'unchanged'}`}>
                        <span>{gpsAutoConfigParameter.definition?.label ?? gpsAutoConfigParameter.id}</span>
                        <select
                          value={editedValues[gpsAutoConfigParameter.id] ?? String(gpsAutoConfig ?? '')}
                          onChange={(event) =>
                            setEditedValues((existing) => ({
                              ...existing,
                              [gpsAutoConfigParameter.id]: event.target.value
                            }))
                          }
                        >
                          {(gpsAutoConfigParameter.definition?.options ?? []).map((valueOption) => (
                            <option key={`${gpsAutoConfigParameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
                              {valueOption.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    {gpsAutoSwitchParameter ? (
                      <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(gpsAutoSwitchParameter.id)?.status ?? 'unchanged'}`}>
                        <span>{gpsAutoSwitchParameter.definition?.label ?? gpsAutoSwitchParameter.id}</span>
                        <select
                          value={editedValues[gpsAutoSwitchParameter.id] ?? String(gpsAutoSwitch ?? '')}
                          onChange={(event) =>
                            setEditedValues((existing) => ({
                              ...existing,
                              [gpsAutoSwitchParameter.id]: event.target.value
                            }))
                          }
                        >
                          {(gpsAutoSwitchParameter.definition?.options ?? []).map((valueOption) => (
                            <option key={`${gpsAutoSwitchParameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
                              {valueOption.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    {gpsPrimaryParameter ? (
                      <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(gpsPrimaryParameter.id)?.status ?? 'unchanged'}`}>
                        <span>{gpsPrimaryParameter.definition?.label ?? gpsPrimaryParameter.id}</span>
                        <select
                          value={editedValues[gpsPrimaryParameter.id] ?? String(gpsPrimary ?? '')}
                          onChange={(event) =>
                            setEditedValues((existing) => ({
                              ...existing,
                              [gpsPrimaryParameter.id]: event.target.value
                            }))
                          }
                        >
                          {(gpsPrimaryParameter.definition?.options ?? []).map((valueOption) => (
                            <option key={`${gpsPrimaryParameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
                              {valueOption.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    {gpsRateParameter ? (
                      <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(gpsRateParameter.id)?.status ?? 'unchanged'}`}>
                        <span>{gpsRateParameter.definition?.label ?? gpsRateParameter.id}</span>
                        {gpsRateParameter.definition?.options && gpsRateParameter.definition.options.length > 0 ? (
                          <select
                            value={editedValues[gpsRateParameter.id] ?? String(gpsRateMs ?? '')}
                            onChange={(event) =>
                              setEditedValues((existing) => ({
                                ...existing,
                                [gpsRateParameter.id]: event.target.value
                              }))
                            }
                          >
                            {gpsRateParameter.definition.options.map((valueOption) => (
                              <option key={`${gpsRateParameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
                                {valueOption.label} ({valueOption.value} ms)
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="number"
                            min={gpsRateParameter.definition?.minimum}
                            max={gpsRateParameter.definition?.maximum}
                            step={gpsRateParameter.definition?.step ?? 1}
                            value={editedValues[gpsRateParameter.id] ?? String(gpsRateMs ?? '')}
                            onChange={(event) =>
                              setEditedValues((existing) => ({
                                ...existing,
                                [gpsRateParameter.id]: event.target.value
                              }))
                            }
                          />
                        )}
                      </label>
                    ) : null}
                  </div>

                  <ul className="output-note-list">
                    <li>Keep GPS redundancy features simple unless the aircraft actually has two usable GPS links.</li>
                    <li>After GPS behavior changes, reboot, reconnect, and verify live lock/telemetry before flight.</li>
                  </ul>
                </div>
              ) : null}

              {osdTypeParameter || osdChannelParameter || osdSwitchMethodParameter || mspOptionsParameter || mspOsdCellCountParameter ? (
                <div className="scoped-review-card scoped-review-card--compact">
                  <div className="switch-exercise-card__header">
                    <div>
                      <strong>Video OSD</strong>
                      <p>Keep the FPV overlay backend, page switching, and MSP display options local to this Ports workflow.</p>
                    </div>
                    <StatusBadge tone={toneForScopedDraftReview(portsStagedDrafts.length, portsInvalidDrafts.length)}>
                      {portsInvalidDrafts.length > 0
                        ? `${portsInvalidDrafts.length} invalid`
                        : portsStagedDrafts.length > 0
                          ? `${portsStagedDrafts.length} staged`
                          : 'in sync'}
                    </StatusBadge>
                  </div>

                  <div className="config-pills">
                    {osdTypeParameter ? <span>Backend: {formatArducopterOsdType(osdType)}</span> : null}
                    {osdChannelParameter ? <span>Screen channel: {formatArducopterOsdChannel(osdChannel)}</span> : null}
                    {osdSwitchMethodParameter ? <span>Switching: {formatArducopterOsdSwitchMethod(osdSwitchMethod)}</span> : null}
                    {mspOsdCellCountParameter ? <span>Cell count: {formatArducopterMspOsdCellCount(mspOsdCellCount)}</span> : null}
                    {mspOptionsParameter ? <span>MSP options: {describeBitmaskSelections(mspOptions, ARDUCOPTER_MSP_OPTION_BIT_LABELS, 'No special options')}</span> : null}
                    {osdLinkPorts.length > 0
                      ? osdLinkPorts.map((port) => <span key={`osd-link:${port.portNumber}`}>{port.label}: {port.protocolLabel}</span>)
                      : <span>No MSP / DisplayPort OSD link detected in current port roles</span>}
                  </div>

                  <div className="scoped-editor-grid">
                    {osdTypeParameter ? (
                      <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(osdTypeParameter.id)?.status ?? 'unchanged'}`}>
                        <span>{osdTypeParameter.definition?.label ?? osdTypeParameter.id}</span>
                        <select
                          value={editedValues[osdTypeParameter.id] ?? String(osdType ?? '')}
                          onChange={(event) =>
                            setEditedValues((existing) => ({
                              ...existing,
                              [osdTypeParameter.id]: event.target.value
                            }))
                          }
                        >
                          {(osdTypeParameter.definition?.options ?? []).map((valueOption) => (
                            <option key={`${osdTypeParameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
                              {valueOption.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    {osdChannelParameter ? (
                      <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(osdChannelParameter.id)?.status ?? 'unchanged'}`}>
                        <span>{osdChannelParameter.definition?.label ?? osdChannelParameter.id}</span>
                        <select
                          value={editedValues[osdChannelParameter.id] ?? String(osdChannel ?? '')}
                          onChange={(event) =>
                            setEditedValues((existing) => ({
                              ...existing,
                              [osdChannelParameter.id]: event.target.value
                            }))
                          }
                        >
                          {(osdChannelParameter.definition?.options ?? []).map((valueOption) => (
                            <option key={`${osdChannelParameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
                              {valueOption.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    {osdSwitchMethodParameter ? (
                      <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(osdSwitchMethodParameter.id)?.status ?? 'unchanged'}`}>
                        <span>{osdSwitchMethodParameter.definition?.label ?? osdSwitchMethodParameter.id}</span>
                        <select
                          value={editedValues[osdSwitchMethodParameter.id] ?? String(osdSwitchMethod ?? '')}
                          onChange={(event) =>
                            setEditedValues((existing) => ({
                              ...existing,
                              [osdSwitchMethodParameter.id]: event.target.value
                            }))
                          }
                        >
                          {(osdSwitchMethodParameter.definition?.options ?? []).map((valueOption) => (
                            <option key={`${osdSwitchMethodParameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
                              {valueOption.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    {mspOsdCellCountParameter ? (
                      <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(mspOsdCellCountParameter.id)?.status ?? 'unchanged'}`}>
                        <span>{mspOsdCellCountParameter.definition?.label ?? mspOsdCellCountParameter.id}</span>
                        <select
                          value={editedValues[mspOsdCellCountParameter.id] ?? String(mspOsdCellCount ?? '')}
                          onChange={(event) =>
                            setEditedValues((existing) => ({
                              ...existing,
                              [mspOsdCellCountParameter.id]: event.target.value
                            }))
                          }
                        >
                          {(mspOsdCellCountParameter.definition?.options ?? []).map((valueOption) => (
                            <option key={`${mspOsdCellCountParameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
                              {valueOption.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    {mspOptionsParameter ? (
                      <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(mspOptionsParameter.id)?.status ?? 'unchanged'}`}>
                        <span>{mspOptionsParameter.definition?.label ?? mspOptionsParameter.id}</span>
                        <div className="scoped-checkbox-list">
                          {Object.entries(ARDUCOPTER_MSP_OPTION_BIT_LABELS).map(([bit, label]) => {
                            const numericBit = Number(bit)
                            return (
                              <label key={`${mspOptionsParameter.id}:${bit}`} className="scoped-checkbox-option">
                                <input
                                  type="checkbox"
                                  checked={hasBitmaskFlag(editedMspOptions, numericBit)}
                                  onChange={(event) =>
                                    setEditedValues((existing) => {
                                      const currentValue = normalizeBitmaskValue(existing[mspOptionsParameter.id], mspOptions)
                                      const nextValue = event.target.checked
                                        ? currentValue | (1 << numericBit)
                                        : currentValue & ~(1 << numericBit)

                                      return {
                                        ...existing,
                                        [mspOptionsParameter.id]: String(nextValue)
                                      }
                                    })
                                  }
                                />
                                <span>{label}</span>
                              </label>
                            )
                          })}
                        </div>
                        <small>
                          {parameterDraftById.get(mspOptionsParameter.id)?.status === 'staged'
                            ? `Staged ${describeBitmaskSelections(parameterDraftById.get(mspOptionsParameter.id)?.nextValue, ARDUCOPTER_MSP_OPTION_BIT_LABELS, 'No special options')}`
                            : parameterDraftById.get(mspOptionsParameter.id)?.reason ??
                              `Current ${describeBitmaskSelections(mspOptions, ARDUCOPTER_MSP_OPTION_BIT_LABELS, 'No special options')}`}
                        </small>
                      </label>
                    ) : null}
                  </div>

                  <ul className="output-note-list">
                    <li>Assign the matching serial port to MSP, DJI FPV, or DisplayPort before expecting an FPV overlay.</li>
                    <li>After OSD backend changes, reboot, reconnect, and verify the live overlay in goggles or the display before flight.</li>
                  </ul>
                </div>
              ) : null}

              {vtxEnableParameter || vtxFrequencyParameter || vtxPowerParameter || vtxMaxPowerParameter || vtxOptionsParameter ? (
                <div className="scoped-review-card scoped-review-card--compact">
                  <div className="switch-exercise-card__header">
                    <div>
                      <strong>Video transmitter</strong>
                      <p>Keep VTX control, frequency, and power review local to this Ports workflow.</p>
                    </div>
                    <StatusBadge tone={toneForScopedDraftReview(portsStagedDrafts.length, portsInvalidDrafts.length)}>
                      {portsInvalidDrafts.length > 0
                        ? `${portsInvalidDrafts.length} invalid`
                        : portsStagedDrafts.length > 0
                          ? `${portsStagedDrafts.length} staged`
                          : 'in sync'}
                    </StatusBadge>
                  </div>

                  <div className="config-pills">
                    {vtxEnableParameter ? <span>Control: {formatArducopterVtxEnable(vtxEnabled)}</span> : null}
                    {vtxFrequencyParameter ? <span>Frequency: {vtxFrequency !== undefined ? `${vtxFrequency} MHz` : 'Unknown'}</span> : null}
                    {vtxPowerParameter ? <span>Power: {vtxPower !== undefined ? `${vtxPower} mW` : 'Unknown'}</span> : null}
                    {vtxMaxPowerParameter ? <span>Max power: {vtxMaxPower !== undefined ? `${vtxMaxPower} mW` : 'Unknown'}</span> : null}
                    {vtxLinkPorts.length > 0
                      ? vtxLinkPorts.map((port) => <span key={`vtx-link:${port.portNumber}`}>{port.label}: {port.protocolLabel}</span>)
                      : <span>No VTX control link detected in current port roles</span>}
                  </div>

                  <div className="scoped-editor-grid">
                    {vtxEnableParameter ? (
                      <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(vtxEnableParameter.id)?.status ?? 'unchanged'}`}>
                        <span>{vtxEnableParameter.definition?.label ?? vtxEnableParameter.id}</span>
                        <select
                          value={editedValues[vtxEnableParameter.id] ?? String(vtxEnabled ?? '')}
                          onChange={(event) =>
                            setEditedValues((existing) => ({
                              ...existing,
                              [vtxEnableParameter.id]: event.target.value
                            }))
                          }
                        >
                          {(vtxEnableParameter.definition?.options ?? []).map((valueOption) => (
                            <option key={`${vtxEnableParameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
                              {valueOption.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    {vtxFrequencyParameter ? (
                      <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(vtxFrequencyParameter.id)?.status ?? 'unchanged'}`}>
                        <span>{vtxFrequencyParameter.definition?.label ?? vtxFrequencyParameter.id}</span>
                        <input
                          type="number"
                          min={vtxFrequencyParameter.definition?.minimum}
                          max={vtxFrequencyParameter.definition?.maximum}
                          step={vtxFrequencyParameter.definition?.step ?? 1}
                          value={editedValues[vtxFrequencyParameter.id] ?? String(vtxFrequency ?? '')}
                          onChange={(event) =>
                            setEditedValues((existing) => ({
                              ...existing,
                              [vtxFrequencyParameter.id]: event.target.value
                            }))
                          }
                        />
                      </label>
                    ) : null}

                    {vtxPowerParameter ? (
                      <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(vtxPowerParameter.id)?.status ?? 'unchanged'}`}>
                        <span>{vtxPowerParameter.definition?.label ?? vtxPowerParameter.id}</span>
                        <input
                          type="number"
                          min={vtxPowerParameter.definition?.minimum}
                          max={vtxPowerParameter.definition?.maximum}
                          step={vtxPowerParameter.definition?.step ?? 1}
                          value={editedValues[vtxPowerParameter.id] ?? String(vtxPower ?? '')}
                          onChange={(event) =>
                            setEditedValues((existing) => ({
                              ...existing,
                              [vtxPowerParameter.id]: event.target.value
                            }))
                          }
                        />
                      </label>
                    ) : null}

                    {vtxMaxPowerParameter ? (
                      <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(vtxMaxPowerParameter.id)?.status ?? 'unchanged'}`}>
                        <span>{vtxMaxPowerParameter.definition?.label ?? vtxMaxPowerParameter.id}</span>
                        <input
                          type="number"
                          min={vtxMaxPowerParameter.definition?.minimum}
                          max={vtxMaxPowerParameter.definition?.maximum}
                          step={vtxMaxPowerParameter.definition?.step ?? 1}
                          value={editedValues[vtxMaxPowerParameter.id] ?? String(vtxMaxPower ?? '')}
                          onChange={(event) =>
                            setEditedValues((existing) => ({
                              ...existing,
                              [vtxMaxPowerParameter.id]: event.target.value
                            }))
                          }
                        />
                      </label>
                    ) : null}

                    {vtxOptionsParameter ? (
                      <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(vtxOptionsParameter.id)?.status ?? 'unchanged'}`}>
                        <span>{vtxOptionsParameter.definition?.label ?? vtxOptionsParameter.id}</span>
                        <input
                          type="number"
                          min={vtxOptionsParameter.definition?.minimum}
                          max={vtxOptionsParameter.definition?.maximum}
                          step={vtxOptionsParameter.definition?.step ?? 1}
                          value={editedValues[vtxOptionsParameter.id] ?? String(vtxOptions ?? '')}
                          onChange={(event) =>
                            setEditedValues((existing) => ({
                              ...existing,
                              [vtxOptionsParameter.id]: event.target.value
                            }))
                          }
                        />
                      </label>
                    ) : null}
                  </div>

                  <ul className="output-note-list">
                    <li>Assign the actual VTX control protocol on the matching serial port first, then use this card to set frequency and power.</li>
                    <li>Bench-check the actual transmitted channel and power after changes before flying or arming with props on.</li>
                  </ul>
                </div>
              ) : null}

	              {renderAdditionalSettingsCard(
	                'Additional port settings',
	                'These metadata-backed port and peripheral settings are kept local to the Ports view so common setup work does not spill into raw Parameters.',
                portsAdditionalGroups,
                portsAdditionalDraftEntries,
                portsAdditionalStagedDrafts,
                portsAdditionalInvalidDrafts,
                'ports:additional',
	                'Apply Additional Port Changes',
	                'additional port settings'
	              )}
		              </div>
		            </div>

		            <div className="switch-exercise-controls">
	              <button
	                style={buttonStyle('primary')}
	                onClick={() => void handleApplyScopedParameterDrafts(portsDraftEntries, 'ports:apply', 'Ports & peripherals')}
	                disabled={
	                  busyAction !== undefined ||
	                  portsStagedDrafts.length === 0 ||
	                  portsInvalidDrafts.length > 0 ||
	                  !canApplyDraftParameters
	                }
	              >
	                {busyAction === 'ports:apply' ? 'Applying…' : `Apply Port Changes (${portsStagedDrafts.length})`}
	              </button>
	              <button
	                style={buttonStyle()}
	                onClick={() => handleDiscardScopedParameterDrafts(portsDraftEntries.map((entry) => entry.id), 'ports')}
	                disabled={busyAction !== undefined || portsDraftEntries.length === 0}
	              >
	                Discard Port Changes
	              </button>
	            </div>

	            <p className="telemetry-note">
	              Use the sidebar session controls to reboot and refresh after changing serial roles, GPS drivers, or flow-control settings.
	            </p>
	          </div>
	          </Panel>
	        </div>
	      </section>
	      ) : null}

	      {(activeViewId === 'receiver' || activeViewId === 'power') ? (
      <section className={`grid ${activeViewId === 'receiver' || activeViewId === 'power' ? 'one-up' : 'two-up'}`}>
        {activeViewId === 'receiver' ? (
        <div id="setup-panel-rc">
          <Panel
            title="Live RC Inputs"
            subtitle="Receiver telemetry, calibrated channel bars, and an estimated flight-mode switch position from the current RC stream."
          >
          <div className="telemetry-stack telemetry-stack--receiver">
            <div className="receiver-workspace">
              <div className="receiver-workspace__live">
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

                <RcChannelBars
                  channels={rcChannelDisplays}
                  verified={snapshot.liveVerification.rcInput.verified}
                  testId="receiver-channel-bars"
                />

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

                <div className="receiver-exercise-grid">
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
                {(modeSwitchExercise.status === 'idle' ? modeExerciseAssignments.map((assignment) => assignment.slot) : modeSwitchExercise.targetSlots).map((slot) => {
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
                </div>
              </div>

              <div className="receiver-workspace__config">
                <div className="receiver-config-grid">

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
	                <li>Stage the captured values, then review and apply them from the Receiver view before confirming the radio step.</li>
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
                </div>

                <div className="receiver-support-grid">
              {modeChannelParameter || rssiTypeParameter || rssiChannelParameter || rssiChannelLowParameter || rssiChannelHighParameter ? (
                <div className="scoped-review-card scoped-review-card--compact">
                  <div className="switch-exercise-card__header">
                    <div>
                      <strong>Receiver link & signal setup</strong>
                      <p>Mode-channel selection, RSSI configuration, and receiver-link awareness stay local to this Receiver workflow.</p>
                    </div>
                    <StatusBadge tone={toneForScopedDraftReview(receiverStagedDrafts.length, receiverInvalidDrafts.length)}>
                      {receiverInvalidDrafts.length > 0
                        ? `${receiverInvalidDrafts.length} invalid`
                        : receiverStagedDrafts.length > 0
                          ? `${receiverStagedDrafts.length} staged`
                          : 'in sync'}
                    </StatusBadge>
                  </div>

                  <div className="config-pills">
                    <span>Mode channel: {formatArducopterFlightModeChannel(configuredModeChannel)}</span>
                    <span>RSSI source: {formatArducopterRssiType(rssiType)}</span>
                    <span>Live RSSI: {snapshot.liveVerification.rcInput.rssi ?? 'Unknown'}</span>
                    {receiverLinkPorts.length > 0
                      ? receiverLinkPorts.map((port) => <span key={`receiver-link:${port.portNumber}`}>{port.label}: {port.protocolLabel}</span>)
                      : <span>No receiver serial link detected in current port roles</span>}
                  </div>

                  <div className="scoped-editor-grid">
                    {modeChannelParameter ? (
                      <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(modeChannelParameter.id)?.status ?? 'unchanged'}`}>
                        <span>{modeChannelParameter.definition?.label ?? modeChannelParameter.id}</span>
                        <select
                          value={editedValues[modeChannelParameter.id] ?? String(configuredModeChannel ?? '')}
                          onChange={(event) =>
                            setEditedValues((existing) => ({
                              ...existing,
                              [modeChannelParameter.id]: event.target.value
                            }))
                          }
                        >
                          {(modeChannelParameter.definition?.options ?? []).map((valueOption) => (
                            <option key={`${modeChannelParameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
                              {valueOption.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    {rssiTypeParameter ? (
                      <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(rssiTypeParameter.id)?.status ?? 'unchanged'}`}>
                        <span>{rssiTypeParameter.definition?.label ?? rssiTypeParameter.id}</span>
                        <select
                          value={editedValues[rssiTypeParameter.id] ?? String(rssiType ?? '')}
                          onChange={(event) =>
                            setEditedValues((existing) => ({
                              ...existing,
                              [rssiTypeParameter.id]: event.target.value
                            }))
                          }
                        >
                          {(rssiTypeParameter.definition?.options ?? []).map((valueOption) => (
                            <option key={`${rssiTypeParameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
                              {valueOption.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    {rssiChannelParameter ? (
                      <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(rssiChannelParameter.id)?.status ?? 'unchanged'}`}>
                        <span>{rssiChannelParameter.definition?.label ?? rssiChannelParameter.id}</span>
                        <input
                          type="number"
                          min={rssiChannelParameter.definition?.minimum}
                          max={rssiChannelParameter.definition?.maximum}
                          step={rssiChannelParameter.definition?.step ?? 1}
                          value={editedValues[rssiChannelParameter.id] ?? String(rssiChannel ?? '')}
                          onChange={(event) =>
                            setEditedValues((existing) => ({
                              ...existing,
                              [rssiChannelParameter.id]: event.target.value
                            }))
                          }
                        />
                      </label>
                    ) : null}

                    {rssiChannelLowParameter ? (
                      <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(rssiChannelLowParameter.id)?.status ?? 'unchanged'}`}>
                        <span>{rssiChannelLowParameter.definition?.label ?? rssiChannelLowParameter.id}</span>
                        <input
                          type="number"
                          min={rssiChannelLowParameter.definition?.minimum}
                          max={rssiChannelLowParameter.definition?.maximum}
                          step={rssiChannelLowParameter.definition?.step ?? 1}
                          value={editedValues[rssiChannelLowParameter.id] ?? String(rssiChannelLow ?? '')}
                          onChange={(event) =>
                            setEditedValues((existing) => ({
                              ...existing,
                              [rssiChannelLowParameter.id]: event.target.value
                            }))
                          }
                        />
                      </label>
                    ) : null}

                    {rssiChannelHighParameter ? (
                      <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(rssiChannelHighParameter.id)?.status ?? 'unchanged'}`}>
                        <span>{rssiChannelHighParameter.definition?.label ?? rssiChannelHighParameter.id}</span>
                        <input
                          type="number"
                          min={rssiChannelHighParameter.definition?.minimum}
                          max={rssiChannelHighParameter.definition?.maximum}
                          step={rssiChannelHighParameter.definition?.step ?? 1}
                          value={editedValues[rssiChannelHighParameter.id] ?? String(rssiChannelHigh ?? '')}
                          onChange={(event) =>
                            setEditedValues((existing) => ({
                              ...existing,
                              [rssiChannelHighParameter.id]: event.target.value
                            }))
                          }
                        />
                      </label>
                    ) : null}
                  </div>

                  <ul className="output-note-list">
                    <li>Receiver serial protocol is usually assigned from Ports; this card covers the receiver-side interpretation of that link.</li>
                    <li>After changing the mode channel or RSSI settings, rerun the mode-switch and RC verification exercises before flight.</li>
                  </ul>
                </div>
              ) : null}

	            <div className="scoped-review-card">
	              <div className="switch-exercise-card__header">
	                <div>
	                  <strong>Receiver & mode changes in review</strong>
	                  <p>
	                    Keep RC mapping, calibration, and flight-mode work local to this view. Apply verified changes here instead of
	                    jumping to Parameters.
	                  </p>
	                </div>
	                <StatusBadge tone={toneForScopedDraftReview(receiverStagedDrafts.length, receiverInvalidDrafts.length)}>
	                  {receiverInvalidDrafts.length > 0
	                    ? `${receiverInvalidDrafts.length} invalid`
	                    : receiverStagedDrafts.length > 0
	                      ? `${receiverStagedDrafts.length} staged`
	                      : 'in sync'}
	                </StatusBadge>
	              </div>

	              {receiverDraftEntries.length > 0 ? (
	                <div className="scoped-draft-list">
	                  {receiverDraftEntries.map((draft) => (
	                    <article key={draft.id} className={`scoped-draft-item scoped-draft-item--${draft.status}`}>
	                      <div className="scoped-draft-item__header">
	                        <strong>{draft.id}</strong>
	                        <StatusBadge tone={toneForParameterDraftStatus(draft.status)}>{draft.status}</StatusBadge>
	                      </div>
	                      <p>{draft.label}</p>
	                      <small>
	                        {draft.status === 'staged'
	                          ? `${formatParameterValue(draft.currentValue, draft.definition?.unit)} to ${formatParameterValue(
	                              draft.nextValue,
	                              draft.definition?.unit
	                            )}`
	                          : draft.reason ?? 'Draft matches the live controller value.'}
	                      </small>
	                    </article>
	                  ))}
	                </div>
	              ) : (
	                <p className="success-copy">No receiver-specific parameter changes are currently staged.</p>
	              )}

	              <div className="switch-exercise-controls">
	                <button
	                  style={buttonStyle('primary')}
	                  onClick={() =>
	                    void handleApplyScopedParameterDrafts(receiverDraftEntries, 'receiver:apply', 'Receiver setup')
	                  }
	                  disabled={
	                    busyAction !== undefined ||
	                    receiverStagedDrafts.length === 0 ||
	                    receiverInvalidDrafts.length > 0 ||
	                    !canApplyDraftParameters
	                  }
	                >
	                  {busyAction === 'receiver:apply' ? 'Applying…' : `Apply Receiver Changes (${receiverStagedDrafts.length})`}
	                </button>
	                <button
	                  style={buttonStyle()}
	                  onClick={() =>
	                    handleDiscardScopedParameterDrafts(receiverDraftEntries.map((entry) => entry.id), 'receiver')
	                  }
	                  disabled={busyAction !== undefined || receiverDraftEntries.length === 0}
	                >
	                  Discard Receiver Changes
	                </button>
	              </div>
	            </div>

	            {modeAssignmentParameters.length > 0 ? (
	              <div className="scoped-review-card scoped-review-card--compact">
	                <div className="switch-exercise-card__header">
	                  <div>
	                    <strong>Flight mode assignments</strong>
	                    <p>Edit the configured switch positions here, then apply them from the same Receiver workflow.</p>
	                  </div>
	                  <StatusBadge tone={modeExerciseAssignments.length >= 2 ? 'success' : 'warning'}>
	                    {modeExerciseAssignments.length >= 2 ? `${modeExerciseAssignments.length} distinct positions` : 'Review needed'}
	                  </StatusBadge>
	                </div>

	                <div className="scoped-editor-grid">
	                  {modeAssignmentParameters.map((parameter) => {
	                    const draft = parameterDraftById.get(parameter.id)
	                    const inputValue = editedValues[parameter.id] ?? String(parameter.value)

	                    return (
	                      <label key={parameter.id} className={`scoped-editor-field scoped-editor-field--${draft?.status ?? 'unchanged'}`}>
	                        <span>{parameter.definition?.label ?? parameter.id}</span>
	                        <select
	                          value={inputValue}
	                          onChange={(event) =>
	                            setEditedValues((existing) => ({
	                              ...existing,
	                              [parameter.id]: event.target.value
	                            }))
	                          }
	                        >
	                          {(parameter.definition?.options ?? []).map((valueOption) => (
	                            <option key={`${parameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
	                              {valueOption.label} ({valueOption.value})
	                            </option>
	                          ))}
	                        </select>
	                        <small>
	                          {draft?.status === 'staged'
	                            ? `Staged ${formatParameterDisplayValue(parameter, draft.nextValue)}`
	                            : draft?.reason ?? `Current ${formatParameterDisplayValue(parameter, parameter.value)}`}
	                        </small>
	                      </label>
	                    )
	                  })}
	                </div>

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
	              </div>
	            ) : null}
                </div>

              {renderAdditionalSettingsCard(
                'Additional receiver settings',
                'These metadata-backed receiver and mode settings extend the Receiver workflow without forcing you into raw Parameters.',
                receiverAdditionalGroups,
                receiverAdditionalDraftEntries,
                receiverAdditionalStagedDrafts,
                receiverAdditionalInvalidDrafts,
                'receiver:additional',
                'Apply Additional Receiver Changes',
                'additional receiver settings'
              )}
              </div>
            </div>
          </div>
          </Panel>
        </div>
        ) : null}

        {activeViewId === 'power' ? (
        <div id="setup-panel-power">
          <Panel
            title="Power & Failsafe"
            subtitle="Live battery telemetry plus local review/apply controls for the key battery- and failsafe-related settings on the vehicle."
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

            {parameterNotice ? (
              <div className="parameter-review__notice">
                <StatusBadge tone={parameterNotice.tone}>{parameterNotice.tone}</StatusBadge>
                <p>{parameterNotice.text}</p>
              </div>
            ) : null}

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
              <span>Failsafe voltage source: {formatArducopterBatteryVoltageSource(batteryVoltageSource)}</span>
              <span>Low battery action: {formatArducopterBatteryFailsafeAction(batteryFailsafe)}</span>
              <span>Critical battery action: {formatArducopterBatteryFailsafeAction(batteryCriticalFailsafe)}</span>
              <span>Throttle failsafe: {formatArducopterThrottleFailsafe(throttleFailsafe)}</span>
              <span>Throttle failsafe PWM: {throttleFailsafeValue !== undefined ? `${throttleFailsafeValue} us` : 'Unknown'}</span>
            </div>

            <div className="scoped-review-card">
              <div className="switch-exercise-card__header">
                <div>
                  <strong>Power & failsafe configuration</strong>
                  <p>
                    Keep routine battery-monitor and failsafe changes local to this view. Apply them here, then verify live telemetry and pre-arm state
                    before first flight.
                  </p>
                </div>
                <StatusBadge tone={toneForScopedDraftReview(powerStagedDrafts.length, powerInvalidDrafts.length)}>
                  {powerInvalidDrafts.length > 0
                    ? `${powerInvalidDrafts.length} invalid`
                    : powerStagedDrafts.length > 0
                      ? `${powerStagedDrafts.length} staged`
                      : 'in sync'}
                </StatusBadge>
              </div>

              <div className="scoped-editor-grid">
                {batteryMonitorParameter ? (
                  <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(batteryMonitorParameter.id)?.status ?? 'unchanged'}`}>
                    <span>{batteryMonitorParameter.definition?.label ?? batteryMonitorParameter.id}</span>
                    <select
                      value={editedValues[batteryMonitorParameter.id] ?? String(batteryMonitor ?? '')}
                      onChange={(event) =>
                        setEditedValues((existing) => ({
                          ...existing,
                          [batteryMonitorParameter.id]: event.target.value
                        }))
                      }
                    >
                      {(batteryMonitorParameter.definition?.options ?? []).map((valueOption) => (
                        <option key={`${batteryMonitorParameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
                          {valueOption.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {batteryCapacityParameter ? (
                  <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(batteryCapacityParameter.id)?.status ?? 'unchanged'}`}>
                    <span>{batteryCapacityParameter.definition?.label ?? batteryCapacityParameter.id}</span>
                    <input
                      type="number"
                      min={batteryCapacityParameter.definition?.minimum}
                      max={batteryCapacityParameter.definition?.maximum}
                      step={batteryCapacityParameter.definition?.step ?? 1}
                      value={editedValues[batteryCapacityParameter.id] ?? String(batteryCapacity ?? '')}
                      onChange={(event) =>
                        setEditedValues((existing) => ({
                          ...existing,
                          [batteryCapacityParameter.id]: event.target.value
                        }))
                      }
                    />
                  </label>
                ) : null}

                {batteryArmVoltageParameter ? (
                  <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(batteryArmVoltageParameter.id)?.status ?? 'unchanged'}`}>
                    <span>{batteryArmVoltageParameter.definition?.label ?? batteryArmVoltageParameter.id}</span>
                    <input
                      type="number"
                      min={batteryArmVoltageParameter.definition?.minimum}
                      max={batteryArmVoltageParameter.definition?.maximum}
                      step={batteryArmVoltageParameter.definition?.step ?? 0.1}
                      value={editedValues[batteryArmVoltageParameter.id] ?? String(batteryArmVoltage ?? '')}
                      onChange={(event) =>
                        setEditedValues((existing) => ({
                          ...existing,
                          [batteryArmVoltageParameter.id]: event.target.value
                        }))
                      }
                    />
                  </label>
                ) : null}

                {batteryArmMahParameter ? (
                  <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(batteryArmMahParameter.id)?.status ?? 'unchanged'}`}>
                    <span>{batteryArmMahParameter.definition?.label ?? batteryArmMahParameter.id}</span>
                    <input
                      type="number"
                      min={batteryArmMahParameter.definition?.minimum}
                      max={batteryArmMahParameter.definition?.maximum}
                      step={batteryArmMahParameter.definition?.step ?? 1}
                      value={editedValues[batteryArmMahParameter.id] ?? String(batteryArmMah ?? '')}
                      onChange={(event) =>
                        setEditedValues((existing) => ({
                          ...existing,
                          [batteryArmMahParameter.id]: event.target.value
                        }))
                      }
                    />
                  </label>
                ) : null}

                {batteryVoltageSourceParameter ? (
                  <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(batteryVoltageSourceParameter.id)?.status ?? 'unchanged'}`}>
                    <span>{batteryVoltageSourceParameter.definition?.label ?? batteryVoltageSourceParameter.id}</span>
                    <select
                      value={editedValues[batteryVoltageSourceParameter.id] ?? String(batteryVoltageSource ?? '')}
                      onChange={(event) =>
                        setEditedValues((existing) => ({
                          ...existing,
                          [batteryVoltageSourceParameter.id]: event.target.value
                        }))
                      }
                    >
                      {(batteryVoltageSourceParameter.definition?.options ?? []).map((valueOption) => (
                        <option key={`${batteryVoltageSourceParameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
                          {valueOption.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {batteryLowVoltageParameter ? (
                  <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(batteryLowVoltageParameter.id)?.status ?? 'unchanged'}`}>
                    <span>{batteryLowVoltageParameter.definition?.label ?? batteryLowVoltageParameter.id}</span>
                    <input
                      type="number"
                      min={batteryLowVoltageParameter.definition?.minimum}
                      max={batteryLowVoltageParameter.definition?.maximum}
                      step={batteryLowVoltageParameter.definition?.step ?? 0.1}
                      value={editedValues[batteryLowVoltageParameter.id] ?? String(batteryLowVoltage ?? '')}
                      onChange={(event) =>
                        setEditedValues((existing) => ({
                          ...existing,
                          [batteryLowVoltageParameter.id]: event.target.value
                        }))
                      }
                    />
                  </label>
                ) : null}

                {batteryLowMahParameter ? (
                  <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(batteryLowMahParameter.id)?.status ?? 'unchanged'}`}>
                    <span>{batteryLowMahParameter.definition?.label ?? batteryLowMahParameter.id}</span>
                    <input
                      type="number"
                      min={batteryLowMahParameter.definition?.minimum}
                      max={batteryLowMahParameter.definition?.maximum}
                      step={batteryLowMahParameter.definition?.step ?? 1}
                      value={editedValues[batteryLowMahParameter.id] ?? String(batteryLowMah ?? '')}
                      onChange={(event) =>
                        setEditedValues((existing) => ({
                          ...existing,
                          [batteryLowMahParameter.id]: event.target.value
                        }))
                      }
                    />
                  </label>
                ) : null}

                {batteryFailsafeParameter ? (
                  <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(batteryFailsafeParameter.id)?.status ?? 'unchanged'}`}>
                    <span>{batteryFailsafeParameter.definition?.label ?? batteryFailsafeParameter.id}</span>
                    <select
                      value={editedValues[batteryFailsafeParameter.id] ?? String(batteryFailsafe ?? '')}
                      onChange={(event) =>
                        setEditedValues((existing) => ({
                          ...existing,
                          [batteryFailsafeParameter.id]: event.target.value
                        }))
                      }
                    >
                      {(batteryFailsafeParameter.definition?.options ?? []).map((valueOption) => (
                        <option key={`${batteryFailsafeParameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
                          {valueOption.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {batteryCriticalVoltageParameter ? (
                  <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(batteryCriticalVoltageParameter.id)?.status ?? 'unchanged'}`}>
                    <span>{batteryCriticalVoltageParameter.definition?.label ?? batteryCriticalVoltageParameter.id}</span>
                    <input
                      type="number"
                      min={batteryCriticalVoltageParameter.definition?.minimum}
                      max={batteryCriticalVoltageParameter.definition?.maximum}
                      step={batteryCriticalVoltageParameter.definition?.step ?? 0.1}
                      value={editedValues[batteryCriticalVoltageParameter.id] ?? String(batteryCriticalVoltage ?? '')}
                      onChange={(event) =>
                        setEditedValues((existing) => ({
                          ...existing,
                          [batteryCriticalVoltageParameter.id]: event.target.value
                        }))
                      }
                    />
                  </label>
                ) : null}

                {batteryCriticalMahParameter ? (
                  <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(batteryCriticalMahParameter.id)?.status ?? 'unchanged'}`}>
                    <span>{batteryCriticalMahParameter.definition?.label ?? batteryCriticalMahParameter.id}</span>
                    <input
                      type="number"
                      min={batteryCriticalMahParameter.definition?.minimum}
                      max={batteryCriticalMahParameter.definition?.maximum}
                      step={batteryCriticalMahParameter.definition?.step ?? 1}
                      value={editedValues[batteryCriticalMahParameter.id] ?? String(batteryCriticalMah ?? '')}
                      onChange={(event) =>
                        setEditedValues((existing) => ({
                          ...existing,
                          [batteryCriticalMahParameter.id]: event.target.value
                        }))
                      }
                    />
                  </label>
                ) : null}

                {batteryCriticalFailsafeParameter ? (
                  <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(batteryCriticalFailsafeParameter.id)?.status ?? 'unchanged'}`}>
                    <span>{batteryCriticalFailsafeParameter.definition?.label ?? batteryCriticalFailsafeParameter.id}</span>
                    <select
                      value={editedValues[batteryCriticalFailsafeParameter.id] ?? String(batteryCriticalFailsafe ?? '')}
                      onChange={(event) =>
                        setEditedValues((existing) => ({
                          ...existing,
                          [batteryCriticalFailsafeParameter.id]: event.target.value
                        }))
                      }
                    >
                      {(batteryCriticalFailsafeParameter.definition?.options ?? []).map((valueOption) => (
                        <option key={`${batteryCriticalFailsafeParameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
                          {valueOption.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {throttleFailsafeParameter ? (
                  <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(throttleFailsafeParameter.id)?.status ?? 'unchanged'}`}>
                    <span>{throttleFailsafeParameter.definition?.label ?? throttleFailsafeParameter.id}</span>
                    <select
                      value={editedValues[throttleFailsafeParameter.id] ?? String(throttleFailsafe ?? '')}
                      onChange={(event) =>
                        setEditedValues((existing) => ({
                          ...existing,
                          [throttleFailsafeParameter.id]: event.target.value
                        }))
                      }
                    >
                      {(throttleFailsafeParameter.definition?.options ?? []).map((valueOption) => (
                        <option key={`${throttleFailsafeParameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
                          {valueOption.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {throttleFailsafeValueParameter ? (
                  <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(throttleFailsafeValueParameter.id)?.status ?? 'unchanged'}`}>
                    <span>{throttleFailsafeValueParameter.definition?.label ?? throttleFailsafeValueParameter.id}</span>
                    <input
                      type="number"
                      min={throttleFailsafeValueParameter.definition?.minimum}
                      max={throttleFailsafeValueParameter.definition?.maximum}
                      step={throttleFailsafeValueParameter.definition?.step ?? 1}
                      value={editedValues[throttleFailsafeValueParameter.id] ?? String(throttleFailsafeValue ?? '')}
                      onChange={(event) =>
                        setEditedValues((existing) => ({
                          ...existing,
                          [throttleFailsafeValueParameter.id]: event.target.value
                        }))
                      }
                    />
                  </label>
                ) : null}
              </div>

              <ul className="output-note-list">
                <li>Battery thresholds set to `0` deliberately disable that threshold path; do not leave them at zero accidentally.</li>
                <li>After changing battery monitor source, voltage source, or failsafe thresholds, verify live telemetry before first flight.</li>
                <li>After changing throttle failsafe settings, bench-check receiver-loss behavior again before flight.</li>
              </ul>

              {powerDraftEntries.length > 0 ? (
                <div className="scoped-draft-list">
                  {powerDraftEntries.map((draft) => (
                    <article key={draft.id} className={`scoped-draft-item scoped-draft-item--${draft.status}`}>
                      <div className="scoped-draft-item__header">
                        <strong>{draft.label}</strong>
                        <StatusBadge tone={toneForParameterDraftStatus(draft.status)}>{draft.status}</StatusBadge>
                      </div>
                      <p>{draft.id}</p>
                      <small>
                        {draft.status === 'staged'
                          ? `${formatParameterValue(draft.currentValue, draft.definition?.unit)} to ${formatParameterValue(
                              draft.nextValue,
                              draft.definition?.unit
                            )}`
                          : draft.reason ?? 'Draft matches the live controller value.'}
                      </small>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="success-copy">No power or failsafe changes are staged right now.</p>
              )}

              <div className="switch-exercise-controls">
                <button
                  style={buttonStyle('primary')}
                  onClick={() => void handleApplyScopedParameterDrafts(powerDraftEntries, 'power:apply', 'Power & failsafe')}
                  disabled={
                    busyAction !== undefined ||
                    powerStagedDrafts.length === 0 ||
                    powerInvalidDrafts.length > 0 ||
                    !canApplyDraftParameters
                  }
                >
                  {busyAction === 'power:apply' ? 'Applying…' : `Apply Power Changes (${powerStagedDrafts.length})`}
                </button>
                <button
                  style={buttonStyle()}
                  onClick={() => handleDiscardScopedParameterDrafts(powerDraftEntries.map((entry) => entry.id), 'power')}
                  disabled={busyAction !== undefined || powerDraftEntries.length === 0}
                >
                  Discard Power Changes
                </button>
              </div>
            </div>

            {renderAdditionalSettingsCard(
              'Additional power & failsafe settings',
              'These metadata-backed safety settings extend the Power view so advanced battery and RC-loss behavior can stay in-context.',
              powerAdditionalGroups,
              powerAdditionalDraftEntries,
              powerAdditionalStagedDrafts,
              powerAdditionalInvalidDrafts,
              'power:additional',
              'Apply Additional Power Changes',
              'additional power settings'
            )}

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
          subtitle="Review frame geometry, output assignments, and key motor/peripheral settings before any output testing."
        >
        <div className="telemetry-stack telemetry-stack--outputs">
          <div className="outputs-workspace">
            <div className="outputs-workspace__main">
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

            <AttitudePreview
              snapshot={snapshot}
              compact
              frameClassLabel={airframe.frameClassLabel}
              frameTypeLabel={airframe.frameTypeLabel}
            />

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

            </div>
            <div className="outputs-workspace__sidebar">

          {outputAssignmentParameters.length > 0 ? (
            <div className="scoped-review-card scoped-review-card--compact">
              <div className="switch-exercise-card__header">
                <div>
                  <strong>Output assignments</strong>
                  <p>Remap motor and peripheral functions directly from Outputs, then rerun output verification before flight.</p>
                </div>
                <StatusBadge tone={toneForScopedDraftReview(outputAssignmentStagedDrafts.length, outputAssignmentInvalidDrafts.length)}>
                  {outputAssignmentInvalidDrafts.length > 0
                    ? `${outputAssignmentInvalidDrafts.length} invalid`
                    : outputAssignmentStagedDrafts.length > 0
                      ? `${outputAssignmentStagedDrafts.length} staged`
                      : 'in sync'}
                </StatusBadge>
              </div>

              <div className="scoped-review-card__disclosure">
                <small>
                  {showAllOutputAssignments
                    ? `Showing all ${outputAssignmentParameters.length} SERVO function slots.`
                    : `Showing ${visibleOutputAssignmentParameters.length} likely-relevant outputs first${hiddenOutputAssignmentCount > 0 ? `, with ${hiddenOutputAssignmentCount} additional slot${hiddenOutputAssignmentCount === 1 ? '' : 's'} hidden.` : '.'}`}
                </small>
                {outputAssignmentParameters.length > visibleOutputAssignmentParameters.length || showAllOutputAssignments ? (
                  <button
                    style={buttonStyle()}
                    onClick={() => setShowAllOutputAssignments((current) => !current)}
                    disabled={busyAction !== undefined}
                  >
                    {showAllOutputAssignments ? 'Show Focused Outputs' : `Show All ${outputAssignmentParameters.length} Outputs`}
                  </button>
                ) : null}
              </div>

              <div className="scoped-editor-grid">
                {visibleOutputAssignmentParameters.map((parameter) => {
                  const draft = parameterDraftById.get(parameter.id)
                  const outputChannel = parseServoOutputChannelNumber(parameter.id)
                  const mappedOutput = configuredOutputs.find((output) => output.channelNumber === outputChannel)

                  return (
                    <label key={parameter.id} className={`scoped-editor-field scoped-editor-field--${draft?.status ?? 'unchanged'}`}>
                      <span>{parameter.definition?.label ?? parameter.id}</span>
                      <select
                        value={editedValues[parameter.id] ?? String(parameter.value)}
                        onChange={(event) =>
                          setEditedValues((existing) => ({
                            ...existing,
                            [parameter.id]: event.target.value
                          }))
                        }
                      >
                        {(parameter.definition?.options ?? []).map((valueOption) => (
                          <option key={`${parameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
                            {valueOption.label} ({valueOption.value})
                          </option>
                        ))}
                      </select>
                      <small>
                        {draft?.status === 'staged'
                          ? `Staged ${formatParameterDisplayValue(parameter, draft.nextValue)}`
                          : draft?.reason ??
                            (mappedOutput
                              ? `Current ${mappedOutput.functionLabel} on OUT${mappedOutput.channelNumber}`
                              : `Current ${formatParameterDisplayValue(parameter, parameter.value)}`)}
                      </small>
                    </label>
                  )
                })}
              </div>

              <ul className="output-note-list">
                <li>Changing SERVOx function assignments can move motors, LEDs, or accessories to a different output pin immediately after apply/reboot.</li>
                <li>After remapping outputs, keep props off and repeat the motor/peripheral verification steps from this view.</li>
              </ul>

              <div className="switch-exercise-controls">
                <button
                  style={buttonStyle('primary')}
                  onClick={() =>
                    void handleApplyScopedParameterDrafts(outputAssignmentDraftEntries, 'outputs:assignments', 'Output assignments')
                  }
                  disabled={
                    busyAction !== undefined ||
                    outputAssignmentStagedDrafts.length === 0 ||
                    outputAssignmentInvalidDrafts.length > 0 ||
                    !canApplyDraftParameters
                  }
                >
                  {busyAction === 'outputs:assignments' ? 'Applying…' : `Apply Output Assignments (${outputAssignmentStagedDrafts.length})`}
                </button>
                <button
                  style={buttonStyle()}
                  onClick={() =>
                    handleDiscardScopedParameterDrafts(outputAssignmentDraftEntries.map((entry) => entry.id), 'output assignments')
                  }
                  disabled={busyAction !== undefined || outputAssignmentDraftEntries.length === 0}
                >
                  Discard Output Assignments
                </button>
              </div>
            </div>
          ) : null}

          {notificationLedTypesParameter || notificationLedLengthParameter || notificationLedBrightnessParameter || notificationLedOverrideParameter || notificationBuzzTypesParameter || notificationBuzzVolumeParameter ? (
            <div className="scoped-review-card scoped-review-card--compact">
              <div className="switch-exercise-card__header">
                <div>
                  <strong>LED & buzzer notifications</strong>
                  <p>Keep common FPV notification hardware setup local to Outputs instead of dropping into raw parameters.</p>
                </div>
                <StatusBadge tone={toneForScopedDraftReview(outputNotificationStagedDrafts.length, outputNotificationInvalidDrafts.length)}>
                  {outputNotificationInvalidDrafts.length > 0
                    ? `${outputNotificationInvalidDrafts.length} invalid`
                    : outputNotificationStagedDrafts.length > 0
                      ? `${outputNotificationStagedDrafts.length} staged`
                      : 'in sync'}
                </StatusBadge>
              </div>

              <div className="config-pills">
                {notificationLedTypesParameter ? <span>LED drivers: {describeBitmaskSelections(notificationLedTypes, ARDUCOPTER_NOTIFICATION_LED_TYPE_BIT_LABELS, 'Disabled')}</span> : null}
                {notificationLedBrightnessParameter ? <span>Brightness: {formatArducopterNotificationLedBrightness(notificationLedBrightness)}</span> : null}
                {notificationLedLengthParameter ? <span>LED length: {notificationLedLength ?? 'Unknown'}</span> : null}
                {notificationLedOverrideParameter ? <span>LED source: {formatArducopterNotificationLedOverride(notificationLedOverride)}</span> : null}
                {notificationBuzzTypesParameter ? <span>Buzzer drivers: {describeBitmaskSelections(notificationBuzzTypes, ARDUCOPTER_NOTIFICATION_BUZZER_TYPE_BIT_LABELS, 'Disabled')}</span> : null}
                {notificationBuzzVolumeParameter ? <span>Buzzer volume: {notificationBuzzVolume !== undefined ? `${notificationBuzzVolume}%` : 'Unknown'}</span> : null}
                {notificationLedOutputs.length > 0
                  ? notificationLedOutputs.map((output) => <span key={`notification-output:${output.channelNumber}`}>OUT{output.channelNumber}: {output.functionLabel}</span>)
                  : <span>No NeoPixel output assignment detected yet</span>}
              </div>

              <div className="scoped-editor-grid">
                {notificationLedTypesParameter ? (
                  <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(notificationLedTypesParameter.id)?.status ?? 'unchanged'}`}>
                    <span>{notificationLedTypesParameter.definition?.label ?? notificationLedTypesParameter.id}</span>
                    <div className="scoped-checkbox-list">
                      {Object.entries(ARDUCOPTER_NOTIFICATION_LED_TYPE_BIT_LABELS).map(([bit, label]) => {
                        const numericBit = Number(bit)
                        return (
                          <label key={`${notificationLedTypesParameter.id}:${bit}`} className="scoped-checkbox-option">
                            <input
                              type="checkbox"
                              checked={hasBitmaskFlag(editedNotificationLedTypes, numericBit)}
                              onChange={(event) =>
                                setEditedValues((existing) => {
                                  const currentValue = normalizeBitmaskValue(existing[notificationLedTypesParameter.id], notificationLedTypes)
                                  const nextValue = event.target.checked
                                    ? currentValue | (1 << numericBit)
                                    : currentValue & ~(1 << numericBit)

                                  return {
                                    ...existing,
                                    [notificationLedTypesParameter.id]: String(nextValue)
                                  }
                                })
                              }
                            />
                            <span>{label}</span>
                          </label>
                        )
                      })}
                    </div>
                    <small>
                      {parameterDraftById.get(notificationLedTypesParameter.id)?.status === 'staged'
                        ? `Staged ${describeBitmaskSelections(parameterDraftById.get(notificationLedTypesParameter.id)?.nextValue, ARDUCOPTER_NOTIFICATION_LED_TYPE_BIT_LABELS, 'Disabled')}`
                        : parameterDraftById.get(notificationLedTypesParameter.id)?.reason ??
                          `Current ${describeBitmaskSelections(notificationLedTypes, ARDUCOPTER_NOTIFICATION_LED_TYPE_BIT_LABELS, 'Disabled')}`}
                    </small>
                  </label>
                ) : null}

                {notificationLedBrightnessParameter ? (
                  <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(notificationLedBrightnessParameter.id)?.status ?? 'unchanged'}`}>
                    <span>{notificationLedBrightnessParameter.definition?.label ?? notificationLedBrightnessParameter.id}</span>
                    <select
                      value={editedValues[notificationLedBrightnessParameter.id] ?? String(notificationLedBrightness ?? '')}
                      onChange={(event) =>
                        setEditedValues((existing) => ({
                          ...existing,
                          [notificationLedBrightnessParameter.id]: event.target.value
                        }))
                      }
                    >
                      {(notificationLedBrightnessParameter.definition?.options ?? []).map((valueOption) => (
                        <option key={`${notificationLedBrightnessParameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
                          {valueOption.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {notificationLedLengthParameter ? (
                  <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(notificationLedLengthParameter.id)?.status ?? 'unchanged'}`}>
                    <span>{notificationLedLengthParameter.definition?.label ?? notificationLedLengthParameter.id}</span>
                    <input
                      type="number"
                      min={notificationLedLengthParameter.definition?.minimum}
                      max={notificationLedLengthParameter.definition?.maximum}
                      step={notificationLedLengthParameter.definition?.step ?? 1}
                      value={editedValues[notificationLedLengthParameter.id] ?? String(notificationLedLength ?? '')}
                      onChange={(event) =>
                        setEditedValues((existing) => ({
                          ...existing,
                          [notificationLedLengthParameter.id]: event.target.value
                        }))
                      }
                    />
                  </label>
                ) : null}

                {notificationLedOverrideParameter ? (
                  <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(notificationLedOverrideParameter.id)?.status ?? 'unchanged'}`}>
                    <span>{notificationLedOverrideParameter.definition?.label ?? notificationLedOverrideParameter.id}</span>
                    <select
                      value={editedValues[notificationLedOverrideParameter.id] ?? String(notificationLedOverride ?? '')}
                      onChange={(event) =>
                        setEditedValues((existing) => ({
                          ...existing,
                          [notificationLedOverrideParameter.id]: event.target.value
                        }))
                      }
                    >
                      {(notificationLedOverrideParameter.definition?.options ?? []).map((valueOption) => (
                        <option key={`${notificationLedOverrideParameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
                          {valueOption.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {notificationBuzzTypesParameter ? (
                  <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(notificationBuzzTypesParameter.id)?.status ?? 'unchanged'}`}>
                    <span>{notificationBuzzTypesParameter.definition?.label ?? notificationBuzzTypesParameter.id}</span>
                    <div className="scoped-checkbox-list">
                      {Object.entries(ARDUCOPTER_NOTIFICATION_BUZZER_TYPE_BIT_LABELS).map(([bit, label]) => {
                        const numericBit = Number(bit)
                        return (
                          <label key={`${notificationBuzzTypesParameter.id}:${bit}`} className="scoped-checkbox-option">
                            <input
                              type="checkbox"
                              checked={hasBitmaskFlag(editedNotificationBuzzTypes, numericBit)}
                              onChange={(event) =>
                                setEditedValues((existing) => {
                                  const currentValue = normalizeBitmaskValue(existing[notificationBuzzTypesParameter.id], notificationBuzzTypes)
                                  const nextValue = event.target.checked
                                    ? currentValue | (1 << numericBit)
                                    : currentValue & ~(1 << numericBit)

                                  return {
                                    ...existing,
                                    [notificationBuzzTypesParameter.id]: String(nextValue)
                                  }
                                })
                              }
                            />
                            <span>{label}</span>
                          </label>
                        )
                      })}
                    </div>
                    <small>
                      {parameterDraftById.get(notificationBuzzTypesParameter.id)?.status === 'staged'
                        ? `Staged ${describeBitmaskSelections(parameterDraftById.get(notificationBuzzTypesParameter.id)?.nextValue, ARDUCOPTER_NOTIFICATION_BUZZER_TYPE_BIT_LABELS, 'Disabled')}`
                        : parameterDraftById.get(notificationBuzzTypesParameter.id)?.reason ??
                          `Current ${describeBitmaskSelections(notificationBuzzTypes, ARDUCOPTER_NOTIFICATION_BUZZER_TYPE_BIT_LABELS, 'Disabled')}`}
                    </small>
                  </label>
                ) : null}

                {notificationBuzzVolumeParameter ? (
                  <label className={`scoped-editor-field scoped-editor-field--${parameterDraftById.get(notificationBuzzVolumeParameter.id)?.status ?? 'unchanged'}`}>
                    <span>{notificationBuzzVolumeParameter.definition?.label ?? notificationBuzzVolumeParameter.id}</span>
                    <input
                      type="number"
                      min={notificationBuzzVolumeParameter.definition?.minimum}
                      max={notificationBuzzVolumeParameter.definition?.maximum}
                      step={notificationBuzzVolumeParameter.definition?.step ?? 1}
                      value={editedValues[notificationBuzzVolumeParameter.id] ?? String(notificationBuzzVolume ?? '')}
                      onChange={(event) =>
                        setEditedValues((existing) => ({
                          ...existing,
                          [notificationBuzzVolumeParameter.id]: event.target.value
                        }))
                      }
                    />
                  </label>
                ) : null}
              </div>

              <ul className="output-note-list">
                <li>Assign a NeoPixel output in the Output assignments card before expecting external LED strips to respond.</li>
                <li>After notification-driver changes, bench-check the LEDs and buzzer with props off before flight.</li>
              </ul>

              <div className="switch-exercise-controls">
                <button
                  style={buttonStyle('primary')}
                  onClick={() =>
                    void handleApplyScopedParameterDrafts(outputNotificationDraftEntries, 'outputs:notifications', 'Notification outputs')
                  }
                  disabled={
                    busyAction !== undefined ||
                    outputNotificationStagedDrafts.length === 0 ||
                    outputNotificationInvalidDrafts.length > 0 ||
                    !canApplyDraftParameters
                  }
                >
                  {busyAction === 'outputs:notifications' ? 'Applying…' : `Apply Notification Changes (${outputNotificationStagedDrafts.length})`}
                </button>
                <button
                  style={buttonStyle()}
                  onClick={() =>
                    handleDiscardScopedParameterDrafts(outputNotificationDraftEntries.map((entry) => entry.id), 'notification outputs')
                  }
                  disabled={busyAction !== undefined || outputNotificationDraftEntries.length === 0}
                >
                  Discard Notification Changes
                </button>
              </div>
            </div>
          ) : null}

          {renderAdditionalSettingsCard(
            'Additional output settings',
            'These metadata-backed output and airframe settings extend Outputs without forcing routine configuration back into raw Parameters.',
            outputAdditionalGroups,
            outputAdditionalDraftEntries,
            outputAdditionalStagedDrafts,
            outputAdditionalInvalidDrafts,
            'outputs:additional',
            'Apply Additional Output Changes',
            'additional output settings'
          )}
            </div>
          </div>

          <div className="outputs-lab-grid">
          <MotorTestSliders
            motorCount={outputMapping.motorOutputs.length || 4}
            selectedOutput={motorTestOutput}
            throttlePercent={motorTestThrottlePercent}
            onSelectOutput={(output) => setMotorTestOutput(output)}
            onThrottleChange={(percent) => setMotorTestThrottlePercent(percent)}
            onTest={() => void handleRunMotorTest()}
            testDisabled={busyAction !== undefined || !motorTestEligibility.allowed || motorTestOutput === undefined}
            masterEnabled={false}
            testId="motor-test-sliders"
          />

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

	            <div className="scoped-review-card scoped-review-card--compact">
	              <div className="switch-exercise-card__header">
	                <div>
	                  <strong>ESC & output settings</strong>
	                  <p>Adjust the key motor protocol and spin-threshold values directly from Outputs.</p>
	                </div>
	                <StatusBadge tone={toneForScopedDraftReview(outputReviewStagedDrafts.length, outputReviewInvalidDrafts.length)}>
	                  {outputReviewInvalidDrafts.length > 0
	                    ? `${outputReviewInvalidDrafts.length} invalid`
	                    : outputReviewStagedDrafts.length > 0
	                      ? `${outputReviewStagedDrafts.length} staged`
	                      : 'in sync'}
	                </StatusBadge>
	              </div>

	              <div className="scoped-editor-grid">
	                {outputReviewParameters.map((parameter) => {
	                  const draft = parameterDraftById.get(parameter.id)
	                  const option = draft?.nextValue !== undefined
	                    ? findParameterOption(parameter.definition, draft.nextValue)
	                    : findParameterOption(parameter.definition, parameter.value)
	                  const inputValue = editedValues[parameter.id] ?? String(parameter.value)

	                  return (
	                    <label key={parameter.id} className={`scoped-editor-field scoped-editor-field--${draft?.status ?? 'unchanged'}`}>
	                      <span>{parameter.definition?.label ?? parameter.id}</span>
	                      {parameter.definition?.options && parameter.definition.options.length > 0 ? (
	                        <select
	                          value={inputValue}
	                          onChange={(event) =>
	                            setEditedValues((existing) => ({
	                              ...existing,
	                              [parameter.id]: event.target.value
	                            }))
	                          }
	                        >
	                          {parameter.definition.options.map((valueOption) => (
	                            <option key={`${parameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
	                              {valueOption.label} ({valueOption.value})
	                            </option>
	                          ))}
	                        </select>
	                      ) : (
	                        <input
	                          type="number"
	                          step={parameter.definition?.step ?? 0.01}
	                          min={parameter.definition?.minimum}
	                          max={parameter.definition?.maximum}
	                          value={inputValue}
	                          onChange={(event) =>
	                            setEditedValues((existing) => ({
	                              ...existing,
	                              [parameter.id]: event.target.value
	                            }))
	                          }
	                        />
	                      )}
	                      <small>
	                        {draft?.status === 'staged'
	                          ? `Staged ${formatParameterDisplayValue(parameter, draft.nextValue)}`
	                          : draft?.reason ??
	                            `Current ${formatParameterDisplayValue(parameter, parameter.value)}${
	                              option?.label && !draft ? ` · ${option.label}` : ''
	                            }`}
	                      </small>
	                    </label>
	                  )
	                })}
	              </div>

	              <div className="switch-exercise-controls">
	                <button
	                  style={buttonStyle('primary')}
	                  onClick={() =>
	                    void handleApplyScopedParameterDrafts(outputReviewDraftEntries, 'outputs:apply', 'Outputs')
	                  }
	                  disabled={
	                    busyAction !== undefined ||
	                    outputReviewStagedDrafts.length === 0 ||
	                    outputReviewInvalidDrafts.length > 0 ||
	                    !canApplyDraftParameters
	                  }
	                >
	                  {busyAction === 'outputs:apply' ? 'Applying…' : `Apply Output Changes (${outputReviewStagedDrafts.length})`}
	                </button>
	                <button
	                  style={buttonStyle()}
	                  onClick={() =>
	                    handleDiscardScopedParameterDrafts(outputReviewDraftEntries.map((entry) => entry.id), 'output')
	                  }
	                  disabled={busyAction !== undefined || outputReviewDraftEntries.length === 0}
	                >
	                  Discard Output Changes
	                </button>
	              </div>
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

      {activeViewId === 'snapshots' ? (
      <section className="grid one-up">
        <Panel
          title="Snapshots"
          subtitle="Capture, compare, and restore known-good parameter sets with the same verified write path used by the rest of the configurator."
        >
          <div className="telemetry-stack">
            <input
              ref={snapshotImportInputRef}
              className="parameter-backup-input"
              type="file"
              accept="application/json,.json"
              onChange={(event) => void handleImportSnapshotFile(event)}
            />

            <div className="telemetry-header">
              <div>
                <h3>Local snapshot library</h3>
                <p>
                  Capture the current live configuration, keep named browser-local snapshots, compare them against the synced controller, and restore
                  only the differing parameters when you need to roll back to a known-good baseline.
                </p>
              </div>
              <StatusBadge tone={toneForScopedDraftReview(selectedSnapshotChangedEntries.length, selectedSnapshotInvalidEntries.length)}>
                {selectedSnapshotInvalidEntries.length > 0
                  ? `${selectedSnapshotInvalidEntries.length} invalid`
                  : selectedSnapshotChangedEntries.length > 0
                    ? `${selectedSnapshotChangedEntries.length} diff`
                    : `${savedSnapshots.length} saved`}
              </StatusBadge>
            </div>

            <p className="telemetry-note">
              The selected snapshot below becomes the active baseline for the whole app. The sidebar reflects the same baseline, drift count, and
              restore state across every product view.
            </p>

            <div className="snapshot-capture-row">
              <label className="scoped-editor-field">
                <span>Snapshot label</span>
                <input
                  data-testid="snapshot-label-input"
                  type="text"
                  value={snapshotLabelInput}
                  onChange={(event) => setSnapshotLabelInput(event.target.value)}
                  placeholder="Optional label, e.g. MOZ7 known-good baseline"
                />
                <small>Leave this blank to generate a timestamped label from the connected vehicle identity.</small>
              </label>

              <label className="scoped-editor-field">
                <span>Tags</span>
                <input
                  data-testid="snapshot-tags-input"
                  type="text"
                  value={snapshotTagsInput}
                  onChange={(event) => setSnapshotTagsInput(event.target.value)}
                  placeholder="moz7, baseline, tune"
                />
                <small>Optional comma-separated tags to make later library review easier.</small>
              </label>

              <label className="scoped-editor-field">
                <span>Note</span>
                <textarea
                  data-testid="snapshot-note-input"
                  value={snapshotNoteInput}
                  onChange={(event) => setSnapshotNoteInput(event.target.value)}
                  placeholder="Optional context for when and why this snapshot was captured."
                  rows={3}
                />
                <small>Notes travel with exported snapshot-library files.</small>
              </label>

              <div className="snapshot-capture-actions">
                <label className="snapshot-protected-toggle">
                  <input
                    data-testid="snapshot-protected-toggle"
                    type="checkbox"
                    checked={snapshotProtectedInput}
                    onChange={(event) => setSnapshotProtectedInput(event.target.checked)}
                  />
                  <span>Mark as protected baseline</span>
                </label>
                <button
                  data-testid="capture-live-snapshot-button"
                  style={buttonStyle('primary')}
                  onClick={handleCaptureLiveSnapshot}
                  disabled={busyAction !== undefined || snapshot.parameters.length === 0}
                >
                  Capture Live Snapshot
                </button>
                <button data-testid="import-snapshot-file-button" style={buttonStyle()} onClick={handleOpenSnapshotImport} disabled={busyAction !== undefined}>
                  Import Snapshot or Library
                </button>
                <button
                  data-testid="export-snapshot-library-button"
                  style={buttonStyle()}
                  onClick={handleExportSnapshotLibrary}
                  disabled={busyAction !== undefined || savedSnapshots.length === 0}
                >
                  Export Library
                </button>
              </div>
            </div>

            <p className="telemetry-note">
              Browser snapshots stay local by default, but `Export Library` writes a portable snapshot-library file that the desktop CLI and later web
              sessions can import directly.
            </p>

            {desktopBridge ? (
              <div className="desktop-snapshot-workspace">
                <div className="telemetry-header">
                  <div>
                    <h3>Desktop snapshot files</h3>
                    <p>
                      The Electron shell can open and save snapshot libraries through native file dialogs while keeping compare and restore in this same
                      browser-first workflow.
                    </p>
                  </div>
                  <StatusBadge tone={desktopSnapshotLibraryPath ? 'success' : 'neutral'}>
                    {desktopSnapshotLibraryPath ? 'linked library' : 'local only'}
                  </StatusBadge>
                </div>

                {desktopSnapshotLibraryPath ? (
                  <div className="config-pills">
                    <span>{desktopSnapshotLibraryName ?? 'Desktop snapshot library'}</span>
                    <span>{desktopSnapshotLibraryPath}</span>
                  </div>
                ) : (
                  <p className="telemetry-note">
                    No desktop library file is linked yet. Open one from disk to keep this browser library tied to a named desktop file.
                  </p>
                )}

                <div className="button-row">
                  <button
                    data-testid="desktop-open-snapshot-file-button"
                    style={buttonStyle()}
                    onClick={() => void handleOpenDesktopSnapshotFile()}
                    disabled={busyAction !== undefined}
                  >
                    Open from Desktop…
                  </button>
                  <button
                    data-testid="desktop-save-snapshot-library-button"
                    style={buttonStyle()}
                    onClick={() => void handleSaveDesktopSnapshotLibrary()}
                    disabled={busyAction !== undefined || savedSnapshots.length === 0}
                  >
                    {desktopSnapshotLibraryPath ? 'Save Library' : 'Save Library to Desktop…'}
                  </button>
                  <button
                    data-testid="desktop-export-selected-snapshot-button"
                    style={buttonStyle()}
                    onClick={() => void handleExportSelectedSnapshotToDesktop()}
                    disabled={busyAction !== undefined || !selectedSnapshot}
                  >
                    Export Selected to Desktop…
                  </button>
                </div>
              </div>
            ) : null}

            {snapshotStorageNotice ? (
              <div className="parameter-review__notice">
                <StatusBadge tone={snapshotStorageNotice.tone}>{snapshotStorageNotice.tone}</StatusBadge>
                <p>{snapshotStorageNotice.text}</p>
              </div>
            ) : null}

            {snapshotNotice ? (
              <div className="parameter-review__notice">
                <StatusBadge tone={snapshotNotice.tone}>{snapshotNotice.tone}</StatusBadge>
                <p>{snapshotNotice.text}</p>
              </div>
            ) : null}

            {parameterFollowUp ? (
              <div className="parameter-follow-up">
                <StatusBadge tone={parameterFollowUp.requiresReboot ? 'warning' : 'neutral'}>
                  {parameterFollowUp.requiresReboot ? 'reboot' : 'refresh'}
                </StatusBadge>
                <p>{parameterFollowUp.text}</p>
                <small>Use the sidebar session controls to complete the pending reboot or refresh after a restore.</small>
              </div>
            ) : null}

            <div className="telemetry-metric-grid">
              <article className="telemetry-metric-card">
                <span>Saved snapshots</span>
                <strong>{savedSnapshots.length}</strong>
              </article>
              <article className="telemetry-metric-card">
                <span>Snapshot params</span>
                <strong>{selectedSnapshot?.backup.parameterCount ?? 0}</strong>
              </article>
              <article className="telemetry-metric-card">
                <span>Changed vs live</span>
                <strong>{selectedSnapshotRestore?.changedCount ?? 0}</strong>
              </article>
              <article className="telemetry-metric-card">
                <span>Reboot-sensitive</span>
                <strong>{selectedSnapshotChangedEntries.filter((entry) => entry.definition?.rebootRequired).length}</strong>
              </article>
            </div>

            {savedSnapshots.length > 0 ? (
              <div className="snapshot-library-grid">
                {savedSnapshots.map((savedSnapshot) => {
                  const isActive = savedSnapshot.id === selectedSnapshot?.id
                  const restorePreview =
                    (savedSnapshot.id === selectedSnapshot?.id ? selectedSnapshotRestore : deriveDraftValuesFromParameterBackup(snapshot.parameters, savedSnapshot.backup)) ?? {
                      draftValues: {},
                      matchedCount: 0,
                      changedCount: 0,
                      unchangedCount: 0,
                      unknownParameterIds: []
                    }

                  return (
                    <button
                      key={savedSnapshot.id}
                      type="button"
                      data-testid={`snapshot-card-${savedSnapshot.id}`}
                      className={`snapshot-card${isActive ? ' is-active' : ''}`}
                      onClick={() => setSelectedSnapshotId(savedSnapshot.id)}
                    >
                      <div className="snapshot-card__header">
                        <div>
                          <strong>{savedSnapshot.label}</strong>
                          <small>{formatSnapshotTimestamp(savedSnapshot.capturedAt)}</small>
                        </div>
                        <StatusBadge tone={restorePreview.changedCount > 0 ? 'warning' : 'neutral'}>
                          {restorePreview.changedCount > 0 ? `${restorePreview.changedCount} diff` : 'matches'}
                        </StatusBadge>
                      </div>

                      <div className="config-pills">
                        <span>{savedSnapshot.source === 'captured' ? 'captured here' : 'imported'}</span>
                        <span>{savedSnapshot.backup.parameterCount} params</span>
                        <span>{savedSnapshot.backup.vehicle?.vehicle ?? savedSnapshot.backup.firmware}</span>
                        {savedSnapshot.protected ? <span className="is-target">protected</span> : null}
                        {savedSnapshot.tags.slice(0, 3).map((tag) => (
                          <span key={`${savedSnapshot.id}:${tag}`}>#{tag}</span>
                        ))}
                      </div>

                      <p>
                        {savedSnapshot.backup.vehicle
                          ? `${savedSnapshot.backup.vehicle.flightMode} at export from sys ${savedSnapshot.backup.vehicle.systemId} / comp ${savedSnapshot.backup.vehicle.componentId}.`
                          : 'Vehicle identity was not embedded in this imported backup file.'}
                      </p>
                      {savedSnapshot.note ? <small className="snapshot-card__note">{savedSnapshot.note}</small> : null}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="telemetry-note">
                No saved snapshots yet. Capture the live controller or import a previously exported backup to build a restore library.
              </p>
            )}

            {selectedSnapshot ? (
              <div className="snapshot-selected">
                <div className="telemetry-header">
                  <div>
                    <h3>{selectedSnapshot.label}</h3>
                    <p>
                      {selectedSnapshot.source === 'captured'
                        ? 'Captured from the current browser session.'
                        : 'Imported into the local browser snapshot library.'}
                    </p>
                  </div>
                  <StatusBadge tone={selectedSnapshotChangedEntries.length > 0 ? 'warning' : 'success'}>
                    {selectedSnapshotChangedEntries.length > 0 ? 'restore available' : 'already matched'}
                  </StatusBadge>
                </div>

                <div className="telemetry-metric-grid">
                  <article className="telemetry-metric-card">
                    <span>Captured</span>
                    <strong>{formatSnapshotTimestamp(selectedSnapshot.capturedAt)}</strong>
                  </article>
                  <article className="telemetry-metric-card">
                    <span>Matched live</span>
                    <strong>{selectedSnapshotRestore?.unchangedCount ?? 0}</strong>
                  </article>
                  <article className="telemetry-metric-card">
                    <span>Unknown on live</span>
                    <strong>{selectedSnapshotRestore?.unknownParameterIds.length ?? 0}</strong>
                  </article>
                  <article className="telemetry-metric-card">
                    <span>Restore writes</span>
                    <strong>{selectedSnapshotChangedEntries.length}</strong>
                  </article>
                </div>

                <div className="config-pills">
                  <span>{selectedSnapshot.backup.vehicle?.vehicle ?? selectedSnapshot.backup.firmware}</span>
                  <span>{selectedSnapshot.backup.vehicle?.firmware ?? 'Unknown firmware'}</span>
                  <span>{selectedSnapshot.backup.vehicle?.flightMode ?? 'Mode unknown at export'}</span>
                  <span>{selectedSnapshot.backup.parameterCount} parameters</span>
                  {selectedSnapshot.protected ? <span className="is-target">protected baseline</span> : null}
                  {selectedSnapshot.tags.map((tag) => (
                    <span key={`${selectedSnapshot.id}:detail:${tag}`}>#{tag}</span>
                  ))}
                </div>

                {selectedSnapshot.note ? <p className="snapshot-selected__note">{selectedSnapshot.note}</p> : null}

                {selectedSnapshotRestore && selectedSnapshotRestore.unknownParameterIds.length > 0 ? (
                  <div className="parameter-follow-up parameter-follow-up--warning">
                    <StatusBadge tone="warning">partial</StatusBadge>
                    <p>
                      {selectedSnapshotRestore.unknownParameterIds.length} snapshot parameter(s) do not exist in the current live metadata set and will
                      be ignored during restore.
                    </p>
                  </div>
                ) : null}

                {selectedSnapshotChangedEntries.length > 0 ? (
                  <div className="parameter-diff-grid">
                    {selectedSnapshotDiffGroups.map((group) => (
                      <section key={group.category} className="parameter-diff-group">
                        <header>
                          <strong>{formatCategoryLabel(group.category)}</strong>
                          <span>{group.entries.length} changed</span>
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
                ) : (
                  <p className="telemetry-note">
                    This snapshot already matches the currently synced controller values. Capture another live snapshot or choose another library entry to
                    compare.
                  </p>
                )}

                {selectedSnapshotInvalidEntries.length > 0 ? (
                  <div className="parameter-diff-grid parameter-diff-grid--invalid">
                    <section className="parameter-diff-group parameter-diff-group--invalid">
                      <header>
                        <strong>Invalid restore values</strong>
                        <span>{selectedSnapshotInvalidEntries.length} blocked</span>
                      </header>

                      {selectedSnapshotInvalidEntries.map((draft) => (
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
                  </div>
                ) : null}

                <div className="parameter-follow-up parameter-follow-up--warning">
                  <StatusBadge tone="warning">overwrite</StatusBadge>
                  <p>
                    Snapshot restore writes only the diff against the current live controller, verifies readback, and rolls back earlier writes if a later
                    write fails. It still overwrites the current live values for every changed parameter listed above.
                  </p>
                </div>

                <label className="snapshot-restore-ack">
                  <input
                    data-testid="snapshot-restore-ack"
                    type="checkbox"
                    checked={snapshotRestoreAcknowledged}
                    onChange={(event) => setSnapshotRestoreAcknowledged(event.target.checked)}
                    disabled={busyAction !== undefined || selectedSnapshotChangedEntries.length === 0}
                  />
                  <span>I understand that applying this restore will overwrite the current live values shown in the diff above.</span>
                </label>

                <div className="switch-exercise-controls">
                  <button
                    data-testid="apply-snapshot-restore-button"
                    style={buttonStyle('primary')}
                    onClick={() => void handleApplySelectedSnapshotRestore()}
                    disabled={
                      busyAction !== undefined ||
                      selectedSnapshotChangedEntries.length === 0 ||
                      selectedSnapshotInvalidEntries.length > 0 ||
                      !snapshotRestoreAcknowledged ||
                      !canApplyDraftParameters
                    }
                  >
                    {busyAction === 'snapshots:apply' ? 'Applying…' : `Apply Snapshot Restore (${selectedSnapshotChangedEntries.length})`}
                  </button>
                  {isExpertMode ? (
                    <button
                      style={buttonStyle()}
                      onClick={handleStageSelectedSnapshotDiff}
                      disabled={busyAction !== undefined || selectedSnapshotChangedEntries.length === 0}
                    >
                      Send Diff to Parameters
                    </button>
                  ) : null}
                  <button style={buttonStyle()} onClick={handleExportSelectedSnapshot} disabled={busyAction !== undefined}>
                    Export Selected
                  </button>
                  <button
                    data-testid="toggle-selected-snapshot-protection-button"
                    style={buttonStyle()}
                    onClick={handleToggleSelectedSnapshotProtection}
                    disabled={busyAction !== undefined}
                  >
                    {selectedSnapshot.protected ? 'Unprotect Selected' : 'Protect Selected'}
                  </button>
                  <button
                    data-testid="delete-selected-snapshot-button"
                    style={buttonStyle()}
                    onClick={handleDeleteSelectedSnapshot}
                    disabled={busyAction !== undefined || selectedSnapshot.protected}
                  >
                    Delete Selected
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </Panel>
      </section>
      ) : null}

      {activeViewId === 'tuning' ? (
      <section className="grid one-up">
        <Panel
          title="Tuning"
          subtitle="Keep the first tuning pass small and reliable: adjust flight feel and acro rates here, then use Expert mode only when you need deeper controller work."
        >
          <div className="telemetry-stack">
            <div className="telemetry-header">
              <div>
                <h3>Simple tuning baseline</h3>
                <p>
                  This surface intentionally stays narrow so setup and configuration remain the center of the product. Start with these grouped
                  controls, save small changes, and fly-test before opening broader expert tuning.
                </p>
              </div>
              <StatusBadge tone={toneForScopedDraftReview(tuningStagedDrafts.length, tuningInvalidDrafts.length)}>
                {tuningInvalidDrafts.length > 0
                  ? `${tuningInvalidDrafts.length} invalid`
                  : tuningStagedDrafts.length > 0
                    ? `${tuningStagedDrafts.length} staged`
                    : 'in sync'}
              </StatusBadge>
            </div>

            {parameterNotice ? (
              <div className="parameter-review__notice">
                <StatusBadge tone={parameterNotice.tone}>{parameterNotice.tone}</StatusBadge>
                <p>{parameterNotice.text}</p>
              </div>
            ) : null}

            <div className="telemetry-metric-grid">
              <article className="telemetry-metric-card">
                <span>Live mode</span>
                <strong>{snapshot.vehicle?.flightMode ?? 'Unknown'}</strong>
              </article>
              <article className="telemetry-metric-card">
                <span>RC link</span>
                <strong>{snapshot.liveVerification.rcInput.verified ? 'Verified' : 'Not live'}</strong>
              </article>
              <article className="telemetry-metric-card">
                <span>Staged tuning changes</span>
                <strong>{tuningStagedDrafts.length}</strong>
              </article>
              <article className="telemetry-metric-card">
                <span>Curated controls</span>
                <strong>{tuningParameters.length}</strong>
              </article>
            </div>

            <div className="tuning-card-grid">
              <article className="tuning-card">
                <div className="switch-exercise-card__header">
                  <div>
                    <strong>Flight feel</strong>
                    <p>General stick feel for self-leveling flight, yaw authority, and maximum lean angle.</p>
                  </div>
                  <StatusBadge tone="neutral">{flightFeelParameters.length} controls</StatusBadge>
                </div>

                <div className="tuning-field-grid">
                  {flightFeelParameters.map((parameter) => {
                    const draft = parameterDraftById.get(parameter.id)
                    const inputValue = tuningInputValue(parameter, editedValues)
                    const displayValue =
                      parameter.id === 'ANGLE_MAX'
                        ? formatAngleMaxDegrees(draft?.nextValue ?? parameter.value)
                        : formatParameterDisplayValue(parameter, draft?.nextValue ?? parameter.value)

                    return (
                      <label key={parameter.id} className={`scoped-editor-field scoped-editor-field--${draft?.status ?? 'unchanged'}`}>
                        <span>{parameter.definition?.label ?? parameter.id}</span>
                        <input
                          data-testid={`tuning-input-${parameter.id}`}
                          type="number"
                          min={parameter.id === 'ANGLE_MAX' ? 10 : parameter.definition?.minimum}
                          max={parameter.id === 'ANGLE_MAX' ? 80 : parameter.definition?.maximum}
                          step={parameter.id === 'ANGLE_MAX' ? 1 : parameter.definition?.step ?? 0.01}
                          value={inputValue}
                          onChange={(event) => stageTuningInputValue(parameter, event.target.value, setEditedValues)}
                        />
                        <small>
                          {parameter.id === 'ANGLE_MAX'
                            ? `Current ${formatAngleMaxDegrees(parameter.value)}. Staged ${displayValue}.`
                            : draft?.status === 'staged'
                              ? `Staged ${displayValue}`
                              : draft?.reason ?? `Current ${displayValue}`}
                        </small>
                      </label>
                    )
                  })}
                </div>

                <ul className="output-note-list">
                  <li>Lower smoothing makes the quad feel more immediate; higher smoothing makes it feel softer.</li>
                  <li>Lean-angle changes are shown in degrees here, even though ArduPilot stores `ANGLE_MAX` in centidegrees.</li>
                  <li>Increase yaw values slowly and confirm control feel with a short test flight between changes.</li>
                </ul>
              </article>

              <article className="tuning-card">
                <div className="switch-exercise-card__header">
                  <div>
                    <strong>Acro rates & expo</strong>
                    <p>Core FPV-style acro handling only. PID banks and deeper controller tuning stay out of this first pass.</p>
                  </div>
                  <StatusBadge tone="neutral">{acroTuningParameters.length} controls</StatusBadge>
                </div>

                <div className="tuning-field-grid">
                  {acroTuningParameters.map((parameter) => {
                    const draft = parameterDraftById.get(parameter.id)
                    const inputValue = tuningInputValue(parameter, editedValues)
                    const displayValue = formatParameterDisplayValue(parameter, draft?.nextValue ?? parameter.value)

                    return (
                      <label key={parameter.id} className={`scoped-editor-field scoped-editor-field--${draft?.status ?? 'unchanged'}`}>
                        <span>{parameter.definition?.label ?? parameter.id}</span>
                        <input
                          data-testid={`tuning-input-${parameter.id}`}
                          type="number"
                          min={parameter.definition?.minimum}
                          max={parameter.definition?.maximum}
                          step={parameter.definition?.step ?? 0.01}
                          value={inputValue}
                          onChange={(event) => stageTuningInputValue(parameter, event.target.value, setEditedValues)}
                        />
                        <small>
                          {draft?.status === 'staged'
                            ? `Staged ${displayValue}`
                            : draft?.reason ?? `Current ${displayValue}`}
                        </small>
                      </label>
                    )
                  })}
                </div>

                <div className="config-pills">
                  <span>Roll/pitch rates</span>
                  <span>Yaw rate</span>
                  <span>Roll/pitch expo</span>
                  <span>Yaw expo</span>
                </div>

                <ul className="output-note-list">
                  <li>Rates set the maximum rotation speed in Acro mode.</li>
                  <li>Expo softens the center stick area without reducing full-stick authority.</li>
                  <li>If you need deeper tune changes than rates/expo, switch to Expert and use the raw parameter tools deliberately.</li>
                </ul>
              </article>
            </div>

            <div className="tuning-card-grid">
              <RateCurveGraph
                maxRate={Number(editedValues['ACRO_RP_RATE'] ?? readParameterValue(snapshot, 'ACRO_RP_RATE') ?? 360)}
                expo={Number(editedValues['ACRO_RP_EXPO'] ?? readParameterValue(snapshot, 'ACRO_RP_EXPO') ?? 0)}
                label="Roll / Pitch"
              />
              <RateCurveGraph
                maxRate={Number(editedValues['ACRO_Y_RATE'] ?? readParameterValue(snapshot, 'ACRO_Y_RATE') ?? 180)}
                expo={Number(editedValues['ACRO_Y_EXPO'] ?? readParameterValue(snapshot, 'ACRO_Y_EXPO') ?? 0)}
                label="Yaw"
                color="#dab254"
              />
            </div>

            <div className="scoped-review-card">
              <div className="switch-exercise-card__header">
                <div>
                  <strong>Tuning changes in review</strong>
                  <p>Keep this first tuning surface simple: stage local drafts here, apply them here, and use Expert mode only for deeper follow-up.</p>
                </div>
                <StatusBadge tone={toneForScopedDraftReview(tuningStagedDrafts.length, tuningInvalidDrafts.length)}>
                  {tuningInvalidDrafts.length > 0
                    ? `${tuningInvalidDrafts.length} invalid`
                    : tuningStagedDrafts.length > 0
                      ? `${tuningStagedDrafts.length} staged`
                      : 'in sync'}
                </StatusBadge>
              </div>

              {tuningDraftEntries.length > 0 ? (
                <div className="scoped-draft-list">
                  {tuningDraftEntries.map((draft) => (
                    <article key={draft.id} className={`scoped-draft-item scoped-draft-item--${draft.status}`}>
                      <div className="scoped-draft-item__header">
                        <strong>{draft.label}</strong>
                        <StatusBadge tone={toneForParameterDraftStatus(draft.status)}>{draft.status}</StatusBadge>
                      </div>
                      <p>{draft.id}</p>
                      <small>
                        {draft.status === 'staged'
                          ? `${formatParameterValue(draft.currentValue, draft.definition?.unit)} to ${formatParameterValue(
                              draft.nextValue,
                              draft.definition?.unit
                            )}`
                          : draft.reason ?? 'Draft matches the live controller value.'}
                      </small>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="success-copy">No tuning changes are staged right now.</p>
              )}

              <div className="switch-exercise-controls">
                <button
                  data-testid="apply-tuning-changes-button"
                  style={buttonStyle('primary')}
                  onClick={() => void handleApplyScopedParameterDrafts(tuningDraftEntries, 'tuning:apply', 'Tuning')}
                  disabled={
                    busyAction !== undefined ||
                    tuningStagedDrafts.length === 0 ||
                    tuningInvalidDrafts.length > 0 ||
                    !canApplyDraftParameters
                  }
                >
                  {busyAction === 'tuning:apply' ? 'Applying…' : `Apply Tuning Changes (${tuningStagedDrafts.length})`}
                </button>
                <button
                  style={buttonStyle()}
                  onClick={() => handleDiscardScopedParameterDrafts(tuningDraftEntries.map((entry) => entry.id), 'tuning')}
                  disabled={busyAction !== undefined || tuningDraftEntries.length === 0}
                >
                  Discard Tuning Changes
                </button>
              </div>
            </div>

            <p className="telemetry-note">
              This view is intentionally limited to high-value flight-feel and rate/expo controls. It is designed to be easy to expand later without
              turning the app into a full raw-tuning surface by default.
            </p>
          </div>
        </Panel>
      </section>
      ) : null}

      {activeViewId === 'presets' ? (
      <section className="grid one-up">
        <Panel
          title="Presets"
          subtitle="Curated tuning bundles built on the same verified write path and snapshot safety system as the rest of the configurator."
        >
          <div className="telemetry-stack">
            <div className="telemetry-header">
              <div>
                <h3>Preset library</h3>
                <p>
                  Presets stay intentionally narrow: they touch only the small, high-value tuning controls already exposed in this product. Every
                  apply requires diff review, and a pre-apply snapshot is captured automatically before any write is sent.
                </p>
              </div>
              <StatusBadge tone={toneForPresetApplicability(selectedPresetApplicability.status)}>
                {selectedPresetInvalidEntries.length > 0
                  ? `${selectedPresetInvalidEntries.length} invalid`
                  : selectedPresetChangedEntries.length > 0
                    ? `${selectedPresetChangedEntries.length} diff`
                    : `${presetDefinitions.length} presets`}
              </StatusBadge>
            </div>

            {presetNotice ? (
              <div className="parameter-review__notice">
                <StatusBadge tone={presetNotice.tone}>{presetNotice.tone}</StatusBadge>
                <p>{presetNotice.text}</p>
              </div>
            ) : null}

            {parameterFollowUp ? (
              <div className="parameter-follow-up">
                <StatusBadge tone={parameterFollowUp.requiresReboot ? 'warning' : 'neutral'}>
                  {parameterFollowUp.requiresReboot ? 'reboot' : 'refresh'}
                </StatusBadge>
                <p>{parameterFollowUp.text}</p>
                <small>Use the sidebar session controls to complete the pending reboot or refresh after a preset apply.</small>
              </div>
            ) : null}

            <div className="telemetry-metric-grid">
              <article className="telemetry-metric-card">
                <span>Preset families</span>
                <strong>{presetGroups.length}</strong>
              </article>
              <article className="telemetry-metric-card">
                <span>Total presets</span>
                <strong>{presetDefinitions.length}</strong>
              </article>
              <article className="telemetry-metric-card">
                <span>Changed vs live</span>
                <strong>{selectedPresetDiff?.changedCount ?? 0}</strong>
              </article>
              <article className="telemetry-metric-card">
                <span>Auto backups</span>
                <strong>{savedSnapshots.filter((snapshotEntry) => snapshotEntry.tags.includes('auto-backup')).length}</strong>
              </article>
            </div>

            {presetGroups.length > 0 ? (
              <div className="preset-group-grid">
                {presetGroups.map((group) => (
                  <section key={group.id} className="preset-group">
                    <header className="preset-group__header">
                      <div>
                        <strong>{group.label}</strong>
                        <p>{group.description}</p>
                      </div>
                      <StatusBadge tone="neutral">{metadataCatalog.presetsByGroup[group.id]?.length ?? 0} presets</StatusBadge>
                    </header>

                    <div className="preset-card-grid">
                      {(metadataCatalog.presetsByGroup[group.id] ?? []).map((preset) => {
                        const preview = presetPreviewById.get(preset.id)
                        const isActive = preset.id === selectedPreset?.id
                        const changedCount = preview?.diff.changedCount ?? 0
                        const invalidCount = deriveParameterDraftEntries(snapshot.parameters, preview?.diff.draftValues ?? {}).filter(
                          (entry) => entry.status === 'invalid'
                        ).length

                        return (
                          <button
                            key={preset.id}
                            type="button"
                            data-testid={`preset-card-${preset.id}`}
                            className={`preset-card${isActive ? ' is-active' : ''}`}
                            onClick={() => setSelectedPresetId(preset.id)}
                          >
                            <div className="preset-card__header">
                              <div>
                                <strong>{preset.label}</strong>
                                <small>{preset.description}</small>
                              </div>
                              <StatusBadge
                                tone={
                                  invalidCount > 0
                                    ? 'danger'
                                    : preview
                                      ? toneForPresetApplicability(preview.applicability.status)
                                      : 'neutral'
                                }
                              >
                                {invalidCount > 0
                                  ? `${invalidCount} invalid`
                                  : preview?.applicability.status === 'blocked'
                                    ? 'blocked'
                                    : changedCount > 0
                                      ? `${changedCount} diff`
                                      : 'matches'}
                              </StatusBadge>
                            </div>

                            <div className="config-pills">
                              <span>{preset.values.length} params</span>
                              {preset.tags.slice(0, 3).map((tag) => (
                                <span key={`${preset.id}:${tag}`}>#{tag}</span>
                              ))}
                            </div>

                            {preset.note ? <p>{preset.note}</p> : null}
                          </button>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <p className="telemetry-note">No presets are defined in the current firmware metadata bundle yet.</p>
            )}

            {selectedPreset ? (
              <div className="preset-selected">
                <div className="telemetry-header">
                  <div>
                    <h3>{selectedPreset.label}</h3>
                    <p>{selectedPreset.description}</p>
                  </div>
                  <div className="preset-selected__badges">
                    <StatusBadge tone="neutral">{selectedPreset.groupDefinition.label}</StatusBadge>
                    <StatusBadge tone={toneForPresetApplicability(selectedPresetApplicability.status)}>
                      {selectedPresetApplicability.status}
                    </StatusBadge>
                  </div>
                </div>

                <div className="telemetry-metric-grid">
                  <article className="telemetry-metric-card">
                    <span>Touched params</span>
                    <strong>{selectedPreset.values.length}</strong>
                  </article>
                  <article className="telemetry-metric-card">
                    <span>Changed on live</span>
                    <strong>{selectedPresetChangedEntries.length}</strong>
                  </article>
                  <article className="telemetry-metric-card">
                    <span>Already matched</span>
                    <strong>{selectedPresetDiff?.unchangedCount ?? 0}</strong>
                  </article>
                  <article className="telemetry-metric-card">
                    <span>Unknown on live</span>
                    <strong>{selectedPresetDiff?.unknownParameterIds.length ?? 0}</strong>
                  </article>
                </div>

                <div className="config-pills">
                  <span>{selectedPreset.groupDefinition.label}</span>
                  {selectedPreset.tags.map((tag) => (
                    <span key={`${selectedPreset.id}:tag:${tag}`}>#{tag}</span>
                  ))}
                </div>

                {selectedPreset.note ? <p className="snapshot-selected__note">{selectedPreset.note}</p> : null}

                {selectedPreset.prerequisites && selectedPreset.prerequisites.length > 0 ? (
                  <div className="preset-notes">
                    <strong>Before you apply</strong>
                    <ul className="output-note-list">
                      {selectedPreset.prerequisites.map((item) => (
                        <li key={`${selectedPreset.id}:prereq:${item}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {selectedPresetApplicability.reasons.length > 0 ? (
                  <div
                    className={`parameter-follow-up${
                      selectedPresetApplicability.status === 'blocked' ? ' parameter-follow-up--warning' : ''
                    }`}
                  >
                    <StatusBadge tone={toneForPresetApplicability(selectedPresetApplicability.status)}>
                      {selectedPresetApplicability.status}
                    </StatusBadge>
                    <p>{selectedPresetApplicability.reasons.join(' ')}</p>
                  </div>
                ) : null}

                {selectedPreset.cautions && selectedPreset.cautions.length > 0 ? (
                  <div className="preset-notes">
                    <strong>Cautions</strong>
                    <ul className="output-note-list">
                      {selectedPreset.cautions.map((item) => (
                        <li key={`${selectedPreset.id}:caution:${item}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {selectedPresetDiff && selectedPresetDiff.unknownParameterIds.length > 0 ? (
                  <div className="parameter-follow-up parameter-follow-up--warning">
                    <StatusBadge tone="warning">partial</StatusBadge>
                    <p>
                      {selectedPresetDiff.unknownParameterIds.length} preset parameter(s) do not exist in the current live metadata set and will be
                      ignored.
                    </p>
                  </div>
                ) : null}

                {selectedPresetChangedEntries.length > 0 ? (
                  <div className="parameter-diff-grid">
                    {selectedPresetDiffGroups.map((group) => (
                      <section key={group.category} className="parameter-diff-group">
                        <header>
                          <strong>{formatCategoryLabel(group.category)}</strong>
                          <span>{group.entries.length} changed</span>
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
                ) : (
                  <p className="telemetry-note">
                    This preset already matches the currently synced values, so there is nothing to apply right now.
                  </p>
                )}

                {selectedPresetInvalidEntries.length > 0 ? (
                  <div className="parameter-diff-grid parameter-diff-grid--invalid">
                    <section className="parameter-diff-group parameter-diff-group--invalid">
                      <header>
                        <strong>Invalid preset values</strong>
                        <span>{selectedPresetInvalidEntries.length} blocked</span>
                      </header>

                      {selectedPresetInvalidEntries.map((draft) => (
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
                  </div>
                ) : null}

                <div className="parameter-follow-up parameter-follow-up--warning">
                  <StatusBadge tone="warning">backup</StatusBadge>
                  <p>
                    Applying a preset writes only the diff shown above, verifies every write, and automatically captures a pre-apply snapshot in the
                    Snapshots library before sending anything to the controller.
                  </p>
                </div>

                <label className="snapshot-restore-ack">
                  <input
                    data-testid="preset-apply-ack"
                    type="checkbox"
                    checked={presetApplyAcknowledged}
                    onChange={(event) => setPresetApplyAcknowledged(event.target.checked)}
                    disabled={busyAction !== undefined || selectedPresetChangedEntries.length === 0}
                  />
                  <span>I reviewed this preset diff and want ArduConfigurator to capture a backup and apply these changes to the live controller.</span>
                </label>

                <div className="switch-exercise-controls">
                  <button
                    data-testid="apply-preset-button"
                    style={buttonStyle('primary')}
                    onClick={() => void handleApplySelectedPreset()}
                    disabled={
                      busyAction !== undefined ||
                      selectedPresetChangedEntries.length === 0 ||
                      selectedPresetInvalidEntries.length > 0 ||
                      selectedPresetApplicability.status === 'blocked' ||
                      !presetApplyAcknowledged ||
                      !canApplyDraftParameters
                    }
                  >
                    {busyAction === 'presets:apply' ? 'Applying…' : `Apply Preset (${selectedPresetChangedEntries.length})`}
                  </button>
                  <button
                    style={buttonStyle()}
                    onClick={handleStageSelectedPresetDiff}
                    disabled={
                      busyAction !== undefined ||
                      selectedPresetChangedEntries.length === 0 ||
                      selectedPresetApplicability.status === 'blocked'
                    }
                  >
                    Load as Manual Tuning Draft
                  </button>
                </div>
              </div>
            ) : null}

            <p className="telemetry-note">
              Presets are designed to stay explainable and reversible. They are not broad tune dumps, and they intentionally stop at the first small
              set of flight-feel and rate/expo controls.
            </p>
          </div>
        </Panel>
      </section>
      ) : null}

      {activeViewId === 'parameters' ? (
      <Panel title="Parameter Editor" subtitle="Stage changes locally, review the diff, then apply them through the shared runtime.">
        <div className="parameter-follow-up parameter-follow-up--warning">
          <StatusBadge tone="warning">expert</StatusBadge>
          <p>Raw parameter editing is an Expert surface. Use Setup, Ports, Receiver, Outputs, and Power for routine workflow changes first.</p>
        </div>

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
	              <small>Use the sidebar session controls to complete the pending reboot or refresh.</small>
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

      <footer className="app-status-bar">
        <span className={`app-status-bar__item ${snapshot.connection.kind === 'connected' ? 'is-ok' : ''}`}>
          <span className="dot" />
          {snapshot.connection.kind}
        </span>
        <span className="app-status-bar__item">
          {snapshot.vehicle?.vehicle ?? '—'}
        </span>
        <span className="app-status-bar__item">
          {snapshot.parameterStats.status === 'complete'
            ? `${snapshot.parameterStats.downloaded} params synced`
            : formatParameterSync(snapshot)}
        </span>
        {snapshot.preArmStatus.healthy
          ? <span className="app-status-bar__item is-ok"><span className="dot" />Pre-arm clear</span>
          : <span className="app-status-bar__item is-warn"><span className="dot" />{snapshot.preArmStatus.issues.length} pre-arm issues</span>}
        <span className="app-status-bar__spacer" />
        <span className="app-status-bar__item">
          {snapshot.sessionProfile === 'usb-bench' ? 'USB bench' : 'Full power'}
        </span>
        <span className="app-status-bar__item">
          {missionTitleForView(activeViewId)}
        </span>
      </footer>
    </main>
  )
}
