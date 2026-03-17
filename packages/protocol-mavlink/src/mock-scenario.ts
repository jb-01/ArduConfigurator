import {
  MAV_AUTOPILOT,
  MAV_CMD,
  MAV_MODE_FLAG,
  MAV_PARAM_TYPE,
  MAV_RESULT,
  MAV_SEVERITY,
  MAV_STATE,
  MAV_TYPE,
  MAVLINK_MESSAGE_IDS,
} from './constants.js'
import { decodeSingleV2Envelope, MavlinkV2Codec } from './mavlink-v2-codec.js'
import type {
  CommandLongMessage,
  GlobalPositionIntMessage,
  MavlinkEnvelope,
  MavlinkMessage,
  ParamSetMessage,
  ParamValueMessage
} from './messages.js'

export interface MockScenario {
  initialFrames: Uint8Array[]
  respondToOutbound: (frame: Uint8Array) => Uint8Array[]
}

type ParameterState = Record<string, number>

const mockParameters: ParameterState = {
  FRAME_CLASS: 1,
  FRAME_TYPE: 1,
  AHRS_ORIENTATION: 0,
  COMPASS_USE: 1,
  COMPASS_USE2: 0,
  COMPASS_USE3: 0,
  SERIAL0_PROTOCOL: 2,
  SERIAL0_BAUD: 115,
  SERIAL1_PROTOCOL: 23,
  SERIAL1_BAUD: 420,
  BRD_SER1_RTSCTS: 0,
  SERIAL2_PROTOCOL: 2,
  SERIAL2_BAUD: 57,
  BRD_SER2_RTSCTS: 2,
  SERIAL3_PROTOCOL: 5,
  SERIAL3_BAUD: 115,
  BRD_SER3_RTSCTS: 0,
  SERIAL4_PROTOCOL: -1,
  SERIAL4_BAUD: 57,
  BRD_SER4_RTSCTS: 0,
  SERIAL5_PROTOCOL: 38,
  SERIAL5_BAUD: 115,
  BRD_SER5_RTSCTS: 0,
  SERIAL6_PROTOCOL: 22,
  SERIAL6_BAUD: 115,
  BRD_SER6_RTSCTS: 0,
  SERIAL7_PROTOCOL: -1,
  SERIAL7_BAUD: 57,
  SERIAL8_PROTOCOL: 16,
  SERIAL8_BAUD: 115,
  GPS_TYPE: 9,
  GPS_TYPE2: 0,
  GPS_AUTO_CONFIG: 1,
  GPS_AUTO_SWITCH: 0,
  GPS_PRIMARY: 0,
  GPS_RATE_MS: 200,
  OSD_TYPE: 5,
  OSD_CHAN: 8,
  OSD_SW_METHOD: 2,
  MSP_OPTIONS: 4,
  MSP_OSD_NCELLS: 0,
  VTX_ENABLE: 1,
  VTX_FREQ: 5800,
  VTX_POWER: 200,
  VTX_MAX_POWER: 800,
  VTX_OPTIONS: 0,
  BATT_MONITOR: 4,
  BATT_CAPACITY: 1300,
  BATT_ARM_VOLT: 13.8,
  BATT_ARM_MAH: 0,
  DISARM_DELAY: 10,
  BATT_FS_VOLTSRC: 1,
  BATT_LOW_VOLT: 14.4,
  BATT_LOW_MAH: 300,
  BATT_LOW_TIMER: 10,
  BATT_FS_LOW_ACT: 2,
  BATT_CRT_VOLT: 13.8,
  BATT_CRT_MAH: 150,
  BATT_FS_CRT_ACT: 1,
  ATC_INPUT_TC: 0.15,
  ANGLE_MAX: 4500,
  PILOT_Y_RATE: 180,
  PILOT_Y_EXPO: 0.2,
  FLTMODE_CH: 7,
  FLTMODE1: 0,
  FLTMODE2: 5,
  FLTMODE3: 6,
  FS_THR_ENABLE: 1,
  FS_THR_VALUE: 975,
  RC_FS_TIMEOUT: 0.5,
  FS_OPTIONS: 0,
  RCMAP_ROLL: 1,
  RCMAP_PITCH: 2,
  RCMAP_THROTTLE: 3,
  RCMAP_YAW: 4,
  RSSI_TYPE: 3,
  RSSI_CHANNEL: 8,
  RSSI_CHAN_LOW: 1000,
  RSSI_CHAN_HIGH: 2000,
  RC_SPEED: 150,
  RC_OPTIONS: 0,
  RC1_MIN: 1000,
  RC1_MAX: 2000,
  RC1_TRIM: 1500,
  RC2_MIN: 1000,
  RC2_MAX: 2000,
  RC2_TRIM: 1500,
  RC3_MIN: 1000,
  RC3_MAX: 2000,
  RC3_TRIM: 1500,
  RC4_MIN: 1000,
  RC4_MAX: 2000,
  RC4_TRIM: 1500,
  ACRO_RP_RATE: 360,
  ACRO_Y_RATE: 240,
  ACRO_RP_EXPO: 0.35,
  ACRO_Y_EXPO: 0.2,
  MOT_PWM_TYPE: 5,
  MOT_PWM_MIN: 1000,
  MOT_PWM_MAX: 2000,
  MOT_SPIN_ARM: 0.08,
  MOT_SPIN_MIN: 0.12,
  MOT_SPIN_MAX: 0.95,
  NTF_LED_TYPES: 256,
  NTF_LED_LEN: 8,
  NTF_LED_BRIGHT: 2,
  NTF_LED_OVERRIDE: 0,
  NTF_BUZZ_TYPES: 1,
  NTF_BUZZ_VOLUME: 60,
  SERVO1_FUNCTION: 33,
  SERVO2_FUNCTION: 34,
  SERVO3_FUNCTION: 35,
  SERVO4_FUNCTION: 36,
  SERVO5_FUNCTION: 0,
  SERVO6_FUNCTION: 0,
  SERVO7_FUNCTION: 0,
  SERVO8_FUNCTION: 0,
  SERVO9_FUNCTION: 120,
  SERVO10_FUNCTION: 0,
  SERVO11_FUNCTION: 0,
  SERVO12_FUNCTION: 0,
  SERVO13_FUNCTION: 0,
  SERVO14_FUNCTION: 0,
  SERVO15_FUNCTION: 0,
  SERVO16_FUNCTION: 0
}

