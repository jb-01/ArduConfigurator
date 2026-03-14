import type { FirmwareMetadataBundle, ParameterValueOption } from './types.js'
import {
  ARDUCOPTER_BATTERY_FAILSAFE_ACTION_LABELS,
  ARDUCOPTER_FLIGHT_MODE_LABELS,
  ARDUCOPTER_FRAME_CLASS_LABELS,
  ARDUCOPTER_FRAME_TYPE_LABELS,
  ARDUCOPTER_SERVO_FUNCTION_LABELS,
  ARDUCOPTER_THROTTLE_FAILSAFE_LABELS,
} from './arducopter-enums.js'

const enabledDisabledOptions: ParameterValueOption[] = [
  { value: 0, label: 'Disabled' },
  { value: 1, label: 'Enabled' }
]

const rcEndpointNotes = [
  'Receiver endpoint changes should be followed by another live RC range verification pass.'
]

function enumOptions(labelMap: Record<number, string>): ParameterValueOption[] {
  return Object.entries(labelMap)
    .map(([value, label]) => ({
      value: Number(value),
      label
    }))
    .sort((left, right) => left.value - right.value)
}

export const arducopterMetadata: FirmwareMetadataBundle = {
  firmware: 'ArduCopter',
  parameters: {
    FRAME_CLASS: {
      id: 'FRAME_CLASS',
      label: 'Frame Class',
      description: 'Primary airframe class for the vehicle.',
      category: 'airframe',
      minimum: 0,
      maximum: 17,
      rebootRequired: true,
      notes: ['After changing frame geometry, refresh outputs and re-check motor direction before flight.'],
      options: enumOptions(ARDUCOPTER_FRAME_CLASS_LABELS)
    },
    FRAME_TYPE: {
      id: 'FRAME_TYPE',
      label: 'Frame Type',
      description: 'Specific motor geometry within the selected frame class.',
      category: 'airframe',
      minimum: 0,
      maximum: 19,
      rebootRequired: true,
      notes: ['Frame-type changes should be followed by a reboot and another output review.'],
      options: enumOptions(ARDUCOPTER_FRAME_TYPE_LABELS)
    },
    AHRS_ORIENTATION: {
      id: 'AHRS_ORIENTATION',
      label: 'Board Orientation',
      description: 'Mounting orientation for the flight controller.',
      category: 'sensors',
      notes: ['If the board orientation changes, repeat accelerometer calibration before flight.']
    },
    COMPASS_USE: {
      id: 'COMPASS_USE',
      label: 'Compass Enabled',
      description: 'Primary compass enable state.',
      category: 'sensors',
      minimum: 0,
      maximum: 1,
      options: enabledDisabledOptions
    },
    BATT_MONITOR: {
      id: 'BATT_MONITOR',
      label: 'Battery Monitor',
      description: 'Battery sensing source configuration.',
      category: 'power',
      minimum: 0,
      notes: ['Use a live powered session to confirm that the selected battery monitor is actually producing telemetry.']
    },
    BATT_CAPACITY: {
      id: 'BATT_CAPACITY',
      label: 'Battery Capacity',
      description: 'Nominal battery capacity used for failsafe and remaining estimate.',
      category: 'power',
      unit: 'mAh',
      minimum: 0,
      step: 1,
      notes: ['Match this to the pack capacity that the vehicle will actually fly with.']
    },
    BATT_FS_LOW_ACT: {
      id: 'BATT_FS_LOW_ACT',
      label: 'Low Battery Failsafe Action',
      description: 'Action taken when the low battery failsafe threshold is reached.',
      category: 'failsafe',
      minimum: 0,
      maximum: 7,
      options: enumOptions(ARDUCOPTER_BATTERY_FAILSAFE_ACTION_LABELS)
    },
    FLTMODE1: {
      id: 'FLTMODE1',
      label: 'Flight Mode 1',
      description: 'Mode assigned to the first switch position.',
      category: 'modes',
      options: enumOptions(ARDUCOPTER_FLIGHT_MODE_LABELS)
    },
    FLTMODE2: {
      id: 'FLTMODE2',
      label: 'Flight Mode 2',
      description: 'Mode assigned to the second switch position.',
      category: 'modes',
      options: enumOptions(ARDUCOPTER_FLIGHT_MODE_LABELS)
    },
    FLTMODE3: {
      id: 'FLTMODE3',
      label: 'Flight Mode 3',
      description: 'Mode assigned to the third switch position.',
      category: 'modes',
      options: enumOptions(ARDUCOPTER_FLIGHT_MODE_LABELS)
    },
    FS_THR_ENABLE: {
      id: 'FS_THR_ENABLE',
      label: 'Throttle Failsafe',
      description: 'Throttle failsafe enable behavior.',
      category: 'failsafe',
      minimum: 0,
      maximum: 7,
      options: enumOptions(ARDUCOPTER_THROTTLE_FAILSAFE_LABELS)
    },
    RC1_MIN: {
      id: 'RC1_MIN',
      label: 'RC1 Minimum',
      description: 'Minimum calibrated value for roll input.',
      category: 'radio',
      minimum: 800,
      maximum: 2200,
      step: 1,
      notes: rcEndpointNotes
    },
    RC1_MAX: {
      id: 'RC1_MAX',
      label: 'RC1 Maximum',
      description: 'Maximum calibrated value for roll input.',
      category: 'radio',
      minimum: 800,
      maximum: 2200,
      step: 1,
      notes: rcEndpointNotes
    },
    RC1_TRIM: {
      id: 'RC1_TRIM',
      label: 'RC1 Trim',
      description: 'Center trim value for roll input.',
      category: 'radio',
      minimum: 800,
      maximum: 2200,
      step: 1,
      notes: rcEndpointNotes
    },
    RC3_MIN: {
      id: 'RC3_MIN',
      label: 'RC3 Minimum',
      description: 'Minimum calibrated value for throttle input.',
      category: 'radio',
      minimum: 800,
      maximum: 2200,
      step: 1,
      notes: rcEndpointNotes
    },
    RC3_MAX: {
      id: 'RC3_MAX',
      label: 'RC3 Maximum',
      description: 'Maximum calibrated value for throttle input.',
      category: 'radio',
      minimum: 800,
      maximum: 2200,
      step: 1,
      notes: rcEndpointNotes
    },
    RC3_TRIM: {
      id: 'RC3_TRIM',
      label: 'RC3 Trim',
      description: 'Center trim value for throttle input.',
      category: 'radio',
      minimum: 800,
      maximum: 2200,
      step: 1,
      notes: rcEndpointNotes
    },
    SERVO1_FUNCTION: {
      id: 'SERVO1_FUNCTION',
      label: 'Output 1 Function',
      description: 'Assigned function for output channel 1.',
      category: 'outputs',
      notes: ['After remapping outputs, confirm the new assignment with a guarded motor or output review before flight.'],
      options: enumOptions(ARDUCOPTER_SERVO_FUNCTION_LABELS)
    },
    SERVO2_FUNCTION: {
      id: 'SERVO2_FUNCTION',
      label: 'Output 2 Function',
      description: 'Assigned function for output channel 2.',
      category: 'outputs',
      notes: ['After remapping outputs, confirm the new assignment with a guarded motor or output review before flight.'],
      options: enumOptions(ARDUCOPTER_SERVO_FUNCTION_LABELS)
    },
    SERVO3_FUNCTION: {
      id: 'SERVO3_FUNCTION',
      label: 'Output 3 Function',
      description: 'Assigned function for output channel 3.',
      category: 'outputs',
      notes: ['After remapping outputs, confirm the new assignment with a guarded motor or output review before flight.'],
      options: enumOptions(ARDUCOPTER_SERVO_FUNCTION_LABELS)
    },
    SERVO4_FUNCTION: {
      id: 'SERVO4_FUNCTION',
      label: 'Output 4 Function',
      description: 'Assigned function for output channel 4.',
      category: 'outputs',
      notes: ['After remapping outputs, confirm the new assignment with a guarded motor or output review before flight.'],
      options: enumOptions(ARDUCOPTER_SERVO_FUNCTION_LABELS)
    },
    SERVO5_FUNCTION: {
      id: 'SERVO5_FUNCTION',
      label: 'Output 5 Function',
      description: 'Assigned function for output channel 5.',
      category: 'outputs',
      notes: ['After remapping outputs, confirm the new assignment with a guarded motor or output review before flight.'],
      options: enumOptions(ARDUCOPTER_SERVO_FUNCTION_LABELS)
    },
    SERVO6_FUNCTION: {
      id: 'SERVO6_FUNCTION',
      label: 'Output 6 Function',
      description: 'Assigned function for output channel 6.',
      category: 'outputs',
      notes: ['After remapping outputs, confirm the new assignment with a guarded motor or output review before flight.'],
      options: enumOptions(ARDUCOPTER_SERVO_FUNCTION_LABELS)
    },
    SERVO7_FUNCTION: {
      id: 'SERVO7_FUNCTION',
      label: 'Output 7 Function',
      description: 'Assigned function for output channel 7.',
      category: 'outputs',
      notes: ['After remapping outputs, confirm the new assignment with a guarded motor or output review before flight.'],
      options: enumOptions(ARDUCOPTER_SERVO_FUNCTION_LABELS)
    },
    SERVO8_FUNCTION: {
      id: 'SERVO8_FUNCTION',
      label: 'Output 8 Function',
      description: 'Assigned function for output channel 8.',
      category: 'outputs',
      notes: ['After remapping outputs, confirm the new assignment with a guarded motor or output review before flight.'],
      options: enumOptions(ARDUCOPTER_SERVO_FUNCTION_LABELS)
    },
    SERVO9_FUNCTION: {
      id: 'SERVO9_FUNCTION',
      label: 'Output 9 Function',
      description: 'Assigned function for output channel 9.',
      category: 'outputs',
      notes: ['After remapping outputs, confirm the new assignment with a guarded motor or output review before flight.'],
      options: enumOptions(ARDUCOPTER_SERVO_FUNCTION_LABELS)
    },
    SERVO10_FUNCTION: {
      id: 'SERVO10_FUNCTION',
      label: 'Output 10 Function',
      description: 'Assigned function for output channel 10.',
      category: 'outputs',
      notes: ['After remapping outputs, confirm the new assignment with a guarded motor or output review before flight.'],
      options: enumOptions(ARDUCOPTER_SERVO_FUNCTION_LABELS)
    },
    SERVO11_FUNCTION: {
      id: 'SERVO11_FUNCTION',
      label: 'Output 11 Function',
      description: 'Assigned function for output channel 11.',
      category: 'outputs',
      notes: ['After remapping outputs, confirm the new assignment with a guarded motor or output review before flight.'],
      options: enumOptions(ARDUCOPTER_SERVO_FUNCTION_LABELS)
    },
    SERVO12_FUNCTION: {
      id: 'SERVO12_FUNCTION',
      label: 'Output 12 Function',
      description: 'Assigned function for output channel 12.',
      category: 'outputs',
      notes: ['After remapping outputs, confirm the new assignment with a guarded motor or output review before flight.'],
      options: enumOptions(ARDUCOPTER_SERVO_FUNCTION_LABELS)
    }
  },
  setupSections: [
    {
      id: 'link',
      title: 'Vehicle Link',
      description: 'Bring the vehicle online and pull the first parameter snapshot.',
      requiredParameters: [],
      actions: ['request-parameters']
    },
    {
      id: 'airframe',
      title: 'Airframe',
      description: 'Verify the frame class and geometry before motor output setup.',
      requiredParameters: ['FRAME_CLASS', 'FRAME_TYPE']
    },
    {
      id: 'outputs',
      title: 'Outputs',
      description: 'Review the primary motor and peripheral output assignments before any props-on testing.',
      requiredParameters: ['SERVO1_FUNCTION', 'SERVO2_FUNCTION', 'SERVO3_FUNCTION', 'SERVO4_FUNCTION'],
      sessionOverrides: {
        'usb-bench': {
          notes: ['USB-only bench session: output review is configuration-only. Keep props removed for any later output testing.']
        }
      }
    },
    {
      id: 'accelerometer',
      title: 'Accelerometer Calibration',
      description: 'Complete IMU calibration before tuning or arming.',
      requiredParameters: ['AHRS_ORIENTATION'],
      completionStatusTexts: ['Accelerometer calibration complete.'],
      actions: ['calibrate-accelerometer']
    },
    {
      id: 'compass',
      title: 'Compass Calibration',
      description: 'Confirm the compass is enabled and calibrated.',
      requiredParameters: ['COMPASS_USE'],
      completionStatusTexts: ['Compass calibration complete.'],
      sessionOverrides: {
        'usb-bench': {
          notes: ['USB-only bench session: external compass hardware may be unpowered, so final sensor verification may still need full vehicle power.']
        }
      },
      actions: ['calibrate-compass']
    },
    {
      id: 'radio',
      title: 'Radio',
      description: 'Inspect primary RC channel calibration.',
      requiredParameters: ['RC1_MIN', 'RC1_MAX', 'RC1_TRIM', 'RC3_MIN', 'RC3_MAX', 'RC3_TRIM'],
      requiredLiveSignals: ['rc-input'],
      sessionOverrides: {
        'usb-bench': {
          notes: ['USB-only bench session: RC receiver inputs are not treated as verified until the receiver and control link are powered.']
        }
      }
    },
    {
      id: 'failsafe',
      title: 'Failsafe',
      description: 'Review throttle and battery failsafe behavior.',
      requiredParameters: ['FS_THR_ENABLE', 'BATT_FS_LOW_ACT'],
      requiredLiveSignals: ['rc-input', 'battery-telemetry'],
      sessionOverrides: {
        'usb-bench': {
          notes: ['USB-only bench session: throttle and battery failsafe behavior still need live verification with the receiver and battery monitor powered.']
        }
      }
    },
    {
      id: 'modes',
      title: 'Flight Modes',
      description: 'Check the first three mapped flight modes.',
      requiredParameters: ['FLTMODE1', 'FLTMODE2', 'FLTMODE3'],
      requiredLiveSignals: ['rc-input'],
      sessionOverrides: {
        'usb-bench': {
          notes: ['USB-only bench session: flight-mode switch mapping remains unverified until live RC inputs are available.']
        }
      }
    },
    {
      id: 'power',
      title: 'Battery',
      description: 'Validate battery monitoring before flight.',
      requiredParameters: ['BATT_MONITOR', 'BATT_CAPACITY'],
      requiredLiveSignals: ['battery-telemetry'],
      sessionOverrides: {
        'usb-bench': {
          notes: ['USB-only bench session: battery monitor and peripheral power checks are deferred until the flight battery is connected.']
        }
      },
      actions: ['reboot-autopilot']
    }
  ]
}
