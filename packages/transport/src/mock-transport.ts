import type {
  FrameListener,
  MockTransportOptions,
  StatusListener,
  Transport,
  TransportStatus,
  Unsubscribe,
} from './types.js'

const DEFAULT_STATUS: TransportStatus = { kind: 'idle' }

export class MockTransport implements Transport {
  readonly id: string
  readonly kind = 'mock' as const

  private readonly frameListeners = new Set<FrameListener>()
  private readonly statusListeners = new Set<StatusListener>()
  private readonly outboundFramesLog: Uint8Array[] = []
  private readonly options: Required<MockTransportOptions>
  private readonly pendingTimers = new Set<ReturnType<typeof setTimeout>>()

  private status: TransportStatus = DEFAULT_STATUS
  private isConnected = false

  constructor(id: string, options: MockTransportOptions = {}) {
    this.id = id
    this.options = {
      initialFrames: options.initialFrames ?? [],
      frameIntervalMs: options.frameIntervalMs ?? 150,
      responseDelayMs: options.responseDelayMs ?? 80,
      chunkSize: options.chunkSize ?? 0,
      respondToOutbound: options.respondToOutbound ?? (() => [])
    }
  }

  getStatus(): TransportStatus {
    return this.status
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return
    }

    this.updateStatus({ kind: 'connecting' })
    this.isConnected = true
    this.updateStatus({ kind: 'connected' })

    this.options.initialFrames.forEach((frame, index) => {
      this.queueInboundFrame(frame, this.options.frameIntervalMs * index)
    })
  }

  async disconnect(): Promise<void> {
    this.pendingTimers.forEach((timer) => clearTimeout(timer))
    this.pendingTimers.clear()
    this.isConnected = false
    this.updateStatus({ kind: 'disconnected', reason: 'Mock transport disconnected.' })
  }

  async send(frame: Uint8Array): Promise<void> {
    this.outboundFramesLog.push(frame)
    const responseFrames = await this.options.respondToOutbound(frame)
    responseFrames.forEach((responseFrame, index) => {
      this.queueInboundFrame(responseFrame, this.options.responseDelayMs + this.options.frameIntervalMs * index)
    })
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

  outboundFrames(): Uint8Array[] {
    return [...this.outboundFramesLog]
  }

  private queueInboundFrame(frame: Uint8Array, delayMs: number): void {
    const timer = setTimeout(() => {
      this.pendingTimers.delete(timer)
      if (!this.isConnected) {
        return
      }

      const chunks = chunkFrame(frame, this.options.chunkSize)
      chunks.forEach((chunk, index) => {
        const nestedTimer = setTimeout(() => {
          this.pendingTimers.delete(nestedTimer)
          if (!this.isConnected) {
            return
          }

          this.frameListeners.forEach((listener) => listener(chunk))
        }, index * 2)

        this.pendingTimers.add(nestedTimer)
      })
    }, delayMs)

    this.pendingTimers.add(timer)
  }

  private updateStatus(status: TransportStatus): void {
    this.status = status
    this.statusListeners.forEach((listener) => listener(status))
  }
}

function chunkFrame(frame: Uint8Array, chunkSize: number): Uint8Array[] {
  if (chunkSize <= 0 || frame.length <= chunkSize) {
    return [frame]
  }

  const chunks: Uint8Array[] = []
  for (let index = 0; index < frame.length; index += chunkSize) {
    chunks.push(frame.slice(index, index + chunkSize))
  }
  return chunks
}
