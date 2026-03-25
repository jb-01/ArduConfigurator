import {
  MAVLINK_MESSAGE_CRCS,
  MAVLINK_MESSAGE_IDS,
  MAVLINK_MIN_PAYLOAD_LENGTHS,
  MAVLINK_PAYLOAD_LENGTHS,
  MAVLINK_PROTOCOL_VERSION,
  MAVLINK_V2_CHECKSUM_LENGTH,
  MAVLINK_V2_HEADER_LENGTH,
  MAVLINK_V2_INCOMPAT_FLAG_SIGNED,
  MAVLINK_V2_SIGNATURE_LENGTH,
  MAVLINK_V2_STX,
} from './constants.js'
import type { StreamingCodec } from './json-lines-codec.js'
import type {
  AttitudeMessage,
  AutopilotVersionMessage,
  CommandAckMessage,
  CommandLongMessage,
  FileTransferProtocolMessage,
  GlobalPositionIntMessage,
  HeartbeatMessage,
  MavlinkEnvelope,
  MavlinkMessage,
  ParamRequestListMessage,
  ParamSetMessage,
  ParamValueMessage,
  RcChannelsMessage,
  StatusTextMessage,
  SysStatusMessage,
} from './messages.js'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export class MavlinkV2Codec implements StreamingCodec<MavlinkEnvelope> {
  private buffer: Uint8Array = new Uint8Array(0)

  encode(envelope: MavlinkEnvelope): Uint8Array {
    const messageId = messageIdFor(envelope.message)
    const payload = encodePayload(envelope.message)
    const payloadLength = payload.length

    const frame = new Uint8Array(MAVLINK_V2_HEADER_LENGTH + payloadLength + MAVLINK_V2_CHECKSUM_LENGTH)
    frame[0] = MAVLINK_V2_STX
    frame[1] = payloadLength
    frame[2] = 0
    frame[3] = 0
    frame[4] = envelope.header.sequence & 0xff
    frame[5] = envelope.header.systemId & 0xff
    frame[6] = envelope.header.componentId & 0xff
    frame[7] = messageId & 0xff
    frame[8] = (messageId >> 8) & 0xff
    frame[9] = (messageId >> 16) & 0xff
    frame.set(payload, MAVLINK_V2_HEADER_LENGTH)

    const checksum = crcMessage(frame.subarray(1, MAVLINK_V2_HEADER_LENGTH + payloadLength), MAVLINK_MESSAGE_CRCS[messageId])
    frame[MAVLINK_V2_HEADER_LENGTH + payloadLength] = checksum & 0xff
    frame[MAVLINK_V2_HEADER_LENGTH + payloadLength + 1] = (checksum >> 8) & 0xff

    return frame
  }

  push(chunk: Uint8Array): MavlinkEnvelope[] {
    this.buffer = concatBytes(this.buffer, chunk)
    const envelopes: MavlinkEnvelope[] = []

    while (this.buffer.length >= MAVLINK_V2_HEADER_LENGTH + MAVLINK_V2_CHECKSUM_LENGTH) {
      const stxIndex = this.buffer.indexOf(MAVLINK_V2_STX)
      if (stxIndex === -1) {
        this.buffer = new Uint8Array(0)
        break
      }

      if (stxIndex > 0) {
        this.buffer = this.buffer.slice(stxIndex)
      }

      if (this.buffer.length < MAVLINK_V2_HEADER_LENGTH + MAVLINK_V2_CHECKSUM_LENGTH) {
        break
      }

      const payloadLength = this.buffer[1]
      const incompatFlags = this.buffer[2]
      const signedLength = incompatFlags & MAVLINK_V2_INCOMPAT_FLAG_SIGNED ? MAVLINK_V2_SIGNATURE_LENGTH : 0
      const frameLength = MAVLINK_V2_HEADER_LENGTH + payloadLength + MAVLINK_V2_CHECKSUM_LENGTH + signedLength

      if (this.buffer.length < frameLength) {
        break
      }

      const frame = this.buffer.slice(0, frameLength)
      this.buffer = this.buffer.slice(frameLength)

      const messageId = frame[7] | (frame[8] << 8) | (frame[9] << 16)
      const crcExtra = MAVLINK_MESSAGE_CRCS[messageId]
      if (crcExtra === undefined) {
        continue
      }

      const expectedChecksum = crcMessage(frame.subarray(1, MAVLINK_V2_HEADER_LENGTH + payloadLength), crcExtra)
      const receivedChecksum = frame[MAVLINK_V2_HEADER_LENGTH + payloadLength] | (frame[MAVLINK_V2_HEADER_LENGTH + payloadLength + 1] << 8)
      if (expectedChecksum !== receivedChecksum) {
        continue
      }

      if (payloadLength < (MAVLINK_MIN_PAYLOAD_LENGTHS[messageId] ?? 0)) {
        continue
      }

      const payload = frame.slice(MAVLINK_V2_HEADER_LENGTH, MAVLINK_V2_HEADER_LENGTH + payloadLength)
      const message = decodePayload(messageId, payload)
      if (!message) {
        continue
      }

      envelopes.push({
        header: {
          systemId: frame[5],
          componentId: frame[6],
          sequence: frame[4]
        },
        message,
        timestampMs: Date.now()
      })
    }

    return envelopes
  }

  reset(): void {
    this.buffer = new Uint8Array(0)
  }
}

