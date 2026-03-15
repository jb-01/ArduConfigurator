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

export const ARDUCOPTER_FRAME_CLASS_LABELS: Record<number, string> = {
  0: 'Undefined',
  1: 'Quad',
  2: 'Hexa',
  3: 'Octa',
  4: 'OctaQuad',
  5: 'Y6',
  6: 'Heli',
  7: 'Tri',
  8: 'SingleCopter',
  9: 'CoaxCopter',
  10: 'BiCopter',
  11: 'Heli Dual',
  12: 'DodecaHexa',
  13: 'HeliQuad',
  14: 'Deca',
  15: 'Scripting Matrix',
  16: '6DoF Scripting',
  17: 'Dynamic Scripting Matrix'
}

export const ARDUCOPTER_FRAME_TYPE_LABELS: Record<number, string> = {
  0: 'Plus',
  1: 'X',
  2: 'V',
  3: 'H',
  4: 'V-Tail',
  5: 'A-Tail',
  10: 'Y6B',
  11: 'Y6F',
  12: 'BetaFlight X',
  13: 'DJI X',
  14: 'Clockwise X',
  15: 'I',
  18: 'BetaFlight X Reversed',
  19: 'Y4'
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

export const ARDUCOPTER_BATTERY_MONITOR_LABELS: Record<number, string> = {
  0: 'Disabled',
  3: 'Analog Voltage Only',
  4: 'Analog Voltage and Current',
  5: 'Solo',
  6: 'Bebop',
  7: 'SMBus-Generic',
  8: 'DroneCAN BatteryInfo',
  9: 'ESC Telemetry',
  10: 'Sum Of Selected Monitors',
  11: 'Fuel Flow',
  12: 'Fuel Level PWM',
  13: 'SMBus SUI3',
  14: 'SMBus SUI6',
  15: 'NeoDesign',
  16: 'SMBus Maxell',
  17: 'Generator Electrical',
  18: 'Generator Fuel',
  19: 'Rotoye',
  20: 'MPPT',
  21: 'INA2XX',
  22: 'LTC2946',
  23: 'Torqeedo',
  24: 'Fuel Level Analog'
}

export const ARDUCOPTER_BATTERY_VOLTAGE_SOURCE_LABELS: Record<number, string> = {
  0: 'Raw Voltage',
  1: 'Sag Compensated Voltage'
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

export const ARDUCOPTER_MOT_PWM_TYPE_LABELS: Record<number, string> = {
  0: 'Normal',
  1: 'OneShot',
  2: 'OneShot125',
  3: 'Brushed',
  4: 'DShot150',
  5: 'DShot300',
  6: 'DShot600',
  7: 'DShot1200',
  8: 'PWMRange'
}

export const ARDUCOPTER_SERIAL_PROTOCOL_LABELS: Record<number, string> = {
  [-1]: 'None',
  1: 'MAVLink1',
  2: 'MAVLink2',
  3: 'FrSky D',
  4: 'FrSky SPort',
  5: 'GPS',
  7: 'AlexMos Gimbal',
  8: 'SToRM32 Gimbal',
  9: 'Lidar',
  10: 'FrSky Passthrough',
  13: 'Beacon',
  14: 'Volz',
  15: 'SBUS Servo Out',
  16: 'ESC Telemetry',
  17: 'Devo Telemetry',
  18: 'OpticalFlow',
  19: 'Robotis',
  20: 'MSP',
  21: 'IMU MSP',
  22: 'DisplayPort',
  23: 'CRSF',
  24: 'FrSky FPort',
  25: 'FrSky SPort',
  26: 'LTM',
  27: 'RunCam',
  28: 'HOTT',
  29: 'Scripting',
  30: 'Crossfire VTX',
  31: 'Generator',
  32: 'Winch',
  33: 'SBus Servo In',
  34: 'DJI FPV',
  35: 'Airspeed',
  36: 'ADSB',
  37: 'AHRS',
  38: 'SmartAudio',
  39: 'FrSky SPort With Passthrough',
  40: 'IRC Tramp',
  41: 'RangeFinder',
  42: 'Vision Position',
  43: 'Audio VTX',
  44: 'HoTT Telemetry',
  45: 'DDS XRCE',
  46: 'IMU Data',
  48: 'PPP',
  49: 'i-BUS Telemetry',
  50: 'IOMCU'
}

export const ARDUCOPTER_SERIAL_BAUD_LABELS: Record<number, string> = {
  1: '1,200',
  2: '2,400',
  4: '4,800',
  9: '9,600',
  19: '19,200',
  38: '38,400',
  57: '57,600',
  111: '111,100',
  115: '115,200',
  230: '230,400',
  256: '256,000',
  460: '460,800',
  500: '500,000',
  921: '921,600',
  1500: '1,500,000',
  2000: '2,000,000'
}

export const ARDUCOPTER_SERIAL_RTSCTS_LABELS: Record<number, string> = {
  0: 'Disabled',
  1: 'Enabled',
  2: 'Auto',
  3: 'RS-485 RTS'
}

export const ARDUCOPTER_GPS_TYPE_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Auto',
  2: 'u-blox',
  3: 'SBF',
  4: 'GSOF',
  5: 'NMEA',
  6: 'SiRF',
  7: 'HIL',
  8: 'SwiftNav',
  9: 'DroneCAN',
  10: 'MAV',
  11: 'ERB',
  13: 'Nova',
  14: 'Hemisphere NMEA',
  15: 'u-blox Moving Baseline Base',
  16: 'u-blox Moving Baseline Rover',
  17: 'MSP',
  18: 'AllyStar',
  19: 'ExternalAHRS',
  20: 'NMEA Unicore',
  21: 'Rover Moving Baseline Base',
  22: 'Rover Moving Baseline Rover',
  23: 'Septentrio',
  24: 'Unicore Moving Baseline Base',
  25: 'Unicore Moving Baseline Rover'
}

export const ARDUCOPTER_GPS_AUTO_CONFIG_LABELS: Record<number, string> = {
  0: 'Disabled',
  1: 'Serial GPS Only',
  2: 'Serial + DroneCAN',
  3: 'Clear Non-ArduPilot Config'
}

export const ARDUCOPTER_GPS_AUTO_SWITCH_LABELS: Record<number, string> = {
  0: 'Use Primary',
  1: 'Use Best',
  2: 'Blend',
  4: 'Primary if 3D Fix+'
}

export const ARDUCOPTER_GPS_PRIMARY_LABELS: Record<number, string> = {
  0: 'First GPS',
  1: 'Second GPS'
}

export const ARDUCOPTER_GPS_RATE_MS_LABELS: Record<number, string> = {
  50: '20 Hz',
  100: '10 Hz',
  125: '8 Hz',
  200: '5 Hz'
}

export const ARDUCOPTER_OSD_TYPE_LABELS: Record<number, string> = {
  0: 'Disabled',
  1: 'MAX7456',
  2: 'SITL',
  3: 'MSP',
  4: 'TXONLY',
  5: 'MSP DisplayPort'
}

export const ARDUCOPTER_OSD_CHANNEL_LABELS: Record<number, string> = {
  0: 'Disabled',
  5: 'Channel 5',
  6: 'Channel 6',
  7: 'Channel 7',
  8: 'Channel 8',
  9: 'Channel 9',
  10: 'Channel 10',
  11: 'Channel 11',
  12: 'Channel 12',
  13: 'Channel 13',
  14: 'Channel 14',
  15: 'Channel 15',
  16: 'Channel 16'
}

export const ARDUCOPTER_OSD_SWITCH_METHOD_LABELS: Record<number, string> = {
  0: 'Advance On Change',
  1: 'Select By PWM Range',
  2: 'Advance On High Pulse'
}

export const ARDUCOPTER_MSP_OSD_CELL_COUNT_LABELS: Record<number, string> = {
  0: 'Auto',
  1: '1 cell',
  2: '2 cells',
  3: '3 cells',
  4: '4 cells',
  5: '5 cells',
  6: '6 cells',
  7: '7 cells',
  8: '8 cells',
  9: '9 cells',
  10: '10 cells',
  11: '11 cells',
  12: '12 cells',
  13: '13 cells',
  14: '14 cells'
}

export const ARDUCOPTER_VTX_ENABLE_LABELS: Record<number, string> = {
  0: 'Disabled',
  1: 'Enabled'
}

export const ARDUCOPTER_MSP_OPTION_BIT_LABELS: Record<number, string> = {
  0: 'Telemetry Mode',
  1: 'Disable DJI Workarounds',
  2: 'Betaflight Fonts'
}

export const ARDUCOPTER_RSSI_TYPE_LABELS: Record<number, string> = {
  0: 'Disabled',
  1: 'Analog Pin',
  2: 'RC Channel PWM',
  3: 'Receiver Protocol',
  4: 'PWM Input Pin'
}

export const ARDUCOPTER_NOTIFICATION_LED_TYPE_BIT_LABELS: Record<number, string> = {
  0: 'Built-in LED',
  5: 'DroneCAN',
  8: 'NeoPixel',
  9: 'ProfiLED',
  10: 'Scripting',
  11: 'DShot',
  12: 'ProfiLED SPI'
}

export const ARDUCOPTER_NOTIFICATION_BUZZER_TYPE_BIT_LABELS: Record<number, string> = {
  0: 'Built-in Buzzer',
  1: 'DShot',
  2: 'DroneCAN'
}

export const ARDUCOPTER_NOTIFICATION_LED_BRIGHTNESS_LABELS: Record<number, string> = {
  0: 'Off',
  1: 'Low',
  2: 'Medium',
  3: 'High'
}

export const ARDUCOPTER_NOTIFICATION_LED_OVERRIDE_LABELS: Record<number, string> = {
  0: 'Standard',
  1: 'MAVLink / Scripting / AP_Periph',
  2: 'Outback Challenge',
  3: 'Traffic Light'
}

export const ARDUCOPTER_FLTMODE_CHANNEL_LABELS: Record<number, string> = {
  0: 'Disabled',
  1: 'Channel 1',
  2: 'Channel 2',
  3: 'Channel 3',
  4: 'Channel 4',
  5: 'Channel 5',
  6: 'Channel 6',
  7: 'Channel 7',
  8: 'Channel 8',
  9: 'Channel 9',
  10: 'Channel 10',
  11: 'Channel 11',
  12: 'Channel 12',
  13: 'Channel 13',
  14: 'Channel 14',
  15: 'Channel 15',
  16: 'Channel 16'
}

export const ARDUCOPTER_SERVO_FUNCTION_LABELS: Record<number, string> = {
  [-1]: 'GPIO',
  0: 'Disabled',
  1: 'RCPassThru',
  6: 'Mount Yaw',
  7: 'Mount Pitch',
  8: 'Mount Roll',
  9: 'Mount Deploy/Retract',
  10: 'Camera Trigger',
  12: 'Mount2 Yaw',
  13: 'Mount2 Pitch',
  14: 'Mount2 Roll',
  15: 'Mount2 Deploy/Retract',
  27: 'Parachute Release',
  29: 'Landing Gear',
  30: 'Motor Enable Switch',
  31: 'Rotor Head Speed',
  32: 'Tail Rotor Speed',
  33: 'Motor 1',
  34: 'Motor 2',
  35: 'Motor 3',
  36: 'Motor 4',
  37: 'Motor 5',
  38: 'Motor 6',
  39: 'Motor 7',
  40: 'Motor 8',
  41: 'Motor Tilt',
  45: 'Tilt Motor Rear',
  46: 'Tilt Motor Rear Left',
  47: 'Tilt Motor Rear Right',
  51: 'RCPassThru1',
  52: 'RCPassThru2',
  53: 'RCPassThru3',
  54: 'RCPassThru4',
  55: 'RCPassThru5',
  56: 'RCPassThru6',
  57: 'RCPassThru7',
  58: 'RCPassThru8',
  59: 'RCPassThru9',
  60: 'RCPassThru10',
  61: 'RCPassThru11',
  62: 'RCPassThru12',
  63: 'RCPassThru13',
  64: 'RCPassThru14',
  65: 'RCPassThru15',
  66: 'RCPassThru16',
  70: 'Throttle',
  73: 'Throttle Left',
  74: 'Throttle Right',
  75: 'Tilt Motor Left',
  76: 'Tilt Motor Right',
  81: 'Boost Engine Throttle',
  82: 'Motor 9',
  83: 'Motor 10',
  84: 'Motor 11',
  85: 'Motor 12',
  88: 'Winch',
  90: 'Camera ISO',
  91: 'Camera Aperture',
  92: 'Camera Focus',
  93: 'Camera Shutter Speed',
  120: 'NeoPixel 1',
  121: 'NeoPixel 2',
  122: 'NeoPixel 3',
  123: 'NeoPixel 4',
  140: 'RCIN1Scaled',
  141: 'RCIN2Scaled',
  142: 'RCIN3Scaled',
  143: 'RCIN4Scaled',
  144: 'RCIN5Scaled',
  145: 'RCIN6Scaled',
  146: 'RCIN7Scaled',
  147: 'RCIN8Scaled',
  148: 'RCIN9Scaled',
  149: 'RCIN10Scaled',
  150: 'RCIN11Scaled',
  151: 'RCIN12Scaled',
  152: 'RCIN13Scaled',
  153: 'RCIN14Scaled',
  154: 'RCIN15Scaled',
  155: 'RCIN16Scaled'
}

export function arducopterFlightModeLabel(modeNumber: number | undefined): string | undefined {
  if (modeNumber === undefined) {
    return undefined
  }

  return ARDUCOPTER_FLIGHT_MODE_LABELS[modeNumber]
}

export function arducopterFrameClassLabel(value: number | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  return ARDUCOPTER_FRAME_CLASS_LABELS[value]
}

export function arducopterFrameTypeLabel(value: number | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  return ARDUCOPTER_FRAME_TYPE_LABELS[value]
}

export function formatArducopterFrameClass(value: number | undefined): string {
  return arducopterFrameClassLabel(value) ?? (value === undefined ? 'Unknown' : `Frame class ${value}`)
}

export function formatArducopterFrameType(value: number | undefined): string {
  return arducopterFrameTypeLabel(value) ?? (value === undefined ? 'Unknown' : `Frame type ${value}`)
}

export function expectedMotorCountForArducopterFrameClass(value: number | undefined): number | undefined {
  switch (value) {
    case 1:
      return 4
    case 2:
      return 6
    case 3:
      return 8
    case 4:
      return 8
    case 5:
      return 6
    case 7:
      return 3
    case 8:
      return 1
    case 9:
      return 2
    case 10:
      return 2
    case 12:
      return 12
    case 14:
      return 10
    default:
      return undefined
  }
}

export function isArducopterFrameTypeIgnored(frameClass: number | undefined): boolean {
  return frameClass === 5 || frameClass === 6 || frameClass === 7 || frameClass === 8 || frameClass === 9 || frameClass === 10
}

export function arducopterServoFunctionLabel(value: number | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  return ARDUCOPTER_SERVO_FUNCTION_LABELS[value]
}

export function arducopterMotorPwmTypeLabel(value: number | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  return ARDUCOPTER_MOT_PWM_TYPE_LABELS[value]
}

export function formatArducopterMotorPwmType(value: number | undefined): string {
  return arducopterMotorPwmTypeLabel(value) ?? (value === undefined ? 'Unknown' : `PWM type ${value}`)
}

export function arducopterSerialProtocolLabel(value: number | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  return ARDUCOPTER_SERIAL_PROTOCOL_LABELS[value]
}

export function formatArducopterSerialProtocol(value: number | undefined): string {
  return arducopterSerialProtocolLabel(value) ?? (value === undefined ? 'Unknown' : `Protocol ${value}`)
}

export function arducopterSerialBaudLabel(value: number | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  return ARDUCOPTER_SERIAL_BAUD_LABELS[value]
}

export function formatArducopterSerialBaud(value: number | undefined): string {
  const label = arducopterSerialBaudLabel(value)
  return label ? `${label} baud` : value === undefined ? 'Unknown' : `${value} baud`
}

export function arducopterSerialRtsctsLabel(value: number | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  return ARDUCOPTER_SERIAL_RTSCTS_LABELS[value]
}

export function formatArducopterSerialRtscts(value: number | undefined): string {
  return arducopterSerialRtsctsLabel(value) ?? (value === undefined ? 'Unknown' : `Flow ${value}`)
}

export function arducopterGpsTypeLabel(value: number | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  return ARDUCOPTER_GPS_TYPE_LABELS[value]
}

export function formatArducopterGpsType(value: number | undefined): string {
  return arducopterGpsTypeLabel(value) ?? (value === undefined ? 'Unknown' : `GPS ${value}`)
}

export function formatArducopterGpsAutoConfig(value: number | undefined): string {
  return ARDUCOPTER_GPS_AUTO_CONFIG_LABELS[value ?? Number.NaN] ?? (value === undefined ? 'Unknown' : `Auto config ${value}`)
}

export function formatArducopterGpsAutoSwitch(value: number | undefined): string {
  return ARDUCOPTER_GPS_AUTO_SWITCH_LABELS[value ?? Number.NaN] ?? (value === undefined ? 'Unknown' : `Switch ${value}`)
}

export function formatArducopterGpsPrimary(value: number | undefined): string {
  return ARDUCOPTER_GPS_PRIMARY_LABELS[value ?? Number.NaN] ?? (value === undefined ? 'Unknown' : `Primary ${value}`)
}

export function formatArducopterGpsRateMs(value: number | undefined): string {
  const label = ARDUCOPTER_GPS_RATE_MS_LABELS[value ?? Number.NaN]
  return label ?? (value === undefined ? 'Unknown' : `${value} ms`)
}

export function formatArducopterOsdType(value: number | undefined): string {
  return ARDUCOPTER_OSD_TYPE_LABELS[value ?? Number.NaN] ?? (value === undefined ? 'Unknown' : `OSD ${value}`)
}

export function formatArducopterOsdChannel(value: number | undefined): string {
  return ARDUCOPTER_OSD_CHANNEL_LABELS[value ?? Number.NaN] ?? (value === undefined ? 'Unknown' : `Channel ${value}`)
}

export function formatArducopterOsdSwitchMethod(value: number | undefined): string {
  return ARDUCOPTER_OSD_SWITCH_METHOD_LABELS[value ?? Number.NaN] ?? (value === undefined ? 'Unknown' : `Method ${value}`)
}

export function formatArducopterMspOsdCellCount(value: number | undefined): string {
  return ARDUCOPTER_MSP_OSD_CELL_COUNT_LABELS[value ?? Number.NaN] ?? (value === undefined ? 'Unknown' : `${value} cells`)
}

export function formatArducopterVtxEnable(value: number | undefined): string {
  return ARDUCOPTER_VTX_ENABLE_LABELS[value ?? Number.NaN] ?? (value === undefined ? 'Unknown' : `State ${value}`)
}

export function formatArducopterRssiType(value: number | undefined): string {
  return ARDUCOPTER_RSSI_TYPE_LABELS[value ?? Number.NaN] ?? (value === undefined ? 'Unknown' : `RSSI ${value}`)
}

export function formatArducopterNotificationLedBrightness(value: number | undefined): string {
  return ARDUCOPTER_NOTIFICATION_LED_BRIGHTNESS_LABELS[value ?? Number.NaN] ?? (value === undefined ? 'Unknown' : `Brightness ${value}`)
}

export function formatArducopterNotificationLedOverride(value: number | undefined): string {
  return ARDUCOPTER_NOTIFICATION_LED_OVERRIDE_LABELS[value ?? Number.NaN] ?? (value === undefined ? 'Unknown' : `Source ${value}`)
}

export function formatArducopterFlightModeChannel(value: number | undefined): string {
  return ARDUCOPTER_FLTMODE_CHANNEL_LABELS[value ?? Number.NaN] ?? (value === undefined ? 'Unknown' : `Channel ${value}`)
}

export function arducopterMotorNumberForServoFunction(value: number | undefined): number | undefined {
  switch (value) {
    case 33:
      return 1
    case 34:
      return 2
    case 35:
      return 3
    case 36:
      return 4
    case 37:
      return 5
    case 38:
      return 6
    case 39:
      return 7
    case 40:
      return 8
    case 82:
      return 9
    case 83:
      return 10
    case 84:
      return 11
    case 85:
      return 12
    default:
      return undefined
  }
}

export function formatArducopterServoFunction(value: number | undefined): string {
  return arducopterServoFunctionLabel(value) ?? (value === undefined ? 'Unknown' : `Function ${value}`)
}

export function formatArducopterFlightMode(modeNumber: number | undefined): string {
  return arducopterFlightModeLabel(modeNumber) ?? (modeNumber === undefined ? 'Unknown' : `Mode ${modeNumber}`)
}

export function formatArducopterBatteryFailsafeAction(value: number | undefined): string {
  return ARDUCOPTER_BATTERY_FAILSAFE_ACTION_LABELS[value ?? Number.NaN] ?? (value === undefined ? 'Unknown' : `Action ${value}`)
}

export function formatArducopterBatteryMonitor(value: number | undefined): string {
  return ARDUCOPTER_BATTERY_MONITOR_LABELS[value ?? Number.NaN] ?? (value === undefined ? 'Unknown' : `Monitor ${value}`)
}

export function formatArducopterBatteryVoltageSource(value: number | undefined): string {
  return ARDUCOPTER_BATTERY_VOLTAGE_SOURCE_LABELS[value ?? Number.NaN] ?? (value === undefined ? 'Unknown' : `Source ${value}`)
}

export function formatArducopterThrottleFailsafe(value: number | undefined): string {
  return ARDUCOPTER_THROTTLE_FAILSAFE_LABELS[value ?? Number.NaN] ?? (value === undefined ? 'Unknown' : `Setting ${value}`)
}
