import {
  createParameterSnapshot,
  createParameterSnapshotLibrary,
  type ParameterSnapshotCreateOptions,
  parseParameterSnapshotLibrary,
  serializeParameterSnapshotLibrary,
  sortParameterSnapshots,
  type ParameterBackupFile,
  type ParameterSnapshotRecord,
} from '@arduconfig/ardupilot-core'

export type SavedSnapshotSource = ParameterSnapshotRecord['source']
export type SavedParameterSnapshot = ParameterSnapshotRecord

interface LegacySavedParameterSnapshot {
  id: string
  label: string
  capturedAt: string
  source: 'captured' | 'imported'
  backup: ParameterBackupFile
}

interface LegacySavedSnapshotLibraryFile {
  schemaVersion: 1
  application: 'ArduConfigurator'
  snapshots: LegacySavedParameterSnapshot[]
}

const SNAPSHOT_LIBRARY_STORAGE_KEY = 'arduconfig:snapshot-library'

export function loadStoredSnapshots(): SavedParameterSnapshot[] {
  if (typeof window === 'undefined') {
    return []
  }

  const raw = window.localStorage.getItem(SNAPSHOT_LIBRARY_STORAGE_KEY)
  if (!raw) {
    return []
  }

  try {
    return parseParameterSnapshotLibrary(raw).snapshots
  } catch {
    return loadLegacyStoredSnapshots(raw)
  }
}

export function persistSnapshots(snapshots: SavedParameterSnapshot[]): void {
  if (typeof window === 'undefined') {
    return
  }

  const library = createParameterSnapshotLibrary('Browser Local Snapshot Library', snapshots)
  window.localStorage.setItem(SNAPSHOT_LIBRARY_STORAGE_KEY, serializeParameterSnapshotLibrary(library))
}

export function createSavedSnapshot(
  backup: ParameterBackupFile,
  label: string | undefined,
  source: SavedSnapshotSource,
  options: Omit<ParameterSnapshotCreateOptions, 'source'> = {}
): SavedParameterSnapshot {
  return createParameterSnapshot(backup, label, {
    ...options,
    source
  })
}

function loadLegacyStoredSnapshots(raw: string): SavedParameterSnapshot[] {
  try {
    const parsed = JSON.parse(raw) as Partial<LegacySavedSnapshotLibraryFile>
    if (parsed.schemaVersion !== 1 || parsed.application !== 'ArduConfigurator' || !Array.isArray(parsed.snapshots)) {
      return []
    }

    return sortParameterSnapshots(
      parsed.snapshots
        .filter(isLegacySavedParameterSnapshot)
        .map((snapshot) => ({
          id: snapshot.id,
          label: snapshot.label,
          capturedAt: snapshot.capturedAt,
          source: snapshot.source,
          note: undefined,
          tags: [],
          protected: false,
          backup: snapshot.backup
        }))
    )
  } catch {
    return []
  }
}

function isLegacySavedParameterSnapshot(value: unknown): value is LegacySavedParameterSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<LegacySavedParameterSnapshot>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.label === 'string' &&
    typeof candidate.capturedAt === 'string' &&
    (candidate.source === 'captured' || candidate.source === 'imported') &&
    typeof candidate.backup === 'object' &&
    candidate.backup !== null &&
    (candidate.backup as Partial<ParameterBackupFile>).application === 'ArduConfigurator' &&
    Array.isArray((candidate.backup as Partial<ParameterBackupFile>).parameters)
  )
}