export function decodeSingleV2Envelope(frame: Uint8Array): MavlinkEnvelope {
  const codec = new MavlinkV2Codec()
  const messages = codec.push(frame)
  if (messages.length !== 1) {
    throw new Error(`Expected exactly one MAVLink envelope, got ${messages.length}.`)
  }
  return messages[0]
}

function encodePayload(message: MavlinkMessage): Uint8Array {
  switch (message.type) {
    case 'HEARTBEAT':
      return encodeHeartbeatPayload(message)
    case 'SYS_STATUS':
      return encodeSysStatusPayload(message)
    case 'GLOBAL_POSITION_INT':
      return encodeGlobalPositionIntPayload(message)
    case 'PARAM_REQUEST_LIST':
      return encodeParamRequestListPayload(message)
    case 'PARAM_VALUE':
      return encodeParamValuePayload(message)
    case 'PARAM_SET':
      return encodeParamSetPayload(message)
    case 'ATTITUDE':
      return encodeAttitudePayload(message)
    case 'RC_CHANNELS':
      return encodeRcChannelsPayload(message)
    case 'FILE_TRANSFER_PROTOCOL':
      return encodeFileTransferProtocolPayload(message)
    case 'COMMAND_ACK':
      return encodeCommandAckPayload(message)
    case 'COMMAND_LONG':
      return encodeCommandLongPayload(message)
    case 'AUTOPILOT_VERSION':
      return encodeAutopilotVersionPayload(message)
    case 'STATUSTEXT':
      return encodeStatusTextPayload(message)
    default:
      throw new Error('Unsupported MAVLink message for encoding.')
  }
}

