import {
  MAV_FTP_ERR,
  MAV_FTP_OPCODE,
  MAV_AUTOPILOT,
  MAV_CMD,
  MAV_MODE_FLAG,
  MAV_PROTOCOL_CAPABILITY,
  MAV_PARAM_TYPE,
  MAV_RESULT,
  MAV_SEVERITY,
  MAV_STATE,
  MAV_TYPE,
  MAVLINK_MESSAGE_IDS,
} from './constants.js'
import { decodeSingleV2Envelope, MavlinkV2Codec } from './mavlink-v2-codec.js'
import type {
  AutopilotVersionMessage,
  CommandLongMessage,
  FileTransferProtocolMessage,
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
  SERIAL0_OPTIONS: 0,
  SERIAL1_PROTOCOL: 23,
  SERIAL1_BAUD: 420,
  SERIAL1_OPTIONS: 0,
  BRD_SER1_RTSCTS: 0,
  SERIAL2_PROTOCOL: 2,
  SERIAL2_BAUD: 57,
  SERIAL2_OPTIONS: 0,
  BRD_SER2_RTSCTS: 2,
  SERIAL3_PROTOCOL: 5,
  SERIAL3_BAUD: 115,
  SERIAL3_OPTIONS: 0,
  BRD_SER3_RTSCTS: 0,
  SERIAL4_PROTOCOL: -1,
  SERIAL4_BAUD: 57,
  SERIAL4_OPTIONS: 0,
  BRD_SER4_RTSCTS: 0,
  SERIAL5_PROTOCOL: 37,
  SERIAL5_BAUD: 115,
  SERIAL5_OPTIONS: 1,
  BRD_SER5_RTSCTS: 0,
  SERIAL6_PROTOCOL: 42,
  SERIAL6_BAUD: 115,
  SERIAL6_OPTIONS: 0,
  BRD_SER6_RTSCTS: 0,
  SERIAL7_PROTOCOL: -1,
  SERIAL7_BAUD: 57,
  SERIAL7_OPTIONS: 0,
  SERIAL8_PROTOCOL: 16,
  SERIAL8_BAUD: 115,
  SERIAL8_OPTIONS: 0,
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

const mockAutopilotVersion: AutopilotVersionMessage = {
  type: 'AUTOPILOT_VERSION',
  capabilities: MAV_PROTOCOL_CAPABILITY.FTP,
  flightSwVersion: 0x040600ff,
  middlewareSwVersion: 0,
  osSwVersion: 0,
  boardVersion: 59 << 16,
  flightCustomVersion: new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x24, 0x03, 0x26, 0x01]),
  middlewareCustomVersion: new Uint8Array(8),
  osCustomVersion: new Uint8Array(8),
  vendorId: 0,
  productId: 0,
  uid: 0x0123456789abcdefn
}

const mockUartsText = [
  'UARTV1',
  'SERIAL0 OTG1    TX =    120 RX =     18 TXBD=     0 RXBD=     0',
  'SERIAL1 UART7   TX =    802 RX =    155 TXBD=     0 RXBD=     0',
  'SERIAL2 UART5   TX*=     63 RX*=      0 TXBD=   128 RXBD=     0',
  'SERIAL3 USART1  TX =      0 RX =      0 TXBD=     0 RXBD=     0',
  'SERIAL4 UART8   TX =      0 RX =      0 TXBD=     0 RXBD=     0',
  'SERIAL5 USART2  TX =      0 RX =      0 TXBD=     0 RXBD=     0',
  'SERIAL6 UART4   TX =      0 RX =      0 TXBD=     0 RXBD=     0',
  'SERIAL7 USART3  TX =      0 RX =      0 TXBD=     0 RXBD=     0',
  'SERIAL8 USART6  TX =      4 RX =      0 TXBD=     0 RXBD=     0'
].join('\n')

const mockUartsBytes = new TextEncoder().encode(mockUartsText)
const mockTimersBytes = new TextEncoder().encode(
  [
    'Timer Mapping',
    'PWM1 TIM5 CH1',
    'PWM2 TIM5 CH2',
    'PWM3 TIM5 CH3',
    'PWM4 TIM5 CH4'
  ].join('\n')
)
const mockHelloScriptBytes = new TextEncoder().encode(
  "gcs:send_text(6, 'hello from @SYS/scripts/hello.lua')\n"
)
const mockAutorunScriptBytes = new TextEncoder().encode(
  [
    "gcs:send_text(6, 'autorun bootstrap active')",
    'return true'
  ].join('\n')
)

