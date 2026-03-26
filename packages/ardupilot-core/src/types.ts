import type { GuidedActionId, LiveSignalId, ParameterDefinition, SessionProfile, SetupSectionDefinition } from '@arduconfig/param-metadata'
import type { TransportStatus } from '@arduconfig/transport'

export type SetupStatus = 'attention' | 'in-progress' | 'complete'
export type ParameterSyncStatus = 'idle' | 'awaiting-vehicle' | 'requesting' | 'streaming' | 'complete'
export type GuidedActionStatus = 'idle' | 'requested' | 'running' | 'succeeded' | 'failed'
export type MotorTestStatus = 'idle' | 'requested' | 'running' | 'succeeded' | 'failed'

export interface VehicleIdentity {
  firmware: 'ArduPilot' | 'Unknown'
  vehicle: 'ArduCopter' | 'Unknown'
  systemId: number
  componentId: number
  armed: boolean
  flightMode: string
}

export interface HardwareBoardState {
  boardVersion: number
  boardType: number
  vendorId: number
  productId: number
  uid?: string
  ftpSupported: boolean
  lastUpdatedAtMs: number
}

export interface BoardSerialPortMapping {
  serialPortNumber: number
  hardwarePort: string
  txActive: boolean
  rxActive: boolean
  txBytes?: number
  rxBytes?: number
  txBufferDrops?: number
  rxBufferDrops?: number
}

export type BoardFileStatus = 'idle' | 'loading' | 'ready' | 'unsupported' | 'missing' | 'error'

export interface BoardFileState {
  status: BoardFileStatus
  path: string
  mappings: BoardSerialPortMapping[]
  rawText?: string
  error?: string
  fetchedAtMs?: number
}

export interface HardwareState {
  board?: HardwareBoardState
  uartsFile: BoardFileState
}

export interface StatusTextEntry {
  severity: 'info' | 'warning' | 'error'
  text: string
}

export interface PreArmIssueState {
  text: string
  severity: StatusTextEntry['severity']
  firstSeenAtMs: number
  lastSeenAtMs: number
}

export interface PreArmStatusState {
  healthy: boolean
  issues: PreArmIssueState[]
  lastUpdatedAtMs?: number
}

export interface ParameterState {
  id: string
  value: number
  index: number
  count: number
  definition?: ParameterDefinition
}

export interface ParameterWriteOptions {
  verifyTimeoutMs?: number
  tolerance?: number
}

export interface ParameterWriteRequest {
  paramId: string
  paramValue: number
}

export interface ParameterWriteResult {
  paramId: string
  previousValue?: number
  requestedValue: number
  confirmedValue: number
  confirmedAtMs: number
}

export interface ParameterBatchWriteResult {
  applied: ParameterWriteResult[]
  rolledBack: ParameterWriteResult[]
}

export interface ParameterSyncState {
  status: ParameterSyncStatus
  downloaded: number
  total: number
  duplicateFrames: number
  progress: number | null
  targetSystemId?: number
  targetComponentId?: number
  requestedAtMs?: number
  completedAtMs?: number
}

export interface GuidedActionState {
  actionId: GuidedActionId
  status: GuidedActionStatus
  summary: string
  instructions: string[]
  statusTexts: string[]
  ctaLabel?: string
  startedAtMs?: number
  updatedAtMs?: number
  completedAtMs?: number
}

export interface RcInputState {
  verified: boolean
  channelCount: number
  channels: number[]
  rssi?: number
  lastSeenAtMs?: number
}

export interface BatteryTelemetryState {
  verified: boolean
  voltageMv?: number
  voltageV?: number
  currentA?: number
  remainingPercent?: number
  lastSeenAtMs?: number
}

export interface AttitudeTelemetryState {
  verified: boolean
  rollDeg?: number
  pitchDeg?: number
  yawDeg?: number
  lastSeenAtMs?: number
}

export interface GlobalPositionTelemetryState {
  verified: boolean
  latitudeDeg?: number
  longitudeDeg?: number
  altitudeM?: number
  relativeAltitudeM?: number
  groundSpeedMs?: number
  headingDeg?: number
  lastSeenAtMs?: number
}

export interface LiveVerificationState {
  satisfiedSignals: LiveSignalId[]
  rcInput: RcInputState
  batteryTelemetry: BatteryTelemetryState
  attitudeTelemetry: AttitudeTelemetryState
  globalPosition: GlobalPositionTelemetryState
}

export interface MotorTestState {
  status: MotorTestStatus
  summary: string
  instructions: string[]
  allOutputsSelected?: boolean
  selectedOutputChannel?: number
  selectedOutputCount?: number
  selectedMotorNumber?: number
  throttlePercent?: number
  durationSeconds?: number
  startedAtMs?: number
  updatedAtMs?: number
  completedAtMs?: number
}

export interface MotorTestRequest {
  outputChannel?: number
  runAllOutputs?: boolean
  throttlePercent: number
  durationSeconds: number
}

export interface SetupSectionState {
  id: string
  title: string
  description: string
  status: SetupStatus
  notes: string[]
  actions: GuidedActionId[]
  definition: SetupSectionDefinition
  parameters: ParameterState[]
}

export interface ConfiguratorSnapshot {
  connection: TransportStatus
  sessionProfile: SessionProfile
  vehicle?: VehicleIdentity
  hardware: HardwareState
  parameterStats: {
    downloaded: number
    total: number
    duplicateFrames: number
    status: ParameterSyncStatus
    progress: number | null
    requestedAtMs?: number
    completedAtMs?: number
  }
  parameters: ParameterState[]
  setupSections: SetupSectionState[]
  guidedActions: Record<GuidedActionId, GuidedActionState>
  motorTest: MotorTestState
  liveVerification: LiveVerificationState
  preArmStatus: PreArmStatusState
  statusTexts: StatusTextEntry[]
}
