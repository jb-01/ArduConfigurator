import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ArduPilotConfiguratorRuntime,
  deriveEscSetupSummary,
  deriveRcMapDraftValues,
  detectDominantRcChannelChange
} from '../packages/ardupilot-core/dist/index.js'
import { arducopterMetadata } from '../packages/param-metadata/dist/index.js'

test('pre-arm issues are surfaced in the shared runtime snapshot', async () => {
  const runtime = new ArduPilotConfiguratorRuntime(createStatusTextSession('PreArm: RC not calibrated'), arducopterMetadata)

  try {
    await runtime.connect()
    const snapshot = runtime.getSnapshot()

    assert.equal(snapshot.preArmStatus.healthy, false)
    assert.equal(snapshot.preArmStatus.issues.length, 1)
    assert.equal(snapshot.preArmStatus.issues[0].text, 'PreArm: RC not calibrated')
  } finally {
    await runtime.disconnect().catch(() => {})
    runtime.destroy()
  }
})

test('detectDominantRcChannelChange finds the strongest unexcluded RC channel', () => {
  const baseline = [1500, 1500, 1000, 1500, 1500]
  const channels = [1500, 1680, 1000, 1500, 1840]

  const strongest = detectDominantRcChannelChange(channels, baseline)
  assert.equal(strongest?.channelNumber, 5)

  const nextStrongest = detectDominantRcChannelChange(channels, baseline, {
    excludedChannelNumbers: [5]
  })
  assert.equal(nextStrongest?.channelNumber, 2)
})

test('deriveRcMapDraftValues only stages changed RCMAP parameters', () => {
  const drafts = deriveRcMapDraftValues(
    {
      roll: 1,
      pitch: 4,
      throttle: 3,
      yaw: 2
    },
    {
      roll: 1,
      pitch: 2,
      throttle: 3,
      yaw: 4
    }
  )

  assert.deepEqual(drafts, {
    RCMAP_PITCH: '4',
    RCMAP_YAW: '2'
  })
})

test('deriveEscSetupSummary classifies analog protocols and flags invalid ranges', () => {
  const summary = deriveEscSetupSummary(
    createSnapshot({
      MOT_PWM_TYPE: 0,
      MOT_PWM_MIN: 2000,
      MOT_PWM_MAX: 1000,
      MOT_SPIN_ARM: 0.12,
      MOT_SPIN_MIN: 0.1,
      MOT_SPIN_MAX: 0.95
    })
  )

  assert.equal(summary.calibrationPath, 'analog-calibration')
  assert.ok(summary.notes.some((note) => note.includes('MOT_PWM_MIN must be lower than MOT_PWM_MAX')))
  assert.ok(summary.notes.some((note) => note.includes('MOT_SPIN_MIN should stay above MOT_SPIN_ARM')))
})

test('deriveEscSetupSummary classifies digital motor protocols', () => {
  const summary = deriveEscSetupSummary(
    createSnapshot({
      MOT_PWM_TYPE: 5,
      MOT_PWM_MIN: 1000,
      MOT_PWM_MAX: 2000,
      MOT_SPIN_ARM: 0.08,
      MOT_SPIN_MIN: 0.12,
      MOT_SPIN_MAX: 0.95
    })
  )

  assert.equal(summary.calibrationPath, 'digital-protocol')
  assert.ok(summary.notes.some((note) => note.includes('Digital motor protocols')))
})

function createSnapshot(parameterValues) {
  return {
    connection: { kind: 'connected' },
    sessionProfile: 'full-power',
    vehicle: {
      firmware: 'ArduPilot',
      vehicle: 'ArduCopter',
      systemId: 1,
      componentId: 1,
      armed: false,
      flightMode: 'Stabilize'
    },
    parameterStats: {
      downloaded: Object.keys(parameterValues).length,
      total: Object.keys(parameterValues).length,
      duplicateFrames: 0,
      status: 'complete',
      progress: 1
    },
    parameters: Object.entries(parameterValues).map(([id, value], index, entries) => ({
      id,
      value,
      index,
      count: entries.length,
      definition: arducopterMetadata.parameters[id]
    })),
    setupSections: [],
    guidedActions: {
      'request-parameters': {
        actionId: 'request-parameters',
        status: 'idle',
        summary: '',
        instructions: [],
        statusTexts: []
      },
      'calibrate-accelerometer': {
        actionId: 'calibrate-accelerometer',
        status: 'idle',
        summary: '',
        instructions: [],
        statusTexts: []
      },
      'calibrate-compass': {
        actionId: 'calibrate-compass',
        status: 'idle',
        summary: '',
        instructions: [],
        statusTexts: []
      },
      'reboot-autopilot': {
        actionId: 'reboot-autopilot',
        status: 'idle',
        summary: '',
        instructions: [],
        statusTexts: []
      }
    },
    motorTest: {
      status: 'idle',
      summary: '',
      instructions: []
    },
    liveVerification: {
      satisfiedSignals: [],
      rcInput: {
        verified: false,
        channelCount: 0,
        channels: []
      },
      batteryTelemetry: {
        verified: false
      },
      attitudeTelemetry: {
        verified: false
      }
    },
    preArmStatus: {
      healthy: true,
      issues: []
    },
    statusTexts: []
  }
}

function createStatusTextSession(statusText) {
  const statusListeners = []
  const messageListeners = []
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
      emit({
        type: 'STATUSTEXT',
        severity: 4,
        text: statusText
      })
    },
    async disconnect() {
      connected = false
      statusListeners.forEach((listener) => listener({ kind: 'disconnected', reason: 'test disconnect' }))
    },
    destroy() {},
    async send() {}
  }
}
