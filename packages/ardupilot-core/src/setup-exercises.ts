import { formatArducopterFlightMode } from '@arduconfig/param-metadata'

import type { ConfiguratorSnapshot } from './types.js'

export type ModeSwitchExerciseStatus = 'idle' | 'running' | 'passed' | 'failed'
export type RcRangeExerciseStatus = 'idle' | 'running' | 'passed' | 'failed'
export type RcAxisId = 'roll' | 'pitch' | 'throttle' | 'yaw'

export interface ModeAssignment {
  slot: number
  value?: number
  label: string
}

export interface ModeSwitchEstimate {
  channelNumber?: number
  pwm?: number
  estimatedSlot?: number
  configuredParamId?: string
  configuredValue?: number
}

export interface ModeSwitchExerciseState {
  status: ModeSwitchExerciseStatus
  targetSlots: number[]
  visitedSlots: number[]
  currentTargetSlot?: number
  unexpectedSlots: number[]
  startedAtMs?: number
  completedAtMs?: number
  failureReason?: string
}

export interface RcAxisObservation {
  axisId: RcAxisId
  label: string
  channelNumber: number
  pwm?: number
  calibratedMin: number
  calibratedMax: number
  calibratedTrim: number
  normalizedPercent?: number
  lowDetected: boolean
  highDetected: boolean
  centeredDetected: boolean
}

export interface RcAxisExerciseProgress {
  axisId: RcAxisId
  label: string
  channelNumber: number
  lowObserved: boolean
  highObserved: boolean
  centeredObserved: boolean
  completed: boolean
}

export interface RcRangeExerciseState {
  status: RcRangeExerciseStatus
  targetAxes: RcAxisId[]
  axisProgress: Record<RcAxisId, RcAxisExerciseProgress>
  currentTargetAxis?: RcAxisId
  startedAtMs?: number
  completedAtMs?: number
  failureReason?: string
}

const DEFAULT_MODE_CHANNEL = 5
const DEFAULT_RC_AXIS_CHANNEL_MAP: Record<RcAxisId, number> = {
  roll: 1,
  pitch: 2,
  throttle: 3,
  yaw: 4
}
const RC_AXIS_ORDER: RcAxisId[] = ['roll', 'pitch', 'throttle', 'yaw']
const RC_LOW_THRESHOLD = 0.15
const RC_HIGH_THRESHOLD = 0.85
const RC_CENTER_TOLERANCE_RATIO = 0.1
const RC_CENTER_TOLERANCE_US = 45

export function deriveModeAssignments(snapshot: ConfiguratorSnapshot): ModeAssignment[] {
  const assignments: ModeAssignment[] = []

  Array.from({ length: 6 }, (_, index) => {
    const slot = index + 1
    const value = readRoundedParameter(snapshot, `FLTMODE${slot}`)
    if (value === undefined) {
      return
    }

    assignments.push({
      slot,
      value,
      label: formatArducopterFlightMode(value)
    })
  })

  return assignments
}

export function deriveModeSwitchEstimate(snapshot: ConfiguratorSnapshot): ModeSwitchEstimate {
  const channelNumber = getModeChannelNumber(snapshot)
  if (channelNumber === undefined) {
    return {}
  }

  const pwm = snapshot.liveVerification.rcInput.channels[channelNumber - 1]
  if (!isValidPwm(pwm)) {
    return { channelNumber }
  }

  const estimatedSlot = estimateFlightModeSlot(pwm)
  const configuredParamId = `FLTMODE${estimatedSlot}`
  const configuredValue = readRoundedParameter(snapshot, configuredParamId)

  return {
    channelNumber,
    pwm,
    estimatedSlot,
    configuredParamId,
    configuredValue
  }
}

export function formatModeSlotLabel(snapshot: ConfiguratorSnapshot, slot: number | undefined): string {
  if (slot === undefined) {
    return 'Unknown slot'
  }

  const configuredValue = readRoundedParameter(snapshot, `FLTMODE${slot}`)
  return `Slot ${slot} (${formatArducopterFlightMode(configuredValue)})`
}

export function createIdleModeSwitchExerciseState(): ModeSwitchExerciseState {
  return {
    status: 'idle',
    targetSlots: [],
    visitedSlots: [],
    unexpectedSlots: []
  }
}

