import type { FrameListener, StatusListener, Transport, TransportStatus, Unsubscribe } from './types.js'

interface WebSocketLike {
  binaryType: BinaryType
  readonly readyState: number
  send(data: Uint8Array | ArrayBuffer): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'open', listener: (event: Event) => void): void
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  addEventListener(type: 'error', listener: (event: Event) => void): void
  addEventListener(type: 'close', listener: (event: CloseEvent) => void): void
  removeEventListener(type: 'open', listener: (event: Event) => void): void
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  removeEventListener(type: 'error', listener: (event: Event) => void): void
  removeEventListener(type: 'close', listener: (event: CloseEvent) => void): void
}

export interface WebSocketTransportOptions {
  url: string
  protocols?: string | string[]
  socketFactory?: (url: string, protocols?: string | string[]) => WebSocketLike
}

export class WebSocketTransport implements Transport {
  readonly kind = 'websocket' as const
  readonly id: string

  private readonly frameListeners = new Set<FrameListener>()
  private readonly statusListeners = new Set<StatusListener>()
  private readonly options: WebSocketTransportOptions

  private status: TransportStatus = { kind: 'idle' }
  private socket?: WebSocketLike

  private readonly handleMessage = (event: MessageEvent) => {
    void this.forwardFrame(event.data)
  }

  private readonly handleRuntimeError = () => {
    if (this.status.kind === 'connected' || this.status.kind === 'connecting') {
      this.updateStatus({ kind: 'error', message: `WebSocket transport ${this.id} encountered an error.` })
    }
  }

  private readonly handleRuntimeClose = (event: CloseEvent) => {
    const reason = event.reason || `WebSocket closed (${event.code})`
    if (this.status.kind === 'connected' || this.status.kind === 'connecting') {
      this.updateStatus({ kind: 'disconnected', reason })
    }
  }

  constructor(id = 'websocket', options: WebSocketTransportOptions) {
    this.id = id
    this.options = options
  }

  static isSupported(): boolean {
    return typeof globalThis.WebSocket === 'function'
  }

  getStatus(): TransportStatus {
    return this.status
  }

  async connect(): Promise<void> {
    if (this.status.kind === 'connected') {
      return
    }

    const socketFactory = this.options.socketFactory ?? defaultSocketFactory
    if (!socketFactory) {
      this.updateStatus({ kind: 'error', message: 'WebSocket is not available in this environment.' })
      return
    }

    this.updateStatus({ kind: 'connecting' })

    await new Promise<void>((resolve, reject) => {
      const socket = socketFactory(this.options.url, this.options.protocols)
      this.socket = socket
      socket.binaryType = 'arraybuffer'

      const cleanupConnectListeners = () => {
        socket.removeEventListener('open', handleOpen)
        socket.removeEventListener('error', handleError)
        socket.removeEventListener('close', handleCloseBeforeOpen)
      }

      const handleOpen = () => {
        cleanupConnectListeners()
        socket.addEventListener('message', this.handleMessage)
        socket.addEventListener('error', this.handleRuntimeError)
        socket.addEventListener('close', this.handleRuntimeClose)
        this.updateStatus({ kind: 'connected' })
        resolve()
      }

      const handleError = () => {
        cleanupConnectListeners()
        const message = `Failed to open WebSocket ${this.options.url}.`
        this.updateStatus({ kind: 'error', message })
        reject(new Error(message))
      }

      const handleCloseBeforeOpen = (event: CloseEvent) => {
        cleanupConnectListeners()
        const reason = event.reason || `WebSocket closed before opening (${event.code})`
        this.updateStatus({ kind: 'disconnected', reason })
        reject(new Error(reason))
      }

      socket.addEventListener('open', handleOpen)
      socket.addEventListener('error', handleError)
      socket.addEventListener('close', handleCloseBeforeOpen)
    })
  }

  async disconnect(): Promise<void> {
    if (!this.socket) {
      this.updateStatus({ kind: 'disconnected', reason: 'WebSocket already closed.' })
      return
    }

    const socket = this.socket
    this.detachRuntimeListeners(socket)
    this.socket = undefined
    socket.close(1000, 'Requested disconnect')
    this.updateStatus({ kind: 'disconnected', reason: 'WebSocket closed.' })
  }

  async send(frame: Uint8Array): Promise<void> {
    if (!this.socket || this.socket.readyState !== SOCKET_OPEN_READY_STATE) {
      throw new Error('WebSocketTransport is not connected.')
    }

    this.socket.send(frame)
  }

  onFrame(listener: FrameListener): Unsubscribe {
    this.frameListeners.add(listener)
    return () => {
      this.frameListeners.delete(listener)
    }
  }

  onStatus(listener: StatusListener): Unsubscribe {
    this.statusListeners.add(listener)
    listener(this.status)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  private detachRuntimeListeners(socket: WebSocketLike): void {
    socket.removeEventListener('message', this.handleMessage)
    socket.removeEventListener('error', this.handleRuntimeError)
    socket.removeEventListener('close', this.handleRuntimeClose)
  }

  private async forwardFrame(data: unknown): Promise<void> {
    const frame = await normalizeSocketData(data)
    if (!frame) {
      return
    }

    this.frameListeners.forEach((listener) => listener(frame))
  }

  private updateStatus(status: TransportStatus): void {
    this.status = status
    this.statusListeners.forEach((listener) => listener(status))
  }
}

const SOCKET_OPEN_READY_STATE = 1

function defaultSocketFactory(url: string, protocols?: string | string[]): WebSocketLike {
  if (typeof globalThis.WebSocket !== 'function') {
    throw new Error('WebSocket is not available in this environment.')
  }

  return new globalThis.WebSocket(url, protocols)
}

async function normalizeSocketData(data: unknown): Promise<Uint8Array | undefined> {
  if (data instanceof Uint8Array) {
    return data
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }

  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer())
  }

  if (typeof data === 'string') {
    return new TextEncoder().encode(data)
  }

  return undefined
}
