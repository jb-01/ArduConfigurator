import type { FirmwareMetadataBundle } from './types.js'

export const arducopterMetadata: FirmwareMetadataBundle = {
  firmware: 'ArduCopter',
  parameters: {
    FRAME_CLASS: {
      id: 'FRAME_CLASS',
      label: 'Frame Class',
      description: 'Primary airframe class for the vehicle.',
      category: 'airframe'
    },
    FRAME_TYPE: {
      id: 'FRAME_TYPE',
      label: 'Frame Type',
      description: 'Specific motor geometry within the selected frame class.',
      category: 'airframe'
    },
    AHRS_ORIENTATION: {
      id: 'AHRS_ORIENTATION',
      label: 'Board Orientation',
      description: 'Mounting orientation for the flight controller.',
      category: 'sensors'
    },
    COMPASS_USE: {
      id: 'COMPASS_USE',
      label: 'Compass Enabled',
      description: 'Primary compass enable state.',
      category: 'sensors'
    },
    BATT_MONITOR: {
      id: 'BATT_MONITOR',
      label: 'Battery Monitor',
      description: 'Battery sensing source configuration.',
      category: 'power'
    },
    BATT_CAPACITY: {
      id: 'BATT_CAPACITY',
      label: 'Battery Capacity',
      description: 'Nominal battery capacity used for failsafe and remaining estimate.',
      category: 'power',
      unit: 'mAh'
    },
    BATT_FS_LOW_ACT: {
      id: 'BATT_FS_LOW_ACT',
      label: 'Low Battery Failsafe Action',
      description: 'Action taken when the low battery failsafe threshold is reached.',
      category: 'failsafe'
    },
    FLTMODE1: {
      id: 'FLTMODE1',
      label: 'Flight Mode 1',
      description: 'Mode assigned to the first switch position.',
      category: 'modes'
    },
    FLTMODE2: {
      id: 'FLTMODE2',
      label: 'Flight Mode 2',
      description: 'Mode assigned to the second switch position.',
      category: 'modes'
    },
    FLTMODE3: {
      id: 'FLTMODE3',
      label: 'Flight Mode 3',
      description: 'Mode assigned to the third switch position.',
      category: 'modes'
    },
    FS_THR_ENABLE: {
      id: 'FS_THR_ENABLE',
      label: 'Throttle Failsafe',
      description: 'Throttle failsafe enable behavior.',
      category: 'failsafe'
    },
    RC1_MIN: {
      id: 'RC1_MIN',
      label: 'RC1 Minimum',
      description: 'Minimum calibrated value for roll input.',
      category: 'radio'
    },
    RC1_MAX: {
      id: 'RC1_MAX',
      label: 'RC1 Maximum',
      description: 'Maximum calibrated value for roll input.',
      category: 'radio'
    },
    RC1_TRIM: {
      id: 'RC1_TRIM',
      label: 'RC1 Trim',
      description: 'Center trim value for roll input.',
      category: 'radio'
    },
    RC3_MIN: {
      id: 'RC3_MIN',
      label: 'RC3 Minimum',
      description: 'Minimum calibrated value for throttle input.',
      category: 'radio'
    },
    RC3_MAX: {
      id: 'RC3_MAX',
      label: 'RC3 Maximum',
      description: 'Maximum calibrated value for throttle input.',
      category: 'radio'
    },
    RC3_TRIM: {
      id: 'RC3_TRIM',
      label: 'RC3 Trim',
      description: 'Center trim value for throttle input.',
      category: 'radio'
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
