import type {
  FirmwareMetadataBundle,
  GuidedActionId,
  LiveSignalId,
  SessionProfile,
  SetupSectionSessionOverride,
} from '@arduconfig/param-metadata'
import { formatArducopterFlightMode } from '@arduconfig/param-metadata'
import type {
  CommandAckMessage,
  CommandLongMessage,
  HeartbeatMessage,
  MavlinkEnvelope,
  ParamValueMessage,
  RcChannelsMessage,
  StatusTextMessage,
  SysStatusMessage,
} from '@arduconfig/protocol-mavlink'
import {
  MAV_AUTOPILOT,
  MAV_CMD,
  MAV_MODE_FLAG,
  MAV_PARAM_TYPE,
  MAV_RESULT,
  MAV_SEVERITY,
  MAV_TYPE,
  MAVLINK_MESSAGE_IDS,
  MavlinkSession,
} from '@arduconfig/protocol-mavlink'
import type { TransportStatus, Unsubscribe } from '@arduconfig/transport'

import type {
  ConfiguratorSnapshot,
  GuidedActionState,
  LiveVerificationState,
  ParameterState,
  ParameterSyncState,
  SetupSectionState,
  StatusTextEntry,
  VehicleIdentity,
} from './types.js'

type UpdateListener = (snapshot: ConfiguratorSnapshot) => void

