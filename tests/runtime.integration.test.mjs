import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ArduPilotConfiguratorRuntime,
  ParameterBatchWriteError,
  createParameterBackup,
  createParameterSnapshot,
  createParameterSnapshotLibrary,
  deriveDraftValuesFromParameterBackup,
  parseParameterBackup,
  parseParameterSnapshotInput,
  parseParameterSnapshotLibrary,
  resolveParameterSnapshotInput,
  serializeParameterBackup,
  serializeParameterSnapshotLibrary
} from '../packages/ardupilot-core/dist/index.js'
import { createMockSITL } from '../packages/mock-sitl/dist/index.js'
import { arducopterMetadata } from '../packages/param-metadata/dist/index.js'
import { MAV_AUTOPILOT, MAV_CMD, MAV_TYPE, MAVLINK_MESSAGE_IDS } from '../packages/protocol-mavlink/dist/index.js'

test('mock SITL connects and syncs a full parameter table', async () => {
  const sitl = createMockSITL()

  try {
    const snapshot = await sitl.connectAndSync({
      heartbeatTimeoutMs: 2000,
      parameterTimeoutMs: 5000
    })

    assert.equal(snapshot.connection.kind, 'connected')
    assert.equal(snapshot.vehicle?.vehicle, 'ArduCopter')
    assert.equal(snapshot.parameterStats.status, 'complete')
    assert.ok(snapshot.parameterStats.downloaded >= 10)
  } finally {
    await sitl.disconnect().catch(() => {})
    sitl.destroy()
  }
})

test('verified parameter writes resolve on PARAM_VALUE readback', async () => {
  const sitl = createMockSITL()

  try {
    await sitl.connectAndSync({
      heartbeatTimeoutMs: 2000,
      parameterTimeoutMs: 5000
    })

    const result = await sitl.runtime.setParameter('FLTMODE1', 5, {
      verifyTimeoutMs: 1000
    })

    assert.equal(result.paramId, 'FLTMODE1')
    assert.equal(result.confirmedValue, 5)
    assert.equal(
      sitl.runtime.getSnapshot().parameters.find((parameter) => parameter.id === 'FLTMODE1')?.value,
      5
    )
  } finally {
    await sitl.disconnect().catch(() => {})
    sitl.destroy()
  }
})

test('batch writes roll back earlier changes when a later verification fails', async () => {
  const runtime = new ArduPilotConfiguratorRuntime(
    createEchoSession({
      FLTMODE1: 0,
      FLTMODE2: 1
    }, ({ paramId, paramValue }) => paramId === 'FLTMODE2' && paramValue === 6),
    arducopterMetadata
  )

  try {
    await runtime.connect()
    await runtime.requestParameterList({ timeoutMs: 200 })
    await runtime.waitForParameterSync({ timeoutMs: 200 })

    let capturedError
    try {
      await runtime.setParameters(
        [
          { paramId: 'FLTMODE1', paramValue: 5 },
          { paramId: 'FLTMODE2', paramValue: 6 }
        ],
        { verifyTimeoutMs: 50 }
      )
    } catch (error) {
      capturedError = error
    }

    assert.ok(capturedError instanceof ParameterBatchWriteError)
    assert.equal(capturedError.result.applied.length, 1)
    assert.equal(capturedError.result.rolledBack.length, 1)
    assert.match(capturedError.message, /Rolled back 1 previously applied parameter change/)

    const snapshot = runtime.getSnapshot()
    assert.equal(snapshot.parameters.find((parameter) => parameter.id === 'FLTMODE1')?.value, 0)
    assert.equal(snapshot.parameters.find((parameter) => parameter.id === 'FLTMODE2')?.value, 1)
  } finally {
    await runtime.disconnect().catch(() => {})
    runtime.destroy()
  }
})

test('parameter backups round-trip into staged restore diffs', async () => {
  const sitl = createMockSITL()

  try {
    const initialSnapshot = await sitl.connectAndSync({
      heartbeatTimeoutMs: 2000,
      parameterTimeoutMs: 5000
    })

    const backup = createParameterBackup(initialSnapshot)
    const modeEntry = backup.parameters.find((parameter) => parameter.id === 'FLTMODE1')
    assert.ok(modeEntry)
    modeEntry.value = 5

    const restore = deriveDraftValuesFromParameterBackup(
      initialSnapshot.parameters,
      parseParameterBackup(serializeParameterBackup(backup))
    )

    assert.equal(restore.changedCount, 1)
    assert.deepEqual(restore.draftValues, {
      FLTMODE1: '5'
    })
  } finally {
    await sitl.disconnect().catch(() => {})
    sitl.destroy()
  }
})

