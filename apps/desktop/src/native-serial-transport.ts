import { SerialPort } from 'serialport'

import type { FrameListener, StatusListener, Transport, TransportStatus, Unsubscribe } from '@arduconfig/transport'

export interface NativeSerialTransportOptions {
  path: string
  baudRate: number
}

export interface NativeSerialPortInfo {
  path: string
  manufacturer?: string
  serialNumber?: string
  vendorId?: string
  productId?: string
}

export class NativeSerialTransport implements Transport {
  readonly id: string
  readonly kind = 'native-serial' as const

  private readonly frameListeners = new Set<FrameListener>()
  private readonly statusListeners = new Set<StatusListener>()
  private readonly options: NativeSerialTransportOptions

  private status: TransportStatus = { kind: 'idle' }
  private port?: SerialPort

  constructor(id: string, options: NativeSerialTransportOptions) {
    this.id = id
    this.options = options
  }

  static async listPorts(): Promise<NativeSerialPortInfo[]> {
    const ports = await SerialPort.list()
    return ports.map((port) => ({
      path: port.path,
      manufacturer: port.manufacturer ?? undefined,
      serialNumber: port.serialNumber ?? undefined,
      vendorId: port.vendorId ?? undefined,
      productId: port.productId ?? undefined
    }))
  }

  getStatus(): TransportStatus {
    return this.status
  }

  async connect(): Promise<void> {
    if (this.port?.isOpen) {
      return
    }

    this.updateStatus({ kind: 'connecting' })

    const port = new SerialPort({
      path: this.options.path,
      baudRate: this.options.baudRate,
      autoOpen: false
    })

    await new Promise<void>((resolve, reject) => {
      port.open((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })

    port.on('data', (data: Buffer) => {
      this.frameListeners.forEach((listener) => listener(new Uint8Array(data)))
    })
    port.on('error', (error: Error) => {
      this.updateStatus({ kind: 'error', message: error.message })
    })
    port.on('close', () => {
      if (this.status.kind === 'connected') {
        this.updateStatus({ kind: 'disconnected', reason: 'Serial port closed.' })
      }
    })

    this.port = port
    this.updateStatus({ kind: 'connected' })
  }

  async disconnect(): Promise<void> {
    if (!this.port) {
      return
    }

    await new Promise<void>((resolve, reject) => {
      this.port!.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })

    this.port = undefined
    this.updateStatus({ kind: 'disconnected', reason: 'Serial port closed.' })
  }

  async send(frame: Uint8Array): Promise<void> {
    if (!this.port?.isOpen) {
      throw new Error('NativeSerialTransport is not connected.')
    }

    await new Promise<void>((resolve, reject) => {
      this.port!.write(Buffer.from(frame), (error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
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

  private updateStatus(status: TransportStatus): void {
    this.status = status
    this.statusListeners.forEach((listener) => listener(status))
  }
}