interface VehicleWaiter {
  resolve: (vehicle: VehicleIdentity) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface ParameterSyncWaiter {
  resolve: (parameterStats: ConfiguratorSnapshot['parameterStats']) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface WaitForVehicleOptions {
  timeoutMs?: number
}

export interface RequestParameterListOptions extends WaitForVehicleOptions {}

export interface WaitForParameterSyncOptions {
  timeoutMs?: number
}

export interface ArduPilotConfiguratorRuntimeOptions {
  sessionProfile?: SessionProfile
}

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 5000
const DEFAULT_PARAMETER_SYNC_TIMEOUT_MS = 20000
const MAX_GUIDED_ACTION_STATUS_TEXTS = 5
const LIVE_TELEMETRY_INTERVAL_US = 200000
const LIVE_TELEMETRY_REQUESTS = [
  {
    messageId: MAVLINK_MESSAGE_IDS.RC_CHANNELS,
    label: 'RC_CHANNELS'
  },
  {
    messageId: MAVLINK_MESSAGE_IDS.SYS_STATUS,
    label: 'SYS_STATUS'
  }
] as const

export class ArduPilotConfiguratorRuntime {
  private readonly updateListeners = new Set<UpdateListener>()
  private readonly subscriptions: Unsubscribe[]
  private readonly vehicleWaiters = new Set<VehicleWaiter>()
  private readonly parameterSyncWaiters = new Set<ParameterSyncWaiter>()
  private readonly parameters = new Map<string, ParameterState>()
  private readonly statusTexts: StatusTextEntry[] = []

  private connection: TransportStatus
  private sessionProfile: SessionProfile
  private vehicle?: VehicleIdentity
  private parameterSync: ParameterSyncState = createIdleParameterSync()
  private guidedActions = createIdleGuidedActions()
  private liveVerification = createIdleLiveVerification()
  private totalParameters = 0
  private liveTelemetryRequestsIssued = false

  constructor(
    private readonly session: MavlinkSession,
    private readonly metadata: FirmwareMetadataBundle,
    options: ArduPilotConfiguratorRuntimeOptions = {}
  ) {
    this.connection = this.session.getTransportStatus()
    this.sessionProfile = options.sessionProfile ?? 'full-power'
    this.subscriptions = [
      this.session.onStatus((status: TransportStatus) => {
        this.connection = status
        if (status.kind === 'disconnected' || status.kind === 'error') {
          const reason =
            status.kind === 'error'
              ? status.message
              : status.reason ?? 'Vehicle link closed before the request completed.'
          this.rejectVehicleWaiters(new Error(reason))
          this.rejectParameterSyncWaiters(new Error(reason))
          this.resetLiveState()
        }
        this.emit()
      }),
      this.session.onMessage((envelope: MavlinkEnvelope) => {
        this.processEnvelope(envelope)
        this.emit()
      })
    ]
  }

  getSnapshot(): ConfiguratorSnapshot {
    const parameters = [...this.parameters.values()].sort((left, right) => left.id.localeCompare(right.id))

    return {
      connection: this.connection,
      sessionProfile: this.sessionProfile,
      vehicle: this.vehicle,
      parameterStats: {
        downloaded: parameters.length,
        total: this.totalParameters,
        duplicateFrames: this.parameterSync.duplicateFrames,
        status: this.parameterSync.status,
        progress: this.parameterSync.progress,
        requestedAtMs: this.parameterSync.requestedAtMs,
        completedAtMs: this.parameterSync.completedAtMs
      },
      parameters,
      setupSections: this.buildSetupSections(),
      guidedActions: cloneGuidedActions(this.guidedActions),
      liveVerification: cloneLiveVerification(this.liveVerification),
      statusTexts: [...this.statusTexts]
    }
  }

  subscribe(listener: UpdateListener): Unsubscribe {
    this.updateListeners.add(listener)
    listener(this.getSnapshot())
    return () => {
      this.updateListeners.delete(listener)
    }
  }

  async connect(): Promise<void> {
    this.resetLiveState()
    await this.session.connect()
  }

  async disconnect(): Promise<void> {
    await this.session.disconnect()
  }

  setSessionProfile(profile: SessionProfile): void {
    if (this.sessionProfile === profile) {
      return
    }

    this.sessionProfile = profile
    GUIDED_ACTION_IDS.forEach((actionId) => {
      const current = this.guidedActions[actionId]
      if (current.status === 'idle') {
        this.setGuidedAction(actionId, {
          ...current,
          instructions: defaultInstructionsForAction(actionId, profile)
        })
      }
    })
    this.emit()
  }

  async waitForVehicle(options: WaitForVehicleOptions = {}): Promise<VehicleIdentity> {
    if (this.vehicle) {
      return this.vehicle
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS
    if (this.parameterSync.status === 'idle') {
      this.parameterSync = {
        ...this.parameterSync,
        status: 'awaiting-vehicle'
      }
      this.emit()
    }

    return new Promise<VehicleIdentity>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.vehicleWaiters.delete(waiter)
        reject(new Error(`Timed out waiting for vehicle heartbeat after ${timeoutMs}ms.`))
      }, timeoutMs)

      const waiter: VehicleWaiter = {
        resolve: (vehicle: VehicleIdentity) => {
          clearTimeout(timer)
          resolve(vehicle)
        },
        reject: (error: Error) => {
          clearTimeout(timer)
          reject(error)
        },
        timer
      }

      this.vehicleWaiters.add(waiter)
    })
  }

  async requestParameterList(options: RequestParameterListOptions = {}): Promise<void> {
    this.setGuidedAction('request-parameters', {
      actionId: 'request-parameters',
      status: 'requested',
      summary: 'Waiting for heartbeat before requesting the parameter table.',
      instructions: ['The parameter sync will start once the autopilot heartbeat identifies the target system.'],
      statusTexts: [],
      startedAtMs: Date.now(),
      updatedAtMs: Date.now(),
      completedAtMs: undefined
    })
    this.emit()

    try {
      const vehicle = await this.waitForVehicle(options)
      this.parameters.clear()
      this.totalParameters = 0
      this.parameterSync = {
        status: 'requesting',
        downloaded: 0,
        total: 0,
        duplicateFrames: 0,
        progress: null,
        targetSystemId: vehicle.systemId,
        targetComponentId: vehicle.componentId,
        requestedAtMs: Date.now()
      }
      this.setGuidedAction('request-parameters', {
        actionId: 'request-parameters',
        status: 'running',
        summary: `Parameter request sent to sys=${vehicle.systemId} comp=${vehicle.componentId}.`,
        instructions: ['Waiting for the autopilot to stream the full parameter table.'],
        statusTexts: [],
        startedAtMs: this.guidedActions['request-parameters'].startedAtMs ?? Date.now(),
        updatedAtMs: Date.now(),
        completedAtMs: undefined
      })
      this.emit()

      await this.session.send({
        type: 'PARAM_REQUEST_LIST',
        targetSystem: vehicle.systemId,
        targetComponent: vehicle.componentId
      })
    } catch (error) {
      this.failGuidedAction('request-parameters', error)
      this.emit()
      throw error
    }
  }

  async waitForParameterSync(options: WaitForParameterSyncOptions = {}): Promise<ConfiguratorSnapshot['parameterStats']> {
    if (this.parameterSync.status === 'complete') {
      return this.getSnapshot().parameterStats
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_PARAMETER_SYNC_TIMEOUT_MS

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.parameterSyncWaiters.delete(waiter)
        reject(new Error(`Timed out waiting for parameter sync after ${timeoutMs}ms.`))
      }, timeoutMs)

      const waiter: ParameterSyncWaiter = {
        resolve: (parameterStats: ConfiguratorSnapshot['parameterStats']) => {
          clearTimeout(timer)
          resolve(parameterStats)
        },
        reject: (error: Error) => {
          clearTimeout(timer)
          reject(error)
        },
        timer
      }

      this.parameterSyncWaiters.add(waiter)
    })
  }

  async setParameter(paramId: string, paramValue: number): Promise<void> {
    const known = this.parameters.get(paramId)
    this.parameters.set(paramId, {
      id: paramId,
      value: paramValue,
      index: known?.index ?? this.parameters.size,
      count: known?.count ?? this.totalParameters,
      definition: this.metadata.parameters[paramId]
    })

    await this.session.send({
      type: 'PARAM_SET',
      targetSystem: this.vehicle?.systemId ?? 1,
      targetComponent: this.vehicle?.componentId ?? 1,
      paramId,
      paramValue,
      paramType: MAV_PARAM_TYPE.REAL32
    })

    this.emit()
  }

  async runGuidedAction(actionId: GuidedActionId): Promise<void> {
    switch (actionId) {
      case 'request-parameters':
        await this.requestParameterList()
        return
      case 'calibrate-accelerometer':
        await this.performCommandGuidedAction(
          'calibrate-accelerometer',
          'Accelerometer calibration command queued.',
          'Accelerometer calibration command sent. Waiting for autopilot guidance.',
          defaultInstructionsForAction('calibrate-accelerometer', this.sessionProfile),
          () => this.sendCommand(MAV_CMD.PREFLIGHT_CALIBRATION, [0, 0, 0, 0, 1, 0, 0])
        )
        return
      case 'calibrate-compass':
        await this.performCommandGuidedAction(
          'calibrate-compass',
          'Compass calibration command queued.',
          'Compass calibration command sent. Waiting for autopilot guidance.',
          defaultInstructionsForAction('calibrate-compass', this.sessionProfile),
          () => this.sendCommand(MAV_CMD.PREFLIGHT_CALIBRATION, [0, 1, 0, 0, 0, 0, 0])
        )
        return
      case 'reboot-autopilot':
        await this.performCommandGuidedAction(
          'reboot-autopilot',
          'Autopilot reboot request queued.',
          'Reboot request sent. Expect the link to drop if the autopilot accepts it.',
          defaultInstructionsForAction('reboot-autopilot', this.sessionProfile),
          () => this.sendCommand(MAV_CMD.PREFLIGHT_REBOOT_SHUTDOWN, [1, 0, 0, 0, 0, 0, 0])
        )
        return
      default:
        return
    }
  }

  destroy(): void {
    this.subscriptions.forEach((unsubscribe) => unsubscribe())
    this.rejectVehicleWaiters(new Error('Runtime destroyed before vehicle heartbeat was received.'))
    this.rejectParameterSyncWaiters(new Error('Runtime destroyed before parameter sync completed.'))
    this.session.destroy()
  }

  private async sendCommand(command: number, params: number[]): Promise<void> {
    const message: CommandLongMessage = {
      type: 'COMMAND_LONG',
      command,
      targetSystem: this.vehicle?.systemId ?? 1,
      targetComponent: this.vehicle?.componentId ?? 1,
      confirmation: 0,
      params: params as CommandLongMessage['params']
    }

    await this.session.send(message)
  }

  private async requestLiveTelemetryStreams(systemId: number, componentId: number): Promise<void> {
    this.liveTelemetryRequestsIssued = true

    try {
      for (const request of LIVE_TELEMETRY_REQUESTS) {
        await this.session.send({
          type: 'COMMAND_LONG',
          command: MAV_CMD.SET_MESSAGE_INTERVAL,
          targetSystem: systemId,
          targetComponent: componentId,
          confirmation: 0,
          params: [request.messageId, LIVE_TELEMETRY_INTERVAL_US, 0, 0, 0, 0, 0]
        })
      }

      this.appendStatusEntry(
        'info',
        `Requested live telemetry streams: ${LIVE_TELEMETRY_REQUESTS.map((request) => request.label).join(', ')}.`
      )
    } catch (error) {
      this.liveTelemetryRequestsIssued = false
      const message = error instanceof Error ? error.message : 'Unknown live telemetry request error.'
      this.appendStatusEntry('warning', `Failed to request live telemetry streams: ${message}`)
    }
  }

  private processEnvelope(envelope: MavlinkEnvelope): void {
    switch (envelope.message.type) {
      case 'HEARTBEAT':
        this.processHeartbeat(envelope.message, envelope.header.systemId, envelope.header.componentId)
        break
      case 'PARAM_VALUE':
        this.processParamValue(envelope.message)
        break
      case 'RC_CHANNELS':
        this.processRcChannels(envelope.message)
        break
      case 'COMMAND_ACK':
        this.processCommandAck(envelope.message)
        break
      case 'STATUSTEXT':
        this.processStatusText(envelope.message)
        break
      case 'SYS_STATUS':
        this.processSysStatus(envelope.message)
        break
      default:
        break
    }
  }

  private processHeartbeat(message: HeartbeatMessage, systemId: number, componentId: number): void {
    const isCopter = message.autopilot === MAV_AUTOPILOT.ARDUPILOTMEGA && message.vehicleType === MAV_TYPE.QUADROTOR
    this.vehicle = {
      firmware: isCopter ? 'ArduPilot' : 'Unknown',
      vehicle: isCopter ? 'ArduCopter' : 'Unknown',
      systemId,
      componentId,
      armed: Boolean(message.baseMode & MAV_MODE_FLAG.SAFETY_ARMED),
      flightMode: formatArduPilotMode(message.customMode)
    }

    if (this.parameterSync.status === 'awaiting-vehicle') {
      this.parameterSync = createIdleParameterSync()
    }

    this.resolveVehicleWaiters(this.vehicle)

    if (!this.liveTelemetryRequestsIssued) {
      void this.requestLiveTelemetryStreams(systemId, componentId)
    }
  }

  private processParamValue(message: ParamValueMessage): void {
    const known = this.parameters.get(message.paramId)
    this.totalParameters = message.paramCount
    this.parameters.set(message.paramId, {
      id: message.paramId,
      value: message.paramValue,
      index: message.paramIndex,
      count: message.paramCount,
      definition: this.metadata.parameters[message.paramId]
    })

    const downloaded = this.parameters.size
    const duplicateFrames = this.parameterSync.duplicateFrames + (known ? 1 : 0)
    const total = this.totalParameters
    const isComplete = total > 0 && downloaded >= total

    this.parameterSync = {
      status: isComplete ? 'complete' : downloaded > 0 ? 'streaming' : this.parameterSync.status,
      downloaded,
      total,
      duplicateFrames,
      progress: total > 0 ? Math.min(downloaded / total, 1) : null,
      targetSystemId: this.parameterSync.targetSystemId ?? this.vehicle?.systemId,
      targetComponentId: this.parameterSync.targetComponentId ?? this.vehicle?.componentId,
      requestedAtMs: this.parameterSync.requestedAtMs,
      completedAtMs: isComplete ? this.parameterSync.completedAtMs ?? Date.now() : undefined
    }

    if (isComplete) {
      this.setGuidedAction('request-parameters', {
        ...this.guidedActions['request-parameters'],
        status: 'succeeded',
        summary: `Parameter sync complete. Downloaded ${downloaded}/${total} values.`,
        instructions: ['Review the setup sections and confirm any hardware-dependent steps on the live vehicle.'],
        updatedAtMs: Date.now(),
        completedAtMs: Date.now()
      })
      this.resolveParameterSyncWaiters(this.getSnapshot().parameterStats)
      return
    }

    if (this.parameterSync.status === 'streaming' || this.parameterSync.status === 'requesting') {
      this.setGuidedAction('request-parameters', {
        ...this.guidedActions['request-parameters'],
        status: 'running',
        summary: `Downloading parameter table (${downloaded}/${total || 'unknown'}).`,
        instructions: ['Keep the link open until the parameter stream completes.'],
        updatedAtMs: Date.now(),
        completedAtMs: undefined
      })
    }
  }

  private processStatusText(message: StatusTextMessage): void {
    this.statusTexts.unshift({
      severity: severityName(message.severity),
      text: message.text
    })
    this.statusTexts.splice(12)
    this.processGuidedActionStatusText(message.text)
  }

  private processRcChannels(message: RcChannelsMessage): void {
    const validChannels = message.channels.filter((value, index) => index < message.channelCount && isPwmChannelValue(value))
    this.liveVerification.rcInput = {
      verified: message.channelCount > 0 && validChannels.length > 0,
      channelCount: message.channelCount,
      channels: message.channels.slice(0, Math.max(message.channelCount, 8)),
      rssi: message.rssi === 255 ? undefined : message.rssi,
      lastSeenAtMs: Date.now()
    }
    this.liveVerification.satisfiedSignals = recomputeSatisfiedSignals(this.liveVerification)
  }

  private processSysStatus(message: SysStatusMessage): void {
    const voltageMv = message.voltageBatteryMv
    const batteryVerified = voltageMv !== 0xffff && voltageMv > 1000
    this.liveVerification.batteryTelemetry = {
      verified: batteryVerified,
      voltageMv: batteryVerified ? voltageMv : undefined,
      voltageV: batteryVerified ? Number((voltageMv / 1000).toFixed(2)) : undefined,
      currentA:
        batteryVerified && message.currentBatteryCa !== -1 ? Number((message.currentBatteryCa / 100).toFixed(2)) : undefined,
      remainingPercent:
        batteryVerified && message.batteryRemaining >= 0 && message.batteryRemaining <= 100 ? message.batteryRemaining : undefined,
      lastSeenAtMs: Date.now()
    }
    this.liveVerification.satisfiedSignals = recomputeSatisfiedSignals(this.liveVerification)
  }

  private processCommandAck(message: CommandAckMessage): void {
    if (message.command !== MAV_CMD.SET_MESSAGE_INTERVAL) {
      return
    }

    if (message.result === MAV_RESULT.ACCEPTED || message.result === MAV_RESULT.IN_PROGRESS) {
      return
    }

    this.appendStatusEntry('warning', `Autopilot rejected live telemetry stream request (${mavResultLabel(message.result)}).`)
  }

  private buildSetupSections(): SetupSectionState[] {
    return this.metadata.setupSections.map((definition) => {
      const sectionParameters = definition.requiredParameters
        .map((parameterId: string) => this.parameters.get(parameterId))
        .filter((parameter): parameter is ParameterState => parameter !== undefined)

      const missingParameters = definition.requiredParameters.filter(
        (parameterId: string) => !this.parameters.has(parameterId)
      )
      const completionTexts = definition.completionStatusTexts ?? []
      const missingCompletionTexts = completionTexts.filter(
        (text: string) => !this.statusTexts.some((entry) => entry.text.includes(text))
      )
      const missingLiveSignals = (definition.requiredLiveSignals ?? []).filter(
        (signalId: LiveSignalId) => !this.liveVerification.satisfiedSignals.includes(signalId)
      )

      const hasAnyProgress =
        sectionParameters.length > 0 ||
        missingLiveSignals.length < (definition.requiredLiveSignals?.length ?? 0) ||
        completionTexts.some((text: string) => this.statusTexts.some((entry) => entry.text.includes(text)))

      const baseStatus =
        missingParameters.length === 0 && missingCompletionTexts.length === 0 && missingLiveSignals.length === 0
          ? 'complete'
          : hasAnyProgress
            ? 'in-progress'
            : 'attention'

      const sessionOverride = definition.sessionOverrides?.[this.sessionProfile]
      const status = applySessionOverride(baseStatus, hasAnyProgress, sessionOverride)

      const notes = [
        ...missingParameters.map((parameterId: string) => `Missing parameter: ${parameterId}`),
        ...missingCompletionTexts.map((text: string) => `Pending confirmation: ${text}`),
        ...missingLiveSignals.map((signalId: LiveSignalId) => `Pending live verification: ${liveSignalLabel(signalId)}`),
        ...(sessionOverride?.notes ?? [])
      ]

      return {
        id: definition.id,
        title: definition.title,
        description: definition.description,
        status,
        notes,
        actions: definition.actions ?? [],
        definition,
        parameters: sectionParameters
      }
    })
  }

  private emit(): void {
    const snapshot = this.getSnapshot()
    this.updateListeners.forEach((listener) => listener(snapshot))
  }

  private resetLiveState(): void {
    this.vehicle = undefined
    this.parameters.clear()
    this.totalParameters = 0
    this.parameterSync = createIdleParameterSync()
    this.guidedActions = createIdleGuidedActions()
    this.liveVerification = createIdleLiveVerification()
    this.liveTelemetryRequestsIssued = false
    this.statusTexts.splice(0)
  }

  private resolveVehicleWaiters(vehicle: VehicleIdentity): void {
    this.vehicleWaiters.forEach((waiter) => {
      clearTimeout(waiter.timer)
      waiter.resolve(vehicle)
    })
    this.vehicleWaiters.clear()
  }

  private rejectVehicleWaiters(error: Error): void {
    this.vehicleWaiters.forEach((waiter) => {
      clearTimeout(waiter.timer)
      waiter.reject(error)
    })
    this.vehicleWaiters.clear()
  }

  private resolveParameterSyncWaiters(parameterStats: ConfiguratorSnapshot['parameterStats']): void {
    this.parameterSyncWaiters.forEach((waiter) => {
      clearTimeout(waiter.timer)
      waiter.resolve(parameterStats)
    })
    this.parameterSyncWaiters.clear()
  }

  private rejectParameterSyncWaiters(error: Error): void {
    this.parameterSyncWaiters.forEach((waiter) => {
      clearTimeout(waiter.timer)
      waiter.reject(error)
    })
    this.parameterSyncWaiters.clear()
  }

  private async performCommandGuidedAction(
    actionId: GuidedActionId,
    requestedSummary: string,
    runningSummary: string,
    instructions: string[],
    operation: () => Promise<void>
  ): Promise<void> {
    const startedAtMs = Date.now()
    this.setGuidedAction(actionId, {
      actionId,
      status: 'requested',
      summary: requestedSummary,
      instructions,
      statusTexts: [],
      startedAtMs,
      updatedAtMs: startedAtMs,
      completedAtMs: undefined
    })
    this.emit()

    try {
      await operation()
      this.setGuidedAction(actionId, {
        ...this.guidedActions[actionId],
        status: 'running',
        summary: runningSummary,
        instructions,
        updatedAtMs: Date.now(),
        completedAtMs: undefined
      })
      this.emit()
    } catch (error) {
      this.failGuidedAction(actionId, error)
      this.emit()
      throw error
    }
  }

  private failGuidedAction(actionId: GuidedActionId, error: unknown): void {
    const message = error instanceof Error ? error.message : 'Unknown guided action error.'
    this.setGuidedAction(actionId, {
      ...this.guidedActions[actionId],
      status: 'failed',
      summary: message,
      updatedAtMs: Date.now(),
      completedAtMs: Date.now()
    })
  }

  private processGuidedActionStatusText(text: string): void {
    const now = Date.now()
    GUIDED_ACTION_IDS.filter((actionId) => actionId !== 'request-parameters').forEach((actionId) => {
      const current = this.guidedActions[actionId]
      const match = matchGuidedActionText(actionId, current, text, this.sessionProfile)
      if (!match) {
        return
      }

      const nextStatus = match.status ?? (current.status === 'idle' ? 'running' : current.status)
      this.setGuidedAction(actionId, {
        actionId,
        status: nextStatus,
        summary: match.summary,
        instructions: match.instructions ?? current.instructions,
        statusTexts: appendGuidedActionText(current.statusTexts, text),
        startedAtMs: current.startedAtMs ?? now,
        updatedAtMs: now,
        completedAtMs: nextStatus === 'succeeded' || nextStatus === 'failed' ? now : undefined
      })
    })
  }

  private setGuidedAction(actionId: GuidedActionId, state: GuidedActionState): void {
    this.guidedActions[actionId] = state
  }

  private appendStatusEntry(severity: StatusTextEntry['severity'], text: string): void {
    const duplicate = this.statusTexts[0]?.severity === severity && this.statusTexts[0]?.text === text
    if (!duplicate) {
      this.statusTexts.unshift({
        severity,
        text
      })
    }
    this.statusTexts.splice(12)
  }
}

