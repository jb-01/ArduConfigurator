export const ARDUCOPTER_FLIGHT_MODE_LABELS: Record<number, string> = {
  0: 'Stabilize',
  1: 'Acro',
  2: 'AltHold',
  3: 'Auto',
  4: 'Guided',
  5: 'Loiter',
  6: 'RTL',
  7: 'Circle',
  9: 'Land',
  11: 'Drift',
  13: 'Sport',
  14: 'Flip',
  15: 'AutoTune',
  16: 'PosHold',
  17: 'Brake',
  18: 'Throw',
  19: 'Avoid ADS-B',
  20: 'Guided NoGPS',
  21: 'SmartRTL',
  22: 'FlowHold',
  23: 'Follow',
  24: 'ZigZag',
  25: 'SystemID',
  26: 'Heli Autorotate',
  27: 'Auto RTL',
  28: 'Turtle'
}

export const ARDUCOPTER_BATTERY_FAILSAFE_ACTION_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Land',
  2: 'RTL',
  3: 'SmartRTL or RTL',
  4: 'SmartRTL or Land',
  5: 'Terminate',
  6: 'Auto DO_LAND_START or RTL',
  7: 'Brake or Land'
}

export const ARDUCOPTER_THROTTLE_FAILSAFE_LABELS: Record<number, string> = {
  0: 'Disabled',
  1: 'Always RTL',
  2: 'Continue Mission in Auto (removed in 4.0+)',
  3: 'Always Land',
  4: 'SmartRTL or RTL',
  5: 'SmartRTL or Land',
  6: 'Auto DO_LAND_START or RTL',
  7: 'Brake or Land'
}

export function arducopterFlightModeLabel(modeNumber: number | undefined): string | undefined {
  if (modeNumber === undefined) {
    return undefined
  }

  return ARDUCOPTER_FLIGHT_MODE_LABELS[modeNumber]
}

export function formatArducopterFlightMode(modeNumber: number | undefined): string {
  return arducopterFlightModeLabel(modeNumber) ?? (modeNumber === undefined ? 'Unknown' : `Mode ${modeNumber}`)
}

export function formatArducopterBatteryFailsafeAction(value: number | undefined): string {
  return ARDUCOPTER_BATTERY_FAILSAFE_ACTION_LABELS[value ?? Number.NaN] ?? (value === undefined ? 'Unknown' : `Action ${value}`)
}

export function formatArducopterThrottleFailsafe(value: number | undefined): string {
  return ARDUCOPTER_THROTTLE_FAILSAFE_LABELS[value ?? Number.NaN] ?? (value === undefined ? 'Unknown' : `Setting ${value}`)
}
