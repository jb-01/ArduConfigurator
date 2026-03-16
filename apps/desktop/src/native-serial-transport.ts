import { SerialPort } from 'serialport'

import type { FrameListener, StatusListener, Transport, TransportStatus, Unsubscribe } from '@arduconfig/transport'

export interface NativeSerialTransportOptions {
  path: string
  baudRate: number
}

export interface NativeSerialTransportDependencies {
  createPort?: (options: NativeSerialTransportOptions & { autoOpen: false }) => NativeSerialPort
}

export interface NativeSerialPortInfo {
  path: string
  manufacturer?: string
  serialNumber?: string
  vendorId?: string
  productId?: string
}

interface NativeSerialPort {
  readonly isOpen: boolean
  on(event: 'data', listener: (data: Buffer) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  on(event: 'close', listener: () => void): unknown
  open(callback: (error: Error | null | undefined) => void): void
  close(callback: (error: Error | null | undefined) => void): void
  write(data: Buffer, callback: (error: Error | null | undefined) => void): void
}

export class NativeSerialTransport implements Transport {
  readonly id: string
  readonly kind = 'native-serial' as const

  private readonly frameListeners = new Set<FrameListener>()
  private readonly statusListeners = new Set<StatusListener>()
  private readonly options: NativeSerialTransportOptions
  private readonly createPort: (options: NativeSerialTransportOptions & { autoOpen: false }) => NativeSerialPort

  private status: TransportStatus = { kind: 'idle' }
  private port?: NativeSerialPort

  constructor(id: string, options: NativeSerialTransportOptions, dependencies: NativeSerialTransportDependencies = {}) {
    this.id = id
    this.options = options
    this.createPort =
      dependencies.createPort ??
      ((serialOptions) =>
        new SerialPort({
          path: serialOptions.path,
          baudRate: serialOptions.baudRate,
          autoOpen: serialOptions.autoOpen
        }))
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

    let port: NativeSerialPort
    try {
      port = this.createPort({
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
    } catch (error) {
      this.port = undefined
      const message = error instanceof Error ? error.message : 'Unknown native serial error.'
      this.updateStatus({ kind: 'error', message })
      throw error instanceof Error ? error : new Error(message)
    }

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