function severityName(severity: number): StatusTextEntry['severity'] {
  if (severity <= MAV_SEVERITY.ERROR) {
    return 'error'
  }
  if (severity === MAV_SEVERITY.WARNING) {
    return 'warning'
  }
  return 'info'
}

function formatArduPilotMode(customMode: number): string {
  return formatArducopterFlightMode(customMode)
}

function createIdleParameterSync(): ParameterSyncState {
  return {
    status: 'idle',
    downloaded: 0,
    total: 0,
    duplicateFrames: 0,
    progress: null
  }
}

function createIdleLiveVerification(): LiveVerificationState {
  return {
    satisfiedSignals: [],
    rcInput: {
      verified: false,
      channelCount: 0,
      channels: []
    },
    batteryTelemetry: {
      verified: false
    }
  }
}

function createIdleGuidedActions(): Record<GuidedActionId, GuidedActionState> {
  return {
    'request-parameters': createIdleGuidedAction('request-parameters'),
    'calibrate-accelerometer': createIdleGuidedAction('calibrate-accelerometer'),
    'calibrate-compass': createIdleGuidedAction('calibrate-compass'),
    'reboot-autopilot': createIdleGuidedAction('reboot-autopilot')
  }
}

function createIdleGuidedAction(actionId: GuidedActionId): GuidedActionState {
  return {
    actionId,
    status: 'idle',
    summary: idleSummaryForAction(actionId),
    instructions: defaultInstructionsForAction(actionId, 'full-power'),
    statusTexts: []
  }
}

