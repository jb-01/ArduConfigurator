export type GuidedActionId =
  | 'request-parameters'
  | 'calibrate-accelerometer'
  | 'calibrate-compass'
  | 'reboot-autopilot'

export type SessionProfile = 'full-power' | 'usb-bench'
export type LiveSignalId = 'rc-input' | 'battery-telemetry'
export type AppViewId = 'setup' | 'ports' | 'receiver' | 'outputs' | 'power' | 'snapshots' | 'tuning' | 'presets' | 'parameters'

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
  snapshotExcluded?: boolean
  notes?: string[]
  options?: ParameterValueOption[]
}

export interface PresetGroupDefinition {
  id: string
  label: string
  description: string
  order: number
}

export interface ParameterPresetValue {
  paramId: string
  value: number
}

export interface PresetCompatibilityDefinition {
  frameClasses?: number[]
}

export interface PresetDefinition {
  id: string
  label: string
  description: string
  groupId: string
  order: number
  values: ParameterPresetValue[]
  note?: string
  tags?: string[]
  prerequisites?: string[]
  cautions?: string[]
  compatibility?: PresetCompatibilityDefinition
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
  presetGroups?: Record<string, PresetGroupDefinition>
  presets?: Record<string, PresetDefinition>
  parameters: Record<string, ParameterDefinition>
  setupSections: SetupSectionDefinition[]
}

export interface NormalizedParameterDefinition extends ParameterDefinition {
  categoryDefinition: ParameterCategoryDefinition
}

export interface NormalizedPresetDefinition extends Omit<PresetDefinition, 'tags'> {
  groupDefinition: PresetGroupDefinition
  tags: string[]
}

export interface NormalizedFirmwareMetadataBundle {
  firmware: FirmwareMetadataBundle['firmware']
  appViews: AppViewDefinition[]
  categories: ParameterCategoryDefinition[]
  categoryById: Record<string, ParameterCategoryDefinition>
  presetGroups: PresetGroupDefinition[]
  presetGroupById: Record<string, PresetGroupDefinition>
  presets: NormalizedPresetDefinition[]
  presetsByGroup: Record<string, NormalizedPresetDefinition[]>
  parameters: Record<string, NormalizedParameterDefinition>
  parametersByCategory: Record<string, NormalizedParameterDefinition[]>
}
