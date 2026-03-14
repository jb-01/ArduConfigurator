export type GuidedActionId =
  | 'request-parameters'
  | 'calibrate-accelerometer'
  | 'calibrate-compass'
  | 'reboot-autopilot'

export type SessionProfile = 'full-power' | 'usb-bench'
export type LiveSignalId = 'rc-input' | 'battery-telemetry'
export type AppViewId = 'setup' | 'receiver' | 'outputs' | 'power' | 'parameters'

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

export interface AppViewDefinition {
  id: AppViewId
  label: string
  description: string
  order: number
}

export interface ParameterCategoryDefinition {
  id: string
  label: string
  description: string
  order: number
  viewId: AppViewId
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
  appViews?: AppViewDefinition[]
  categories?: Record<string, ParameterCategoryDefinition>
  parameters: Record<string, ParameterDefinition>
  setupSections: SetupSectionDefinition[]
}

export interface NormalizedParameterDefinition extends ParameterDefinition {
  categoryDefinition: ParameterCategoryDefinition
}

export interface NormalizedFirmwareMetadataBundle {
  firmware: FirmwareMetadataBundle['firmware']
  appViews: AppViewDefinition[]
  categories: ParameterCategoryDefinition[]
  categoryById: Record<string, ParameterCategoryDefinition>
  parameters: Record<string, NormalizedParameterDefinition>
  parametersByCategory: Record<string, NormalizedParameterDefinition[]>
}