function cloneGuidedActions(guidedActions: Record<GuidedActionId, GuidedActionState>): Record<GuidedActionId, GuidedActionState> {
  return Object.fromEntries(
    GUIDED_ACTION_IDS.map((actionId) => [
      actionId,
      {
        ...guidedActions[actionId],
        instructions: [...guidedActions[actionId].instructions],
        statusTexts: [...guidedActions[actionId].statusTexts]
      }
    ])
  ) as Record<GuidedActionId, GuidedActionState>
}

function cloneLiveVerification(liveVerification: LiveVerificationState): LiveVerificationState {
  return {
    satisfiedSignals: [...liveVerification.satisfiedSignals],
    rcInput: {
      ...liveVerification.rcInput,
      channels: [...liveVerification.rcInput.channels]
    },
    batteryTelemetry: {
      ...liveVerification.batteryTelemetry
    }
  }
}

function idleSummaryForAction(actionId: GuidedActionId): string {
  switch (actionId) {
    case 'request-parameters':
      return 'Ready to request the full parameter table.'
    case 'calibrate-accelerometer':
      return 'Accelerometer calibration has not started.'
    case 'calibrate-compass':
      return 'Compass calibration has not started.'
    case 'reboot-autopilot':
      return 'No reboot has been requested.'
    default:
      return 'Ready.'
  }
}