test('snapshot backups exclude volatile STAT_ parameters and ignore them on restore', () => {
  const snapshot = {
    vehicle: {
      firmware: 'ArduPilot',
      vehicle: 'ArduCopter',
      systemId: 1,
      componentId: 1,
      flightMode: 'Stabilize'
    },
    parameters: [
      {
        id: 'FLTMODE1',
        value: 0,
        index: 0,
        count: 3,
        definition: arducopterMetadata.parameters.FLTMODE1
      },
      {
        id: 'STAT_RUNTIME',
        value: 100,
        index: 1,
        count: 3
      },
      {
        id: 'STAT_BOOTCNT',
        value: 12,
        index: 2,
        count: 3
      }
    ]
  }

  const backup = createParameterBackup(snapshot)
  assert.equal(backup.parameterCount, 1)
  assert.deepEqual(
    backup.parameters.map((parameter) => parameter.id),
    ['FLTMODE1']
  )

  const legacyBackupWithStats = {
    ...backup,
    parameterCount: 3,
    parameters: [
      ...backup.parameters,
      { id: 'STAT_RUNTIME', value: 999 },
      { id: 'STAT_BOOTCNT', value: 99 }
    ]
  }

  const restore = deriveDraftValuesFromParameterBackup(snapshot.parameters, legacyBackupWithStats)
  assert.equal(restore.changedCount, 0)
  assert.deepEqual(restore.draftValues, {})
  assert.deepEqual(restore.unknownParameterIds, [])
})

test('snapshot restore ignores benign float variance when values are effectively equal', () => {
  const snapshot = {
    vehicle: {
      firmware: 'ArduPilot',
      vehicle: 'ArduCopter',
      systemId: 1,
      componentId: 1,
      flightMode: 'Stabilize'
    },
    parameters: [
      {
        id: 'ATC_INPUT_TC',
        value: 0.15000000596046448,
        index: 0,
        count: 1,
        definition: arducopterMetadata.parameters.ATC_INPUT_TC
      }
    ]
  }

  const backup = createParameterBackup(snapshot)
  backup.parameters[0].value = 0.15

  const restore = deriveDraftValuesFromParameterBackup(snapshot.parameters, backup)
  assert.equal(restore.changedCount, 0)
  assert.equal(restore.unchangedCount, 1)
  assert.deepEqual(restore.draftValues, {})
})

test('snapshot libraries round-trip and select snapshots by label', async () => {
  const sitl = createMockSITL()

  try {
    const initialSnapshot = await sitl.connectAndSync({
      heartbeatTimeoutMs: 2000,
      parameterTimeoutMs: 5000
    })

    const baselineBackup = createParameterBackup(initialSnapshot)
    const modifiedBackup = createParameterBackup(initialSnapshot)
    modifiedBackup.parameters.find((parameter) => parameter.id === 'FLTMODE1').value = 5

    const library = createParameterSnapshotLibrary('MOZ7 Baselines', [
      createParameterSnapshot(modifiedBackup, 'Aggressive tune', {
        source: 'captured',
        tags: ['moz7', 'tune']
      }),
      createParameterSnapshot(baselineBackup, 'Known-good baseline', {
        source: 'captured',
        protected: true
      })
    ])

    const parsedLibrary = parseParameterSnapshotLibrary(serializeParameterSnapshotLibrary(library))
    assert.equal(parsedLibrary.snapshots.length, 2)

    const selectedSnapshot = resolveParameterSnapshotInput(
      parseParameterSnapshotInput(serializeParameterSnapshotLibrary(library)),
      {
        label: 'Known-good baseline'
      }
    )

    assert.equal(selectedSnapshot.label, 'Known-good baseline')
    assert.equal(selectedSnapshot.protected, true)
    assert.deepEqual(selectedSnapshot.tags, [])
  } finally {
    await sitl.disconnect().catch(() => {})
    sitl.destroy()
  }
})

test('guided accelerometer flow completes through mock status text feedback', async () => {
  const sitl = createMockSITL()

  try {
    await sitl.connectAndSync({
      heartbeatTimeoutMs: 2000,
      parameterTimeoutMs: 5000
    })

    await sitl.runtime.runGuidedAction('calibrate-accelerometer')
    await waitFor(
      () => sitl.runtime.getSnapshot().guidedActions['calibrate-accelerometer'].status === 'succeeded',
      1000
    )

    const action = sitl.runtime.getSnapshot().guidedActions['calibrate-accelerometer']
    assert.equal(action.status, 'succeeded')
    assert.equal(action.summary, 'Accelerometer calibration complete.')
    assert.ok(action.statusTexts.some((text) => text.includes('Place vehicle')))
  } finally {
    await sitl.disconnect().catch(() => {})
    sitl.destroy()
  }
})