function decodePayload(messageId: number, payload: Uint8Array): MavlinkMessage | undefined {
  switch (messageId) {
    case MAVLINK_MESSAGE_IDS.HEARTBEAT:
      return decodeHeartbeatPayload(payload)
    case MAVLINK_MESSAGE_IDS.SYS_STATUS:
      return decodeSysStatusPayload(payload)
    case MAVLINK_MESSAGE_IDS.GLOBAL_POSITION_INT:
      return decodeGlobalPositionIntPayload(payload)
    case MAVLINK_MESSAGE_IDS.PARAM_REQUEST_LIST:
      return decodeParamRequestListPayload(payload)
    case MAVLINK_MESSAGE_IDS.PARAM_VALUE:
      return decodeParamValuePayload(payload)
    case MAVLINK_MESSAGE_IDS.PARAM_SET:
      return decodeParamSetPayload(payload)
    case MAVLINK_MESSAGE_IDS.ATTITUDE:
      return decodeAttitudePayload(payload)
    case MAVLINK_MESSAGE_IDS.RC_CHANNELS:
      return decodeRcChannelsPayload(payload)
    case MAVLINK_MESSAGE_IDS.FILE_TRANSFER_PROTOCOL:
      return decodeFileTransferProtocolPayload(payload)
    case MAVLINK_MESSAGE_IDS.COMMAND_ACK:
      return decodeCommandAckPayload(payload)
    case MAVLINK_MESSAGE_IDS.COMMAND_LONG:
      return decodeCommandLongPayload(payload)
    case MAVLINK_MESSAGE_IDS.AUTOPILOT_VERSION:
      return decodeAutopilotVersionPayload(payload)
    case MAVLINK_MESSAGE_IDS.STATUSTEXT:
      return decodeStatusTextPayload(payload)
    default:
      return undefined
  }
}

function messageIdFor(message: MavlinkMessage): number {
  switch (message.type) {
    case 'HEARTBEAT':
      return MAVLINK_MESSAGE_IDS.HEARTBEAT
    case 'SYS_STATUS':
      return MAVLINK_MESSAGE_IDS.SYS_STATUS
    case 'GLOBAL_POSITION_INT':
      return MAVLINK_MESSAGE_IDS.GLOBAL_POSITION_INT
    case 'PARAM_REQUEST_LIST':
      return MAVLINK_MESSAGE_IDS.PARAM_REQUEST_LIST
    case 'PARAM_VALUE':
      return MAVLINK_MESSAGE_IDS.PARAM_VALUE
    case 'PARAM_SET':
      return MAVLINK_MESSAGE_IDS.PARAM_SET
    case 'ATTITUDE':
      return MAVLINK_MESSAGE_IDS.ATTITUDE
    case 'RC_CHANNELS':
      return MAVLINK_MESSAGE_IDS.RC_CHANNELS
    case 'FILE_TRANSFER_PROTOCOL':
      return MAVLINK_MESSAGE_IDS.FILE_TRANSFER_PROTOCOL
    case 'COMMAND_ACK':
      return MAVLINK_MESSAGE_IDS.COMMAND_ACK
    case 'COMMAND_LONG':
      return MAVLINK_MESSAGE_IDS.COMMAND_LONG
    case 'AUTOPILOT_VERSION':
      return MAVLINK_MESSAGE_IDS.AUTOPILOT_VERSION
    case 'STATUSTEXT':
      return MAVLINK_MESSAGE_IDS.STATUSTEXT
    default:
      throw new Error('Unsupported MAVLink message.')
  }
}

function encodeHeartbeatPayload(message: HeartbeatMessage): Uint8Array {
  const payload = new Uint8Array(MAVLINK_PAYLOAD_LENGTHS[MAVLINK_MESSAGE_IDS.HEARTBEAT])
  const view = new DataView(payload.buffer)
  view.setUint32(0, message.customMode, true)
  view.setUint8(4, message.vehicleType)
  view.setUint8(5, message.autopilot)
  view.setUint8(6, message.baseMode)
  view.setUint8(7, message.systemStatus)
  view.setUint8(8, message.mavlinkVersion || MAVLINK_PROTOCOL_VERSION)
  return payload
}

function decodeHeartbeatPayload(payload: Uint8Array): HeartbeatMessage {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  return {
    type: 'HEARTBEAT',
    customMode: view.getUint32(0, true),
    vehicleType: view.getUint8(4),
    autopilot: view.getUint8(5),
    baseMode: view.getUint8(6),
    systemStatus: view.getUint8(7),
    mavlinkVersion: view.getUint8(8)
  }
}

