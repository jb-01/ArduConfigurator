import {
  ArduPilotConfiguratorRuntime,
  advanceModeSwitchExerciseState,
  advanceRcRangeExerciseState,
  createModeSwitchExerciseState,
  createRcRangeExerciseState,
  deriveModeSwitchEstimate,
  deriveRcAxisObservations,
  failModeSwitchExerciseState,
  failRcRangeExerciseState,
  formatModeSlotLabel,
  formatRcAxisLabel,
  type ConfiguratorSnapshot,
  type RcAxisId,
  type SetupStatus,
} from '@arduconfig/ardupilot-core'
import { arducopterMetadata, type GuidedActionId, type SessionProfile } from '@arduconfig/param-metadata'
import { MavlinkSession, MavlinkV2Codec } from '@arduconfig/protocol-mavlink'

import { NativeSerialTransport, type NativeSerialPortInfo } from './native-serial-transport.js'

type SnapshotFormat = 'off' | 'pretty' | 'json'
type ReadOnlyExerciseKind = 'mode-switch' | 'rc-ranges'

interface RuntimeSerialOptions {
  path?: string
  portIndex?: number
  baudRate: number
  listPorts: boolean
  requestParams: boolean
  heartbeatTimeoutMs: number
  parameterTimeoutMs: number
  holdOpenMs: number
  snapshot: SnapshotFormat
  sessionProfile: SessionProfile
  guidedAction?: GuidedActionId
  executeGuidedAction: boolean
  benchSession: boolean
  readOnlyExercise?: ReadOnlyExerciseKind
  exerciseTimeoutMs: number
}

interface GuidedActionDecision {
  allowed: boolean
  reasons: string[]
}

const defaults: RuntimeSerialOptions = {
  baudRate: 115200,
  listPorts: false,
  requestParams: true,
  heartbeatTimeoutMs: 5000,
  parameterTimeoutMs: 20000,
  holdOpenMs: 0,
  snapshot: 'pretty',
  sessionProfile: 'full-power',
  executeGuidedAction: false,
  benchSession: false,
  exerciseTimeoutMs: 15000
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const ports = await NativeSerialTransport.listPorts()

  if (options.listPorts) {
    printPorts(ports)
    return
  }

  const path = resolvePortPath(options, ports)
  const transport = new NativeSerialTransport('runtime-serial', {
    path,
    baudRate: options.baudRate
  })
  const session = new MavlinkSession(transport, new MavlinkV2Codec())
  const runtime = new ArduPilotConfiguratorRuntime(session, arducopterMetadata, {
    sessionProfile: options.sessionProfile
  })

  let previousSnapshot: ConfiguratorSnapshot | undefined
  let latestSnapshot = runtime.getSnapshot()
  const seenStatusKeys = new Set<string>()
  const unsubscribe = runtime.subscribe((snapshot) => {
    latestSnapshot = snapshot
    logSnapshotDelta(previousSnapshot, snapshot, seenStatusKeys)
    previousSnapshot = snapshot
  })

  try {
    console.log(`[runtime] opening ${path} at ${options.baudRate} baud`)
    await runtime.connect()
    const vehicle = await runtime.waitForVehicle({ timeoutMs: options.heartbeatTimeoutMs })
    console.log(
      `[runtime] vehicle=${vehicle.vehicle} firmware=${vehicle.firmware} sys=${vehicle.systemId} comp=${vehicle.componentId} armed=${vehicle.armed} mode="${vehicle.flightMode}"`
    )

    if (options.requestParams) {
      await runtime.requestParameterList({ timeoutMs: options.heartbeatTimeoutMs })
      const parameterStats = await runtime.waitForParameterSync({ timeoutMs: options.parameterTimeoutMs })
      console.log(
        `[runtime] parameter sync complete ${parameterStats.downloaded}/${parameterStats.total} duplicates=${parameterStats.duplicateFrames}`
      )
    }

    if (options.guidedAction) {
      await maybeRunGuidedAction(runtime, latestSnapshot, options)
      latestSnapshot = runtime.getSnapshot()
    }

    if (options.readOnlyExercise) {
      latestSnapshot = await runReadOnlyExercise(runtime, latestSnapshot, options)
    }

    renderSnapshot(latestSnapshot, options.snapshot)

    if (options.holdOpenMs > 0) {
      console.log(`[runtime] holding link open for ${options.holdOpenMs}ms`)
      await sleep(options.holdOpenMs)
    }
  } finally {
    unsubscribe()
    await runtime.disconnect()
    runtime.destroy()
  }
}