export function createModeSwitchExerciseState(snapshot: ConfiguratorSnapshot): ModeSwitchExerciseState {
  if (!snapshot.liveVerification.rcInput.verified) {
    return failModeSwitchExerciseState(createIdleModeSwitchExerciseState(), 'No live RC telemetry is available for the mode switch exercise.')
  }

  const estimate = deriveModeSwitchEstimate(snapshot)
  if (estimate.channelNumber === undefined) {
    return failModeSwitchExerciseState(createIdleModeSwitchExerciseState(), 'Mode switch channel is not configured.')
  }

  const targetSlots = deriveModeAssignments(snapshot).map((assignment) => assignment.slot)
  if (targetSlots.length < 2) {
    return failModeSwitchExerciseState(
      createIdleModeSwitchExerciseState(),
      'At least two configured FLTMODEn positions are required for the mode switch exercise.'
    )
  }

  return {
    status: 'running',
    targetSlots,
    visitedSlots: [],
    currentTargetSlot: targetSlots[0],
    unexpectedSlots: [],
    startedAtMs: Date.now()
  }
}

export function advanceModeSwitchExerciseState(
  current: ModeSwitchExerciseState,
  snapshot: ConfiguratorSnapshot
): ModeSwitchExerciseState {
  if (current.status !== 'running') {
    return current
  }

  if (!snapshot.liveVerification.rcInput.verified) {
    return failModeSwitchExerciseState(current, 'Lost live RC telemetry before the mode switch exercise completed.')
  }

  const estimate = deriveModeSwitchEstimate(snapshot)
  if (estimate.channelNumber === undefined) {
    return failModeSwitchExerciseState(current, 'Mode switch channel is no longer available.')
  }

  if (estimate.estimatedSlot === undefined) {
    return current
  }

  const observedSlot = estimate.estimatedSlot
  let visitedSlots = current.visitedSlots
  let unexpectedSlots = current.unexpectedSlots

  if (current.targetSlots.includes(observedSlot)) {
    if (!visitedSlots.includes(observedSlot)) {
      visitedSlots = [...visitedSlots, observedSlot].sort((left, right) => left - right)
    }
  } else if (!unexpectedSlots.includes(observedSlot)) {
    unexpectedSlots = [...unexpectedSlots, observedSlot].sort((left, right) => left - right)
  }

  const currentTargetSlot = nextModeSwitchTarget(current.targetSlots, visitedSlots)
  if (currentTargetSlot === undefined) {
    return {
      ...current,
      status: 'passed',
      visitedSlots,
      unexpectedSlots,
      currentTargetSlot: undefined,
      completedAtMs: Date.now(),
      failureReason: undefined
    }
  }

  if (
    visitedSlots.length === current.visitedSlots.length &&
    unexpectedSlots.length === current.unexpectedSlots.length &&
    current.currentTargetSlot === currentTargetSlot
  ) {
    return current
  }

  return {
    ...current,
    visitedSlots,
    unexpectedSlots,
    currentTargetSlot
  }
}

export function failModeSwitchExerciseState(
  current: ModeSwitchExerciseState,
  reason: string
): ModeSwitchExerciseState {
  return {
    ...current,
    status: 'failed',
    failureReason: reason,
    completedAtMs: Date.now()
  }
}

export function formatRcAxisLabel(axisId: RcAxisId): string {
  switch (axisId) {
    case 'roll':
      return 'Roll'
    case 'pitch':
      return 'Pitch'
    case 'throttle':
      return 'Throttle'
    case 'yaw':
      return 'Yaw'
    default:
      return axisId
  }
}