function envelope(sequence: number, message: MavlinkMessage): MavlinkEnvelope {
  return {
    header: {
      systemId: 1,
      componentId: 1,
      sequence
    },
    message,
    timestampMs: Date.now()
  }
}

function rcChannelsMessage(timeBootMs: number): MavlinkMessage {
  return {
    type: 'RC_CHANNELS',
    timeBootMs,
    channelCount: 8,
    channels: [1500, 1500, 1100, 1500, 1000, 1500, 1500, 1500],
    rssi: 100
  }
}

function attitudeMessage(timeBootMs: number, rollRad = 0, pitchRad = 0, yawRad = 0): MavlinkMessage {
  return {
    type: 'ATTITUDE',
    timeBootMs,
    rollRad,
    pitchRad,
    yawRad,
    rollSpeedRadS: 0,
    pitchSpeedRadS: 0,
    yawSpeedRadS: 0
  }
}

function sysStatusMessage(voltageBatteryMv: number, batteryRemaining: number): MavlinkMessage {
  return {
    type: 'SYS_STATUS',
    sensorsPresent: 0,
    sensorsEnabled: 0,
    sensorsHealth: 0,
    load: 180,
    voltageBatteryMv,
    currentBatteryCa: 120,
    batteryRemaining,
    dropRateComm: 0,
    errorsComm: 0,
    errorsCount1: 0,
    errorsCount2: 0,
    errorsCount3: 0,
    errorsCount4: 0,
    sensorsPresentExtended: 0,
    sensorsEnabledExtended: 0,
    sensorsHealthExtended: 0
  }
}

function globalPositionMessage(timeBootMs: number): GlobalPositionIntMessage {
  return {
    type: 'GLOBAL_POSITION_INT',
    timeBootMs,
    latitudeE7: 377749300,
    longitudeE7: -1224194200,
    altitudeMm: 18420,
    relativeAltitudeMm: 1240,
    velocityXcms: 120,
    velocityYcms: -40,
    velocityZcms: 0,
    headingCdeg: 27450
  }
}

