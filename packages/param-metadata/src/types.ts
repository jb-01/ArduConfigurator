export type GuidedActionId =
  | 'request-parameters'
  | 'calibrate-accelerometer'
  | 'calibrate-compass'
  | 'reboot-autopilot'

export type SessionProfile = 'full-power' | 'usb-bench'
export type LiveSignalId = 'rc-input' | 'battery-telemetry'

export interface ParameterValueOption {
  value: number
  label: string
  description?: string
}

export interface ParameterDefinition {
  id: string
  label: string
  description: string
  category: string
  unit?: string
  minimum?: number
  maximum?: number
  step?: number
  rebootRequired?: boolean
  notes?: string[]
  options?: ParameterValueOption[]
}

export interface SetupSectionSessionOverride {
  deferCompletion?: boolean
  notes: string[]
}

export interface SetupSectionDefinition {
  id: string
  title: string
  description: string
  requiredParameters: string[]
  requiredLiveSignals?: LiveSignalId[]
  completionStatusTexts?: string[]
  actions?: GuidedActionId[]
  sessionOverrides?: Partial<Record<SessionProfile, SetupSectionSessionOverride>>
}

export interface FirmwareMetadataBundle {
  firmware: 'ArduCopter'
  parameters: Record<string, ParameterDefinition>
  setupSections: SetupSectionDefinition[]
}
