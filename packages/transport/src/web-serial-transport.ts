import type { FrameListener, StatusListener, Transport, TransportStatus, Unsubscribe } from './types.js'

interface WebSerialPortLike {
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  open(options: { baudRate: number; bufferSize?: number }): Promise<void>
  close(): Promise<void>
}

interface WebSerialNavigatorLike {
  requestPort(): Promise<WebSerialPortLike>
}

export interface WebSerialTransportOptions {
  baudRate: number
  bufferSize?: number
  port?: WebSerialPortLike
}

export class WebSerialTransport implements Transport {
  readonly kind = 'web-serial' as const
  readonly id: string

  private readonly frameListeners = new Set<FrameListener>()
  private readonly statusListeners = new Set<StatusListener>()
  private readonly options: WebSerialTransportOptions

  private status: TransportStatus = { kind: 'idle' }
  private port?: WebSerialPortLike
  private reader?: ReadableStreamDefaultReader<Uint8Array>
  private writer?: WritableStreamDefaultWriter<Uint8Array>

  constructor(id = 'web-serial', options: WebSerialTransportOptions) {
    this.id = id
    this.options = options
    this.port = options.port
  }

  static isSupported(): boolean {
    return getSerialNavigator() !== undefined
  }

  getStatus(): TransportStatus {
    return this.status
  }

  async connect(): Promise<void> {
    if (this.status.kind === 'connected') {
      return
    }

    const serial = getSerialNavigator()
    if (!this.port && !serial) {
      this.updateStatus({ kind: 'error', message: 'Web Serial is not available in this browser.' })
      return
    }

    this.updateStatus({ kind: 'connecting' })

    this.port = this.port ?? (await serial!.requestPort())
    await this.port.open({
      baudRate: this.options.baudRate,
      bufferSize: this.options.bufferSize
    })

    if (!this.port.readable || !this.port.writable) {
      this.updateStatus({ kind: 'error', message: 'Selected serial port does not expose readable/writable streams.' })
      return
    }

    this.reader = this.port.readable.getReader()
    this.writer = this.port.writable.getWriter()
    this.updateStatus({ kind: 'connected' })
    void this.readLoop()
  }

  async disconnect(): Promise<void> {
    await this.reader?.cancel()
    this.reader?.releaseLock()
    this.writer?.releaseLock()
    this.reader = undefined
    this.writer = undefined
    await this.port?.close()
    this.updateStatus({ kind: 'disconnected', reason: 'Serial port closed.' })
  }

  async send(frame: Uint8Array): Promise<void> {
    if (!this.writer) {
      throw new Error('WebSerialTransport is not connected.')
    }

    await this.writer.write(frame)
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

  private async readLoop(): Promise<void> {
    try {
      while (this.reader) {
        const { value, done } = await this.reader.read()
        if (done) {
          break
        }
        if (!value) {
          continue
        }

        this.frameListeners.forEach((listener) => listener(value))
      }

      if (this.status.kind === 'connected') {
        this.updateStatus({ kind: 'disconnected', reason: 'Serial read loop ended.' })
      }
    } catch (error) {
      this.updateStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Unknown Web Serial error.'
      })
    }
  }

  private updateStatus(status: TransportStatus): void {
    this.status = status
    this.statusListeners.forEach((listener) => listener(status))
  }
}

function getSerialNavigator(): WebSerialNavigatorLike | undefined {
  const candidate = navigator as Navigator & { serial?: WebSerialNavigatorLike }
  return candidate.serial
}