function encodeSysStatusPayload(message: SysStatusMessage): Uint8Array {
  const payload = new Uint8Array(MAVLINK_PAYLOAD_LENGTHS[MAVLINK_MESSAGE_IDS.SYS_STATUS])
  const view = new DataView(payload.buffer)
  view.setUint32(0, message.sensorsPresent, true)
  view.setUint32(4, message.sensorsEnabled, true)
  view.setUint32(8, message.sensorsHealth, true)
  view.setUint16(12, message.load, true)
  view.setUint16(14, message.voltageBatteryMv, true)
  view.setInt16(16, message.currentBatteryCa, true)
  view.setUint16(18, message.dropRateComm, true)
  view.setUint16(20, message.errorsComm, true)
  view.setUint16(22, message.errorsCount1, true)
  view.setUint16(24, message.errorsCount2, true)
  view.setUint16(26, message.errorsCount3, true)
  view.setUint16(28, message.errorsCount4, true)
  view.setInt8(30, message.batteryRemaining)
  view.setUint32(31, message.sensorsPresentExtended, true)
  view.setUint32(35, message.sensorsEnabledExtended, true)
  view.setUint32(39, message.sensorsHealthExtended, true)
  return payload
}

function encodeAttitudePayload(message: AttitudeMessage): Uint8Array {
  const payload = new Uint8Array(MAVLINK_PAYLOAD_LENGTHS[MAVLINK_MESSAGE_IDS.ATTITUDE])
  const view = new DataView(payload.buffer)
  view.setUint32(0, message.timeBootMs, true)
  view.setFloat32(4, message.rollRad, true)
  view.setFloat32(8, message.pitchRad, true)
  view.setFloat32(12, message.yawRad, true)
  view.setFloat32(16, message.rollSpeedRadS, true)
  view.setFloat32(20, message.pitchSpeedRadS, true)
  view.setFloat32(24, message.yawSpeedRadS, true)
  return payload
}

function encodeGlobalPositionIntPayload(message: GlobalPositionIntMessage): Uint8Array {
  const payload = new Uint8Array(MAVLINK_PAYLOAD_LENGTHS[MAVLINK_MESSAGE_IDS.GLOBAL_POSITION_INT])
  const view = new DataView(payload.buffer)
  view.setUint32(0, message.timeBootMs, true)
  view.setInt32(4, message.latitudeE7, true)
  view.setInt32(8, message.longitudeE7, true)
  view.setInt32(12, message.altitudeMm, true)
  view.setInt32(16, message.relativeAltitudeMm, true)
  view.setInt16(20, message.velocityXcms, true)
  view.setInt16(22, message.velocityYcms, true)
  view.setInt16(24, message.velocityZcms, true)
  view.setUint16(26, message.headingCdeg, true)
  return payload
}

function decodeAttitudePayload(payload: Uint8Array): AttitudeMessage {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  return {
    type: 'ATTITUDE',
    timeBootMs: view.getUint32(0, true),
    rollRad: view.getFloat32(4, true),
    pitchRad: view.getFloat32(8, true),
    yawRad: view.getFloat32(12, true),
    rollSpeedRadS: view.getFloat32(16, true),
    pitchSpeedRadS: view.getFloat32(20, true),
    yawSpeedRadS: view.getFloat32(24, true)
  }
}

function decodeSysStatusPayload(payload: Uint8Array): SysStatusMessage {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  return {
    type: 'SYS_STATUS',
    sensorsPresent: view.getUint32(0, true),
    sensorsEnabled: view.getUint32(4, true),
    sensorsHealth: view.getUint32(8, true),
    load: view.getUint16(12, true),
    voltageBatteryMv: view.getUint16(14, true),
    currentBatteryCa: view.getInt16(16, true),
    dropRateComm: view.getUint16(18, true),
    errorsComm: view.getUint16(20, true),
    errorsCount1: view.getUint16(22, true),
    errorsCount2: view.getUint16(24, true),
    errorsCount3: view.getUint16(26, true),
    errorsCount4: view.getUint16(28, true),
    batteryRemaining: view.getInt8(30),
    sensorsPresentExtended: payload.byteLength >= 35 ? view.getUint32(31, true) : 0,
    sensorsEnabledExtended: payload.byteLength >= 39 ? view.getUint32(35, true) : 0,
    sensorsHealthExtended: payload.byteLength >= 43 ? view.getUint32(39, true) : 0
  }
}

