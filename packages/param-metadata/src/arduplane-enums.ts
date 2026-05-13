// ArduPlane flight mode labels. Sourced from ArduPilot's mode_reason / Plane
// firmware mode tables. Keys are the numeric mode values reported by
// HEARTBEAT.custom_mode and the FLTMODE<n> parameter family on Plane builds.
//
// This module is the first piece of multi-firmware metadata in the catalog and
// is currently consumed only via direct imports for follow-up work (Modes view
// firmware-aware label resolution). The arducopter metadata bundle remains the
// default for now.
export const ARDUPLANE_FLIGHT_MODE_LABELS: Record<number, string> = {
  0: 'Manual',
  1: 'Circle',
  2: 'Stabilize',
  3: 'Training',
  4: 'Acro',
  5: 'FBWA',
  6: 'FBWB',
  7: 'Cruise',
  8: 'Autotune',
  10: 'Auto',
  11: 'RTL',
  12: 'Loiter',
  13: 'Takeoff',
  14: 'Avoid ADS-B',
  15: 'Guided',
  16: 'Initialising',
  17: 'QStabilize',
  18: 'QHover',
  19: 'QLoiter',
  20: 'QLand',
  21: 'QRTL',
  22: 'QAutotune',
  23: 'QAcro',
  24: 'Thermal',
  25: 'Loiter alt to QLand'
}

export function arduplaneFlightModeLabel(modeNumber: number | undefined): string | undefined {
  return modeNumber === undefined ? undefined : ARDUPLANE_FLIGHT_MODE_LABELS[modeNumber]
}

export function formatArduplaneFlightMode(modeNumber: number | undefined): string {
  return arduplaneFlightModeLabel(modeNumber) ?? (modeNumber === undefined ? 'Unknown' : `Mode ${modeNumber}`)
}