function parseArgs(argv: string[]): RuntimeSerialOptions {
  const options = { ...defaults }

  for (const argument of argv) {
    if (argument === '--list-ports') {
      options.listPorts = true
      continue
    }

    if (argument === '--no-request-params') {
      options.requestParams = false
      continue
    }

    if (argument === '--execute-guided-action') {
      options.executeGuidedAction = true
      continue
    }

    if (argument === '--bench-session') {
      options.benchSession = true
      options.sessionProfile = 'usb-bench'
      continue
    }

    const [rawKey, rawValue] = argument.split('=')
    const key = rawKey.replace(/^--/, '')
    if (rawValue === undefined) {
      continue
    }

    switch (key) {
      case 'path':
        options.path = rawValue
        break
      case 'port-index':
        options.portIndex = Number(rawValue)
        break
      case 'baud':
        options.baudRate = Number(rawValue)
        break
      case 'heartbeat-timeout-ms':
        options.heartbeatTimeoutMs = Number(rawValue)
        break
      case 'parameter-timeout-ms':
        options.parameterTimeoutMs = Number(rawValue)
        break
      case 'hold-open-ms':
        options.holdOpenMs = Number(rawValue)
        break
      case 'snapshot':
        if (rawValue === 'off' || rawValue === 'pretty' || rawValue === 'json') {
          options.snapshot = rawValue
        }
        break
      case 'session-profile':
        if (rawValue === 'full-power' || rawValue === 'usb-bench') {
          options.sessionProfile = rawValue
        }
        break
      case 'guided-action':
        if (isGuidedActionId(rawValue)) {
          options.guidedAction = rawValue
        }
        break
      case 'read-only-exercise':
        if (isReadOnlyExerciseKind(rawValue)) {
          options.readOnlyExercise = rawValue
        }
        break
      case 'exercise-timeout-ms':
        options.exerciseTimeoutMs = Number(rawValue)
        break
      default:
        break
    }
  }

  return options
}

function isGuidedActionId(value: string): value is GuidedActionId {
  return (
    value === 'request-parameters' ||
    value === 'calibrate-accelerometer' ||
    value === 'calibrate-compass' ||
    value === 'reboot-autopilot'
  )
}

function isReadOnlyExerciseKind(value: string): value is ReadOnlyExerciseKind {
  return value === 'mode-switch' || value === 'rc-ranges'
}

function printPorts(ports: NativeSerialPortInfo[]): void {
  if (ports.length === 0) {
    console.log('[runtime] no serial ports detected')
    return
  }

  console.log('[runtime] serial ports:')
  ports.forEach((port, index) => {
    const details = [
      port.manufacturer,
      port.serialNumber ? `sn=${port.serialNumber}` : undefined,
      port.vendorId ? `vid=${port.vendorId}` : undefined,
      port.productId ? `pid=${port.productId}` : undefined
    ]
      .filter((value): value is string => value !== undefined)
      .join(' | ')
    const recommended = isLikelyFlightControllerPort(port) ? ' [recommended]' : ''

    console.log(`- [${index}] ${port.path}${recommended}${details ? ` :: ${details}` : ''}`)
  })
}

function resolvePortPath(options: RuntimeSerialOptions, ports: NativeSerialPortInfo[]): string {
  if (options.path) {
    return options.path
  }

  if (options.portIndex !== undefined) {
    const selectedPort = ports[options.portIndex]
    if (!selectedPort) {
      throw new Error(`Serial port index ${options.portIndex} is not available.`)
    }
    return selectedPort.path
  }

  const preferredPort = ports.find(isLikelyFlightControllerPort)
  if (preferredPort) {
    return preferredPort.path
  }

  if (ports.length === 1) {
    return ports[0].path
  }

  throw new Error('Unable to infer a serial path. Re-run with --list-ports, --port-index=N, or --path=/dev/tty.*')
}

function isLikelyFlightControllerPort(port: NativeSerialPortInfo): boolean {
  return (
    (port.manufacturer ?? '').toLowerCase().includes('ardupilot') ||
    port.path.includes('usbmodem') ||
    port.path.includes('usbserial')
  )
}

