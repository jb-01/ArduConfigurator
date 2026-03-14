import type { ParameterDefinition } from '@arduconfig/param-metadata'

import type { ParameterState } from './types.js'

export type ParameterDraftStatus = 'unchanged' | 'staged' | 'invalid'

export interface ParameterDraftEntry {
  id: string
  label: string
  category: string
  definition?: ParameterDefinition
  rawValue: string
  currentValue?: number
  nextValue?: number
  delta?: number
  status: ParameterDraftStatus
  reason?: string
}

export interface ParameterDraftSummary {
  totalEntries: number
  stagedCount: number
  invalidCount: number
  stagedCategories: string[]
}

export interface ParameterDraftGroup {
  category: string
  entries: ParameterDraftEntry[]
}

const DEFAULT_STAGEABLE_STATUSES: ParameterDraftStatus[] = ['staged']

export function deriveParameterDraftEntries(
  parameters: ParameterState[],
  draftValues: Record<string, string>
): ParameterDraftEntry[] {
  const parameterById = new Map(parameters.map((parameter) => [parameter.id, parameter]))

  return Object.entries(draftValues)
    .map(([paramId, rawValue]) => deriveParameterDraftEntry(parameterById.get(paramId), rawValue, paramId))
    .sort(compareParameterDraftEntries)
}

export function summarizeParameterDraftEntries(entries: ParameterDraftEntry[]): ParameterDraftSummary {
  const stagedEntries = entries.filter((entry) => entry.status === 'staged')
  const stagedCategories = [...new Set(stagedEntries.map((entry) => entry.category))].sort((left, right) =>
    left.localeCompare(right)
  )

  return {
    totalEntries: entries.length,
    stagedCount: stagedEntries.length,
    invalidCount: entries.filter((entry) => entry.status === 'invalid').length,
    stagedCategories
  }
}

export function groupParameterDraftEntries(
  entries: ParameterDraftEntry[],
  statuses: readonly ParameterDraftStatus[] = DEFAULT_STAGEABLE_STATUSES
): ParameterDraftGroup[] {
  const allowedStatuses = new Set(statuses)
  const grouped = new Map<string, ParameterDraftEntry[]>()

  entries
    .filter((entry) => allowedStatuses.has(entry.status))
    .forEach((entry) => {
      const existing = grouped.get(entry.category)
      if (existing) {
        existing.push(entry)
      } else {
        grouped.set(entry.category, [entry])
      }
    })

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, categoryEntries]) => ({
      category,
      entries: [...categoryEntries].sort(compareParameterDraftEntries)
    }))
}

function deriveParameterDraftEntry(parameter: ParameterState | undefined, rawValue: string, paramId: string): ParameterDraftEntry {
  const label = parameter?.definition?.label ?? paramId
  const category = parameter?.definition?.category ?? 'uncategorized'
  const trimmedValue = rawValue.trim()

  if (parameter === undefined) {
    return {
      id: paramId,
      label,
      category,
      rawValue,
      status: 'invalid',
      reason: 'Parameter is not present in the synced snapshot.'
    }
  }

  if (trimmedValue.length === 0) {
    return {
      id: paramId,
      label,
      category,
      definition: parameter.definition,
      rawValue,
      currentValue: parameter.value,
      status: 'invalid',
      reason: 'Enter a numeric value before staging this parameter.'
    }
  }

  const parsedValue = Number(trimmedValue)
  if (!Number.isFinite(parsedValue)) {
    return {
      id: paramId,
      label,
      category,
      definition: parameter.definition,
      rawValue,
      currentValue: parameter.value,
      status: 'invalid',
      reason: 'Only finite numeric values can be written to the controller.'
    }
  }

  if (parameter.definition?.minimum !== undefined && parsedValue < parameter.definition.minimum) {
    return {
      id: paramId,
      label,
      category,
      definition: parameter.definition,
      rawValue,
      currentValue: parameter.value,
      nextValue: parsedValue,
      status: 'invalid',
      reason: `Value is below the documented minimum of ${parameter.definition.minimum}.`
    }
  }

  if (parameter.definition?.maximum !== undefined && parsedValue > parameter.definition.maximum) {
    return {
      id: paramId,
      label,
      category,
      definition: parameter.definition,
      rawValue,
      currentValue: parameter.value,
      nextValue: parsedValue,
      status: 'invalid',
      reason: `Value is above the documented maximum of ${parameter.definition.maximum}.`
    }
  }

  if (parameter.definition?.options && parameter.definition.options.length > 0) {
    const matchesOption = parameter.definition.options.some((option) => Object.is(option.value, parsedValue))
    if (!matchesOption) {
      return {
        id: paramId,
        label,
        category,
        definition: parameter.definition,
        rawValue,
        currentValue: parameter.value,
        nextValue: parsedValue,
        status: 'invalid',
        reason: 'Value is outside the known enum values for this parameter.'
      }
    }
  }

  if (Object.is(parsedValue, parameter.value)) {
    return {
      id: paramId,
      label,
      category,
      definition: parameter.definition,
      rawValue,
      currentValue: parameter.value,
      nextValue: parsedValue,
      delta: 0,
      status: 'unchanged',
      reason: 'Draft matches the current controller value.'
    }
  }

  return {
    id: paramId,
    label,
    category,
    definition: parameter.definition,
    rawValue,
    currentValue: parameter.value,
    nextValue: parsedValue,
    delta: parsedValue - parameter.value,
    status: 'staged'
  }
}

function compareParameterDraftEntries(left: ParameterDraftEntry, right: ParameterDraftEntry): number {
  if (left.category !== right.category) {
    return left.category.localeCompare(right.category)
  }

  return left.id.localeCompare(right.id)
}