function buildParameterFrames(parameterState: ParameterState): Uint8Array[] {
  const codec = new MavlinkV2Codec()
  const entries = Object.entries(parameterState)
  return entries.map(([paramId, paramValue], index) => {
    const message: ParamValueMessage = {
      type: 'PARAM_VALUE',
      paramId,
      paramValue,
      paramType: MAV_PARAM_TYPE.REAL32,
      paramCount: entries.length,
      paramIndex: index
    }

    return codec.encode(envelope(index + 10, message))
  })
}

export function createArduCopterMockScenario(): MockScenario {
  const codec = new MavlinkV2Codec()
  const parameters = { ...mockParameters }

  return {
    initialFrames: [
      codec.encode(
        envelope(1, {
          type: 'HEARTBEAT',
          autopilot: MAV_AUTOPILOT.ARDUPILOTMEGA,
          vehicleType: MAV_TYPE.QUADROTOR,
          baseMode: MAV_MODE_FLAG.CUSTOM_MODE_ENABLED,
          customMode: 0,
          systemStatus: MAV_STATE.STANDBY,
          mavlinkVersion: 3
        })
      ),
      codec.encode(
        envelope(2, {
          type: 'STATUSTEXT',
          severity: MAV_SEVERITY.INFO,
          text: 'Prototype ArduCopter connected.',
          statusId: 0,
          chunkSequence: 0
        })
      ),
      codec.encode(envelope(3, sysStatusMessage(16420, 72))),
      codec.encode(envelope(4, rcChannelsMessage(1200))),
      codec.encode(envelope(5, attitudeMessage(1200))),
      codec.encode(envelope(6, globalPositionMessage(1200)))
    ],
    respondToOutbound: (frame) => {
      const outbound = decodeSingleV2Envelope(frame)
      const responses: Uint8Array[] = []

      switch (outbound.message.type) {
        case 'PARAM_REQUEST_LIST':
          responses.push(...buildParameterFrames(parameters))
          break
        case 'PARAM_SET': {
          const paramSet = outbound.message as ParamSetMessage
          parameters[paramSet.paramId] = paramSet.paramValue
          responses.push(
            codec.encode(
              envelope(100, {
                type: 'PARAM_VALUE',
                paramId: paramSet.paramId,
                paramValue: paramSet.paramValue,
                paramType: MAV_PARAM_TYPE.REAL32,
                paramCount: Object.keys(parameters).length,
                paramIndex: Object.keys(parameters).indexOf(paramSet.paramId)
              })
            )
          )
          responses.push(
            codec.encode(
              envelope(101, {
                type: 'STATUSTEXT',
                severity: MAV_SEVERITY.INFO,
                text: `Parameter ${paramSet.paramId} updated.`,
                statusId: 0,
                chunkSequence: 0
              })
            )
          )
          break
        }
        case 'COMMAND_LONG':
          if (outbound.message.command === MAV_CMD.SET_MESSAGE_INTERVAL) {
            responses.push(
              codec.encode(
                envelope(90, {
                  type: 'COMMAND_ACK',
                  command: MAV_CMD.SET_MESSAGE_INTERVAL,
                  result: MAV_RESULT.ACCEPTED,
                  progress: 0,
                  resultParam2: 0,
                  targetSystem: outbound.header.systemId,
                  targetComponent: outbound.header.componentId
                })
              )
            )

            const requestedMessageId = Math.round(outbound.message.params[0] ?? 0)
            if (requestedMessageId === MAVLINK_MESSAGE_IDS.RC_CHANNELS) {
              responses.push(codec.encode(envelope(91, rcChannelsMessage(1600))))
            }
            if (requestedMessageId === MAVLINK_MESSAGE_IDS.SYS_STATUS) {
              responses.push(codec.encode(envelope(92, sysStatusMessage(16420, 72))))
            }
            if (requestedMessageId === MAVLINK_MESSAGE_IDS.ATTITUDE) {
              responses.push(codec.encode(envelope(93, attitudeMessage(1600))))
            }
            if (requestedMessageId === MAVLINK_MESSAGE_IDS.GLOBAL_POSITION_INT) {
              responses.push(codec.encode(envelope(94, globalPositionMessage(1600))))
            }
          } else if (outbound.message.command === MAV_CMD.DO_MOTOR_TEST) {
            const outputChannel = Math.round(outbound.message.params[0] ?? 0)
            const throttlePercent = Number((outbound.message.params[2] ?? 0).toFixed(1))
            const durationSeconds = Number((outbound.message.params[3] ?? 0).toFixed(1))
            responses.push(
              codec.encode(
                envelope(94, {
                  type: 'COMMAND_ACK',
                  command: MAV_CMD.DO_MOTOR_TEST,
                  result: MAV_RESULT.ACCEPTED,
                  progress: 0,
                  resultParam2: 0,
                  targetSystem: outbound.header.systemId,
                  targetComponent: outbound.header.componentId
                })
              )
            )
            responses.push(
              codec.encode(
                envelope(95, {
                  type: 'STATUSTEXT',
                  severity: MAV_SEVERITY.WARNING,
                  text: `Motor test accepted for OUT${outputChannel} at ${throttlePercent}% for ${durationSeconds}s.`,
                  statusId: 0,
                  chunkSequence: 0
                })
              )
            )
          } else if (isAccelerometerCalibration(outbound.message)) {
            responses.push(
              codec.encode(
                envelope(101, {
                  type: 'COMMAND_ACK',
                  command: MAV_CMD.PREFLIGHT_CALIBRATION,
                  result: MAV_RESULT.ACCEPTED,
                  progress: 0,
                  resultParam2: 0,
                  targetSystem: outbound.header.systemId,
                  targetComponent: outbound.header.componentId
                })
              ),
              ...[
                'Accelerometer calibration started.',
                'Place vehicle level and keep it still.',
                'Place vehicle on its LEFT side.',
                'Place vehicle on its RIGHT side.',
                'Place vehicle nose down.',
                'Place vehicle nose up.',
                'Place vehicle on its back.',
                'Accelerometer calibration complete.'
              ].map((text, index) =>
                codec.encode(
                  envelope(102 + index, {
                    type: 'STATUSTEXT',
                    severity: MAV_SEVERITY.INFO,
                    text,
                    statusId: 0,
                    chunkSequence: 0
                  })
                )
              )
            )
          } else if (isCompassCalibration(outbound.message)) {
            responses.push(
              codec.encode(
                envelope(201, {
                  type: 'COMMAND_ACK',
                  command: MAV_CMD.PREFLIGHT_CALIBRATION,
                  result: MAV_RESULT.ACCEPTED,
                  progress: 0,
                  resultParam2: 0,
                  targetSystem: outbound.header.systemId,
                  targetComponent: outbound.header.componentId
                })
              ),
              ...[
                'Compass calibration started.',
                'Rotate the vehicle through roll, pitch, and yaw.',
                'Compass calibration complete.'
              ].map((text, index) =>
                codec.encode(
                  envelope(202 + index, {
                    type: 'STATUSTEXT',
                    severity: MAV_SEVERITY.INFO,
                    text,
                    statusId: 0,
                    chunkSequence: 0
                  })
                )
              )
            )
          } else if (outbound.message.command === MAV_CMD.PREFLIGHT_REBOOT_SHUTDOWN) {
            responses.push(
              codec.encode(
                envelope(104, {
                  type: 'STATUSTEXT',
                  severity: MAV_SEVERITY.WARNING,
                  text: 'Autopilot reboot requested.',
                  statusId: 0,
                  chunkSequence: 0
                })
              )
            )
          }
          break
        default:
          break
      }

      return responses
    }
  }
}

function isAccelerometerCalibration(message: CommandLongMessage): boolean {
  return message.command === MAV_CMD.PREFLIGHT_CALIBRATION && message.params[4] === 1
}

function isCompassCalibration(message: CommandLongMessage): boolean {
  return message.command === MAV_CMD.PREFLIGHT_CALIBRATION && message.params[1] === 1
}