function decodeGlobalPositionIntPayload(payload: Uint8Array): GlobalPositionIntMessage {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  return {
    type: 'GLOBAL_POSITION_INT',
    timeBootMs: view.getUint32(0, true),
    latitudeE7: view.getInt32(4, true),
    longitudeE7: view.getInt32(8, true),
    altitudeMm: view.getInt32(12, true),
    relativeAltitudeMm: view.getInt32(16, true),
    velocityXcms: view.getInt16(20, true),
    velocityYcms: view.getInt16(22, true),
    velocityZcms: view.getInt16(24, true),
    headingCdeg: view.getUint16(26, true)
  }
}

function encodeParamRequestListPayload(message: ParamRequestListMessage): Uint8Array {
  const payload = new Uint8Array(MAVLINK_PAYLOAD_LENGTHS[MAVLINK_MESSAGE_IDS.PARAM_REQUEST_LIST])
  payload[0] = message.targetSystem & 0xff
  payload[1] = message.targetComponent & 0xff
  return payload
}

function decodeParamRequestListPayload(payload: Uint8Array): ParamRequestListMessage {
  return {
    type: 'PARAM_REQUEST_LIST',
    targetSystem: payload[0],
    targetComponent: payload[1]
  }
}

function encodeParamValuePayload(message: ParamValueMessage): Uint8Array {
  const payload = new Uint8Array(MAVLINK_PAYLOAD_LENGTHS[MAVLINK_MESSAGE_IDS.PARAM_VALUE])
  const view = new DataView(payload.buffer)
  view.setFloat32(0, message.paramValue, true)
  view.setUint16(4, message.paramCount, true)
  view.setUint16(6, message.paramIndex, true)
  payload.set(encodeFixedString(message.paramId, 16), 8)
  view.setUint8(24, message.paramType)
  return payload
}

function decodeParamValuePayload(payload: Uint8Array): ParamValueMessage {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  return {
    type: 'PARAM_VALUE',
    paramValue: view.getFloat32(0, true),
    paramCount: view.getUint16(4, true),
    paramIndex: view.getUint16(6, true),
    paramId: decodeFixedString(payload.subarray(8, 24)),
    paramType: view.getUint8(24)
  }
}

function encodeParamSetPayload(message: ParamSetMessage): Uint8Array {
  const payload = new Uint8Array(MAVLINK_PAYLOAD_LENGTHS[MAVLINK_MESSAGE_IDS.PARAM_SET])
  const view = new DataView(payload.buffer)
  view.setFloat32(0, message.paramValue, true)
  view.setUint8(4, message.targetSystem)
  view.setUint8(5, message.targetComponent)
  payload.set(encodeFixedString(message.paramId, 16), 6)
  view.setUint8(22, message.paramType)
  return payload
}

function decodeParamSetPayload(payload: Uint8Array): ParamSetMessage {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  return {
    type: 'PARAM_SET',
    paramValue: view.getFloat32(0, true),
    targetSystem: view.getUint8(4),
    targetComponent: view.getUint8(5),
    paramId: decodeFixedString(payload.subarray(6, 22)),
    paramType: view.getUint8(22)
  }
}

function encodeRcChannelsPayload(message: RcChannelsMessage): Uint8Array {
  const payload = new Uint8Array(MAVLINK_PAYLOAD_LENGTHS[MAVLINK_MESSAGE_IDS.RC_CHANNELS])
  const view = new DataView(payload.buffer)
  view.setUint32(0, message.timeBootMs, true)

  for (let index = 0; index < 18; index += 1) {
    view.setUint16(4 + index * 2, message.channels[index] ?? 0xffff, true)
  }

  view.setUint8(40, message.channelCount)
  view.setUint8(41, message.rssi)
  return payload
}