type MockFtpFileMap = Map<string, Uint8Array>

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
  const ftpFiles = createMockFtpFiles()
  const ftpSessions = new Map<number, { path: string; mode: 'read' | 'write' }>()
  let nextFtpSession = 1

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
          const parameterIndex = Object.keys(parameters).indexOf(paramSet.paramId)
          responses.push(
            codec.encode(
              envelope(100, {
                type: 'PARAM_VALUE',
                paramId: paramSet.paramId,
                paramValue: paramSet.paramValue,
                paramType: MAV_PARAM_TYPE.REAL32,
                paramCount: Object.keys(parameters).length,
                paramIndex: parameterIndex
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
          responses.push(
            codec.encode(
              envelope(102, {
                type: 'PARAM_VALUE',
                paramId: paramSet.paramId,
                paramValue: paramSet.paramValue,
                paramType: MAV_PARAM_TYPE.REAL32,
                paramCount: Object.keys(parameters).length,
                paramIndex: parameterIndex
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
          } else if (
            outbound.message.command === MAV_CMD.REQUEST_MESSAGE &&
            Math.round(outbound.message.params[0] ?? 0) === MAVLINK_MESSAGE_IDS.AUTOPILOT_VERSION
          ) {
            responses.push(codec.encode(envelope(95, mockAutopilotVersion)))
          } else if (outbound.message.command === MAV_CMD.DO_MOTOR_TEST) {
            const targetIndex = Math.round(outbound.message.params[0] ?? 0)
            const throttlePercent = Number((outbound.message.params[2] ?? 0).toFixed(1))
            const durationSeconds = Number((outbound.message.params[3] ?? 0).toFixed(1))
            const motorCount = Math.max(Math.round(outbound.message.params[4] ?? 1), 1)
            const motorOrder = Math.round(outbound.message.params[5] ?? 0)
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
                  text:
                    motorCount > 1
                      ? `Motor test accepted for ${motorCount} motors in sequence at ${throttlePercent}% for ${durationSeconds}s each.`
                      : motorOrder === 2
                        ? `Motor test accepted for M${targetIndex} at ${throttlePercent}% for ${durationSeconds}s.`
                        : `Motor test accepted for target ${targetIndex} at ${throttlePercent}% for ${durationSeconds}s.`,
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
        case 'FILE_TRANSFER_PROTOCOL': {
          const request = decodeFtpPayload((outbound.message as FileTransferProtocolMessage).payload)
          const response = handleMockFtpRequest(request, ftpSessions, () => nextFtpSession++, ftpFiles)
          responses.push(
            codec.encode(
              envelope(250, {
                type: 'FILE_TRANSFER_PROTOCOL',
                targetNetwork: 0,
                targetSystem: outbound.header.systemId,
                targetComponent: outbound.header.componentId,
                payload: encodeFtpPayload(response)
              })
            )
          )
          break
        }
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

interface MockFtpPayload {
  seqNumber: number
  session: number
  opcode: number
  size: number
  reqOpcode: number
  burstComplete: number
  offset: number
  data: Uint8Array
}

function decodeFtpPayload(bytes: Uint8Array): MockFtpPayload {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const size = bytes[4] ?? 0
  return {
    seqNumber: view.getUint16(0, true),
    session: bytes[2] ?? 0,
    opcode: bytes[3] ?? 0,
    size,
    reqOpcode: bytes[5] ?? 0,
    burstComplete: bytes[6] ?? 0,
    offset: view.getUint32(8, true),
    data: bytes.slice(12, 12 + size)
  }
}

function encodeFtpPayload(payload: MockFtpPayload): Uint8Array {
  const bytes = new Uint8Array(251)
  const view = new DataView(bytes.buffer)
  view.setUint16(0, payload.seqNumber, true)
  bytes[2] = payload.session & 0xff
  bytes[3] = payload.opcode & 0xff
  bytes[4] = payload.size & 0xff
  bytes[5] = payload.reqOpcode & 0xff
  bytes[6] = payload.burstComplete & 0xff
  view.setUint32(8, payload.offset >>> 0, true)
  bytes.set(payload.data.slice(0, Math.min(payload.size, 239)), 12)
  return bytes
}

function handleMockFtpRequest(
  request: MockFtpPayload,
  sessions: Map<number, { path: string; mode: 'read' | 'write' }>,
  allocateSession: () => number,
  files: MockFtpFileMap
): MockFtpPayload {
  switch (request.opcode) {
    case MAV_FTP_OPCODE.LIST_DIRECTORY: {
      const path = normalizeMockFtpPath(new TextDecoder().decode(request.data).replace(/\0+$/, ''))
      const entries = listMockDirectoryEntries(files, path)
      if (!entries) {
        return ftpNak(request, MAV_FTP_ERR.FILE_NOT_FOUND)
      }
      if (request.offset >= entries.length) {
        return ftpNak(request, MAV_FTP_ERR.EOF)
      }

      const data = encodeMockDirectoryEntries(entries, request.offset)
      if (data.length === 0) {
        return ftpNak(request, MAV_FTP_ERR.EOF)
      }

      return ftpAck(request, {
        size: data.length,
        offset: request.offset,
        data
      })
    }
    case MAV_FTP_OPCODE.OPEN_FILE_RO: {
      const path = normalizeMockFtpPath(new TextDecoder().decode(request.data).replace(/\0+$/, ''))
      const fileBytes = files.get(path)
      if (!fileBytes) {
        return ftpNak(request, MAV_FTP_ERR.FILE_NOT_FOUND)
      }

      const session = allocateSession()
      sessions.set(session, { path, mode: 'read' })
      const data = new Uint8Array(4)
      new DataView(data.buffer).setUint32(0, fileBytes.length, true)
      return ftpAck(request, {
        session,
        size: 4,
        data
      })
    }
    case MAV_FTP_OPCODE.READ_FILE: {
      const session = sessions.get(request.session)
      if (!session || session.mode !== 'read') {
        return ftpNak(request, MAV_FTP_ERR.INVALID_SESSION)
      }
      const fileBytes = files.get(session.path)
      if (!fileBytes) {
        return ftpNak(request, MAV_FTP_ERR.FILE_NOT_FOUND)
      }
      if (request.offset >= fileBytes.length) {
        return ftpNak(request, MAV_FTP_ERR.EOF)
      }

      const end = Math.min(request.offset + request.size, fileBytes.length)
      const data = fileBytes.slice(request.offset, end)
      return ftpAck(request, {
        session: request.session,
        size: data.length,
        offset: request.offset,
        data
      })
    }
    case MAV_FTP_OPCODE.CREATE_FILE: {
      const path = normalizeMockFtpPath(new TextDecoder().decode(request.data).replace(/\0+$/, ''))
      const parentPath = parentMockFtpPath(path)
      if (!parentPath || !directoryExists(files, parentPath)) {
        return ftpNak(request, MAV_FTP_ERR.FILE_NOT_FOUND)
      }
      if (files.has(path)) {
        return ftpNak(request, MAV_FTP_ERR.FILE_EXISTS)
      }

      const session = allocateSession()
      files.set(path, new Uint8Array(0))
      sessions.set(session, { path, mode: 'write' })
      return ftpAck(request, {
        session
      })
    }
    case MAV_FTP_OPCODE.WRITE_FILE: {
      const session = sessions.get(request.session)
      if (!session || session.mode !== 'write') {
        return ftpNak(request, MAV_FTP_ERR.INVALID_SESSION)
      }

      const currentBytes = files.get(session.path) ?? new Uint8Array(0)
      const writeBytes = request.data.slice(0, request.size)
      const nextBytes = new Uint8Array(Math.max(currentBytes.length, request.offset + writeBytes.length))
      nextBytes.set(currentBytes)
      nextBytes.set(writeBytes, request.offset)
      files.set(session.path, nextBytes)
      return ftpAck(request, {
        session: request.session
      })
    }
    case MAV_FTP_OPCODE.REMOVE_FILE: {
      const path = normalizeMockFtpPath(new TextDecoder().decode(request.data).replace(/\0+$/, ''))
      if (!files.has(path)) {
        return ftpNak(request, MAV_FTP_ERR.FILE_NOT_FOUND)
      }
      files.delete(path)
      return ftpAck(request)
    }
    case MAV_FTP_OPCODE.REMOVE_DIRECTORY: {
      const path = normalizeMockFtpPath(new TextDecoder().decode(request.data).replace(/\0+$/, ''))
      if (!directoryExists(files, path)) {
        return ftpNak(request, MAV_FTP_ERR.FILE_NOT_FOUND)
      }
      if (path === '@SYS' || listMockDirectoryEntries(files, path)?.length) {
        return ftpNak(request, MAV_FTP_ERR.FAIL)
      }
      return ftpAck(request)
    }
    case MAV_FTP_OPCODE.TERMINATE_SESSION:
      sessions.delete(request.session)
      return ftpAck(request, {
        session: request.session
      })
    case MAV_FTP_OPCODE.RESET_SESSIONS:
      sessions.clear()
      return ftpAck(request)
    default:
      return ftpNak(request, MAV_FTP_ERR.UNKNOWN_COMMAND)
  }
}

function createMockFtpFiles(): MockFtpFileMap {
  return new Map<string, Uint8Array>([
    ['@SYS/uarts.txt', mockUartsBytes.slice()],
    ['@SYS/timers.txt', mockTimersBytes.slice()],
    ['@SYS/scripts/autorun.lua', mockAutorunScriptBytes.slice()],
    ['@SYS/scripts/hello.lua', mockHelloScriptBytes.slice()]
  ])
}

function normalizeMockFtpPath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) {
    return '@SYS'
  }
  if (trimmed === '/') {
    return trimmed
  }
  const collapsed = trimmed.replace(/\/+/g, '/')
  if (/^@[A-Za-z0-9_-]+$/.test(collapsed)) {
    return collapsed
  }
  return collapsed.replace(/\/+$/, '')
}

function parentMockFtpPath(path: string): string | undefined {
  const normalizedPath = normalizeMockFtpPath(path)
  if (normalizedPath === '/' || /^@[A-Za-z0-9_-]+$/.test(normalizedPath)) {
    return undefined
  }
  const separatorIndex = normalizedPath.lastIndexOf('/')
  return separatorIndex > 0 ? normalizedPath.slice(0, separatorIndex) : undefined
}

function directoryExists(files: MockFtpFileMap, path: string): boolean {
  const normalizedPath = normalizeMockFtpPath(path)
  if (normalizedPath === '@SYS') {
    return true
  }
  const prefix = `${normalizedPath}/`
  return [...files.keys()].some((filePath) => filePath.startsWith(prefix))
}

function listMockDirectoryEntries(files: MockFtpFileMap, path: string): Array<{ kind: 'file' | 'directory'; name: string; sizeBytes?: number }> | undefined {
  const normalizedPath = normalizeMockFtpPath(path)
  if (!directoryExists(files, normalizedPath)) {
    return undefined
  }

  const prefix = normalizedPath === '/' ? '/' : `${normalizedPath}/`
  const entries = new Map<string, { kind: 'file' | 'directory'; name: string; sizeBytes?: number }>()

  files.forEach((bytes, filePath) => {
    if (!filePath.startsWith(prefix)) {
      return
    }

    const remainder = filePath.slice(prefix.length)
    if (!remainder) {
      return
    }

    const slashIndex = remainder.indexOf('/')
    if (slashIndex === -1) {
      entries.set(remainder, {
        kind: 'file',
        name: remainder,
        sizeBytes: bytes.length
      })
      return
    }

    const directoryName = remainder.slice(0, slashIndex)
    if (!entries.has(directoryName)) {
      entries.set(directoryName, {
        kind: 'directory',
        name: directoryName
      })
    }
  })

  return [...entries.values()].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'directory' ? -1 : 1
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base', numeric: true })
  })
}

function encodeMockDirectoryEntries(
  entries: Array<{ kind: 'file' | 'directory'; name: string; sizeBytes?: number }>,
  offset: number
): Uint8Array {
  const encoder = new TextEncoder()
  const parts: string[] = []

  for (let index = offset; index < entries.length; index += 1) {
    const entry = entries[index]
    const token = entry.kind === 'directory' ? `D${entry.name}` : `F${entry.name}\t${entry.sizeBytes ?? 0}`
    const nextParts = [...parts, token]
    if (encoder.encode(nextParts.join('\0')).length > 200) {
      break
    }
    parts.push(token)
  }

  return encoder.encode(parts.join('\0'))
}

function ftpAck(
  request: MockFtpPayload,
  overrides: Partial<Omit<MockFtpPayload, 'seqNumber' | 'opcode' | 'reqOpcode'>> = {}
): MockFtpPayload {
  return {
    seqNumber: request.seqNumber,
    session: overrides.session ?? request.session,
    opcode: MAV_FTP_OPCODE.ACK,
    size: overrides.size ?? 0,
    reqOpcode: request.opcode,
    burstComplete: overrides.burstComplete ?? 0,
    offset: overrides.offset ?? request.offset,
    data: overrides.data ?? new Uint8Array(0)
  }
}

function ftpNak(request: MockFtpPayload, errorCode: number): MockFtpPayload {
  return {
    seqNumber: request.seqNumber,
    session: request.session,
    opcode: MAV_FTP_OPCODE.NAK,
    size: 1,
    reqOpcode: request.opcode,
    burstComplete: 0,
    offset: request.offset,
    data: new Uint8Array([errorCode])
  }
}
