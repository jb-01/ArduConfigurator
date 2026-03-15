import assert from 'node:assert/strict'
import test from 'node:test'

import { ArduPilotConfiguratorRuntime } from '../packages/ardupilot-core/dist/index.js'
import { arducopterMetadata } from '../packages/param-metadata/dist/index.js'
import { MavlinkSession, MavlinkV2Codec } from '../packages/protocol-mavlink/dist/index.js'
import {
  ReplayTransport,
  WebSocketTransport,
  createRecordedSession,
  createRecordedSessionEvent,
  parseRecordedSession,
  serializeRecordedSession
} from '../packages/transport/dist/index.js'

test('WebSocketTransport connects, relays frames, and disconnects with an injected socket', async () => {
  const socket = new FakeWebSocket()
  const transport = new WebSocketTransport('test-websocket', {
    url: 'ws://127.0.0.1:14550',
    socketFactory: () => socket
  })

  const statuses = []
  const receivedFrames = []
  transport.onStatus((status) => {
    statuses.push(status.kind)
  })
  transport.onFrame((frame) => {
    receivedFrames.push([...frame])
  })

  const connectPromise = transport.connect()
  socket.emitOpen()
  await connectPromise

  await transport.send(new Uint8Array([1, 2, 3]))
  assert.deepEqual(socket.sentFrames.map((frame) => [...frame]), [[1, 2, 3]])

  socket.emitMessage(new Uint8Array([9, 8, 7]).buffer)
  await wait(0)
  assert.deepEqual(receivedFrames, [[9, 8, 7]])

  await transport.disconnect()
  assert.deepEqual(statuses, ['idle', 'connecting', 'connected', 'disconnected'])
})

test('ReplayTransport replays inbound frames and validates strict outbound frames', async () => {
  const outboundA = new Uint8Array([1, 2, 3])
  const outboundB = new Uint8Array([4, 5, 6])
  const inboundA = new Uint8Array([10, 11, 12])
  const inboundB = new Uint8Array([13, 14, 15])

  const session = createRecordedSession('transport replay', [
    createRecordedSessionEvent(outboundA, 'out', 0),
    createRecordedSessionEvent(inboundA, 'in', 5),
    createRecordedSessionEvent(outboundB, 'out', 10),
    createRecordedSessionEvent(inboundB, 'in', 15)
  ])
  const roundTrip = parseRecordedSession(serializeRecordedSession(session))
  const transport = new ReplayTransport('strict-replay', {
    session: roundTrip,
    strictOutbound: true,
    speedMultiplier: 50
  })

  const statuses = []
  const receivedFrames = []
  transport.onStatus((status) => {
    statuses.push(status.kind)
  })
  transport.onFrame((frame) => {
    receivedFrames.push([...frame])
  })

  await transport.connect()
  await transport.send(outboundA)
  await transport.send(outboundB)
  await wait(20)
  await transport.disconnect()

  assert.deepEqual(receivedFrames, [[10, 11, 12], [13, 14, 15]])
  assert.deepEqual(statuses, ['idle', 'connecting', 'connected', 'disconnected'])
})

test('ReplayTransport can drive runtime heartbeat and parameter sync from a recorded session', async () => {
  const codec = new MavlinkV2Codec()
  let sequence = 0
  const encodeEnvelope = (message) =>
    codec.encode({
      header: {
        systemId: 1,
        componentId: 1,
        sequence: sequence++
      },
      message,
      timestampMs: Date.now()
    })

  const session = createRecordedSession('ArduCopter minimal sync', [
    createRecordedSessionEvent(
      encodeEnvelope({
        type: 'HEARTBEAT',
        customMode: 0,
        vehicleType: 2,
        autopilot: 3,
        baseMode: 0,
        systemStatus: 4,
        mavlinkVersion: 3
      }),
      'in',
      0
    ),
    createRecordedSessionEvent(
      encodeEnvelope({
        type: 'PARAM_VALUE',
        paramId: 'FLTMODE1',
        paramValue: 0,
        paramType: 9,
        paramCount: 2,
        paramIndex: 0
      }),
      'in',
      5
    ),
    createRecordedSessionEvent(
      encodeEnvelope({
        type: 'PARAM_VALUE',
        paramId: 'FLTMODE2',
        paramValue: 5,
        paramType: 9,
        paramCount: 2,
        paramIndex: 1
      }),
      'in',
      10
    )
  ])

  const transport = new ReplayTransport('runtime-replay', {
    session,
    speedMultiplier: 50
  })
  const runtime = new ArduPilotConfiguratorRuntime(
    new MavlinkSession(transport, new MavlinkV2Codec()),
    arducopterMetadata
  )

  try {
    await runtime.connect()
    await runtime.requestParameterList({ timeoutMs: 200 })
    await runtime.waitForParameterSync({ timeoutMs: 200 })

    const snapshot = runtime.getSnapshot()
    assert.equal(snapshot.connection.kind, 'connected')
    assert.equal(snapshot.vehicle?.vehicle, 'ArduCopter')
    assert.equal(snapshot.parameterStats.status, 'complete')
    assert.equal(snapshot.parameterStats.downloaded, 2)
    assert.equal(snapshot.parameters.find((parameter) => parameter.id === 'FLTMODE2')?.value, 5)
  } finally {
    await runtime.disconnect().catch(() => {})
    runtime.destroy()
  }
})

class FakeWebSocket {
  binaryType = 'blob'
  readyState = 0
  sentFrames = []

  #listeners = {
    open: new Set(),
    message: new Set(),
    error: new Set(),
    close: new Set()
  }

  send(data) {
    this.sentFrames.push(data instanceof Uint8Array ? data : new Uint8Array(data))
  }

  close() {
    this.readyState = 3
  }

  addEventListener(type, listener) {
    this.#listeners[type].add(listener)
  }

  removeEventListener(type, listener) {
    this.#listeners[type].delete(listener)
  }

  emitOpen() {
    this.readyState = 1
    this.#listeners.open.forEach((listener) => listener({ type: 'open' }))
  }

  emitMessage(data) {
    this.#listeners.message.forEach((listener) => listener({ type: 'message', data }))
  }
}

function wait(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })
}
