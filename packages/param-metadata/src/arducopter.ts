import type { FirmwareMetadataBundle, ParameterValueOption } from './types.js'
import {
  ARDUCOPTER_BATTERY_FAILSAFE_ACTION_LABELS,
  ARDUCOPTER_BATTERY_MONITOR_LABELS,
  ARDUCOPTER_BATTERY_VOLTAGE_SOURCE_LABELS,
  ARDUCOPTER_FLTMODE_CHANNEL_LABELS,
  ARDUCOPTER_FLIGHT_MODE_LABELS,
  ARDUCOPTER_FRAME_CLASS_LABELS,
  ARDUCOPTER_FRAME_TYPE_LABELS,
  ARDUCOPTER_GPS_AUTO_CONFIG_LABELS,
  ARDUCOPTER_GPS_AUTO_SWITCH_LABELS,
  ARDUCOPTER_GPS_PRIMARY_LABELS,
  ARDUCOPTER_GPS_RATE_MS_LABELS,
  ARDUCOPTER_GPS_TYPE_LABELS,
  ARDUCOPTER_MSP_OSD_CELL_COUNT_LABELS,
  ARDUCOPTER_MOT_PWM_TYPE_LABELS,
  ARDUCOPTER_NOTIFICATION_LED_BRIGHTNESS_LABELS,
  ARDUCOPTER_NOTIFICATION_LED_OVERRIDE_LABELS,
  ARDUCOPTER_OSD_CHANNEL_LABELS,
  ARDUCOPTER_OSD_SWITCH_METHOD_LABELS,
  ARDUCOPTER_OSD_TYPE_LABELS,
  ARDUCOPTER_RSSI_TYPE_LABELS,
  ARDUCOPTER_SERIAL_BAUD_LABELS,
  ARDUCOPTER_SERIAL_OPTION_BIT_LABELS,
  ARDUCOPTER_SERIAL_PROTOCOL_LABELS,
  ARDUCOPTER_SERIAL_RTSCTS_LABELS,
  ARDUCOPTER_SERVO_FUNCTION_LABELS,
  ARDUCOPTER_THROTTLE_FAILSAFE_LABELS,
  ARDUCOPTER_VTX_ENABLE_LABELS,
} from './arducopter-enums.js'

const enabledDisabledOptions: ParameterValueOption[] = [
  { value: 0, label: 'Disabled' },
  { value: 1, label: 'Enabled' }
]

const rcEndpointNotes = [
  'Receiver endpoint changes should be followed by another live RC range verification pass.'
]

const rcMapNotes = [
  'Changing RCMAP_* requires a reboot before the new mapping is fully applied.',
  'After changing RC mapping, repeat RC endpoint capture before flight.'
]

const serialProtocolNotes = [
  'Changing a serial port protocol usually requires a reboot before the new port role is fully applied.',
  'After changing a port role, reconnect the peripheral and verify telemetry before flight.'
]

const serialBaudNotes = [
  'Baud-rate changes should be matched to the connected peripheral before reconnecting.'
]

const serialFlowControlNotes = [
  'Only enable RTS/CTS flow control if the connected peripheral and wiring support it.'
]

const serialOptionsNotes = [
  'Serial options expose board-level UART behavior such as half-duplex, inversion, and DMA quirks.',
  'Change these only when the connected receiver, VTX, or peripheral explicitly needs a specific option combination.'
]

const gpsTypeNotes = [
  'After changing GPS driver types, reconnect the sensor and verify lock/telemetry before flight.'
]

const gpsAutoConfigNotes = [
  'Automatic GPS configuration is usually helpful, but it can overwrite manual receiver settings on the attached module.',
  'Reboot and verify live GPS telemetry after changing this behavior.'
]

const gpsSwitchingNotes = [
  'Primary/secondary GPS behavior matters most on dual-GPS setups; keep it simple unless you are actually using redundancy.',
  'If blending or automatic switching is enabled, verify which GPS is primary before flight.'
]

const gpsRateNotes = [
  'Higher GPS update rates can help responsiveness but also increase bus load and CPU work on some targets.',
  'Only raise the GPS rate if the attached module and link can sustain it cleanly.'
]

const vtxEnableNotes = [
  'Use this only when a compatible VTX control path is actually connected and assigned on a serial port.',
  'After enabling VTX control, verify the actual channel, power, and pit behavior on the bench before flight.'
]

const vtxFrequencyNotes = [
  'Use a legal frequency for your region and confirm the actual transmitted channel with the VTX or goggles on the bench.',
  'Changing VTX frequency or power is a bench setup task; avoid guessing in the field.'
]

const vtxPowerNotes = [
  'Keep VTX power conservative during bench setup and only raise it once cooling airflow and legal constraints are understood.',
  'If the VTX has discrete power tables, confirm the requested level matches the hardware-reported level.'
]

const vtxOptionNotes = [
  'This is an advanced VTX behavior bitmask. Leave it alone unless the target VTX protocol expects a specific option combination.',
  'Bench-check pit mode and unlock behavior after changing advanced VTX options.'
]

const osdTypeNotes = [
  'Choose the backend that matches the actual FPV display path, then verify the live overlay in goggles or on the bench display before flight.',
  'Changing the OSD backend usually requires a reboot before the new display path is active.'
]

const osdSwitchNotes = [
  'Only assign an OSD screen-switch channel if the pilot actually needs multiple pages in flight.',
  'After changing OSD switching behavior, verify the page-switch action on the bench before flight.'
]

const mspOsdNotes = [
  'MSP and DisplayPort overlays depend on a matching serial-port role and baud rate on the linked UART.',
  'If the FPV overlay is missing or garbled, verify both the serial protocol assignment and the selected OSD backend.'
]

const batteryMonitorNotes = [
  'Changing the battery monitor source typically requires a reboot before live telemetry matches the new configuration.',
  'Use a live powered session to confirm that the selected battery monitor is actually producing telemetry.'
]

const batteryCapacityNotes = [
  'Match this to the pack capacity that the vehicle will actually fly with.',
  'After changing battery capacity, verify the live remaining-percent estimate on a fully charged pack.'
]

const batteryThresholdNotes = [
  'Set this to zero only if you intentionally want to disable that threshold-based trigger.',
  'Verify the live battery telemetry and your actual cell count before tightening battery failsafe thresholds.'
]

