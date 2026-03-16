import type { ConfiguratorSnapshot, ParameterState } from './types.js'

const SNAPSHOT_EXCLUDED_PREFIXES = ['STAT_'] as const
const SNAPSHOT_COMPARE_TOLERANCE = 0.0001

export interface ParameterBackupEntry {
  id: string
  value: number
  category?: string
  label?: string
  unit?: string
}

export interface ParameterBackupFile {
  schemaVersion: 1
  application: 'ArduConfigurator'
  firmware: NonNullable<ConfiguratorSnapshot['vehicle']>['vehicle'] | 'Unknown'
  exportedAt: string
  parameterCount: number
  vehicle?: {
    firmware: NonNullable<ConfiguratorSnapshot['vehicle']>['firmware']
    vehicle: NonNullable<ConfiguratorSnapshot['vehicle']>['vehicle']
    systemId: number
    componentId: number
    flightMode: string
  }
  parameters: ParameterBackupEntry[]
}

export interface ParameterBackupImportResult {
  draftValues: Record<string, string>
  matchedCount: number
  changedCount: number
  unchangedCount: number
  unknownParameterIds: string[]
}

export function createParameterBackup(snapshot: ConfiguratorSnapshot): ParameterBackupFile {
  const exportableParameters = snapshot.parameters
    .filter((parameter) => !isSnapshotExcludedParameterState(parameter))
    .map((parameter) => ({
      id: parameter.id,
      value: parameter.value,
      category: parameter.definition?.category,
      label: parameter.definition?.label,
      unit: parameter.definition?.unit
    }))
    .sort((left, right) => left.id.localeCompare(right.id))

  return {
    schemaVersion: 1,
    application: 'ArduConfigurator',
    firmware: snapshot.vehicle?.vehicle ?? 'Unknown',
    exportedAt: new Date().toISOString(),
    parameterCount: exportableParameters.length,
    vehicle: snapshot.vehicle
      ? {
          firmware: snapshot.vehicle.firmware,
          vehicle: snapshot.vehicle.vehicle,
          systemId: snapshot.vehicle.systemId,
          componentId: snapshot.vehicle.componentId,
          flightMode: snapshot.vehicle.flightMode
        }
      : undefined,
    parameters: exportableParameters
  }
}

export function serializeParameterBackup(backup: ParameterBackupFile): string {
  return JSON.stringify(backup, null, 2)
}

export function parseParameterBackup(input: string): ParameterBackupFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(input)
  } catch (error) {
    throw new Error(`Backup file is not valid JSON: ${error instanceof Error ? error.message : 'Unknown parse error.'}`)
  }

  if (!isParameterBackupFile(parsed)) {
    throw new Error('Backup file does not match the expected ArduConfigurator parameter backup schema.')
  }

  return {
    ...parsed,
    parameters: [...parsed.parameters].sort((left, right) => left.id.localeCompare(right.id))
  }
}

export function deriveDraftValuesFromParameterBackup(
  parameters: ParameterState[],
  backup: ParameterBackupFile
): ParameterBackupImportResult {
  const parameterById = new Map(parameters.map((parameter) => [parameter.id, parameter]))
  const draftValues: Record<string, string> = {}
  const unknownParameterIds: string[] = []
  let matchedCount = 0
  let changedCount = 0
  let unchangedCount = 0

  backup.parameters.forEach((entry) => {
    if (isSnapshotExcludedBackupEntry(entry)) {
      return
    }

    const current = parameterById.get(entry.id)
    if (!current) {
      unknownParameterIds.push(entry.id)
      return
    }

    matchedCount += 1
    if (parameterValuesMatch(current.value, entry.value)) {
      unchangedCount += 1
      return
    }

    draftValues[entry.id] = String(entry.value)
    changedCount += 1
  })

  return {
    draftValues,
    matchedCount,
    changedCount,
    unchangedCount,
    unknownParameterIds: unknownParameterIds.sort((left, right) => left.localeCompare(right))
  }
}

function isParameterBackupFile(value: unknown): value is ParameterBackupFile {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<ParameterBackupFile>
  if (candidate.schemaVersion !== 1 || candidate.application !== 'ArduConfigurator' || !Array.isArray(candidate.parameters)) {
    return false
  }

  return candidate.parameters.every(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as Partial<ParameterBackupEntry>).id === 'string' &&
      typeof (entry as Partial<ParameterBackupEntry>).value === 'number'
  )
}

function isSnapshotExcludedParameterState(parameter: ParameterState): boolean {
  return parameter.definition?.snapshotExcluded === true || SNAPSHOT_EXCLUDED_PREFIXES.some((prefix) => parameter.id.startsWith(prefix))
}

function isSnapshotExcludedBackupEntry(entry: ParameterBackupEntry): boolean {
  return SNAPSHOT_EXCLUDED_PREFIXES.some((prefix) => entry.id.startsWith(prefix))
}

function parameterValuesMatch(left: number, right: number, tolerance = SNAPSHOT_COMPARE_TOLERANCE): boolean {
  return Object.is(left, right) || Math.abs(left - right) <= tolerance
}
