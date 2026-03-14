import type { GuidedActionId, LiveSignalId, ParameterDefinition, SessionProfile, SetupSectionDefinition } from '@arduconfig/param-metadata'
import type { TransportStatus } from '@arduconfig/transport'

export type SetupStatus = 'attention' | 'in-progress' | 'complete'
export type ParameterSyncStatus = 'idle' | 'awaiting-vehicle' | 'requesting' | 'streaming' | 'complete'
export type GuidedActionStatus = 'idle' | 'requested' | 'running' | 'succeeded' | 'failed'

export interface VehicleIdentity {
  firmware: 'ArduPilot' | 'Unknown'
  vehicle: 'ArduCopter' | 'Unknown'
  systemId: number
  componentId: number
  armed: boolean
  flightMode: string
}

export interface StatusTextEntry {
  severity: 'info' | 'warning' | 'error'
  text: string
}

export interface ParameterState {
  id: string
  value: number
  index: number
  count: number
  definition?: ParameterDefinition
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

export interface LiveVerificationState {
  satisfiedSignals: LiveSignalId[]
  rcInput: RcInputState
  batteryTelemetry: BatteryTelemetryState
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
  liveVerification: LiveVerificationState
  statusTexts: StatusTextEntry[]
}