function decodeRcChannelsPayload(payload: Uint8Array): RcChannelsMessage {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const channels: number[] = []

  for (let index = 0; index < 18; index += 1) {
    channels.push(view.getUint16(4 + index * 2, true))
  }

  return {
    type: 'RC_CHANNELS',
    timeBootMs: view.getUint32(0, true),
    channelCount: view.getUint8(40),
    channels,
    rssi: view.getUint8(41)
  }
}

function encodeFileTransferProtocolPayload(message: FileTransferProtocolMessage): Uint8Array {
  const payload = new Uint8Array(MAVLINK_PAYLOAD_LENGTHS[MAVLINK_MESSAGE_IDS.FILE_TRANSFER_PROTOCOL])
  payload[0] = message.targetNetwork & 0xff
  payload[1] = message.targetSystem & 0xff
  payload[2] = message.targetComponent & 0xff
  payload.set(message.payload.slice(0, payload.length - 3), 3)
  return payload
}

function decodeFileTransferProtocolPayload(payload: Uint8Array): FileTransferProtocolMessage {
  return {
    type: 'FILE_TRANSFER_PROTOCOL',
    targetNetwork: payload[0] ?? 0,
    targetSystem: payload[1] ?? 0,
    targetComponent: payload[2] ?? 0,
    payload: payload.slice(3)
  }
}

function encodeCommandAckPayload(message: CommandAckMessage): Uint8Array {
  const payload = new Uint8Array(MAVLINK_PAYLOAD_LENGTHS[MAVLINK_MESSAGE_IDS.COMMAND_ACK])
  const view = new DataView(payload.buffer)
  view.setUint16(0, message.command, true)
  view.setUint8(2, message.result)
  view.setUint8(3, message.progress)
  view.setInt32(4, message.resultParam2, true)
  view.setUint8(8, message.targetSystem)
  view.setUint8(9, message.targetComponent)
  return payload
}

function decodeCommandAckPayload(payload: Uint8Array): CommandAckMessage {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  return {
    type: 'COMMAND_ACK',
    command: view.getUint16(0, true),
    result: view.getUint8(2),
    progress: payload.byteLength >= 4 ? view.getUint8(3) : 0,
    resultParam2: payload.byteLength >= 8 ? view.getInt32(4, true) : 0,
    targetSystem: payload.byteLength >= 9 ? view.getUint8(8) : 0,
    targetComponent: payload.byteLength >= 10 ? view.getUint8(9) : 0
  }
}

function encodeCommandLongPayload(message: CommandLongMessage): Uint8Array {
  const payload = new Uint8Array(MAVLINK_PAYLOAD_LENGTHS[MAVLINK_MESSAGE_IDS.COMMAND_LONG])
  const view = new DataView(payload.buffer)
  message.params.forEach((value, index) => {
    view.setFloat32(index * 4, value, true)
  })
  view.setUint16(28, message.command, true)
  view.setUint8(30, message.targetSystem)
  view.setUint8(31, message.targetComponent)
  view.setUint8(32, message.confirmation)
  return payload
}

function decodeCommandLongPayload(payload: Uint8Array): CommandLongMessage {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  return {
    type: 'COMMAND_LONG',
    params: [
      view.getFloat32(0, true),
      view.getFloat32(4, true),
      view.getFloat32(8, true),
      view.getFloat32(12, true),
      view.getFloat32(16, true),
      view.getFloat32(20, true),
      view.getFloat32(24, true)
    ],
    command: view.getUint16(28, true),
    targetSystem: view.getUint8(30),
    targetComponent: view.getUint8(31),
    confirmation: view.getUint8(32)
  }
}