test('authoritative ArduPilot heartbeat target is not replaced by later non-autopilot heartbeats', async () => {
  const session = createHeartbeatSession([
    {
      atMs: 0,
      systemId: 1,
      componentId: 1,
      autopilot: MAV_AUTOPILOT.ARDUPILOTMEGA,
      vehicleType: MAV_TYPE.QUADROTOR
    },
    {
      atMs: 10,
      systemId: 1,
      componentId: 100,
      autopilot: 0,
      vehicleType: MAV_TYPE.QUADROTOR
    }
  ])
  const runtime = new ArduPilotConfiguratorRuntime(session, arducopterMetadata)

  try {
    await runtime.connect()
    await runtime.waitForVehicle({ timeoutMs: 200 })
    await sleep(40)

    const vehicle = runtime.getSnapshot().vehicle
    assert.equal(vehicle?.systemId, 1)
    assert.equal(vehicle?.componentId, 1)
    assert.equal(vehicle?.vehicle, 'ArduCopter')

    await runtime.requestParameterList({ timeoutMs: 200 })
    const request = session.sentMessages.find((message) => message.type === 'PARAM_REQUEST_LIST')
    assert.ok(request)
    assert.equal(request.targetSystem, 1)
    assert.equal(request.targetComponent, 1)
  } finally {
    await runtime.disconnect().catch(() => {})
    runtime.destroy()
  }
})

test('ArduCopter detection accepts non-quad multirotor MAV types', async () => {
  const session = createHeartbeatSession([
    {
      atMs: 0,
      systemId: 1,
      componentId: 1,
      autopilot: MAV_AUTOPILOT.ARDUPILOTMEGA,
      vehicleType: MAV_TYPE.HEXAROTOR
    }
  ])
  const runtime = new ArduPilotConfiguratorRuntime(session, arducopterMetadata)

  try {
    await runtime.connect()
    const vehicle = await runtime.waitForVehicle({ timeoutMs: 200 })

    assert.equal(vehicle.firmware, 'ArduPilot')
    assert.equal(vehicle.vehicle, 'ArduCopter')
    assert.equal(runtime.getSnapshot().vehicle?.vehicle, 'ArduCopter')
  } finally {
    await runtime.disconnect().catch(() => {})
    runtime.destroy()
  }
})

test('live telemetry requests use responsive attitude rates and slower support streams', async () => {
  const outbound = []
  const runtime = new ArduPilotConfiguratorRuntime(
    createEchoSession({}, () => false, () => false, (message) => {
      outbound.push(message)
    }),
    arducopterMetadata
  )

  try {
    await runtime.connect()
    await sleep(10)

    const telemetryRequests = outbound.filter(
      (message) => message.type === 'COMMAND_LONG' && message.command === MAV_CMD.SET_MESSAGE_INTERVAL
    )

    assert.deepEqual(
      telemetryRequests.map((message) => [message.params[0], message.params[1]]),
      [
        [MAVLINK_MESSAGE_IDS.ATTITUDE, 25000],
        [MAVLINK_MESSAGE_IDS.RC_CHANNELS, 50000],
        [MAVLINK_MESSAGE_IDS.SYS_STATUS, 500000]
      ]
    )
  } finally {
    await runtime.disconnect().catch(() => {})
    runtime.destroy()
  }
})

test('parameter verification waiters are cleaned up when outbound PARAM_SET send fails', async () => {
  const runtime = new ArduPilotConfiguratorRuntime(
    createEchoSession(
      {
        FLTMODE1: 0
      },
      () => false,
      (message) => message.type === 'PARAM_SET'
    ),
    arducopterMetadata
  )

  try {
    await runtime.connect()
    await runtime.requestParameterList({ timeoutMs: 200 })
    await runtime.waitForParameterSync({ timeoutMs: 200 })

    await assert.rejects(() => runtime.setParameter('FLTMODE1', 5, { verifyTimeoutMs: 50 }), /simulated send failure/i)
    assert.equal(runtime.parameterValueWaiters.size, 0)
  } finally {
    await runtime.disconnect().catch(() => {})
    runtime.destroy()
  }
})