async function maybeRunGuidedAction(
  runtime: ArduPilotConfiguratorRuntime,
  snapshot: ConfiguratorSnapshot,
  options: RuntimeSerialOptions
): Promise<void> {
  const action = options.guidedAction
  if (!action) {
    return
  }

  const decision = evaluateGuidedAction(action, snapshot, options)
  const mode = options.executeGuidedAction ? 'execute' : 'dry-run'

  console.log(`[runtime] guided action ${mode}: ${action}`)

  if (decision.reasons.length > 0) {
    decision.reasons.forEach((reason) => {
      console.log(`[runtime] guided action note: ${reason}`)
    })
  }

  if (!options.executeGuidedAction) {
    console.log('[runtime] no MAVLink command sent. Re-run with --execute-guided-action to actually send it.')
    return
  }

  if (!decision.allowed) {
    throw new Error(`Guided action "${action}" is blocked by runtime safeguards.`)
  }

  await runtime.runGuidedAction(action)
  console.log(`[runtime] guided action sent: ${action}`)
}

function evaluateGuidedAction(
  action: GuidedActionId,
  snapshot: ConfiguratorSnapshot,
  options: RuntimeSerialOptions
): GuidedActionDecision {
  const reasons: string[] = []

  if (snapshot.connection.kind !== 'connected') {
    reasons.push('The transport is not connected.')
  }

  if (action === 'request-parameters') {
    return {
      allowed: snapshot.connection.kind === 'connected',
      reasons
    }
  }

  if (!snapshot.vehicle) {
    reasons.push('No vehicle heartbeat has been identified yet.')
  }

  if (snapshot.vehicle?.armed) {
    reasons.push('The vehicle reports armed=true.')
  }

  if (snapshot.parameterStats.status !== 'complete') {
    reasons.push('Parameter sync is not complete yet.')
  }

  if (options.executeGuidedAction && !options.benchSession) {
    reasons.push('Pass --bench-session to acknowledge this is an intentional disarmed bench session.')
  }

  return {
    allowed: reasons.length === 0,
    reasons
  }
}

function renderSnapshot(snapshot: ConfiguratorSnapshot, format: SnapshotFormat): void {
  if (format === 'off') {
    return
  }

  if (format === 'json') {
    console.log(JSON.stringify(snapshot, null, 2))
    return
  }

  console.log('[runtime] snapshot summary')
  console.log(`  connection: ${snapshot.connection.kind}`)
  console.log(`  session: ${snapshot.sessionProfile === 'usb-bench' ? 'USB bench' : 'Full power'}`)
  console.log(
    `  vehicle: ${snapshot.vehicle ? `${snapshot.vehicle.vehicle} / ${snapshot.vehicle.firmware}` : 'Waiting for heartbeat'}`
  )
  if (snapshot.vehicle) {
    console.log(`  armed: ${snapshot.vehicle.armed}`)
    console.log(`  mode: ${snapshot.vehicle.flightMode}`)
    console.log(`  target: sys=${snapshot.vehicle.systemId} comp=${snapshot.vehicle.componentId}`)
  }
  console.log(
    `  live rc: ${
      snapshot.liveVerification.rcInput.verified
        ? `${snapshot.liveVerification.rcInput.channelCount} channels, RSSI ${snapshot.liveVerification.rcInput.rssi ?? 'unknown'}`
        : 'not verified'
    }`
  )
  console.log(
    `  live battery: ${
      snapshot.liveVerification.batteryTelemetry.verified
        ? `${snapshot.liveVerification.batteryTelemetry.voltageV ?? 'unknown'} V${
            snapshot.liveVerification.batteryTelemetry.remainingPercent !== undefined
              ? `, ${snapshot.liveVerification.batteryTelemetry.remainingPercent}%`
              : ''
          }`
        : 'not verified'
    }`
  )
  const modeSwitchEstimate = deriveModeSwitchEstimate(snapshot)
  if (modeSwitchEstimate.channelNumber !== undefined) {
    console.log(
      `  mode switch: CH${modeSwitchEstimate.channelNumber} ${
        modeSwitchEstimate.estimatedSlot !== undefined
          ? `-> ${formatModeSlotLabel(snapshot, modeSwitchEstimate.estimatedSlot)} at ${modeSwitchEstimate.pwm} us`
          : 'waiting for PWM'
      }`
    )
  }
  const rcAxes = deriveRcAxisObservations(snapshot)
  console.log('  rc axes:')
  rcAxes.forEach((axis) => {
    console.log(
      `    - ${axis.label}: CH${axis.channelNumber} ${axis.pwm !== undefined ? `${axis.pwm} us` : 'no data'} low=${axis.lowDetected ? 'y' : 'n'} high=${axis.highDetected ? 'y' : 'n'}${axis.axisId === 'throttle' ? '' : ` center=${axis.centeredDetected ? 'y' : 'n'}`}`
    )
  })
  console.log(
    `  parameters: ${snapshot.parameterStats.downloaded}/${snapshot.parameterStats.total} status=${snapshot.parameterStats.status} duplicates=${snapshot.parameterStats.duplicateFrames}`
  )
  const activeGuidedActions = Object.values(snapshot.guidedActions).filter((action) => action.status !== 'idle')
  if (activeGuidedActions.length > 0) {
    console.log('  guided actions:')
    activeGuidedActions.forEach((action) => {
      console.log(`    - ${action.actionId}: ${action.status} :: ${action.summary}`)
      action.instructions.slice(0, 2).forEach((instruction) => {
        console.log(`      step: ${instruction}`)
      })
    })
  }
  console.log('  setup:')
  snapshot.setupSections.forEach((section) => {
    console.log(`    - ${statusGlyph(section.status)} ${section.title}: ${section.status}`)
    section.notes.slice(0, 2).forEach((note) => {
      console.log(`      note: ${note}`)
    })
  })
}