export function deriveRcAxisObservations(snapshot: ConfiguratorSnapshot): RcAxisObservation[] {
  const channelMap = deriveRcAxisChannelMap(snapshot)

  return RC_AXIS_ORDER.map((axisId) => {
    const channelNumber = channelMap[axisId]
    const pwm = snapshot.liveVerification.rcInput.channels[channelNumber - 1]
    const calibratedMin = readParameterValue(snapshot, `RC${channelNumber}_MIN`) ?? 1000
    const calibratedMax = readParameterValue(snapshot, `RC${channelNumber}_MAX`) ?? 2000
    const calibratedTrim = readParameterValue(snapshot, `RC${channelNumber}_TRIM`) ?? 1500
    const range = Math.max(calibratedMax - calibratedMin, 1)

    if (!isValidPwm(pwm)) {
      return {
        axisId,
        label: formatRcAxisLabel(axisId),
        channelNumber,
        calibratedMin,
        calibratedMax,
        calibratedTrim,
        lowDetected: false,
        highDetected: false,
        centeredDetected: false
      }
    }

    const normalizedPercent = clamp01((pwm - calibratedMin) / range)
    const centeredDetected =
      axisId !== 'throttle' && Math.abs(pwm - calibratedTrim) <= Math.max(range * RC_CENTER_TOLERANCE_RATIO, RC_CENTER_TOLERANCE_US)

    return {
      axisId,
      label: formatRcAxisLabel(axisId),
      channelNumber,
      pwm,
      calibratedMin,
      calibratedMax,
      calibratedTrim,
      normalizedPercent,
      lowDetected: normalizedPercent <= RC_LOW_THRESHOLD,
      highDetected: normalizedPercent >= RC_HIGH_THRESHOLD,
      centeredDetected
    }
  })
}

export function createIdleRcRangeExerciseState(): RcRangeExerciseState {
  return {
    status: 'idle',
    targetAxes: [],
    axisProgress: createRcAxisProgressRecord(),
  }
}

export function createRcRangeExerciseState(snapshot: ConfiguratorSnapshot): RcRangeExerciseState {
  if (!snapshot.liveVerification.rcInput.verified) {
    return failRcRangeExerciseState(createIdleRcRangeExerciseState(), 'No live RC telemetry is available for the stick range exercise.')
  }

  const observations = deriveRcAxisObservations(snapshot)
  const axisProgress = createRcAxisProgressRecord(observations)
  const currentTargetAxis = nextRcRangeTargetAxis(RC_AXIS_ORDER, axisProgress)

  if (currentTargetAxis === undefined) {
    return {
      status: 'passed',
      targetAxes: RC_AXIS_ORDER,
      axisProgress,
      completedAtMs: Date.now()
    }
  }

  return {
    status: 'running',
    targetAxes: RC_AXIS_ORDER,
    axisProgress,
    currentTargetAxis,
    startedAtMs: Date.now()
  }
}

export function advanceRcRangeExerciseState(
  current: RcRangeExerciseState,
  snapshot: ConfiguratorSnapshot
): RcRangeExerciseState {
  if (current.status !== 'running') {
    return current
  }

  if (!snapshot.liveVerification.rcInput.verified) {
    return failRcRangeExerciseState(current, 'Lost live RC telemetry before the stick range exercise completed.')
  }

  const observations = deriveRcAxisObservations(snapshot)
  const axisProgress = { ...current.axisProgress }
  let changed = false

  observations.forEach((observation) => {
    const existing = axisProgress[observation.axisId]
    const nextState: RcAxisExerciseProgress = {
      axisId: observation.axisId,
      label: observation.label,
      channelNumber: observation.channelNumber,
      lowObserved: existing.lowObserved || observation.lowDetected,
      highObserved: existing.highObserved || observation.highDetected,
      centeredObserved: observation.axisId === 'throttle' ? false : existing.centeredObserved || observation.centeredDetected,
      completed: false
    }

    nextState.completed =
      observation.axisId === 'throttle'
        ? nextState.lowObserved && nextState.highObserved
        : nextState.lowObserved && nextState.highObserved && nextState.centeredObserved

    if (
      nextState.lowObserved !== existing.lowObserved ||
      nextState.highObserved !== existing.highObserved ||
      nextState.centeredObserved !== existing.centeredObserved ||
      nextState.completed !== existing.completed ||
      nextState.channelNumber !== existing.channelNumber
    ) {
      axisProgress[observation.axisId] = nextState
      changed = true
    }
  })

  const currentTargetAxis = nextRcRangeTargetAxis(current.targetAxes, axisProgress)
  if (currentTargetAxis === undefined) {
    return {
      ...current,
      status: 'passed',
      axisProgress,
      currentTargetAxis: undefined,
      completedAtMs: Date.now(),
      failureReason: undefined
    }
  }

  if (!changed && current.currentTargetAxis === currentTargetAxis) {
    return current
  }

  return {
    ...current,
    axisProgress,
    currentTargetAxis
  }
}

