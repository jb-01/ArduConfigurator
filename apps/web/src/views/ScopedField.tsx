import type { ParameterState } from '@arduconfig/ardupilot-core'

export interface ScopedFieldDraftStatus {
  status: string
}

export type ScopedFieldDraftMap = ReadonlyMap<string, ScopedFieldDraftStatus>

interface CommonScopedFieldProps {
  parameter: ParameterState
  liveValue: number | undefined
  editedValues: Record<string, string>
  draftStatusById: ScopedFieldDraftMap
  onChange: (paramId: string, value: string) => void
  compact?: boolean
}

function statusModifier(map: ScopedFieldDraftMap, paramId: string): string {
  return map.get(paramId)?.status ?? 'unchanged'
}

function fieldClassName(map: ScopedFieldDraftMap, paramId: string, compact: boolean): string {
  return `scoped-editor-field${compact ? ' scoped-editor-field--compact' : ''} scoped-editor-field--${statusModifier(map, paramId)}`
}

export function ScopedSelectField(props: CommonScopedFieldProps) {
  const { parameter, liveValue, editedValues, draftStatusById, onChange, compact = true } = props
  return (
    <label className={fieldClassName(draftStatusById, parameter.id, compact)}>
      <span>{parameter.definition?.label ?? parameter.id}</span>
      <select
        value={editedValues[parameter.id] ?? String(liveValue ?? '')}
        onChange={(event) => onChange(parameter.id, event.target.value)}
      >
        {(parameter.definition?.options ?? []).map((valueOption) => (
          <option key={`${parameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
            {valueOption.label}
          </option>
        ))}
      </select>
    </label>
  )
}

interface ScopedNumberFieldProps extends CommonScopedFieldProps {
  stepFallback?: number
}

export function ScopedNumberField(props: ScopedNumberFieldProps) {
  const { parameter, liveValue, editedValues, draftStatusById, onChange, compact = true, stepFallback = 1 } = props
  return (
    <label className={fieldClassName(draftStatusById, parameter.id, compact)}>
      <span>{parameter.definition?.label ?? parameter.id}</span>
      <input
        type="number"
        min={parameter.definition?.minimum}
        max={parameter.definition?.maximum}
        step={parameter.definition?.step ?? stepFallback}
        value={editedValues[parameter.id] ?? String(liveValue ?? '')}
        onChange={(event) => onChange(parameter.id, event.target.value)}
      />
    </label>
  )
}