const batteryArmNotes = [
  'Use this to prevent arming when the pack is already too depleted for a safe flight.',
  'Set to zero to disable the corresponding pre-arm battery check.'
]

const batteryVoltageSourceNotes = [
  'Sag-compensated voltage is usually more useful in flight because it accounts for transient load sag.',
  'Raw voltage can still be useful when comparing power-module calibration against a meter on the bench.'
]

const rcFailsafeThresholdNotes = [
  'Set this slightly above the receiver PWM value seen during radio-loss failsafe, then verify it on the bench.',
  'After changing the threshold, recheck throttle failsafe behavior before flight.'
]

const modeChannelNotes = [
  'Set this to the receiver channel that carries the flight-mode switch. Disable it only if mode selection is handled another way.',
  'After changing the mode channel, rerun the mode-switch exercise before flight.'
]

const rssiNotes = [
  'Only enable RSSI if the receiver or link is actually providing signal-strength data.',
  'Verify the live RSSI reading on the bench before using it as a confidence signal.'
]

const rssiChannelNotes = [
  'Use this only when RSSI is being carried on a dedicated RC channel.',
  'Keep the low/high values matched to the actual receiver output range.'
]

const advancedReceiverNotes = [
  'These receiver-link settings are more advanced than channel mapping and RSSI. Change them only when the actual radio link requires it.',
  'After changing receiver link timing or options, recheck live RC input and failsafe behavior on the bench.'
]

const advancedFailsafeNotes = [
  'These settings change how long the controller waits and how it behaves when RC or battery problems occur.',
  'After changing advanced failsafe behavior, recheck pre-arm state and do another bench review before flight.'
]

const disarmDelayNotes = [
  'This controls how long the vehicle waits before auto-disarming after landing or inactivity.',
  'Keep it long enough to avoid nuisance disarms during setup, but not so long that a landed vehicle stays armed unnecessarily.'
]

const notificationLedNotes = [
  'Notification LED drivers only work when the chosen LED type matches the actual hardware and any required output assignment.',
  'After changing LED types or string length, bench-check the indicator behavior before flight.'
]

const notificationBuzzNotes = [
  'Only enable buzzer drivers that are actually present on the target hardware.',
  'Bench-check the buzzer output after changing notification behavior so the aircraft still has an audible locate/failsafe alert.'
]

const flightFeelNotes = [
  'Make small changes, fly-test, and keep a known-good backup before pushing responsiveness further.',
  'These controls are intended to stay beginner-safe; use Expert mode for deeper controller tuning.'
]

const acroRateNotes = [
  'Rates and expo are best adjusted a little at a time, with a short hover or line-of-sight test between changes.',
  'This first tuning surface intentionally stops at rates and expo so the setup workflow stays approachable.'
]

const presetPrerequisites = [
  'Finish receiver, output, failsafe, and power setup before applying a tuning preset.',
  'Apply one preset family at a time and do a short test flight before stacking more changes.'
]

const flightFeelPresetCautions = [
  'These presets adjust angle-mode stick feel and yaw handling only; they do not retune the underlying rate controller.',
  'A pre-apply snapshot is captured automatically so you can roll back to the previous known-good setup if needed.'
]

const acroRatePresetCautions = [
  'These presets change acro stick sensitivity only; they do not change PID/controller gains.',
  'Start with the balanced preset unless you already know you want either a softer or more aggressive rate profile.'
]

const multirotorPresetFrameClasses = [1, 2, 3, 4, 5, 7, 9, 10, 12, 14] as const

function serialPortDisplayName(portNumber: number): string {
  switch (portNumber) {
    case 0:
      return 'USB / Console'
    case 1:
      return 'Telemetry 1'
    case 2:
      return 'Telemetry 2'
    case 3:
      return 'GPS / UART3'
    default:
      return `Serial ${portNumber}`
  }
}

function enumOptions(labelMap: Record<number, string>): ParameterValueOption[] {
  return Object.entries(labelMap)
    .map(([value, label]) => ({
      value: Number(value),
      label
    }))
    .sort((left, right) => left.value - right.value)
}

function buildSerialPortParameterDefinitions(maxPortNumber: number): FirmwareMetadataBundle['parameters'] {
  const definitions: FirmwareMetadataBundle['parameters'] = {}

  for (let portNumber = 0; portNumber <= maxPortNumber; portNumber += 1) {
    const portLabel = serialPortDisplayName(portNumber)

    definitions[`SERIAL${portNumber}_PROTOCOL`] = {
      id: `SERIAL${portNumber}_PROTOCOL`,
      label: `${portLabel} Protocol`,
      description: `Assigned serial protocol for ${portLabel}.`,
      category: 'ports',
      minimum: -1,
      maximum: 50,
      rebootRequired: true,
      notes: serialProtocolNotes,
      options: enumOptions(ARDUCOPTER_SERIAL_PROTOCOL_LABELS)
    }

    definitions[`SERIAL${portNumber}_BAUD`] = {
      id: `SERIAL${portNumber}_BAUD`,
      label: `${portLabel} Baud`,
      description: `Configured baud rate for ${portLabel}.`,
      category: 'ports',
      minimum: 1,
      maximum: 2000,
      notes: serialBaudNotes,
      options: enumOptions(ARDUCOPTER_SERIAL_BAUD_LABELS)
    }

    definitions[`SERIAL${portNumber}_OPTIONS`] = {
      id: `SERIAL${portNumber}_OPTIONS`,
      label: `${portLabel} Serial Options`,
      description: `Advanced UART option bitmask for ${portLabel}.`,
      category: 'ports',
      minimum: 0,
      maximum: 8191,
      rebootRequired: true,
      notes: serialOptionsNotes,
      options: enumOptions(ARDUCOPTER_SERIAL_OPTION_BIT_LABELS)
    }

    if (portNumber > 0 && portNumber <= 6) {
      definitions[`BRD_SER${portNumber}_RTSCTS`] = {
        id: `BRD_SER${portNumber}_RTSCTS`,
        label: `${portLabel} Flow Control`,
        description: `RTS/CTS flow-control behavior for ${portLabel}.`,
        category: 'ports',
        minimum: 0,
        maximum: 3,
        rebootRequired: true,
        notes: serialFlowControlNotes,
        options: enumOptions(ARDUCOPTER_SERIAL_RTSCTS_LABELS)
      }
    }
  }

  return definitions
}

