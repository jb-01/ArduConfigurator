export type Unsubscribe = () => void

export type TransportKind = 'mock' | 'web-serial' | 'native-serial' | 'websocket'

export type TransportStatus =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'connected' }
  | { kind: 'disconnected'; reason?: string }
  | { kind: 'error'; message: string }

export type FrameListener = (frame: Uint8Array) => void
export type StatusListener = (status: TransportStatus) => void

export interface Transport {
  readonly id: string
  readonly kind: TransportKind
  getStatus(): TransportStatus
  connect(): Promise<void>
  disconnect(): Promise<void>
  send(frame: Uint8Array): Promise<void>
  onFrame(listener: FrameListener): Unsubscribe
  onStatus(listener: StatusListener): Unsubscribe
}

export interface MockTransportOptions {
  initialFrames?: Uint8Array[]
  frameIntervalMs?: number
  responseDelayMs?: number
  chunkSize?: number
  respondToOutbound?: (frame: Uint8Array) => Uint8Array[] | Promise<Uint8Array[]>
}