function statusGlyph(status: SetupStatus): string {
  if (status === 'complete') {
    return 'ok'
  }
  if (status === 'in-progress') {
    return '..'
  }
  return '!!'
}

function logSnapshotDelta(
  previousSnapshot: ConfiguratorSnapshot | undefined,
  snapshot: ConfiguratorSnapshot,
  seenStatusKeys: Set<string>
): void {
  if (snapshot.connection.kind !== previousSnapshot?.connection.kind) {
    console.log(`[runtime] link=${snapshot.connection.kind}`)
  }

  const previousVehicleKey = previousSnapshot?.vehicle
    ? `${previousSnapshot.vehicle.systemId}:${previousSnapshot.vehicle.componentId}:${previousSnapshot.vehicle.flightMode}:${previousSnapshot.vehicle.armed}`
    : undefined
  const vehicleKey = snapshot.vehicle
    ? `${snapshot.vehicle.systemId}:${snapshot.vehicle.componentId}:${snapshot.vehicle.flightMode}:${snapshot.vehicle.armed}`
    : undefined

  if (snapshot.vehicle && vehicleKey !== previousVehicleKey) {
    console.log(
      `[runtime] heartbeat sys=${snapshot.vehicle.systemId} comp=${snapshot.vehicle.componentId} vehicle=${snapshot.vehicle.vehicle} armed=${snapshot.vehicle.armed} mode="${snapshot.vehicle.flightMode}"`
    )
  }

  const downloaded = snapshot.parameterStats.downloaded
  const previousDownloaded = previousSnapshot?.parameterStats.downloaded ?? -1
  const statusChanged = snapshot.parameterStats.status !== previousSnapshot?.parameterStats.status

  if (downloaded !== previousDownloaded || statusChanged) {
    const shouldPrintProgress =
      statusChanged ||
      downloaded <= 12 ||
      downloaded % 50 === 0 ||
      snapshot.parameterStats.status === 'complete'

    if (shouldPrintProgress) {
      const progressText =
        snapshot.parameterStats.progress === null
          ? snapshot.parameterStats.status
          : `${Math.round(snapshot.parameterStats.progress * 100)}%`
      console.log(
        `[runtime] params status=${snapshot.parameterStats.status} progress=${progressText} downloaded=${snapshot.parameterStats.downloaded}/${snapshot.parameterStats.total} duplicates=${snapshot.parameterStats.duplicateFrames}`
      )
    }
  }

  snapshot.statusTexts.forEach((entry) => {
    const key = `${entry.severity}:${entry.text}`
    if (seenStatusKeys.has(key)) {
      return
    }

    seenStatusKeys.add(key)
    console.log(`[runtime] statustext ${entry.severity}: ${entry.text}`)
  })
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

async function runReadOnlyExercise(
  runtime: ArduPilotConfiguratorRuntime,
  snapshot: ConfiguratorSnapshot,
  options: RuntimeSerialOptions
): Promise<ConfiguratorSnapshot> {
  if (options.readOnlyExercise === 'mode-switch') {
    await runModeSwitchExercise(runtime, snapshot, options.exerciseTimeoutMs)
    return runtime.getSnapshot()
  }

  if (options.readOnlyExercise === 'rc-ranges') {
    await runRcRangeExercise(runtime, snapshot, options.exerciseTimeoutMs)
    return runtime.getSnapshot()
  }

  return snapshot
}

async function runModeSwitchExercise(
  runtime: ArduPilotConfiguratorRuntime,
  initialSnapshot: ConfiguratorSnapshot,
  timeoutMs: number
): Promise<void> {
  let state = createModeSwitchExerciseState(initialSnapshot)
  if (state.status === 'failed') {
    console.log(`[runtime] mode-switch exercise unavailable: ${state.failureReason ?? 'Unknown reason.'}`)
    return
  }

  console.log('[runtime] read-only exercise: mode-switch')
  console.log(
    `[runtime] exercise targets: ${state.targetSlots.map((slot) => formatModeSlotLabel(initialSnapshot, slot)).join(', ')}`
  )
  if (state.currentTargetSlot !== undefined) {
    console.log(`[runtime] exercise step: move the switch to ${formatModeSlotLabel(initialSnapshot, state.currentTargetSlot)}`)
  }

  const deadline = Date.now() + timeoutMs
  let previous = state

  while (state.status === 'running' && Date.now() < deadline) {
    await sleep(150)
    state = advanceModeSwitchExerciseState(state, runtime.getSnapshot())

    if (state.visitedSlots.length > previous.visitedSlots.length) {
      const visited = state.visitedSlots.filter((slot) => !previous.visitedSlots.includes(slot))
      visited.forEach((slot) => {
        console.log(`[runtime] exercise progress: observed ${formatModeSlotLabel(runtime.getSnapshot(), slot)}`)
      })
    }

    if (state.unexpectedSlots.length > previous.unexpectedSlots.length) {
      const unexpected = state.unexpectedSlots.filter((slot) => !previous.unexpectedSlots.includes(slot))
      unexpected.forEach((slot) => {
        console.log(`[runtime] exercise warning: observed unconfigured slot ${slot}`)
      })
    }

    if (state.currentTargetSlot !== previous.currentTargetSlot && state.currentTargetSlot !== undefined) {
      console.log(`[runtime] exercise step: move the switch to ${formatModeSlotLabel(runtime.getSnapshot(), state.currentTargetSlot)}`)
    }

    previous = state
  }

  if (state.status === 'running') {
    state = failModeSwitchExerciseState(
      state,
      `Timed out after ${timeoutMs}ms waiting for ${formatModeSlotLabel(runtime.getSnapshot(), state.currentTargetSlot)}.`
    )
  }

  if (state.status === 'passed') {
    console.log('[runtime] exercise result: mode-switch passed')
    return
  }

  console.log(`[runtime] exercise result: mode-switch failed :: ${state.failureReason ?? 'Unknown reason.'}`)
}

async function runRcRangeExercise(
  runtime: ArduPilotConfiguratorRuntime,
  initialSnapshot: ConfiguratorSnapshot,
  timeoutMs: number
): Promise<void> {
  let state = createRcRangeExerciseState(initialSnapshot)
  if (state.status === 'failed') {
    console.log(`[runtime] rc-ranges exercise unavailable: ${state.failureReason ?? 'Unknown reason.'}`)
    return
  }

  console.log('[runtime] read-only exercise: rc-ranges')
  console.log('[runtime] exercise targets: roll, pitch, throttle, yaw')
  if (state.currentTargetAxis !== undefined) {
    console.log(`[runtime] exercise step: ${rcRangeInstruction(state.currentTargetAxis)}`)
  }

  const deadline = Date.now() + timeoutMs
  let previous = state

  while (state.status === 'running' && Date.now() < deadline) {
    await sleep(150)
    state = advanceRcRangeExerciseState(state, runtime.getSnapshot())

    const completedAxes = Object.values(state.axisProgress)
      .filter((axis) => axis.completed && !previous.axisProgress[axis.axisId].completed)
      .map((axis) => axis.label)
    completedAxes.forEach((label) => {
      console.log(`[runtime] exercise progress: ${label} axis complete`)
    })

    if (state.currentTargetAxis !== previous.currentTargetAxis && state.currentTargetAxis !== undefined) {
      console.log(`[runtime] exercise step: ${rcRangeInstruction(state.currentTargetAxis)}`)
    }

    previous = state
  }

  if (state.status === 'running') {
    state = failRcRangeExerciseState(
      state,
      `Timed out after ${timeoutMs}ms waiting for ${state.currentTargetAxis ? formatRcAxisLabel(state.currentTargetAxis) : 'the current'} axis target.`
    )
  }

  if (state.status === 'passed') {
    console.log('[runtime] exercise result: rc-ranges passed')
    return
  }

  console.log(`[runtime] exercise result: rc-ranges failed :: ${state.failureReason ?? 'Unknown reason.'}`)
}

function rcRangeInstruction(axisId: RcAxisId): string {
  if (axisId === 'throttle') {
    return 'move Throttle fully low, then fully high'
  }

  return `move ${formatRcAxisLabel(axisId)} fully low, fully high, then back to center`
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