test('command ack waiters are cleaned up when outbound COMMAND_LONG send fails', async () => {
  const runtime = new ArduPilotConfiguratorRuntime(
    createEchoSession(
      {
        FLTMODE1: 0
      },
      () => false,
      (message) => message.type === 'COMMAND_LONG'
    ),
    arducopterMetadata
  )

  try {
    await runtime.connect()
    await runtime.requestParameterList({ timeoutMs: 200 })
    await runtime.waitForParameterSync({ timeoutMs: 200 })

    await assert.rejects(
      () => runtime.sendCommand(MAV_CMD.DO_MOTOR_TEST, [1, 0, 5, 1, 1, 0, 0], { waitForAck: true, ackTimeoutMs: 50 }),
      /simulated send failure/i
    )
    assert.equal(runtime.commandAckWaiters.size, 0)
  } finally {
    await runtime.disconnect().catch(() => {})
    runtime.destroy()
  }
})

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (predicate()) {
      return
    }
    await sleep(25)
  }

  throw new Error(`Condition did not become true within ${timeoutMs}ms.`)
}

function sleep(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

function createHeartbeatSession(events) {
  const statusListeners = []
  const messageListeners = []
  const timers = new Set()
  const sentMessages = []
  let connected = false

  const emit = ({ systemId, componentId, autopilot, vehicleType, customMode = 0, baseMode = 0, systemStatus = 4 }) => {
    messageListeners.forEach((listener) =>
      listener({
        header: {
          systemId,
          componentId,
          sequence: 0
        },
        message: {
          type: 'HEARTBEAT',
          autopilot,
          vehicleType,
          baseMode,
          customMode,
          systemStatus,
          mavlinkVersion: 3
        },
        timestampMs: Date.now()
      })
    )
  }

  return {
    sentMessages,
    getTransportStatus() {
      return connected ? { kind: 'connected' } : { kind: 'disconnected' }
    },
    onStatus(listener) {
      statusListeners.push(listener)
      return () => {}
    },
    onMessage(listener) {
      messageListeners.push(listener)
      return () => {}
    },
    async connect() {
      connected = true
      statusListeners.forEach((listener) => listener({ kind: 'connected' }))
      events.forEach((event) => {
        const timer = setTimeout(() => {
          timers.delete(timer)
          if (!connected) {
            return
          }
          emit(event)
        }, event.atMs)
        timers.add(timer)
      })
    },
    async disconnect() {
      connected = false
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
      statusListeners.forEach((listener) => listener({ kind: 'disconnected', reason: 'test disconnect' }))
    },
    destroy() {
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
    },
    async send(message) {
      sentMessages.push(message)
    }
  }
}

function createEchoSession(initialParameters, shouldDropWrite, shouldThrowSend = () => false, onSend = () => {}) {
  const statusListeners = []
  const messageListeners = []
  const parameters = { ...initialParameters }
  let connected = false

  const emit = (message) => {
    messageListeners.forEach((listener) =>
      listener({
        header: {
          systemId: 1,
          componentId: 1,
          sequence: 0
        },
        message,
        timestampMs: Date.now()
      })
    )
  }

  return {
    getTransportStatus() {
      return connected ? { kind: 'connected' } : { kind: 'disconnected' }
    },
    onStatus(listener) {
      statusListeners.push(listener)
      return () => {}
    },
    onMessage(listener) {
      messageListeners.push(listener)
      return () => {}
    },
    async connect() {
      connected = true
      statusListeners.forEach((listener) => listener({ kind: 'connected' }))
      emit({
        type: 'HEARTBEAT',
        autopilot: 3,
        vehicleType: 2,
        baseMode: 0,
        customMode: 0,
        systemStatus: 4,
        mavlinkVersion: 3
      })
    },
    async disconnect() {
      connected = false
      statusListeners.forEach((listener) => listener({ kind: 'disconnected', reason: 'test disconnect' }))
    },
    destroy() {},
    async send(message) {
      onSend(message)

      if (shouldThrowSend(message)) {
        throw new Error('simulated send failure')
      }

      if (message.type === 'PARAM_REQUEST_LIST') {
        Object.entries(parameters).forEach(([paramId, paramValue], index, entries) => {
          emit({
            type: 'PARAM_VALUE',
            paramId,
            paramValue,
            paramType: 9,
            paramCount: entries.length,
            paramIndex: index
          })
        })
        return
      }

      if (message.type === 'PARAM_SET') {
        if (shouldDropWrite({ paramId: message.paramId, paramValue: message.paramValue })) {
          return
        }

        parameters[message.paramId] = message.paramValue
        emit({
          type: 'PARAM_VALUE',
          paramId: message.paramId,
          paramValue: message.paramValue,
          paramType: 9,
          paramCount: Object.keys(parameters).length,
          paramIndex: Object.keys(parameters).indexOf(message.paramId)
        })
      }
    }
  }
}