function encodeAutopilotVersionPayload(message: AutopilotVersionMessage): Uint8Array {
  const maxPayloadLength = MAVLINK_PAYLOAD_LENGTHS[MAVLINK_MESSAGE_IDS.AUTOPILOT_VERSION]
  const hasUid2 = message.uid2 !== undefined && message.uid2.some((byte) => byte !== 0)
  const payload = new Uint8Array(hasUid2 ? maxPayloadLength : MAVLINK_MIN_PAYLOAD_LENGTHS[MAVLINK_MESSAGE_IDS.AUTOPILOT_VERSION])
  const view = new DataView(payload.buffer)
  view.setBigUint64(0, message.capabilities, true)
  view.setBigUint64(8, message.uid, true)
  view.setUint32(16, message.flightSwVersion, true)
  view.setUint32(20, message.middlewareSwVersion, true)
  view.setUint32(24, message.osSwVersion, true)
  view.setUint32(28, message.boardVersion, true)
  payload.set(copyFixedBytes(message.flightCustomVersion, 8), 32)
  payload.set(copyFixedBytes(message.middlewareCustomVersion, 8), 40)
  payload.set(copyFixedBytes(message.osCustomVersion, 8), 48)
  view.setUint16(56, message.vendorId, true)
  view.setUint16(58, message.productId, true)
  if (hasUid2) {
    payload.set(copyFixedBytes(message.uid2 as Uint8Array, 18), 60)
  }
  return payload
}

function decodeAutopilotVersionPayload(payload: Uint8Array): AutopilotVersionMessage {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  return {
    type: 'AUTOPILOT_VERSION',
    capabilities: view.getBigUint64(0, true),
    uid: view.getBigUint64(8, true),
    flightSwVersion: view.getUint32(16, true),
    middlewareSwVersion: view.getUint32(20, true),
    osSwVersion: view.getUint32(24, true),
    boardVersion: view.getUint32(28, true),
    flightCustomVersion: payload.slice(32, 40),
    middlewareCustomVersion: payload.slice(40, 48),
    osCustomVersion: payload.slice(48, 56),
    vendorId: view.getUint16(56, true),
    productId: view.getUint16(58, true),
    uid2: payload.byteLength >= 78 ? payload.slice(60, 78) : undefined
  }
}

function encodeStatusTextPayload(message: StatusTextMessage): Uint8Array {
  const payload = new Uint8Array(MAVLINK_PAYLOAD_LENGTHS[MAVLINK_MESSAGE_IDS.STATUSTEXT])
  const view = new DataView(payload.buffer)
  view.setUint8(0, message.severity)
  payload.set(encodeFixedString(message.text, 50), 1)
  view.setUint16(51, message.statusId, true)
  view.setUint8(53, message.chunkSequence)
  return payload
}

function decodeStatusTextPayload(payload: Uint8Array): StatusTextMessage {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  return {
    type: 'STATUSTEXT',
    severity: view.getUint8(0),
    text: decodeFixedString(payload.subarray(1, 51)),
    statusId: payload.byteLength >= 53 ? view.getUint16(51, true) : 0,
    chunkSequence: payload.byteLength >= 54 ? view.getUint8(53) : 0
  }
}

function encodeFixedString(value: string, size: number): Uint8Array {
  const encoded = textEncoder.encode(value)
  const bytes = new Uint8Array(size)
  bytes.set(encoded.slice(0, size))
  return bytes
}

function decodeFixedString(bytes: Uint8Array): string {
  const zeroIndex = bytes.indexOf(0)
  const effective = zeroIndex === -1 ? bytes : bytes.subarray(0, zeroIndex)
  return textDecoder.decode(effective)
}

function copyFixedBytes(value: Uint8Array, size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set(value.slice(0, size))
  return bytes
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  return Uint8Array.from([...left, ...right])
}

function crcMessage(bytes: Uint8Array, crcExtra: number): number {
  let checksum = 0xffff
  for (const byte of bytes) {
    checksum = crcAccumulate(byte, checksum)
  }
  checksum = crcAccumulate(crcExtra, checksum)
  return checksum
}

function crcAccumulate(byte: number, checksum: number): number {
  let tmp = byte ^ (checksum & 0xff)
  tmp ^= (tmp << 4) & 0xff
  return (
    ((checksum >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff
  )
}
