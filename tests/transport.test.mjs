import assert from 'node:assert/strict'
import test from 'node:test'

import { ArduPilotConfiguratorRuntime } from '../packages/ardupilot-core/dist/index.js'
import { arducopterMetadata } from '../packages/param-metadata/dist/index.js'
import { MavlinkSession, MavlinkV2Codec, createArduCopterMockScenario } from '../packages/protocol-mavlink/dist/index.js'
import {
  MockTransport,
  ReplayTransport,
  WebSocketTransport,
  createRecordedSession,
  createRecordedSessionEvent,
  parseRecordedSession,
  serializeRecordedSession
} from '../packages/transport/dist/index.js'
import { NativeSerialTransport } from '../apps/desktop/dist/native-serial-transport.js'
import { createDesktopWebPreferences } from '../apps/desktop/dist/electron-window-options.js'
import { startWebSocketBridgeServer } from '../apps/desktop/dist/websocket-bridge-server.js'

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
  await wait(20)
  await transport.send(outboundB)
  await wait(20)
  await transport.disconnect()

  assert.deepEqual(receivedFrames, [[10, 11, 12], [13, 14, 15]])
  assert.deepEqual(statuses, ['idle', 'connecting', 'connected', 'disconnected'])
})

test('ReplayTransport strict mode gates inbound frames behind matched outbound steps', async () => {
  const outboundA = new Uint8Array([1, 2, 3])
  const outboundB = new Uint8Array([4, 5, 6])
  const inboundA = new Uint8Array([10, 11, 12])
  const inboundB = new Uint8Array([13, 14, 15])

  const transport = new ReplayTransport('strict-gated-replay', {
    session: createRecordedSession('strict gated replay', [
      createRecordedSessionEvent(outboundA, 'out', 0),
      createRecordedSessionEvent(inboundA, 'in', 5),
      createRecordedSessionEvent(outboundB, 'out', 10),
      createRecordedSessionEvent(inboundB, 'in', 15)
    ]),
    strictOutbound: true,
    speedMultiplier: 50
  })

  const receivedFrames = []
  transport.onFrame((frame) => {
    receivedFrames.push([...frame])
  })

  await transport.connect()
  await wait(20)
  assert.deepEqual(receivedFrames, [])

  await transport.send(outboundA)
  await wait(20)
  assert.deepEqual(receivedFrames, [[10, 11, 12]])

  await transport.send(outboundB)
  await wait(20)
  assert.deepEqual(receivedFrames, [[10, 11, 12], [13, 14, 15]])
  await transport.disconnect()
})

