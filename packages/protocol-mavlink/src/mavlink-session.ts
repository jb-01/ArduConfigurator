import type { Transport, TransportStatus, Unsubscribe } from '@arduconfig/transport'

import type { StreamingCodec } from './json-lines-codec.js'
import type { MavlinkEnvelope, MavlinkMessage } from './messages.js'

type MessageListener = (envelope: MavlinkEnvelope) => void
type StatusListener = (status: TransportStatus) => void

export interface SessionSendOptions {
  systemId?: number
  componentId?: number
}

export class MavlinkSession {
  private readonly messageListeners = new Set<MessageListener>()
  private readonly statusListeners = new Set<StatusListener>()
  private readonly transportSubscriptions: Unsubscribe[]
  private sequence = 0

  constructor(
    private readonly transport: Transport,
    private readonly codec: StreamingCodec<MavlinkEnvelope>,
    private readonly gcsIdentity = { systemId: 255, componentId: 190 }
  ) {
    this.transportSubscriptions = [
      this.transport.onFrame((frame: Uint8Array) => {
        this.codec.push(frame).forEach((envelope) => {
          this.messageListeners.forEach((listener) => listener(envelope))
        })
      }),
      this.transport.onStatus((status: TransportStatus) => {
        this.statusListeners.forEach((listener) => listener(status))
      })
    ]
  }

  getTransportStatus(): TransportStatus {
    return this.transport.getStatus()
  }

  async connect(): Promise<void> {
    await this.transport.connect()
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect()
  }

  async send(message: MavlinkMessage, options: SessionSendOptions = {}): Promise<void> {
    const envelope: MavlinkEnvelope = {
      header: {
        systemId: options.systemId ?? this.gcsIdentity.systemId,
        componentId: options.componentId ?? this.gcsIdentity.componentId,
        sequence: this.sequence++
      },
      message,
      timestampMs: Date.now()
    }

    await this.transport.send(this.codec.encode(envelope))
  }

  onMessage(listener: MessageListener): Unsubscribe {
    this.messageListeners.add(listener)
    return () => {
      this.messageListeners.delete(listener)
    }
  }

  onStatus(listener: StatusListener): Unsubscribe {
    this.statusListeners.add(listener)
    listener(this.transport.getStatus())
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  destroy(): void {
    this.transportSubscriptions.forEach((unsubscribe) => unsubscribe())
    this.transportSubscriptions.length = 0
    this.codec.reset()
  }
}