function defaultInstructionsForAction(actionId: GuidedActionId, sessionProfile: SessionProfile): string[] {
  switch (actionId) {
    case 'request-parameters':
      return ['Pull the full parameter table before attempting guided setup or parameter edits.']
    case 'calibrate-accelerometer':
      return [
        'Keep the vehicle disarmed on a stable surface.',
        'Follow each orientation request from the autopilot and hold the frame still until the next prompt appears.'
      ]
    case 'calibrate-compass':
      return [
        'Keep the vehicle away from strong magnetic interference.',
        sessionProfile === 'usb-bench'
          ? 'If external compasses or peripherals are unpowered on USB alone, final compass verification may still need full vehicle power.'
          : 'Rotate the vehicle smoothly through all axes until the autopilot reports completion.'
      ]
    case 'reboot-autopilot':
      return ['Expect the serial link to drop if the autopilot accepts the reboot request.']
    default:
      return []
  }
}

function appendGuidedActionText(statusTexts: string[], text: string): string[] {
  const next = statusTexts[0] === text ? [...statusTexts] : [text, ...statusTexts]
  return next.slice(0, MAX_GUIDED_ACTION_STATUS_TEXTS)
}

function matchGuidedActionText(
  actionId: GuidedActionId,
  current: GuidedActionState,
  text: string,
  sessionProfile: SessionProfile
):
  | {
      status?: GuidedActionState['status']
      summary: string
      instructions?: string[]
    }
  | undefined {
  const normalized = text.toLowerCase()
  const actionIsActive = current.status === 'requested' || current.status === 'running'

  if (actionId === 'calibrate-accelerometer') {
    if (normalized.includes('accelerometer calibration complete')) {
      return {
        status: 'succeeded',
        summary: 'Accelerometer calibration complete.',
        instructions: ['Review the updated setup state before moving on to compass or radio setup.']
      }
    }
    if (normalized.includes('accelerometer calibration failed') || normalized.includes('accel cal failed')) {
      return {
        status: 'failed',
        summary: 'Accelerometer calibration failed.',
        instructions: defaultInstructionsForAction(actionId, sessionProfile)
      }
    }
    if (actionIsActive && normalized.includes('level')) {
      return {
        status: 'running',
        summary: 'Place the vehicle level and keep it still.',
        instructions: ['Set the frame level on a stable surface and wait for the next orientation prompt.']
      }
    }
    if (actionIsActive && normalized.includes('left')) {
      return {
        status: 'running',
        summary: 'Place the vehicle on its left side and keep it still.',
        instructions: ['Move the frame onto its left side and avoid motion until the next prompt.']
      }
    }
    if (actionIsActive && normalized.includes('right')) {
      return {
        status: 'running',
        summary: 'Place the vehicle on its right side and keep it still.',
        instructions: ['Move the frame onto its right side and avoid motion until the next prompt.']
      }
    }
    if (actionIsActive && normalized.includes('nose down')) {
      return {
        status: 'running',
        summary: 'Place the vehicle nose down and keep it still.',
        instructions: ['Tilt the frame nose-down and hold it steady until the autopilot advances.']
      }
    }
    if (actionIsActive && normalized.includes('nose up')) {
      return {
        status: 'running',
        summary: 'Place the vehicle nose up and keep it still.',
        instructions: ['Tilt the frame nose-up and hold it steady until the autopilot advances.']
      }
    }
    if (actionIsActive && normalized.includes('back')) {
      return {
        status: 'running',
        summary: 'Place the vehicle on its back and keep it still.',
        instructions: ['Flip the frame onto its back and keep it motionless until calibration completes.']
      }
    }
    if (normalized.includes('accelerometer calibration')) {
      return {
        status: 'running',
        summary: text,
        instructions: defaultInstructionsForAction(actionId, sessionProfile)
      }
    }
  }

  if (actionId === 'calibrate-compass') {
    if (normalized.includes('compass calibration complete')) {
      return {
        status: 'succeeded',
        summary: 'Compass calibration complete.',
        instructions: ['Review compass health before flight, especially if this was a USB-only bench session.']
      }
    }
    if (normalized.includes('compass calibration failed') || normalized.includes('mag calibration failed')) {
      return {
        status: 'failed',
        summary: 'Compass calibration failed.',
        instructions: defaultInstructionsForAction(actionId, sessionProfile)
      }
    }
    if (
      actionIsActive &&
      (normalized.includes('rotate') ||
        normalized.includes('yaw') ||
        normalized.includes('pitch') ||
        normalized.includes('roll'))
    ) {
      return {
        status: 'running',
        summary: 'Rotate the vehicle through all axes until compass calibration completes.',
        instructions: defaultInstructionsForAction(actionId, sessionProfile)
      }
    }
    if (normalized.includes('compass calibration')) {
      return {
        status: 'running',
        summary: text,
        instructions: defaultInstructionsForAction(actionId, sessionProfile)
      }
    }
  }

  if (actionId === 'reboot-autopilot') {
    if (normalized.includes('reboot requested') || normalized.includes('rebooting')) {
      return {
        status: 'succeeded',
        summary: 'Autopilot reboot requested.',
        instructions: defaultInstructionsForAction(actionId, sessionProfile)
      }
    }
  }

  return undefined
}

