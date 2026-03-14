export interface HeartbeatMessage {
  type: 'HEARTBEAT'
  autopilot: number
  vehicleType: number
  baseMode: number
  customMode: number
  systemStatus: number
  mavlinkVersion: number
}

export interface ParamValueMessage {
  type: 'PARAM_VALUE'
  paramId: string
  paramValue: number
  paramType: number
  paramCount: number
  paramIndex: number
}

export interface StatusTextMessage {
  type: 'STATUSTEXT'
  severity: number
  text: string
  statusId: number
  chunkSequence: number
}

export interface RcChannelsMessage {
  type: 'RC_CHANNELS'
  timeBootMs: number
  channelCount: number
  channels: number[]
  rssi: number
}

export interface SysStatusMessage {
  type: 'SYS_STATUS'
  sensorsPresent: number
  sensorsEnabled: number
  sensorsHealth: number
  load: number
  voltageBatteryMv: number
  currentBatteryCa: number
  batteryRemaining: number
  dropRateComm: number
  errorsComm: number
  errorsCount1: number
  errorsCount2: number
  errorsCount3: number
  errorsCount4: number
  sensorsPresentExtended: number
  sensorsEnabledExtended: number
  sensorsHealthExtended: number
}

export interface ParamRequestListMessage {
  type: 'PARAM_REQUEST_LIST'
  targetSystem: number
  targetComponent: number
}

export interface ParamSetMessage {
  type: 'PARAM_SET'
  targetSystem: number
  targetComponent: number
  paramId: string
  paramValue: number
  paramType: number
}

export interface CommandAckMessage {
  type: 'COMMAND_ACK'
  command: number
  result: number
  progress: number
  resultParam2: number
  targetSystem: number
  targetComponent: number
}

export interface CommandLongMessage {
  type: 'COMMAND_LONG'
  command: number
  targetSystem: number
  targetComponent: number
  confirmation: number
  params: [number, number, number, number, number, number, number]
}

export type MavlinkMessage =
  | HeartbeatMessage
  | RcChannelsMessage
  | SysStatusMessage
  | ParamValueMessage
  | StatusTextMessage
  | ParamRequestListMessage
  | ParamSetMessage
  | CommandAckMessage
  | CommandLongMessage

export interface MavlinkEnvelope {
  header: {
    systemId: number
    componentId: number
    sequence: number
  }
  message: MavlinkMessage
  timestampMs?: number
}
