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
import type { CommandLongMessage, MavlinkEnvelope, MavlinkMessage, ParamSetMessage, ParamValueMessage } from './messages.js'

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
  BATT_MONITOR: 4,
  BATT_CAPACITY: 1300,
  BATT_FS_LOW_ACT: 2,
  FLTMODE1: 0,
  FLTMODE2: 5,
  FLTMODE3: 6,
  FS_THR_ENABLE: 1,
  RC1_MIN: 1000,
  RC1_MAX: 2000,
  RC1_TRIM: 1500,
  RC3_MIN: 1000,
  RC3_MAX: 2000,
  RC3_TRIM: 1500
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
      codec.encode(envelope(4, rcChannelsMessage(1200)))
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
          } else if (isAccelerometerCalibration(outbound.message)) {
            responses.push(
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