export function failRcRangeExerciseState(current: RcRangeExerciseState, reason: string): RcRangeExerciseState {
  return {
    ...current,
    status: 'failed',
    failureReason: reason,
    completedAtMs: Date.now()
  }
}

function readParameterValue(snapshot: ConfiguratorSnapshot, paramId: string): number | undefined {
  return snapshot.parameters.find((parameter) => parameter.id === paramId)?.value
}

function readRoundedParameter(snapshot: ConfiguratorSnapshot, paramId: string): number | undefined {
  const value = readParameterValue(snapshot, paramId)
  return value === undefined ? undefined : Math.round(value)
}

function getModeChannelNumber(snapshot: ConfiguratorSnapshot): number | undefined {
  const configuredChannel = readRoundedParameter(snapshot, 'FLTMODE_CH') ?? readRoundedParameter(snapshot, 'MODE_CH') ?? DEFAULT_MODE_CHANNEL
  return configuredChannel >= 1 && configuredChannel <= snapshot.liveVerification.rcInput.channelCount
    ? configuredChannel
    : configuredChannel >= 1 && configuredChannel <= 16
      ? configuredChannel
      : undefined
}

function estimateFlightModeSlot(pwm: number): number {
  if (pwm <= 1230) {
    return 1
  }
  if (pwm <= 1360) {
    return 2
  }
  if (pwm <= 1490) {
    return 3
  }
  if (pwm <= 1620) {
    return 4
  }
  if (pwm <= 1749) {
    return 5
  }
  return 6
}

function nextModeSwitchTarget(targetSlots: number[], visitedSlots: number[]): number | undefined {
  return targetSlots.find((slot) => !visitedSlots.includes(slot))
}

function deriveRcAxisChannelMap(snapshot: ConfiguratorSnapshot): Record<RcAxisId, number> {
  return {
    roll: readRoundedParameter(snapshot, 'RCMAP_ROLL') ?? DEFAULT_RC_AXIS_CHANNEL_MAP.roll,
    pitch: readRoundedParameter(snapshot, 'RCMAP_PITCH') ?? DEFAULT_RC_AXIS_CHANNEL_MAP.pitch,
    throttle: readRoundedParameter(snapshot, 'RCMAP_THROTTLE') ?? DEFAULT_RC_AXIS_CHANNEL_MAP.throttle,
    yaw: readRoundedParameter(snapshot, 'RCMAP_YAW') ?? DEFAULT_RC_AXIS_CHANNEL_MAP.yaw
  }
}

function createRcAxisProgressRecord(observations: RcAxisObservation[] = []): Record<RcAxisId, RcAxisExerciseProgress> {
  const observationMap = new Map(observations.map((observation) => [observation.axisId, observation]))

  return Object.fromEntries(
    RC_AXIS_ORDER.map((axisId) => {
      const observation = observationMap.get(axisId)
      const progress: RcAxisExerciseProgress = {
        axisId,
        label: formatRcAxisLabel(axisId),
        channelNumber: observation?.channelNumber ?? DEFAULT_RC_AXIS_CHANNEL_MAP[axisId],
        lowObserved: observation?.lowDetected ?? false,
        highObserved: observation?.highDetected ?? false,
        centeredObserved: axisId === 'throttle' ? false : observation?.centeredDetected ?? false,
        completed: false
      }

      progress.completed =
        axisId === 'throttle'
          ? progress.lowObserved && progress.highObserved
          : progress.lowObserved && progress.highObserved && progress.centeredObserved

      return [axisId, progress]
    })
  ) as Record<RcAxisId, RcAxisExerciseProgress>
}

function nextRcRangeTargetAxis(
  targetAxes: RcAxisId[],
  axisProgress: Record<RcAxisId, RcAxisExerciseProgress>
): RcAxisId | undefined {
  return targetAxes.find((axisId) => !axisProgress[axisId].completed)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function isValidPwm(value: number | undefined): value is number {
  return value !== undefined && value !== 0xffff && value >= 800 && value <= 2200
}
