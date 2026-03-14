import type { MavlinkEnvelope } from './messages.js'

export interface StreamingCodec<TMessage> {
  encode(message: TMessage): Uint8Array
  push(chunk: Uint8Array): TMessage[]
  reset(): void
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export class JsonLinesMavlinkCodec implements StreamingCodec<MavlinkEnvelope> {
  private buffer = ''

  encode(message: MavlinkEnvelope): Uint8Array {
    return textEncoder.encode(`${JSON.stringify(message)}\n`)
  }

  push(chunk: Uint8Array): MavlinkEnvelope[] {
    this.buffer += textDecoder.decode(chunk, { stream: true })
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''

    return lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as MavlinkEnvelope)
  }

  reset(): void {
    this.buffer = ''
  }
}

export function decodeSingleJsonEnvelope(frame: Uint8Array): MavlinkEnvelope {
  const decoded = textDecoder.decode(frame).trim()
  return JSON.parse(decoded) as MavlinkEnvelope
}