const GUIDED_ACTION_IDS: GuidedActionId[] = [
  'request-parameters',
  'calibrate-accelerometer',
  'calibrate-compass',
  'reboot-autopilot'
]

function recomputeSatisfiedSignals(liveVerification: LiveVerificationState): LiveSignalId[] {
  const signals: LiveSignalId[] = []
  if (liveVerification.rcInput.verified) {
    signals.push('rc-input')
  }
  if (liveVerification.batteryTelemetry.verified) {
    signals.push('battery-telemetry')
  }
  return signals
}

function liveSignalLabel(signalId: LiveSignalId): string {
  if (signalId === 'rc-input') {
    return 'RC input telemetry'
  }
  return 'battery telemetry'
}

function mavResultLabel(result: number): string {
  switch (result) {
    case MAV_RESULT.ACCEPTED:
      return 'ACCEPTED'
    case MAV_RESULT.TEMPORARILY_REJECTED:
      return 'TEMPORARILY_REJECTED'
    case MAV_RESULT.DENIED:
      return 'DENIED'
    case MAV_RESULT.UNSUPPORTED:
      return 'UNSUPPORTED'
    case MAV_RESULT.FAILED:
      return 'FAILED'
    case MAV_RESULT.IN_PROGRESS:
      return 'IN_PROGRESS'
    default:
      return `UNKNOWN(${result})`
  }
}

function isPwmChannelValue(value: number): boolean {
  return value >= 800 && value <= 2200
}

function applySessionOverride(
  status: SetupSectionState['status'],
  hasAnyProgress: boolean,
  sessionOverride: SetupSectionSessionOverride | undefined
): SetupSectionState['status'] {
  if (!sessionOverride?.deferCompletion || status !== 'complete') {
    return status
  }

  return hasAnyProgress ? 'in-progress' : 'attention'
}