test('ReplayTransport strict mode fails disconnect when required outbound frames were never emitted', async () => {
  const outboundA = new Uint8Array([1, 2, 3])
  const inboundA = new Uint8Array([10, 11, 12])
  const transport = new ReplayTransport('strict-missing-outbound', {
    session: createRecordedSession('strict missing outbound', [
      createRecordedSessionEvent(outboundA, 'out', 0),
      createRecordedSessionEvent(inboundA, 'in', 5)
    ]),
    strictOutbound: true,
    speedMultiplier: 50
  })

  const statuses = []
  transport.onStatus((status) => {
    statuses.push(status.kind)
  })

  await transport.connect()
  await assert.rejects(
    () => transport.disconnect(),
    /ended before 1 required outbound frame was emitted/i
  )
  assert.deepEqual(statuses, ['idle', 'connecting', 'connected', 'error'])
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

test('MockTransport serializes chunked inbound frames so demo parameter sync completes', async () => {
  const scenario = createArduCopterMockScenario()
  const transport = new MockTransport('mock-demo-transport', {
    initialFrames: scenario.initialFrames,
    respondToOutbound: scenario.respondToOutbound,
    frameIntervalMs: 35,
    responseDelayMs: 45,
    chunkSize: 7
  })
  const runtime = new ArduPilotConfiguratorRuntime(
    new MavlinkSession(transport, new MavlinkV2Codec()),
    arducopterMetadata
  )

  try {
    await runtime.connect()
    await runtime.requestParameterList({ timeoutMs: 500 })
    const stats = await runtime.waitForParameterSync({ timeoutMs: 15000 })

    assert.equal(stats.status, 'complete')
    assert.equal(stats.downloaded, 125)
    assert.equal(stats.total, 125)
    assert.equal(runtime.getSnapshot().parameters.find((parameter) => parameter.id === 'FRAME_CLASS')?.value, 1)
    assert.equal(runtime.getSnapshot().parameters.find((parameter) => parameter.id === 'FRAME_TYPE')?.value, 1)
  } finally {
    await runtime.disconnect().catch(() => {})
    runtime.destroy()
  }
})

test('Bundled WebSocket bridge can drive runtime heartbeat and parameter sync from the demo source', async (t) => {
  const scenario = createArduCopterMockScenario()
  let bridge
  try {
    bridge = await startWebSocketBridgeServer({
      host: '127.0.0.1',
      port: 0,
      route: '/mavlink',
      transport: new MockTransport('bridge-demo-transport', {
        initialFrames: scenario.initialFrames,
        respondToOutbound: scenario.respondToOutbound,
        frameIntervalMs: 12,
        responseDelayMs: 20,
        chunkSize: 7
      })
    })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error.code === 'EPERM' || error.code === 'EACCES')) {
      t.skip('Listening sockets are not available in the current sandbox.')
      return
    }
    throw error
  }

  const runtime = new ArduPilotConfiguratorRuntime(
    new MavlinkSession(
      new WebSocketTransport('bridge-client', {
        url: bridge.url
      }),
      new MavlinkV2Codec()
    ),
    arducopterMetadata
  )

  try {
    await runtime.connect()
    await runtime.requestParameterList({ timeoutMs: 1000 })
    const stats = await runtime.waitForParameterSync({ timeoutMs: 8000 })

    assert.equal(runtime.getSnapshot().connection.kind, 'connected')
    assert.equal(runtime.getSnapshot().vehicle?.vehicle, 'ArduCopter')
    assert.equal(stats.status, 'complete')
    assert.equal(stats.downloaded, 125)
    assert.equal(runtime.getSnapshot().parameters.find((parameter) => parameter.id === 'FRAME_CLASS')?.value, 1)
  } finally {
    await runtime.disconnect().catch(() => {})
    runtime.destroy()
    await bridge?.close().catch(() => {})
  }
})

test('NativeSerialTransport surfaces an error status when opening the port fails', async () => {
  const statuses = []
  const transport = new NativeSerialTransport(
    'failing-native-serial',
    {
      path: '/dev/tty.invalid',
      baudRate: 115200
    },
    {
      createPort: () => new FailingNativeSerialPort(new Error('Permission denied'))
    }
  )

  transport.onStatus((status) => {
    statuses.push(status)
  })

  await assert.rejects(() => transport.connect(), /Permission denied/)
  assert.deepEqual(statuses, [
    { kind: 'idle' },
    { kind: 'connecting' },
    { kind: 'error', message: 'Permission denied' }
  ])
  assert.deepEqual(transport.getStatus(), { kind: 'error', message: 'Permission denied' })
})

test('Desktop Electron web preferences keep the renderer sandbox enabled', () => {
  const webPreferences = createDesktopWebPreferences('/tmp/arduconfig-preload.js')

  assert.equal(webPreferences.contextIsolation, true)
  assert.equal(webPreferences.nodeIntegration, false)
  assert.equal(webPreferences.sandbox, true)
  assert.equal(webPreferences.preload, '/tmp/arduconfig-preload.js')
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

class FailingNativeSerialPort {
  constructor(error) {
    this.error = error
    this.isOpen = false
  }

  on() {
    return this
  }

  open(callback) {
    callback(this.error)
  }

  close(callback) {
    callback(undefined)
  }

  write(_data, callback) {
    callback(undefined)
  }
}

function wait(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })
}