export const arducopterMetadata: FirmwareMetadataBundle = {
  firmware: 'ArduCopter',
  appViews: [
    {
      id: 'setup',
      label: 'Setup',
      description: 'Connection, calibration, and guided setup.',
      order: 1
    },
    {
      id: 'ports',
      label: 'Ports',
      description: 'Serial roles, GPS links, and peripheral setup.',
      order: 2
    },
    {
      id: 'vtx',
      label: 'VTX',
      description: 'Video transmitter control, channel, and power setup.',
      order: 3
    },
    {
      id: 'osd',
      label: 'OSD',
      description: 'FPV display backend, screen mode, and overlay switching.',
      order: 4
    },
    {
      id: 'receiver',
      label: 'Receiver',
      description: 'RC mapping, ranges, and flight modes.',
      order: 5
    },
    {
      id: 'outputs',
      label: 'Outputs',
      description: 'Airframe, outputs, motor tests, and ESC review.',
      order: 6
    },
    {
      id: 'power',
      label: 'Power',
      description: 'Battery, failsafe, and pre-arm review.',
      order: 7
    },
    {
      id: 'snapshots',
      label: 'Snapshots',
      description: 'Capture, compare, and restore known-good parameter sets.',
      order: 8
    },
    {
      id: 'tuning',
      label: 'Tuning',
      description: 'Beginner-safe flight-feel and acro-rate tuning.',
      order: 9
    },
    {
      id: 'presets',
      label: 'Presets',
      description: 'Curated, explainable tuning bundles with automatic backup.',
      order: 10
    },
    {
      id: 'parameters',
      label: 'Parameters',
      description: 'Low-level parameter editing and backup work.',
      order: 11
    }
  ],
  categories: {
    airframe: {
      id: 'airframe',
      label: 'Airframe',
      description: 'Frame geometry, type, and mounting configuration.',
      order: 1,
      viewId: 'outputs'
    },
    sensors: {
      id: 'sensors',
      label: 'Sensors',
      description: 'Board orientation and sensor-related setup.',
      order: 2,
      viewId: 'setup'
    },
    ports: {
      id: 'ports',
      label: 'Ports',
      description: 'Serial roles, baud rates, and peripheral transport settings.',
      order: 3,
      viewId: 'ports'
    },
    peripherals: {
      id: 'peripherals',
      label: 'Peripherals',
      description: 'GPS and other externally attached peripherals.',
      order: 4,
      viewId: 'ports'
    },
    vtx: {
      id: 'vtx',
      label: 'VTX',
      description: 'Video transmitter control, frequency, and power settings.',
      order: 5,
      viewId: 'vtx'
    },
    osd: {
      id: 'osd',
      label: 'OSD',
      description: 'FPV overlay backend, switching, and display configuration.',
      order: 6,
      viewId: 'osd'
    },
    radio: {
      id: 'radio',
      label: 'Receiver',
      description: 'RC mapping, ranges, and calibration values.',
      order: 7,
      viewId: 'receiver'
    },
    modes: {
      id: 'modes',
      label: 'Modes',
      description: 'Flight-mode assignments and switch setup.',
      order: 8,
      viewId: 'receiver'
    },
    outputs: {
      id: 'outputs',
      label: 'Outputs',
      description: 'Motor, servo, and propulsion-related outputs.',
      order: 9,
      viewId: 'outputs'
    },
    power: {
      id: 'power',
      label: 'Power',
      description: 'Battery sensing and power monitoring.',
      order: 10,
      viewId: 'power'
    },
    failsafe: {
      id: 'failsafe',
      label: 'Failsafe',
      description: 'Throttle, battery, and failsafe behavior.',
      order: 11,
      viewId: 'power'
    },
    tuning: {
      id: 'tuning',
      label: 'Flight Feel',
      description: 'Simple multirotor handling adjustments for angle mode and general stick feel.',
      order: 12,
      viewId: 'tuning'
    },
    acro: {
      id: 'acro',
      label: 'Acro Rates',
      description: 'Acro roll, pitch, and yaw rates plus expo.',
      order: 13,
      viewId: 'tuning'
    }
  },
  presetGroups: {
    'flight-feel': {
      id: 'flight-feel',
      label: 'Flight Feel',
      description: 'Preset bundles for angle-mode feel, smoothing, and general yaw response.',
      order: 1
    },
    'acro-rates': {
      id: 'acro-rates',
      label: 'Acro Rates',
      description: 'Preset bundles for acro roll, pitch, and yaw stick sensitivity.',
      order: 2
    }
  },
  presets: {
    'flight-feel-soft': {
      id: 'flight-feel-soft',
      label: 'Smooth Explorer',
      description: 'Softer angle-mode response, lower lean angle, and gentler yaw authority for relaxed cruising.',
      groupId: 'flight-feel',
      order: 1,
      values: [
        { paramId: 'ATC_INPUT_TC', value: 0.3 },
        { paramId: 'ANGLE_MAX', value: 3500 },
        { paramId: 'PILOT_Y_RATE', value: 160 },
        { paramId: 'PILOT_Y_EXPO', value: 0.18 }
      ],
      note: 'Good first preset for a larger or heavier multirotor when you want a calm self-leveling feel.',
      tags: ['baseline', 'smooth', 'cinematic'],
      prerequisites: presetPrerequisites,
      cautions: flightFeelPresetCautions,
      compatibility: {
        frameClasses: [...multirotorPresetFrameClasses]
      }
    },
    'flight-feel-balanced': {
      id: 'flight-feel-balanced',
      label: 'Balanced Baseline',
      description: 'Moderate smoothing and lean angle for an all-around starting point.',
      groupId: 'flight-feel',
      order: 2,
      values: [
        { paramId: 'ATC_INPUT_TC', value: 0.22 },
        { paramId: 'ANGLE_MAX', value: 4200 },
        { paramId: 'PILOT_Y_RATE', value: 200 },
        { paramId: 'PILOT_Y_EXPO', value: 0.1 }
      ],
      note: 'Use this first if you are not yet sure whether the vehicle should feel softer or more immediate.',
      tags: ['baseline', 'balanced'],
      prerequisites: presetPrerequisites,
      cautions: flightFeelPresetCautions,
      compatibility: {
        frameClasses: [...multirotorPresetFrameClasses]
      }
    },
    'flight-feel-crisp': {
      id: 'flight-feel-crisp',
      label: 'Crisp Response',
      description: 'Lower smoothing, steeper lean angle, and firmer yaw response for a more immediate feel.',
      groupId: 'flight-feel',
      order: 3,
      values: [
        { paramId: 'ATC_INPUT_TC', value: 0.14 },
        { paramId: 'ANGLE_MAX', value: 5000 },
        { paramId: 'PILOT_Y_RATE', value: 260 },
        { paramId: 'PILOT_Y_EXPO', value: 0.04 }
      ],
      note: 'Use only after confirming the vehicle is already well-behaved on a calmer baseline.',
      tags: ['responsive', 'sport'],
      prerequisites: presetPrerequisites,
      cautions: flightFeelPresetCautions,
      compatibility: {
        frameClasses: [...multirotorPresetFrameClasses]
      }
    },
    'acro-rates-gentle': {
      id: 'acro-rates-gentle',
      label: 'Gentle Acro',
      description: 'Lower acro rates with more expo for easier center-stick precision.',
      groupId: 'acro-rates',
      order: 1,
      values: [
        { paramId: 'ACRO_RP_RATE', value: 220 },
        { paramId: 'ACRO_Y_RATE', value: 180 },
        { paramId: 'ACRO_RP_EXPO', value: 0.18 },
        { paramId: 'ACRO_Y_EXPO', value: 0.14 }
      ],
      note: 'A conservative acro preset for pilots moving over from stabilized flight or flying tighter spaces.',
      tags: ['acro', 'gentle', 'training'],
      prerequisites: presetPrerequisites,
      cautions: acroRatePresetCautions,
      compatibility: {
        frameClasses: [...multirotorPresetFrameClasses]
      }
    },
    'acro-rates-balanced': {
      id: 'acro-rates-balanced',
      label: 'Balanced Acro',
      description: 'Moderate acro rates with a small amount of expo for a versatile FPV baseline.',
      groupId: 'acro-rates',
      order: 2,
      values: [
        { paramId: 'ACRO_RP_RATE', value: 320 },
        { paramId: 'ACRO_Y_RATE', value: 240 },
        { paramId: 'ACRO_RP_EXPO', value: 0.1 },
        { paramId: 'ACRO_Y_EXPO', value: 0.08 }
      ],
      note: 'A good general-purpose rate baseline for most small and mid-size multirotors.',
      tags: ['acro', 'baseline', 'balanced'],
      prerequisites: presetPrerequisites,
      cautions: acroRatePresetCautions,
      compatibility: {
        frameClasses: [...multirotorPresetFrameClasses]
      }
    },
    'acro-rates-sport': {
      id: 'acro-rates-sport',
      label: 'Sport Acro',
      description: 'Higher acro rates with low expo for sharper flips, rolls, and snap response.',
      groupId: 'acro-rates',
      order: 3,
      values: [
        { paramId: 'ACRO_RP_RATE', value: 420 },
        { paramId: 'ACRO_Y_RATE', value: 300 },
        { paramId: 'ACRO_RP_EXPO', value: 0.04 },
        { paramId: 'ACRO_Y_EXPO', value: 0.03 }
      ],
      note: 'This is the most aggressive preset in the initial library; start lower unless you already know the airframe can handle it.',
      tags: ['acro', 'sport', 'responsive'],
      prerequisites: presetPrerequisites,
      cautions: acroRatePresetCautions,
      compatibility: {
        frameClasses: [...multirotorPresetFrameClasses]
      }
    }
  },
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
    COMPASS_USE2: {
      id: 'COMPASS_USE2',
      label: 'Compass 2 Enabled',
      description: 'Secondary compass enable state.',
      category: 'sensors',
      minimum: 0,
      maximum: 1,
      options: enabledDisabledOptions
    },
    COMPASS_USE3: {
      id: 'COMPASS_USE3',
      label: 'Compass 3 Enabled',
      description: 'Tertiary compass enable state.',
      category: 'sensors',
      minimum: 0,
      maximum: 1,
      options: enabledDisabledOptions
    },
    ...buildSerialPortParameterDefinitions(8),
    GPS_TYPE: {
      id: 'GPS_TYPE',
      label: 'Primary GPS Type',
      description: 'Driver type used for the primary GPS/peripheral input.',
      category: 'peripherals',
      minimum: 0,
      maximum: 25,
      rebootRequired: true,
      notes: gpsTypeNotes,
      options: enumOptions(ARDUCOPTER_GPS_TYPE_LABELS)
    },
    GPS_TYPE2: {
      id: 'GPS_TYPE2',
      label: 'Secondary GPS Type',
      description: 'Driver type used for the secondary GPS/peripheral input.',
      category: 'peripherals',
      minimum: 0,
      maximum: 25,
      rebootRequired: true,
      notes: ['Disable this if no secondary GPS is attached. Reboot after changes before verifying redundancy.', ...gpsTypeNotes],
      options: enumOptions(ARDUCOPTER_GPS_TYPE_LABELS)
    },
    GPS_AUTO_CONFIG: {
      id: 'GPS_AUTO_CONFIG',
      label: 'GPS Auto Configure',
      description: 'Automatic configuration behavior for attached GPS modules.',
      category: 'peripherals',
      minimum: 0,
      maximum: 3,
      rebootRequired: true,
      notes: gpsAutoConfigNotes,
      options: enumOptions(ARDUCOPTER_GPS_AUTO_CONFIG_LABELS)
    },
    GPS_AUTO_SWITCH: {
      id: 'GPS_AUTO_SWITCH',
      label: 'GPS Auto Switch',
      description: 'How the controller chooses between the primary and secondary GPS on dual-GPS setups.',
      category: 'peripherals',
      minimum: 0,
      maximum: 4,
      notes: gpsSwitchingNotes,
      options: enumOptions(ARDUCOPTER_GPS_AUTO_SWITCH_LABELS)
    },
    GPS_PRIMARY: {
      id: 'GPS_PRIMARY',
      label: 'Primary GPS Select',
      description: 'Preferred GPS when multiple GPS units are configured.',
      category: 'peripherals',
      minimum: 0,
      maximum: 1,
      notes: gpsSwitchingNotes,
      options: enumOptions(ARDUCOPTER_GPS_PRIMARY_LABELS)
    },
    GPS_RATE_MS: {
      id: 'GPS_RATE_MS',
      label: 'GPS Update Rate',
      description: 'Requested GPS update period for supported serial GPS modules.',
      category: 'peripherals',
      unit: 'ms',
      minimum: 50,
      maximum: 200,
      step: 1,
      rebootRequired: true,
      notes: gpsRateNotes,
      options: enumOptions(ARDUCOPTER_GPS_RATE_MS_LABELS)
    },
    OSD_TYPE: {
      id: 'OSD_TYPE',
      label: 'OSD Backend',
      description: 'Display backend used for the FPV on-screen display.',
      category: 'osd',
      minimum: 0,
      maximum: 5,
      rebootRequired: true,
      notes: osdTypeNotes,
      options: enumOptions(ARDUCOPTER_OSD_TYPE_LABELS)
    },
    OSD_CHAN: {
      id: 'OSD_CHAN',
      label: 'OSD Screen Channel',
      description: 'Receiver channel used to switch between OSD pages.',
      category: 'osd',
      minimum: 0,
      maximum: 16,
      notes: osdSwitchNotes,
      options: enumOptions(ARDUCOPTER_OSD_CHANNEL_LABELS)
    },
    OSD_SW_METHOD: {
      id: 'OSD_SW_METHOD',
      label: 'OSD Switch Method',
      description: 'How the selected OSD channel chooses or advances through pages.',
      category: 'osd',
      minimum: 0,
      maximum: 2,
      notes: osdSwitchNotes,
      options: enumOptions(ARDUCOPTER_OSD_SWITCH_METHOD_LABELS)
    },
    MSP_OPTIONS: {
      id: 'MSP_OPTIONS',
      label: 'MSP Options',
      description: 'Advanced MSP and DisplayPort behavior bitmask.',
      category: 'osd',
      minimum: 0,
      maximum: 7,
      notes: mspOsdNotes
    },
    MSP_OSD_NCELLS: {
      id: 'MSP_OSD_NCELLS',
      label: 'MSP Cell Count',
      description: 'Battery cell-count value sent to MSP-capable FPV displays.',
      category: 'osd',
      minimum: 0,
      maximum: 14,
      notes: mspOsdNotes,
      options: enumOptions(ARDUCOPTER_MSP_OSD_CELL_COUNT_LABELS)
    },
    VTX_ENABLE: {
      id: 'VTX_ENABLE',
      label: 'VTX Control',
      description: 'Enables ArduPilot control of a supported video transmitter.',
      category: 'vtx',
      notes: vtxEnableNotes,
      options: enumOptions(ARDUCOPTER_VTX_ENABLE_LABELS)
    },
    VTX_FREQ: {
      id: 'VTX_FREQ',
      label: 'VTX Frequency',
      description: 'Requested VTX output frequency.',
      category: 'vtx',
      unit: 'MHz',
      minimum: 0,
      maximum: 6000,
      step: 1,
      notes: vtxFrequencyNotes
    },
    VTX_POWER: {
      id: 'VTX_POWER',
      label: 'VTX Power',
      description: 'Requested VTX output power.',
      category: 'vtx',
      unit: 'mW',
      minimum: 0,
      maximum: 5000,
      step: 1,
      notes: vtxPowerNotes
    },
    VTX_MAX_POWER: {
      id: 'VTX_MAX_POWER',
      label: 'VTX Max Power',
      description: 'Upper power limit allowed for VTX control requests.',
      category: 'vtx',
      unit: 'mW',
      minimum: 0,
      maximum: 5000,
      step: 1,
      notes: vtxPowerNotes
    },
    VTX_OPTIONS: {
      id: 'VTX_OPTIONS',
      label: 'VTX Advanced Options',
      description: 'Advanced VTX behavior bitmask.',
      category: 'vtx',
      minimum: 0,
      maximum: 255,
      step: 1,
      notes: vtxOptionNotes
    },
    BATT_MONITOR: {
      id: 'BATT_MONITOR',
      label: 'Battery Monitor',
      description: 'Battery sensing source configuration.',
      category: 'power',
      minimum: 0,
      maximum: 24,
      rebootRequired: true,
      notes: batteryMonitorNotes,
      options: enumOptions(ARDUCOPTER_BATTERY_MONITOR_LABELS)
    },
    BATT_CAPACITY: {
      id: 'BATT_CAPACITY',
      label: 'Battery Capacity',
      description: 'Nominal battery capacity used for failsafe and remaining estimate.',
      category: 'power',
      unit: 'mAh',
      minimum: 0,
      step: 1,
      notes: batteryCapacityNotes
    },
    BATT_ARM_VOLT: {
      id: 'BATT_ARM_VOLT',
      label: 'Arm Voltage Threshold',
      description: 'Battery voltage that must be present before the vehicle is allowed to arm.',
      category: 'power',
      unit: 'V',
      minimum: 0,
      step: 0.1,
      notes: batteryArmNotes
    },
    BATT_ARM_MAH: {
      id: 'BATT_ARM_MAH',
      label: 'Arm Capacity Threshold',
      description: 'Remaining battery capacity required before the vehicle is allowed to arm.',
      category: 'power',
      unit: 'mAh',
      minimum: 0,
      step: 1,
      notes: batteryArmNotes
    },
    DISARM_DELAY: {
      id: 'DISARM_DELAY',
      label: 'Auto Disarm Delay',
      description: 'Delay before the vehicle automatically disarms after landing or inactivity.',
      category: 'power',
      unit: 's',
      minimum: 0,
      maximum: 127,
      step: 1,
      notes: disarmDelayNotes
    },
    BATT_FS_VOLTSRC: {
      id: 'BATT_FS_VOLTSRC',
      label: 'Failsafe Voltage Source',
      description: 'Voltage source used when evaluating battery failsafe thresholds.',
      category: 'failsafe',
      minimum: 0,
      maximum: 1,
      notes: batteryVoltageSourceNotes,
      options: enumOptions(ARDUCOPTER_BATTERY_VOLTAGE_SOURCE_LABELS)
    },
    BATT_LOW_VOLT: {
      id: 'BATT_LOW_VOLT',
      label: 'Low Battery Voltage',
      description: 'Voltage threshold that triggers the low battery failsafe action.',
      category: 'failsafe',
      unit: 'V',
      minimum: 0,
      step: 0.1,
      notes: batteryThresholdNotes
    },
    BATT_LOW_MAH: {
      id: 'BATT_LOW_MAH',
      label: 'Low Battery Capacity',
      description: 'Remaining capacity threshold that triggers the low battery failsafe action.',
      category: 'failsafe',
      unit: 'mAh',
      minimum: 0,
      step: 1,
      notes: batteryThresholdNotes
    },
    BATT_LOW_TIMER: {
      id: 'BATT_LOW_TIMER',
      label: 'Low Battery Hold Time',
      description: 'Time the low-battery threshold must remain active before the low-battery failsafe triggers.',
      category: 'failsafe',
      unit: 's',
      minimum: 0,
      maximum: 120,
      step: 1,
      notes: advancedFailsafeNotes
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
    BATT_CRT_VOLT: {
      id: 'BATT_CRT_VOLT',
      label: 'Critical Battery Voltage',
      description: 'Voltage threshold that triggers the critical battery failsafe action.',
      category: 'failsafe',
      unit: 'V',
      minimum: 0,
      step: 0.1,
      notes: batteryThresholdNotes
    },
    BATT_CRT_MAH: {
      id: 'BATT_CRT_MAH',
      label: 'Critical Battery Capacity',
      description: 'Remaining capacity threshold that triggers the critical battery failsafe action.',
      category: 'failsafe',
      unit: 'mAh',
      minimum: 0,
      step: 1,
      notes: batteryThresholdNotes
    },
    BATT_FS_CRT_ACT: {
      id: 'BATT_FS_CRT_ACT',
      label: 'Critical Battery Action',
      description: 'Action taken when the critical battery threshold is reached.',
      category: 'failsafe',
      minimum: 0,
      maximum: 7,
      options: enumOptions(ARDUCOPTER_BATTERY_FAILSAFE_ACTION_LABELS)
    },
    ATC_INPUT_TC: {
      id: 'ATC_INPUT_TC',
      label: 'Stick Feel Smoothing',
      description: 'Input shaping time constant for roll and pitch demand. Lower values feel crisper; higher values feel softer.',
      category: 'tuning',
      unit: 's',
      minimum: 0,
      maximum: 1,
      step: 0.01,
      notes: flightFeelNotes
    },
    ANGLE_MAX: {
      id: 'ANGLE_MAX',
      label: 'Max Lean Angle',
      description: 'Maximum commanded lean angle in self-leveling modes.',
      category: 'tuning',
      unit: 'cdeg',
      minimum: 1000,
      maximum: 8000,
      step: 100,
      notes: ['This value is stored in centidegrees. A value of 4500 means 45 degrees of maximum lean.', ...flightFeelNotes]
    },
    PILOT_Y_RATE: {
      id: 'PILOT_Y_RATE',
      label: 'Yaw Rate',
      description: 'Maximum yaw rate command used for pilot input outside acro tuning.',
      category: 'tuning',
      unit: 'deg/s',
      minimum: 1,
      maximum: 500,
      step: 1,
      notes: flightFeelNotes
    },
    PILOT_Y_EXPO: {
      id: 'PILOT_Y_EXPO',
      label: 'Yaw Expo',
      description: 'Softens yaw response near center stick while preserving full authority at the ends.',
      category: 'tuning',
      minimum: 0,
      maximum: 1,
      step: 0.01,
      notes: flightFeelNotes
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
    FLTMODE4: {
      id: 'FLTMODE4',
      label: 'Flight Mode 4',
      description: 'Mode assigned to the fourth switch position.',
      category: 'modes',
      options: enumOptions(ARDUCOPTER_FLIGHT_MODE_LABELS)
    },
    FLTMODE5: {
      id: 'FLTMODE5',
      label: 'Flight Mode 5',
      description: 'Mode assigned to the fifth switch position.',
      category: 'modes',
      options: enumOptions(ARDUCOPTER_FLIGHT_MODE_LABELS)
    },
    FLTMODE6: {
      id: 'FLTMODE6',
      label: 'Flight Mode 6',
      description: 'Mode assigned to the sixth switch position.',
      category: 'modes',
      options: enumOptions(ARDUCOPTER_FLIGHT_MODE_LABELS)
    },
    FLTMODE_CH: {
      id: 'FLTMODE_CH',
      label: 'Flight Mode Channel',
      description: 'Receiver channel used to select flight modes.',
      category: 'modes',
      minimum: 0,
      maximum: 16,
      notes: modeChannelNotes,
      options: enumOptions(ARDUCOPTER_FLTMODE_CHANNEL_LABELS)
    },
    MODE_CH: {
      id: 'MODE_CH',
      label: 'Legacy Mode Channel',
      description: 'Legacy mode-channel parameter used on some older setups and firmware variants.',
      category: 'modes',
      minimum: 0,
      maximum: 16,
      notes: ['Prefer FLTMODE_CH when both parameters are present on the target.', ...modeChannelNotes],
      options: enumOptions(ARDUCOPTER_FLTMODE_CHANNEL_LABELS)
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
    FS_THR_VALUE: {
      id: 'FS_THR_VALUE',
      label: 'Throttle Failsafe PWM',
      description: 'PWM threshold used to detect receiver-loss throttle failsafe.',
      category: 'failsafe',
      unit: 'us',
      minimum: 910,
      maximum: 1100,
      step: 1,
      notes: rcFailsafeThresholdNotes
    },
    RC_FS_TIMEOUT: {
      id: 'RC_FS_TIMEOUT',
      label: 'RC Failsafe Timeout',
      description: 'Time ArduPilot waits after losing valid RC input before triggering RC failsafe behavior.',
      category: 'failsafe',
      unit: 's',
      minimum: 0.1,
      maximum: 10,
      step: 0.1,
      notes: advancedFailsafeNotes
    },
    FS_OPTIONS: {
      id: 'FS_OPTIONS',
      label: 'Advanced Failsafe Options',
      description: 'Advanced failsafe behavior bitmask.',
      category: 'failsafe',
      minimum: 0,
      maximum: 65535,
      step: 1,
      notes: advancedFailsafeNotes
    },
    RCMAP_ROLL: {
      id: 'RCMAP_ROLL',
      label: 'Roll Channel Map',
      description: 'Receiver channel mapped to roll input.',
      category: 'radio',
      minimum: 1,
      maximum: 16,
      step: 1,
      rebootRequired: true,
      notes: rcMapNotes
    },
    RCMAP_PITCH: {
      id: 'RCMAP_PITCH',
      label: 'Pitch Channel Map',
      description: 'Receiver channel mapped to pitch input.',
      category: 'radio',
      minimum: 1,
      maximum: 16,
      step: 1,
      rebootRequired: true,
      notes: rcMapNotes
    },
    RCMAP_THROTTLE: {
      id: 'RCMAP_THROTTLE',
      label: 'Throttle Channel Map',
      description: 'Receiver channel mapped to throttle input.',
      category: 'radio',
      minimum: 1,
      maximum: 16,
      step: 1,
      rebootRequired: true,
      notes: rcMapNotes
    },
    RCMAP_YAW: {
      id: 'RCMAP_YAW',
      label: 'Yaw Channel Map',
      description: 'Receiver channel mapped to yaw input.',
      category: 'radio',
      minimum: 1,
      maximum: 16,
      step: 1,
      rebootRequired: true,
      notes: rcMapNotes
    },
    RSSI_TYPE: {
      id: 'RSSI_TYPE',
      label: 'RSSI Source',
      description: 'Signal-strength source used for RSSI reporting.',
      category: 'radio',
      minimum: 0,
      maximum: 4,
      notes: rssiNotes,
      options: enumOptions(ARDUCOPTER_RSSI_TYPE_LABELS)
    },
    RSSI_CHANNEL: {
      id: 'RSSI_CHANNEL',
      label: 'RSSI Channel',
      description: 'Receiver channel used when RSSI is carried on a dedicated RC PWM channel.',
      category: 'radio',
      minimum: 0,
      maximum: 16,
      step: 1,
      notes: rssiChannelNotes
    },
    RSSI_CHAN_LOW: {
      id: 'RSSI_CHAN_LOW',
      label: 'RSSI Low PWM',
      description: 'PWM value treated as minimum RSSI when using a dedicated RSSI channel.',
      category: 'radio',
      unit: 'us',
      minimum: 800,
      maximum: 2200,
      step: 1,
      notes: rssiChannelNotes
    },
    RSSI_CHAN_HIGH: {
      id: 'RSSI_CHAN_HIGH',
      label: 'RSSI High PWM',
      description: 'PWM value treated as maximum RSSI when using a dedicated RSSI channel.',
      category: 'radio',
      unit: 'us',
      minimum: 800,
      maximum: 2200,
      step: 1,
      notes: rssiChannelNotes
    },
    RC_SPEED: {
      id: 'RC_SPEED',
      label: 'RC Input Rate',
      description: 'Maximum RC input update rate accepted from the receiver link.',
      category: 'radio',
      unit: 'Hz',
      minimum: 1,
      maximum: 500,
      step: 1,
      notes: advancedReceiverNotes
    },
    RC_OPTIONS: {
      id: 'RC_OPTIONS',
      label: 'Receiver Options',
      description: 'Advanced RC input and receiver-behavior bitmask.',
      category: 'radio',
      minimum: 0,
      maximum: 65535,
      step: 1,
      notes: advancedReceiverNotes
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
    RC2_MIN: {
      id: 'RC2_MIN',
      label: 'RC2 Minimum',
      description: 'Minimum calibrated value for pitch input.',
      category: 'radio',
      minimum: 800,
      maximum: 2200,
      step: 1,
      notes: rcEndpointNotes
    },
    RC2_MAX: {
      id: 'RC2_MAX',
      label: 'RC2 Maximum',
      description: 'Maximum calibrated value for pitch input.',
      category: 'radio',
      minimum: 800,
      maximum: 2200,
      step: 1,
      notes: rcEndpointNotes
    },
    RC2_TRIM: {
      id: 'RC2_TRIM',
      label: 'RC2 Trim',
      description: 'Center trim value for pitch input.',
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
    RC4_MIN: {
      id: 'RC4_MIN',
      label: 'RC4 Minimum',
      description: 'Minimum calibrated value for yaw input.',
      category: 'radio',
      minimum: 800,
      maximum: 2200,
      step: 1,
      notes: rcEndpointNotes
    },
    RC4_MAX: {
      id: 'RC4_MAX',
      label: 'RC4 Maximum',
      description: 'Maximum calibrated value for yaw input.',
      category: 'radio',
      minimum: 800,
      maximum: 2200,
      step: 1,
      notes: rcEndpointNotes
    },
    RC4_TRIM: {
      id: 'RC4_TRIM',
      label: 'RC4 Trim',
      description: 'Center trim value for yaw input.',
      category: 'radio',
      minimum: 800,
      maximum: 2200,
      step: 1,
      notes: rcEndpointNotes
    },
    ACRO_RP_RATE: {
      id: 'ACRO_RP_RATE',
      label: 'Acro Roll/Pitch Rate',
      description: 'Maximum roll and pitch rate used in Acro mode.',
      category: 'acro',
      unit: 'deg/s',
      minimum: 1,
      maximum: 1080,
      step: 1,
      notes: acroRateNotes
    },
    ACRO_Y_RATE: {
      id: 'ACRO_Y_RATE',
      label: 'Acro Yaw Rate',
      description: 'Maximum yaw rate used in Acro mode.',
      category: 'acro',
      unit: 'deg/s',
      minimum: 1,
      maximum: 1080,
      step: 1,
      notes: acroRateNotes
    },
    ACRO_RP_EXPO: {
      id: 'ACRO_RP_EXPO',
      label: 'Acro Roll/Pitch Expo',
      description: 'Softens roll and pitch response near center stick in Acro mode.',
      category: 'acro',
      minimum: 0,
      maximum: 1,
      step: 0.01,
      notes: acroRateNotes
    },
    ACRO_Y_EXPO: {
      id: 'ACRO_Y_EXPO',
      label: 'Acro Yaw Expo',
      description: 'Softens yaw response near center stick in Acro mode.',
      category: 'acro',
      minimum: 0,
      maximum: 1,
      step: 0.01,
      notes: acroRateNotes
    },
    MOT_PWM_TYPE: {
      id: 'MOT_PWM_TYPE',
      label: 'Motor PWM Type',
      description: 'Motor output protocol for ESC communication.',
      category: 'outputs',
      minimum: 0,
      maximum: 8,
      rebootRequired: true,
      notes: [
        'DShot-based protocols do not use the normal all-at-once PWM ESC calibration flow.',
        'After changing the motor output protocol, reboot and repeat output verification before flight.'
      ],
      options: enumOptions(ARDUCOPTER_MOT_PWM_TYPE_LABELS)
    },
    MOT_PWM_MIN: {
      id: 'MOT_PWM_MIN',
      label: 'Motor PWM Minimum',
      description: 'Minimum PWM value sent to the ESCs when using PWM-based protocols.',
      category: 'outputs',
      minimum: 0,
      maximum: 2200,
      step: 1,
      notes: ['Review with the ESC calibration workflow whenever analog PWM endpoints change.']
    },
    MOT_PWM_MAX: {
      id: 'MOT_PWM_MAX',
      label: 'Motor PWM Maximum',
      description: 'Maximum PWM value sent to the ESCs when using PWM-based protocols.',
      category: 'outputs',
      minimum: 0,
      maximum: 2200,
      step: 1,
      notes: ['Review with the ESC calibration workflow whenever analog PWM endpoints change.']
    },
    MOT_SPIN_ARM: {
      id: 'MOT_SPIN_ARM',
      label: 'Motor Spin Armed',
      description: 'Motor output fraction used immediately after arming.',
      category: 'outputs',
      minimum: 0,
      maximum: 1,
      step: 0.01,
      notes: ['Review spin thresholds after ESC calibration or protocol changes.']
    },
    MOT_SPIN_MIN: {
      id: 'MOT_SPIN_MIN',
      label: 'Motor Spin Minimum',
      description: 'Lowest stabilized motor output fraction during flight.',
      category: 'outputs',
      minimum: 0,
      maximum: 1,
      step: 0.01,
      notes: ['This should stay above MOT_SPIN_ARM for a clean idle-to-flight transition.']
    },
    MOT_SPIN_MAX: {
      id: 'MOT_SPIN_MAX',
      label: 'Motor Spin Maximum',
      description: 'Highest allowed motor output fraction.',
      category: 'outputs',
      minimum: 0,
      maximum: 1,
      step: 0.01,
      notes: ['Leave headroom below 1.0 if the propulsion setup saturates early.']
    },
    NTF_LED_TYPES: {
      id: 'NTF_LED_TYPES',
      label: 'Notification LED Drivers',
      description: 'Enabled notification LED driver bitmask.',
      category: 'outputs',
      minimum: 0,
      maximum: 8191,
      notes: notificationLedNotes
    },
    NTF_LED_LEN: {
      id: 'NTF_LED_LEN',
      label: 'Notification LED Length',
      description: 'Configured pixel count for addressable notification LEDs.',
      category: 'outputs',
      minimum: 1,
      maximum: 256,
      step: 1,
      rebootRequired: true,
      notes: notificationLedNotes
    },
    NTF_LED_BRIGHT: {
      id: 'NTF_LED_BRIGHT',
      label: 'Notification LED Brightness',
      description: 'Global brightness level for supported notification LEDs.',
      category: 'outputs',
      minimum: 0,
      maximum: 3,
      notes: notificationLedNotes,
      options: enumOptions(ARDUCOPTER_NOTIFICATION_LED_BRIGHTNESS_LABELS)
    },
    NTF_LED_OVERRIDE: {
      id: 'NTF_LED_OVERRIDE',
      label: 'Notification LED Source',
      description: 'Alternate source for notification LED state and color control.',
      category: 'outputs',
      minimum: 0,
      maximum: 3,
      notes: notificationLedNotes,
      options: enumOptions(ARDUCOPTER_NOTIFICATION_LED_OVERRIDE_LABELS)
    },
    NTF_BUZZ_TYPES: {
      id: 'NTF_BUZZ_TYPES',
      label: 'Notification Buzzer Drivers',
      description: 'Enabled buzzer driver bitmask.',
      category: 'outputs',
      minimum: 0,
      maximum: 7,
      notes: notificationBuzzNotes
    },
    NTF_BUZZ_VOLUME: {
      id: 'NTF_BUZZ_VOLUME',
      label: 'Notification Buzzer Volume',
      description: 'Volume percentage used by supported buzzer drivers.',
      category: 'outputs',
      unit: '%',
      minimum: 0,
      maximum: 100,
      step: 1,
      notes: notificationBuzzNotes
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
    },
    SERVO13_FUNCTION: {
      id: 'SERVO13_FUNCTION',
      label: 'Output 13 Function',
      description: 'Assigned function for output channel 13.',
      category: 'outputs',
      notes: ['After remapping outputs, confirm the new assignment with a guarded motor or output review before flight.'],
      options: enumOptions(ARDUCOPTER_SERVO_FUNCTION_LABELS)
    },
    SERVO14_FUNCTION: {
      id: 'SERVO14_FUNCTION',
      label: 'Output 14 Function',
      description: 'Assigned function for output channel 14.',
      category: 'outputs',
      notes: ['After remapping outputs, confirm the new assignment with a guarded motor or output review before flight.'],
      options: enumOptions(ARDUCOPTER_SERVO_FUNCTION_LABELS)
    },
    SERVO15_FUNCTION: {
      id: 'SERVO15_FUNCTION',
      label: 'Output 15 Function',
      description: 'Assigned function for output channel 15.',
      category: 'outputs',
      notes: ['After remapping outputs, confirm the new assignment with a guarded motor or output review before flight.'],
      options: enumOptions(ARDUCOPTER_SERVO_FUNCTION_LABELS)
    },
    SERVO16_FUNCTION: {
      id: 'SERVO16_FUNCTION',
      label: 'Output 16 Function',
      description: 'Assigned function for output channel 16.',
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
      requiredParameters: [
        'RCMAP_ROLL',
        'RCMAP_PITCH',
        'RCMAP_THROTTLE',
        'RCMAP_YAW',
        'RC1_MIN',
        'RC1_MAX',
        'RC1_TRIM',
        'RC2_MIN',
        'RC2_MAX',
        'RC2_TRIM',
        'RC3_MIN',
        'RC3_MAX',
        'RC3_TRIM',
        'RC4_MIN',
        'RC4_MAX',
        'RC4_TRIM'
      ],
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
      requiredParameters: [
        'FS_THR_ENABLE',
        'FS_THR_VALUE',
        'BATT_FS_VOLTSRC',
        'BATT_LOW_VOLT',
        'BATT_LOW_MAH',
        'BATT_FS_LOW_ACT',
        'BATT_CRT_VOLT',
        'BATT_CRT_MAH',
        'BATT_FS_CRT_ACT'
      ],
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
      requiredParameters: ['BATT_MONITOR', 'BATT_CAPACITY', 'BATT_ARM_VOLT', 'BATT_ARM_MAH'],
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
