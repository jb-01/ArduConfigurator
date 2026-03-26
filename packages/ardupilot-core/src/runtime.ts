import type {
  FirmwareMetadataBundle,
  GuidedActionId,
  LiveSignalId,
  SessionProfile,
  SetupSectionSessionOverride,
} from '@arduconfig/param-metadata'
import { formatArducopterFlightMode } from '@arduconfig/param-metadata'
import type {
  AttitudeMessage,
  AutopilotVersionMessage,
  CommandAckMessage,
  CommandLongMessage,
  FileTransferProtocolMessage,
  GlobalPositionIntMessage,
  HeartbeatMessage,
  MavlinkEnvelope,
  ParamValueMessage,
  RcChannelsMessage,
  StatusTextMessage,
  SysStatusMessage,
} from '@arduconfig/protocol-mavlink'
import {
  MAV_FTP_ERR,
  MAV_FTP_OPCODE,
  MAV_PROTOCOL_CAPABILITY,
  MAV_AUTOPILOT,
  MAV_CMD,
  MAV_MODE_FLAG,
  MOTOR_TEST_ORDER,
  MOTOR_TEST_THROTTLE_TYPE,
  MAV_PARAM_TYPE,
  MAV_RESULT,
  MAV_SEVERITY,
  MAV_TYPE,
  MAVLINK_MESSAGE_IDS,
  MavlinkSession,
} from '@arduconfig/protocol-mavlink'
import type { TransportStatus, Unsubscribe } from '@arduconfig/transport'

import type {
  BoardFileState,
  HardwareBoardState,
  HardwareState,
  ConfiguratorSnapshot,
  GuidedActionState,
  LiveVerificationState,
  MotorTestRequest,
  PreArmIssueState,
  PreArmStatusState,
  ParameterBatchWriteResult,
  MotorTestState,
  ParameterState,
  ParameterSyncState,
  ParameterWriteOptions,
  ParameterWriteRequest,
  ParameterWriteResult,
  SetupSectionState,
  StatusTextEntry,
  VehicleIdentity,
} from './types.js'
import {
  boardTypeFromBoardVersion,
  decodeMavftpPayload,
  encodeMavftpPayload,
  formatAutopilotUid,
  MavftpRequestError,
  normalizeMavftpPath,
  parseMavftpDirectoryEntries,
  parseUartsFile,
  type MavftpDirectoryEntry,
  type MavftpPayload,
} from './mavftp.js'
import { evaluateMotorTestEligibility, motorTestInstructions } from './motor-test.js'

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

interface CommandAckWaiter {
  command: number
  rejectOnFailure: boolean
  resolve: (message: CommandAckMessage) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface ParameterValueWaiter {
  paramId: string
  expectedValue: number
  tolerance: number
  resolve: (parameter: ParameterState) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface AutopilotVersionWaiter {
  resolve: (board: HardwareBoardState) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface MavftpWaiter {
  seqNumber: number
  resolve: (payload: MavftpPayload) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface WaiterHandle<T> {
  promise: Promise<T>
  cancel: (error: Error) => void
}

interface AccelerometerCalibrationProgressState {
  stepIndex: number
  waitingForCompletion: boolean
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
  accelerometerInitialWarmupMs?: number
  accelerometerStepAdvanceMs?: number
  accelerometerCompletionFallbackMs?: number
  compassGuidanceTimeoutMs?: number
}

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 5000
const DEFAULT_PARAMETER_SYNC_TIMEOUT_MS = 20000
const PARAMETER_SYNC_STALL_RETRY_MS = 1500
const MAX_PARAMETER_SYNC_RETRIES = 3
const DEFAULT_COMMAND_ACK_TIMEOUT_MS = 3000
const DEFAULT_PARAMETER_WRITE_TIMEOUT_MS = 5000
const DEFAULT_AUTOPILOT_VERSION_TIMEOUT_MS = 3000
const DEFAULT_MAVFTP_TIMEOUT_MS = 3000
const DEFAULT_PARAMETER_WRITE_TOLERANCE = 0.0001
const DEFAULT_ACCELEROMETER_INITIAL_WARMUP_MS = 6000
const DEFAULT_ACCELEROMETER_STEP_ADVANCE_MS = 1500
const DEFAULT_ACCELEROMETER_COMPLETION_FALLBACK_MS = 4000
const DEFAULT_COMPASS_GUIDANCE_TIMEOUT_MS = 5000
const PRE_ARM_ISSUE_TTL_MS = 15000
const MAX_GUIDED_ACTION_STATUS_TEXTS = 5
const MOTOR_TEST_COMPLETION_BUFFER_MS = 250
const UARTS_FILE_PATH = '@SYS/uarts.txt'
const MAVFTP_TRANSFER_CHUNK_SIZE = 200
const LIVE_TELEMETRY_REQUESTS = [
  {
    messageId: MAVLINK_MESSAGE_IDS.GLOBAL_POSITION_INT,
    label: 'GLOBAL_POSITION_INT',
    intervalUs: 500000
  },
  {
    messageId: MAVLINK_MESSAGE_IDS.ATTITUDE,
    label: 'ATTITUDE',
    intervalUs: 25000
  },
  {
    messageId: MAVLINK_MESSAGE_IDS.RC_CHANNELS,
    label: 'RC_CHANNELS',
    intervalUs: 50000
  },
  {
    messageId: MAVLINK_MESSAGE_IDS.SYS_STATUS,
    label: 'SYS_STATUS',
    intervalUs: 500000
  }
] as const
const ARDUCOPTER_MAV_TYPES = new Set<number>([
  MAV_TYPE.QUADROTOR,
  MAV_TYPE.HEXAROTOR,
  MAV_TYPE.OCTOROTOR,
  MAV_TYPE.TRICOPTER
])
const ACCELCAL_SUCCESS_VALUE = 16777215
const ACCELCAL_FAILED_VALUE = 16777216
const ACCELEROMETER_CALIBRATION_STEPS = [
  {
    commandValue: 1,
    summary: 'Place the vehicle level and keep it still.',
    instructions: [
      'Set the frame level on a stable surface.',
      'When the frame is motionless, press Confirm Level Position.'
    ],
    ctaLabel: 'Confirm Level Position'
  },
  {
    commandValue: 2,
    summary: 'Place the vehicle on its left side and keep it still.',
    instructions: [
      'Move the frame onto its left side.',
      'When the frame is motionless, press Confirm Left Side Position.'
    ],
    ctaLabel: 'Confirm Left Side Position'
  },
  {
    commandValue: 3,
    summary: 'Place the vehicle on its right side and keep it still.',
    instructions: [
      'Move the frame onto its right side.',
      'When the frame is motionless, press Confirm Right Side Position.'
    ],
    ctaLabel: 'Confirm Right Side Position'
  },
  {
    commandValue: 4,
    summary: 'Place the vehicle nose down and keep it still.',
    instructions: [
      'Tilt the frame nose-down.',
      'When the frame is motionless, press Confirm Nose Down Position.'
    ],
    ctaLabel: 'Confirm Nose Down Position'
  },
  {
    commandValue: 5,
    summary: 'Place the vehicle nose up and keep it still.',
    instructions: [
      'Tilt the frame nose-up.',
      'When the frame is motionless, press Confirm Nose Up Position.'
    ],
    ctaLabel: 'Confirm Nose Up Position'
  },
  {
    commandValue: 6,
    summary: 'Place the vehicle on its back and keep it still.',
    instructions: [
      'Flip the frame onto its back.',
      'When the frame is motionless, press Confirm Back Position.'
    ],
    ctaLabel: 'Confirm Back Position'
  }
] as const

export class ParameterBatchWriteError extends Error {
  constructor(
    message: string,
    readonly result: ParameterBatchWriteResult,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = 'ParameterBatchWriteError'
  }
}

export class ArduPilotConfiguratorRuntime {
  private readonly updateListeners = new Set<UpdateListener>()
  private readonly subscriptions: Unsubscribe[]
  private readonly vehicleWaiters = new Set<VehicleWaiter>()
  private readonly parameterSyncWaiters = new Set<ParameterSyncWaiter>()
  private readonly commandAckWaiters = new Set<CommandAckWaiter>()
  private readonly parameterValueWaiters = new Set<ParameterValueWaiter>()
  private readonly autopilotVersionWaiters = new Set<AutopilotVersionWaiter>()
  private readonly mavftpWaiters = new Set<MavftpWaiter>()
  private readonly parameters = new Map<string, ParameterState>()
  private readonly preArmIssues = new Map<string, PreArmIssueState>()
  private readonly statusTexts: StatusTextEntry[] = []
  private readonly accelerometerInitialWarmupMs: number
  private readonly accelerometerStepAdvanceMs: number
  private readonly accelerometerCompletionFallbackMs: number
  private readonly compassGuidanceTimeoutMs: number

  private connection: TransportStatus
  private sessionProfile: SessionProfile
  private vehicle?: VehicleIdentity
  private hardwareBoard?: HardwareBoardState
  private uartsFile: BoardFileState = createIdleUartsFileState()
  private parameterSync: ParameterSyncState = createIdleParameterSync()
  private guidedActions = createIdleGuidedActions()
  private motorTest = createIdleMotorTestState()
  private liveVerification = createIdleLiveVerification()
  private totalParameters = 0
  private liveTelemetryRequestsIssued = false
  private accelerometerCalibration?: AccelerometerCalibrationProgressState
  private accelerometerPromptFallbackTimer?: ReturnType<typeof setTimeout>
  private accelerometerAdvanceTimer?: ReturnType<typeof setTimeout>
  private compassGuidanceTimer?: ReturnType<typeof setTimeout>
  private motorTestTimer?: ReturnType<typeof setTimeout>
  private preArmExpiryTimer?: ReturnType<typeof setTimeout>
  private parameterSyncRetryTimer?: ReturnType<typeof setTimeout>
  private parameterSyncRetryCount = 0
  private autopilotVersionRequested = false
  private uartsFileRequested = false
  private mavftpSequence = 0

  constructor(
    private readonly session: MavlinkSession,
    private readonly metadata: FirmwareMetadataBundle,
    options: ArduPilotConfiguratorRuntimeOptions = {}
  ) {
    this.connection = this.session.getTransportStatus()
    this.sessionProfile = options.sessionProfile ?? 'full-power'
    this.accelerometerInitialWarmupMs = options.accelerometerInitialWarmupMs ?? DEFAULT_ACCELEROMETER_INITIAL_WARMUP_MS
    this.accelerometerStepAdvanceMs = options.accelerometerStepAdvanceMs ?? DEFAULT_ACCELEROMETER_STEP_ADVANCE_MS
    this.accelerometerCompletionFallbackMs =
      options.accelerometerCompletionFallbackMs ?? DEFAULT_ACCELEROMETER_COMPLETION_FALLBACK_MS
    this.compassGuidanceTimeoutMs = options.compassGuidanceTimeoutMs ?? DEFAULT_COMPASS_GUIDANCE_TIMEOUT_MS
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
          this.rejectCommandAckWaiters(new Error(reason))
          this.rejectParameterValueWaiters(new Error(reason))
          this.rejectAutopilotVersionWaiters(new Error(reason))
          this.rejectMavftpWaiters(new Error(reason))
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
    const preArmStatus = this.buildPreArmStatus()

    return {
      connection: this.connection,
      sessionProfile: this.sessionProfile,
      vehicle: this.vehicle,
      hardware: cloneHardwareState({
        board: this.hardwareBoard ? { ...this.hardwareBoard } : undefined,
        uartsFile: cloneBoardFileState(this.uartsFile)
      }),
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
      motorTest: cloneMotorTestState(this.motorTest),
      liveVerification: cloneLiveVerification(this.liveVerification),
      preArmStatus: clonePreArmStatus(preArmStatus),
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
      this.parameterSyncRetryCount = 0
      this.clearParameterSyncRetryTimer()
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

      await this.requestParameterTable(vehicle.systemId, vehicle.componentId)
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

  async setParameter(paramId: string, paramValue: number, options: ParameterWriteOptions = {}): Promise<ParameterWriteResult> {
    this.assertParameterWriteAllowed()

    const known = this.parameters.get(paramId)
    const writeVerification = this.waitForParameterValue(paramId, paramValue, options)

    try {
      await this.session.send({
        type: 'PARAM_SET',
        targetSystem: this.vehicle?.systemId ?? 1,
        targetComponent: this.vehicle?.componentId ?? 1,
        paramId,
        paramValue,
        paramType: MAV_PARAM_TYPE.REAL32
      })
    } catch (error) {
      const sendError = error instanceof Error ? error : new Error('Unknown parameter send error.')
      writeVerification.cancel(sendError)
      void writeVerification.promise.catch(() => {})
      throw sendError
    }

    try {
      const confirmed = await writeVerification.promise
      this.appendStatusEntry('info', `Verified parameter ${paramId} = ${formatParameterValueForLog(confirmed.value)}.`)
      this.emit()
      return {
        paramId,
        previousValue: known?.value,
        requestedValue: paramValue,
        confirmedValue: confirmed.value,
        confirmedAtMs: Date.now()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown parameter verification error.'
      this.appendStatusEntry('warning', `Failed to verify parameter ${paramId}: ${message}`)
      this.emit()
      throw error
    }
  }

  async setParameters(requests: ParameterWriteRequest[], options: ParameterWriteOptions = {}): Promise<ParameterBatchWriteResult> {
    const result: ParameterBatchWriteResult = {
      applied: [],
      rolledBack: []
    }

    for (const request of requests) {
      const known = this.parameters.get(request.paramId)
      if (known && approximatelyEqualParameterValue(known.value, request.paramValue, options.tolerance)) {
        continue
      }

      try {
        const writeResult = await this.setParameter(request.paramId, request.paramValue, options)
        result.applied.push(writeResult)
      } catch (error) {
        const rollbackSourceWrites = [...result.applied].reverse().filter((write) => write.previousValue !== undefined)
        for (const appliedWrite of rollbackSourceWrites) {
          try {
            const rollbackResult = await this.setParameter(appliedWrite.paramId, appliedWrite.previousValue as number, options)
            result.rolledBack.push(rollbackResult)
          } catch (rollbackError) {
            const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : 'Unknown rollback error.'
            this.appendStatusEntry(
              'error',
              `Rollback failed for ${appliedWrite.paramId} after batch write error: ${rollbackMessage}`
            )
          }
        }

        const writeMessage = error instanceof Error ? error.message : 'Unknown batch write error.'
        const rollbackSummary =
          result.applied.length === 0
            ? 'No earlier parameter writes needed rollback.'
            : result.rolledBack.length === result.applied.length
              ? `Rolled back ${result.rolledBack.length} previously applied parameter change(s).`
              : `Rolled back ${result.rolledBack.length} of ${result.applied.length} previously applied parameter change(s).`
        throw new ParameterBatchWriteError(`Batch write failed on ${request.paramId}: ${writeMessage} ${rollbackSummary}`, result, error)
      }
    }

    return result
  }

  async listRemoteDirectory(path = '@SYS'): Promise<MavftpDirectoryEntry[]> {
    await this.requireMavftpSupport()

    const normalizedPath = normalizeMavftpPath(path)
    const pathBytes = new TextEncoder().encode(normalizedPath)
    const entries: MavftpDirectoryEntry[] = []
    let offset = 0

    while (true) {
      try {
        const response = await this.sendMavftpRequest({
          session: 0,
          opcode: MAV_FTP_OPCODE.LIST_DIRECTORY,
          size: pathBytes.length,
          offset,
          data: pathBytes
        })
        const chunkEntries = parseMavftpDirectoryEntries(normalizedPath, response.data)
        if (chunkEntries.length === 0) {
          break
        }

        entries.push(...chunkEntries)
        offset += chunkEntries.length
      } catch (error) {
        if (error instanceof MavftpRequestError && error.errorCode === MAV_FTP_ERR.EOF) {
          break
        }
        throw error
      }
    }

    return entries.sort(sortMavftpDirectoryEntries)
  }

  async downloadRemoteFile(path: string): Promise<Uint8Array> {
    await this.requireMavftpSupport()
    return this.readRemoteFile(normalizeMavftpPath(path))
  }

  async uploadRemoteFile(path: string, bytes: Uint8Array, options: { overwrite?: boolean } = {}): Promise<void> {
    await this.requireMavftpSupport()

    const normalizedPath = normalizeMavftpPath(path)
    const pathBytes = new TextEncoder().encode(normalizedPath)
    const overwriteExisting = options.overwrite ?? true
    let createResponse: MavftpPayload

    try {
      createResponse = await this.sendMavftpRequest({
        session: 0,
        opcode: MAV_FTP_OPCODE.CREATE_FILE,
        size: pathBytes.length,
        offset: 0,
        data: pathBytes
      })
    } catch (error) {
      if (!(overwriteExisting && error instanceof MavftpRequestError && error.errorCode === MAV_FTP_ERR.FILE_EXISTS)) {
        throw error
      }

      await this.deleteRemotePath(normalizedPath, 'file')
      createResponse = await this.sendMavftpRequest({
        session: 0,
        opcode: MAV_FTP_OPCODE.CREATE_FILE,
        size: pathBytes.length,
        offset: 0,
        data: pathBytes
      })
    }

    const session = createResponse.session
    let offset = 0

    try {
      while (offset < bytes.length) {
        const chunk = bytes.slice(offset, offset + MAVFTP_TRANSFER_CHUNK_SIZE)
        await this.sendMavftpRequest({
          session,
          opcode: MAV_FTP_OPCODE.WRITE_FILE,
          size: chunk.length,
          offset,
          data: chunk
        })
        offset += chunk.length
      }
    } finally {
      await this.sendMavftpRequest({
        session,
        opcode: MAV_FTP_OPCODE.TERMINATE_SESSION,
        size: 0,
        offset: 0,
        data: new Uint8Array(0)
      }).catch(() => {})
    }

    this.appendStatusEntry('info', `Uploaded ${normalizedPath} via MAVFTP.`)
    this.emit()
  }

  async deleteRemotePath(path: string, kind: 'file' | 'directory' = 'file'): Promise<void> {
    await this.requireMavftpSupport()

    const normalizedPath = normalizeMavftpPath(path)
    const pathBytes = new TextEncoder().encode(normalizedPath)
    await this.sendMavftpRequest({
      session: 0,
      opcode: kind === 'directory' ? MAV_FTP_OPCODE.REMOVE_DIRECTORY : MAV_FTP_OPCODE.REMOVE_FILE,
      size: pathBytes.length,
      offset: 0,
      data: pathBytes
    })

    this.appendStatusEntry('info', `Removed ${normalizedPath} via MAVFTP.`)
    this.emit()
  }

  async runGuidedAction(actionId: GuidedActionId): Promise<void> {
    switch (actionId) {
      case 'request-parameters':
        await this.requestParameterList()
        return
      case 'calibrate-accelerometer':
        await this.runAccelerometerCalibrationAction()
        return
      case 'calibrate-compass':
        await this.runCompassCalibrationAction()
        return
      case 'reboot-autopilot':
        await this.performCommandGuidedAction(
          'reboot-autopilot',
          'Autopilot reboot request queued.',
          'Reboot request sent. Expect the link to drop if the autopilot accepts it.',
          defaultInstructionsForAction('reboot-autopilot', this.sessionProfile),
          async () => {
            await this.sendCommand(MAV_CMD.PREFLIGHT_REBOOT_SHUTDOWN, [1, 0, 0, 0, 0, 0, 0])
          }
        )
        return
      default:
        return
    }
  }

  async runMotorTest(request: MotorTestRequest): Promise<void> {
    const eligibility = evaluateMotorTestEligibility(this.getSnapshot(), request)
    if (!eligibility.allowed) {
      throw new Error(eligibility.reasons[0] ?? 'Motor test request is not currently allowed.')
    }

    const selectedOutput = eligibility.selectedOutput
    const selectedOutputs = eligibility.selectedOutputs
    const runningAllOutputs = request.runAllOutputs === true
    const selectedOutputCount = runningAllOutputs ? selectedOutputs.length : 1
    const singleOutputChannel = selectedOutput?.channelNumber ?? request.outputChannel
    const singleMotorSequence = selectedOutput?.motorNumber
    const instructions = motorTestInstructions(request, selectedOutput, selectedOutputs)
    const startedAtMs = Date.now()
    this.motorTest = {
      status: 'requested',
      summary: runningAllOutputs
        ? `Queueing a motor test across all ${selectedOutputCount} mapped motors.`
        : selectedOutput?.motorNumber !== undefined
          ? `Queueing a motor test for OUT${singleOutputChannel} / M${selectedOutput.motorNumber}.`
          : `Queueing a motor test for OUT${singleOutputChannel}.`,
      instructions,
      allOutputsSelected: runningAllOutputs,
      selectedOutputChannel: runningAllOutputs ? undefined : singleOutputChannel,
      selectedOutputCount,
      selectedMotorNumber: runningAllOutputs ? undefined : selectedOutput?.motorNumber,
      throttlePercent: request.throttlePercent,
      durationSeconds: request.durationSeconds,
      startedAtMs,
      updatedAtMs: startedAtMs,
      completedAtMs: undefined
    }
    this.emit()

    try {
      const commandParams: number[] = runningAllOutputs
        ? [1, MOTOR_TEST_THROTTLE_TYPE.PERCENT, request.throttlePercent, request.durationSeconds, selectedOutputCount, MOTOR_TEST_ORDER.SEQUENCE, 0]
        : [singleMotorSequence ?? 1, MOTOR_TEST_THROTTLE_TYPE.PERCENT, request.throttlePercent, request.durationSeconds, 1, MOTOR_TEST_ORDER.BOARD, 0]

      await this.sendCommand(
        MAV_CMD.DO_MOTOR_TEST,
        commandParams,
        { waitForAck: true }
      )

      const runningAtMs = Date.now()
      const selectedOutputLabel = runningAllOutputs
        ? `all ${selectedOutputCount} mapped motors`
        : selectedOutput?.motorNumber !== undefined
          ? `OUT${singleOutputChannel} / M${selectedOutput.motorNumber}`
          : `OUT${singleOutputChannel}`
      this.motorTest = {
        ...this.motorTest,
        status: 'running',
        summary: runningAllOutputs
          ? `Motor test running across ${selectedOutputLabel} at ${request.throttlePercent}% for ${request.durationSeconds.toFixed(1)} seconds per motor.`
          : `Motor test running on ${selectedOutputLabel} at ${request.throttlePercent}% for ${request.durationSeconds.toFixed(1)} seconds.`,
        instructions,
        updatedAtMs: runningAtMs,
        completedAtMs: undefined
      }
      this.appendStatusEntry(
        'warning',
        runningAllOutputs
          ? `Motor test started across ${selectedOutputLabel} at ${request.throttlePercent}% for ${request.durationSeconds.toFixed(1)}s per motor.`
          : `Motor test started on ${selectedOutputLabel} at ${request.throttlePercent}% for ${request.durationSeconds.toFixed(1)}s.`
      )
      this.emit()
      this.scheduleMotorTestCompletion()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown motor test error.'
      this.clearMotorTestTimer()
      this.motorTest = {
        ...this.motorTest,
        status: 'failed',
        summary: message,
        updatedAtMs: Date.now(),
        completedAtMs: Date.now()
      }
      this.emit()
      throw error
    }
  }

  destroy(): void {
    this.subscriptions.forEach((unsubscribe) => unsubscribe())
    this.commandAckWaiters.forEach((waiter) => {
      clearTimeout(waiter.timer)
      waiter.reject(new Error('Runtime destroyed before command acknowledgment was received.'))
    })
    this.commandAckWaiters.clear()
    this.rejectParameterValueWaiters(new Error('Runtime destroyed before parameter verification was received.'))
    this.rejectAutopilotVersionWaiters(new Error('Runtime destroyed before AUTOPILOT_VERSION was received.'))
    this.rejectMavftpWaiters(new Error('Runtime destroyed before the MAVFTP request completed.'))
    this.clearMotorTestTimer()
    this.clearPreArmExpiryTimer()
    this.clearParameterSyncRetryTimer()
    this.clearAccelerometerPromptFallbackTimer()
    this.clearAccelerometerAdvanceTimer()
    this.clearCompassGuidanceTimer()
    this.rejectVehicleWaiters(new Error('Runtime destroyed before vehicle heartbeat was received.'))
    this.rejectParameterSyncWaiters(new Error('Runtime destroyed before parameter sync completed.'))
    this.session.destroy()
  }

  private async sendCommand(
    command: number,
    params: number[],
    options: { waitForAck?: boolean; ackTimeoutMs?: number; rejectAckOnFailure?: boolean } = {}
  ): Promise<CommandAckMessage | void> {
    const message: CommandLongMessage = {
      type: 'COMMAND_LONG',
      command,
      targetSystem: this.vehicle?.systemId ?? 1,
      targetComponent: this.vehicle?.componentId ?? 1,
      confirmation: 0,
      params: params as CommandLongMessage['params']
    }

    const ackWaiter = options.waitForAck
      ? this.waitForCommandAck(command, options.ackTimeoutMs, { rejectOnFailure: options.rejectAckOnFailure ?? true })
      : undefined
    try {
      await this.session.send(message)
    } catch (error) {
      const sendError = error instanceof Error ? error : new Error('Unknown command send error.')
      ackWaiter?.cancel(sendError)
      void ackWaiter?.promise.catch(() => {})
      throw sendError
    }
    if (ackWaiter) {
      return ackWaiter.promise
    }
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
          params: [request.messageId, request.intervalUs, 0, 0, 0, 0, 0]
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

  private async requestAutopilotVersion(systemId: number, componentId: number): Promise<void> {
    const waiter = this.waitForAutopilotVersion()

    try {
      await this.session.send({
        type: 'COMMAND_LONG',
        command: MAV_CMD.REQUEST_MESSAGE,
        targetSystem: systemId,
        targetComponent: componentId,
        confirmation: 0,
        params: [MAVLINK_MESSAGE_IDS.AUTOPILOT_VERSION, 0, 0, 0, 0, 0, 0]
      })
      await waiter.promise
    } catch (error) {
      const requestError = error instanceof Error ? error : new Error('Unknown AUTOPILOT_VERSION request error.')
      waiter.cancel(requestError)
      void waiter.promise.catch(() => {})
      this.autopilotVersionRequested = false
      this.appendStatusEntry('warning', `Failed to identify board metadata: ${requestError.message}`)
      this.emit()
    }
  }

  private processAutopilotVersion(message: AutopilotVersionMessage): void {
    const board: HardwareBoardState = {
      boardVersion: message.boardVersion,
      boardType: boardTypeFromBoardVersion(message.boardVersion),
      vendorId: message.vendorId,
      productId: message.productId,
      uid: formatAutopilotUid(message.uid, message.uid2),
      ftpSupported: (message.capabilities & MAV_PROTOCOL_CAPABILITY.FTP) !== 0n,
      lastUpdatedAtMs: Date.now()
    }

    this.hardwareBoard = board
    this.resolveAutopilotVersionWaiters(board)

    if (!board.ftpSupported && this.uartsFile.status === 'idle') {
      this.uartsFile = {
        ...createIdleUartsFileState(),
        status: 'unsupported'
      }
      return
    }

    if (board.ftpSupported && !this.uartsFileRequested && this.uartsFile.status === 'idle') {
      this.uartsFileRequested = true
      void this.fetchUartsFile()
    }
  }

  private processFileTransferProtocol(message: FileTransferProtocolMessage): void {
    const payload = decodeMavftpPayload(message.payload)
    this.resolveMavftpWaiters(payload)
  }

  private async fetchUartsFile(): Promise<void> {
    if (!this.vehicle) {
      return
    }

    this.uartsFile = {
      ...createIdleUartsFileState(),
      status: 'loading'
    }
    this.emit()

    try {
      const rawText = await this.readRemoteTextFile(UARTS_FILE_PATH)
      this.uartsFile = {
        status: 'ready',
        path: UARTS_FILE_PATH,
        mappings: parseUartsFile(rawText),
        rawText,
        fetchedAtMs: Date.now()
      }
      this.appendStatusEntry('info', `Fetched ${UARTS_FILE_PATH} via MAVFTP.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown MAVFTP error.'
      const status = /file not found/i.test(message) ? 'missing' : 'error'
      this.uartsFile = {
        status,
        path: UARTS_FILE_PATH,
        mappings: [],
        error: message
      }
      this.appendStatusEntry('warning', `Unable to fetch ${UARTS_FILE_PATH}: ${message}`)
    }

    this.emit()
  }

  private async readRemoteTextFile(path: string): Promise<string> {
    const bytes = await this.readRemoteFile(path)
    return new TextDecoder().decode(bytes).replace(/\0+$/, '')
  }

  private async readRemoteFile(path: string): Promise<Uint8Array> {
    const normalizedPath = normalizeMavftpPath(path)
    const pathBytes = new TextEncoder().encode(normalizedPath)
    const openResponse = await this.sendMavftpRequest({
      session: 0,
      opcode: MAV_FTP_OPCODE.OPEN_FILE_RO,
      size: pathBytes.length,
      offset: 0,
      data: pathBytes
    })

    const session = openResponse.session
    const fileSize = openResponse.data.byteLength >= 4 ? new DataView(openResponse.data.buffer, openResponse.data.byteOffset, openResponse.data.byteLength).getUint32(0, true) : 0
    const chunks: Uint8Array[] = []
    let offset = 0

    try {
      while (offset < fileSize) {
        const response = await this.sendMavftpRequest({
          session,
          opcode: MAV_FTP_OPCODE.READ_FILE,
          size: Math.min(MAVFTP_TRANSFER_CHUNK_SIZE, fileSize - offset),
          offset,
          data: new Uint8Array(0)
        })
        chunks.push(response.data)
        offset += response.data.length
        if (response.data.length === 0) {
          break
        }
      }
    } finally {
      await this.sendMavftpRequest({
        session,
        opcode: MAV_FTP_OPCODE.TERMINATE_SESSION,
        size: 0,
        offset: 0,
        data: new Uint8Array(0)
      }).catch(() => {})
    }

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const bytes = new Uint8Array(totalLength)
    let writeOffset = 0
    chunks.forEach((chunk) => {
      bytes.set(chunk, writeOffset)
      writeOffset += chunk.length
    })
    return bytes
  }

  private async sendMavftpRequest(
    request: Pick<MavftpPayload, 'session' | 'opcode' | 'size' | 'offset' | 'data'>
  ): Promise<MavftpPayload> {
    if (!this.vehicle) {
      throw new Error('MAVFTP requires an identified vehicle.')
    }

    const seqNumber = this.mavftpSequence
    this.mavftpSequence = (this.mavftpSequence + 1) & 0xffff
    const waiter = this.waitForMavftpResponse(seqNumber)

    try {
      await this.session.send({
        type: 'FILE_TRANSFER_PROTOCOL',
        targetNetwork: 0,
        targetSystem: this.vehicle.systemId,
        targetComponent: this.vehicle.componentId,
        payload: encodeMavftpPayload({
          seqNumber,
          session: request.session,
          opcode: request.opcode,
          size: request.size,
          reqOpcode: 0,
          burstComplete: 0,
          offset: request.offset,
          data: request.data
        })
      })
    } catch (error) {
      const sendError = error instanceof Error ? error : new Error('Unknown MAVFTP send error.')
      waiter.cancel(sendError)
      void waiter.promise.catch(() => {})
      throw sendError
    }

    const response = await waiter.promise
    if (response.opcode === MAV_FTP_OPCODE.ACK) {
      return response
    }

    const errorCode = response.data[0] ?? 0
    const errno = response.data[1]
    throw new MavftpRequestError(errorCode, errno)
  }

  private async requireMavftpSupport(): Promise<void> {
    if (!this.vehicle) {
      throw new Error('MAVFTP requires an identified vehicle.')
    }

    if (!this.hardwareBoard) {
      if (!this.autopilotVersionRequested) {
        this.autopilotVersionRequested = true
        void this.requestAutopilotVersion(this.vehicle.systemId, this.vehicle.componentId)
      }

      const board = await this.waitForAutopilotVersion().promise
      if (!board.ftpSupported) {
        throw new Error('This controller did not advertise MAVFTP support.')
      }
      return
    }

    if (!this.hardwareBoard.ftpSupported) {
      throw new Error('This controller did not advertise MAVFTP support.')
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
      case 'GLOBAL_POSITION_INT':
        this.processGlobalPosition(envelope.message)
        break
      case 'ATTITUDE':
        this.processAttitude(envelope.message)
        break
      case 'AUTOPILOT_VERSION':
        this.processAutopilotVersion(envelope.message)
        break
      case 'FILE_TRANSFER_PROTOCOL':
        this.processFileTransferProtocol(envelope.message)
        break
      case 'COMMAND_ACK':
        this.processCommandAck(envelope.message)
        break
      case 'COMMAND_LONG':
        this.processCommandLong(envelope.message, envelope.header.systemId, envelope.header.componentId)
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
    if (!isAuthoritativeHeartbeat(message)) {
      return
    }

    if (this.vehicle && (this.vehicle.systemId !== systemId || this.vehicle.componentId !== componentId)) {
      return
    }

    this.vehicle = createVehicleIdentity(message, systemId, componentId)

    if (this.parameterSync.status === 'awaiting-vehicle') {
      this.parameterSync = createIdleParameterSync()
    }

    this.resolveVehicleWaiters(this.vehicle)

    if (!this.liveTelemetryRequestsIssued) {
      void this.requestLiveTelemetryStreams(systemId, componentId)
    }

    if (!this.autopilotVersionRequested) {
      this.autopilotVersionRequested = true
      void this.requestAutopilotVersion(systemId, componentId)
    }
  }

  private processParamValue(message: ParamValueMessage): void {
    const known = this.parameters.get(message.paramId)
    this.totalParameters = message.paramCount
    const parameterState: ParameterState = {
      id: message.paramId,
      value: message.paramValue,
      index: message.paramIndex,
      count: message.paramCount,
      definition: this.metadata.parameters[message.paramId]
    }
    this.parameters.set(message.paramId, parameterState)
    this.resolveParameterValueWaiters(parameterState)

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
      this.clearParameterSyncRetryTimer()
      this.parameterSyncRetryCount = 0
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

    this.scheduleParameterSyncRetry()

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
    const severity = severityName(message.severity)
    this.statusTexts.unshift({
      severity,
      text: message.text
    })
    this.statusTexts.splice(12)
    this.recordPreArmIssue(message.text, severity)
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

  private processAttitude(message: AttitudeMessage): void {
    this.liveVerification.attitudeTelemetry = {
      verified: true,
      rollDeg: radiansToDegrees(message.rollRad),
      pitchDeg: radiansToDegrees(message.pitchRad),
      yawDeg: radiansToDegrees(message.yawRad),
      lastSeenAtMs: Date.now()
    }
  }

  private processGlobalPosition(message: GlobalPositionIntMessage): void {
    const hasValidCoordinates = isValidGlobalCoordinates(message.latitudeE7, message.longitudeE7)
    const horizontalSpeedCms = Math.hypot(message.velocityXcms, message.velocityYcms)

    this.liveVerification.globalPosition = {
      verified: hasValidCoordinates,
      latitudeDeg: hasValidCoordinates ? Number((message.latitudeE7 / 1e7).toFixed(7)) : undefined,
      longitudeDeg: hasValidCoordinates ? Number((message.longitudeE7 / 1e7).toFixed(7)) : undefined,
      altitudeM: hasValidCoordinates ? Number((message.altitudeMm / 1000).toFixed(1)) : undefined,
      relativeAltitudeM: hasValidCoordinates ? Number((message.relativeAltitudeMm / 1000).toFixed(1)) : undefined,
      groundSpeedMs: hasValidCoordinates ? Number((horizontalSpeedCms / 100).toFixed(1)) : undefined,
      headingDeg:
        hasValidCoordinates && message.headingCdeg !== 0xffff ? Number((message.headingCdeg / 100).toFixed(1)) : undefined,
      lastSeenAtMs: Date.now()
    }
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
    this.resolveCommandAckWaiters(message)

    if (message.command !== MAV_CMD.SET_MESSAGE_INTERVAL) {
      return
    }

    if (message.result === MAV_RESULT.ACCEPTED || message.result === MAV_RESULT.IN_PROGRESS) {
      return
    }

    this.appendStatusEntry('warning', `Autopilot rejected live telemetry stream request (${mavResultLabel(message.result)}).`)
  }

  private processCommandLong(message: CommandLongMessage, systemId: number, componentId: number): void {
    if (message.command !== MAV_CMD.ACCELCAL_VEHICLE_POS) {
      return
    }

    const current = this.guidedActions['calibrate-accelerometer']
    if (
      !this.vehicle ||
      this.vehicle.systemId !== systemId ||
      this.vehicle.componentId !== componentId ||
      (current.status === 'idle' && !this.accelerometerCalibration)
    ) {
      return
    }

    const commandValue = Math.round(message.params[0] ?? 0)
    if (commandValue === ACCELCAL_SUCCESS_VALUE) {
      this.clearAccelerometerPromptFallbackTimer()
      this.clearAccelerometerAdvanceTimer()
      this.completeAccelerometerCalibration()
      return
    }

    if (commandValue === ACCELCAL_FAILED_VALUE) {
      this.clearAccelerometerPromptFallbackTimer()
      this.clearAccelerometerAdvanceTimer()
      this.failGuidedAction('calibrate-accelerometer', new Error('Accelerometer calibration failed.'))
      this.accelerometerCalibration = undefined
      return
    }

    const stepIndex = ACCELEROMETER_CALIBRATION_STEPS.findIndex((step) => step.commandValue === commandValue)
    if (stepIndex < 0) {
      return
    }

    this.clearAccelerometerPromptFallbackTimer()
    this.clearAccelerometerAdvanceTimer()
    this.accelerometerCalibration = {
      stepIndex,
      waitingForCompletion: false
    }
    this.setGuidedAction('calibrate-accelerometer', buildAccelerometerCalibrationGuidedAction(stepIndex, this.guidedActions['calibrate-accelerometer']))
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
    this.reconcileCompassCalibrationAvailability()
    const snapshot = this.getSnapshot()
    this.updateListeners.forEach((listener) => listener(snapshot))
  }

  private reconcileCompassCalibrationAvailability(): void {
    const current = this.guidedActions['calibrate-compass']
    if (
      this.parameterSync.status !== 'complete' ||
      (current.status !== 'requested' && current.status !== 'running') ||
      enabledCompassCountFromParameters(this.parameters) > 0
    ) {
      return
    }

    const message = 'No enabled compass detected on this vehicle. Skip this step or enable a compass first.'
    this.failGuidedAction('calibrate-compass', new Error(message))
    this.appendStatusEntry('warning', message)
  }

  private resetLiveState(): void {
    this.vehicle = undefined
    this.hardwareBoard = undefined
    this.uartsFile = createIdleUartsFileState()
    this.parameters.clear()
    this.totalParameters = 0
    this.parameterSyncRetryCount = 0
    this.parameterSync = createIdleParameterSync()
    this.guidedActions = createIdleGuidedActions()
    this.motorTest = createIdleMotorTestState()
    this.liveVerification = createIdleLiveVerification()
    this.liveTelemetryRequestsIssued = false
    this.autopilotVersionRequested = false
    this.uartsFileRequested = false
    this.mavftpSequence = 0
    this.accelerometerCalibration = undefined
    this.preArmIssues.clear()
    this.statusTexts.splice(0)
    this.clearMotorTestTimer()
    this.clearPreArmExpiryTimer()
    this.clearParameterSyncRetryTimer()
    this.clearAccelerometerPromptFallbackTimer()
    this.clearAccelerometerAdvanceTimer()
    this.clearCompassGuidanceTimer()
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

  private waitForAutopilotVersion(timeoutMs = DEFAULT_AUTOPILOT_VERSION_TIMEOUT_MS): WaiterHandle<HardwareBoardState> {
    if (this.hardwareBoard) {
      return {
        promise: Promise.resolve(this.hardwareBoard),
        cancel: () => {}
      }
    }

    let cancel = (_error: Error) => {}
    const promise = new Promise<HardwareBoardState>((resolve, reject) => {
      let settled = false
      const waiter: AutopilotVersionWaiter = {
        resolve: (board) => {
          settled = true
          clearTimeout(timer)
          resolve(board)
        },
        reject: (error) => {
          settled = true
          clearTimeout(timer)
          reject(error)
        },
        timer: undefined as unknown as ReturnType<typeof setTimeout>
      }

      const timer = setTimeout(() => {
        settled = true
        this.autopilotVersionWaiters.delete(waiter)
        reject(new Error(`Timed out waiting for AUTOPILOT_VERSION after ${timeoutMs}ms.`))
      }, timeoutMs)

      waiter.timer = timer
      this.autopilotVersionWaiters.add(waiter)

      cancel = (error: Error) => {
        if (settled) {
          return
        }

        settled = true
        clearTimeout(timer)
        this.autopilotVersionWaiters.delete(waiter)
        reject(error)
      }
    })

    return {
      promise,
      cancel
    }
  }

  private resolveAutopilotVersionWaiters(board: HardwareBoardState): void {
    this.autopilotVersionWaiters.forEach((waiter) => {
      clearTimeout(waiter.timer)
      waiter.resolve(board)
    })
    this.autopilotVersionWaiters.clear()
  }

  private rejectAutopilotVersionWaiters(error: Error): void {
    this.autopilotVersionWaiters.forEach((waiter) => {
      clearTimeout(waiter.timer)
      waiter.reject(error)
    })
    this.autopilotVersionWaiters.clear()
  }

  private waitForMavftpResponse(
    seqNumber: number,
    timeoutMs = DEFAULT_MAVFTP_TIMEOUT_MS
  ): WaiterHandle<MavftpPayload> & { seqNumber: number } {
    let cancel = (_error: Error) => {}
    const promise = new Promise<MavftpPayload>((resolve, reject) => {
      let settled = false
      const waiter: MavftpWaiter = {
        seqNumber,
        resolve: (payload) => {
          settled = true
          clearTimeout(timer)
          resolve(payload)
        },
        reject: (error) => {
          settled = true
          clearTimeout(timer)
          reject(error)
        },
        timer: undefined as unknown as ReturnType<typeof setTimeout>
      }

      const timer = setTimeout(() => {
        settled = true
        this.mavftpWaiters.delete(waiter)
        reject(new Error(`Timed out waiting for MAVFTP response after ${timeoutMs}ms.`))
      }, timeoutMs)

      waiter.timer = timer
      this.mavftpWaiters.add(waiter)

      cancel = (error: Error) => {
        if (settled) {
          return
        }

        settled = true
        clearTimeout(timer)
        this.mavftpWaiters.delete(waiter)
        reject(error)
      }
    })

    return {
      seqNumber,
      promise,
      cancel
    }
  }

  private resolveMavftpWaiters(payload: MavftpPayload): void {
    const waiters = [...this.mavftpWaiters].filter((waiter) => waiter.seqNumber === payload.seqNumber)
    waiters.forEach((waiter) => {
      clearTimeout(waiter.timer)
      this.mavftpWaiters.delete(waiter)
      waiter.resolve(payload)
    })
  }

  private rejectMavftpWaiters(error: Error): void {
    this.mavftpWaiters.forEach((waiter) => {
      clearTimeout(waiter.timer)
      waiter.reject(error)
    })
    this.mavftpWaiters.clear()
  }

  private async requestParameterTable(systemId: number, componentId: number): Promise<void> {
    await this.session.send({
      type: 'PARAM_REQUEST_LIST',
      targetSystem: systemId,
      targetComponent: componentId
    })
    this.scheduleParameterSyncRetry()
  }

  private scheduleParameterSyncRetry(): void {
    this.clearParameterSyncRetryTimer()

    if (
      (this.parameterSync.status !== 'requesting' && this.parameterSync.status !== 'streaming') ||
      this.parameterSyncRetryCount >= MAX_PARAMETER_SYNC_RETRIES
    ) {
      return
    }

    this.parameterSyncRetryTimer = setTimeout(() => {
      void this.retryParameterSync()
    }, PARAMETER_SYNC_STALL_RETRY_MS)
  }

  private clearParameterSyncRetryTimer(): void {
    if (!this.parameterSyncRetryTimer) {
      return
    }

    clearTimeout(this.parameterSyncRetryTimer)
    this.parameterSyncRetryTimer = undefined
  }

  private async retryParameterSync(): Promise<void> {
    this.parameterSyncRetryTimer = undefined

    if (
      !this.vehicle ||
      (this.parameterSync.status !== 'requesting' && this.parameterSync.status !== 'streaming') ||
      this.parameters.size >= this.totalParameters && this.totalParameters > 0 ||
      this.parameterSyncRetryCount >= MAX_PARAMETER_SYNC_RETRIES
    ) {
      return
    }

    this.parameterSyncRetryCount += 1
    const downloaded = this.parameters.size
    const total = this.totalParameters
    this.appendStatusEntry(
      'warning',
      `Parameter stream stalled at ${downloaded}/${total || 'unknown'}. Re-requesting the table (${this.parameterSyncRetryCount}/${MAX_PARAMETER_SYNC_RETRIES}).`
    )
    this.setGuidedAction('request-parameters', {
      ...this.guidedActions['request-parameters'],
      status: 'running',
      summary: `Parameter stream stalled at ${downloaded}/${total || 'unknown'}. Re-requesting missing values.`,
      instructions: ['Keep the link open while the configurator retries the parameter stream.'],
      updatedAtMs: Date.now(),
      completedAtMs: undefined
    })
    this.emit()

    try {
      await this.requestParameterTable(this.vehicle.systemId, this.vehicle.componentId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown parameter retry error.'
      this.appendStatusEntry('warning', `Failed to retry the parameter stream: ${message}`)
      this.emit()
      this.scheduleParameterSyncRetry()
    }
  }

  private rejectCommandAckWaiters(error: Error): void {
    this.commandAckWaiters.forEach((waiter) => {
      clearTimeout(waiter.timer)
      waiter.reject(error)
    })
    this.commandAckWaiters.clear()
  }

  private waitForCommandAck(
    command: number,
    timeoutMs = DEFAULT_COMMAND_ACK_TIMEOUT_MS,
    options: { rejectOnFailure?: boolean } = {}
  ): WaiterHandle<CommandAckMessage> {
    let cancel = (_error: Error) => {}
    const promise = new Promise<CommandAckMessage>((resolve, reject) => {
      let settled = false
      const waiter: CommandAckWaiter = {
        command,
        rejectOnFailure: options.rejectOnFailure ?? true,
        resolve: (message) => {
          settled = true
          clearTimeout(timer)
          resolve(message)
        },
        reject: (error) => {
          settled = true
          clearTimeout(timer)
          reject(error)
        },
        timer: undefined as unknown as ReturnType<typeof setTimeout>
      }

      const timer = setTimeout(() => {
        settled = true
        this.commandAckWaiters.delete(waiter)
        reject(new Error(`Timed out waiting for ${mavCommandLabel(command)} acknowledgment after ${timeoutMs}ms.`))
      }, timeoutMs)

      waiter.timer = timer
      this.commandAckWaiters.add(waiter)

      cancel = (error: Error) => {
        if (settled) {
          return
        }

        settled = true
        clearTimeout(timer)
        this.commandAckWaiters.delete(waiter)
        reject(error)
      }
    })

    return {
      promise,
      cancel
    }
  }

  private waitForParameterValue(
    paramId: string,
    expectedValue: number,
    options: ParameterWriteOptions = {}
  ): WaiterHandle<ParameterState> {
    const timeoutMs = options.verifyTimeoutMs ?? DEFAULT_PARAMETER_WRITE_TIMEOUT_MS
    const tolerance = options.tolerance ?? DEFAULT_PARAMETER_WRITE_TOLERANCE

    let cancel = (_error: Error) => {}
    const promise = new Promise<ParameterState>((resolve, reject) => {
      let settled = false
      const waiter: ParameterValueWaiter = {
        paramId,
        expectedValue,
        tolerance,
        resolve: (parameter) => {
          settled = true
          clearTimeout(timer)
          resolve(parameter)
        },
        reject: (error) => {
          settled = true
          clearTimeout(timer)
          reject(error)
        },
        timer: undefined as unknown as ReturnType<typeof setTimeout>
      }

      const timer = setTimeout(() => {
        settled = true
        this.parameterValueWaiters.delete(waiter)
        reject(new Error(`Timed out waiting for ${paramId} readback after ${timeoutMs}ms.`))
      }, timeoutMs)

      waiter.timer = timer
      this.parameterValueWaiters.add(waiter)

      cancel = (error: Error) => {
        if (settled) {
          return
        }

        settled = true
        clearTimeout(timer)
        this.parameterValueWaiters.delete(waiter)
        reject(error)
      }
    })

    return {
      promise,
      cancel
    }
  }

  private resolveCommandAckWaiters(message: CommandAckMessage): void {
    const waiters = [...this.commandAckWaiters].filter((waiter) => waiter.command === message.command)
    if (waiters.length === 0) {
      return
    }

    waiters.forEach((waiter) => {
      clearTimeout(waiter.timer)
      this.commandAckWaiters.delete(waiter)
      if (message.result === MAV_RESULT.ACCEPTED || message.result === MAV_RESULT.IN_PROGRESS || !waiter.rejectOnFailure) {
        waiter.resolve(message)
        return
      }

      waiter.reject(new Error(`Autopilot rejected ${mavCommandLabel(message.command)} (${mavResultLabel(message.result)}).`))
    })
  }

  private resolveParameterValueWaiters(parameter: ParameterState): void {
    const waiters = [...this.parameterValueWaiters].filter(
      (waiter) =>
        waiter.paramId === parameter.id &&
        approximatelyEqualParameterValue(parameter.value, waiter.expectedValue, waiter.tolerance)
    )

    waiters.forEach((waiter) => {
      clearTimeout(waiter.timer)
      this.parameterValueWaiters.delete(waiter)
      waiter.resolve(parameter)
    })
  }

  private rejectParameterValueWaiters(error: Error): void {
    this.parameterValueWaiters.forEach((waiter) => {
      clearTimeout(waiter.timer)
      waiter.reject(error)
    })
    this.parameterValueWaiters.clear()
  }

  private assertParameterWriteAllowed(): void {
    if (this.connection.kind !== 'connected') {
      throw new Error('Parameter writes require an active vehicle connection.')
    }
    if (!this.vehicle) {
      throw new Error('Parameter writes require an identified vehicle heartbeat.')
    }
    if (this.parameterSync.status !== 'complete') {
      throw new Error('Parameter writes require a completed parameter sync.')
    }
    if (this.vehicle.armed) {
      throw new Error('Parameter writes are blocked while the vehicle is armed.')
    }
    if (hasActiveGuidedAction(this.guidedActions) || this.motorTest.status === 'requested' || this.motorTest.status === 'running') {
      throw new Error('Parameter writes are blocked while another guided action or motor test is active.')
    }
  }

  private clearMotorTestTimer(): void {
    if (this.motorTestTimer) {
      clearTimeout(this.motorTestTimer)
      this.motorTestTimer = undefined
    }
  }

  private clearAccelerometerPromptFallbackTimer(): void {
    if (!this.accelerometerPromptFallbackTimer) {
      return
    }

    clearTimeout(this.accelerometerPromptFallbackTimer)
    this.accelerometerPromptFallbackTimer = undefined
  }

  private clearAccelerometerAdvanceTimer(): void {
    if (!this.accelerometerAdvanceTimer) {
      return
    }

    clearTimeout(this.accelerometerAdvanceTimer)
    this.accelerometerAdvanceTimer = undefined
  }

  private clearCompassGuidanceTimer(): void {
    if (!this.compassGuidanceTimer) {
      return
    }

    clearTimeout(this.compassGuidanceTimer)
    this.compassGuidanceTimer = undefined
  }

  private scheduleAccelerometerPromptFallback(stepIndex: number): void {
    this.clearAccelerometerPromptFallbackTimer()
    this.accelerometerPromptFallbackTimer = setTimeout(() => {
      const current = this.guidedActions['calibrate-accelerometer']
      const state = this.accelerometerCalibration
      if (!state || state.stepIndex !== stepIndex || current.status === 'failed' || current.status === 'succeeded') {
        return
      }

      this.setGuidedAction(
        'calibrate-accelerometer',
        buildAccelerometerCalibrationGuidedAction(stepIndex, this.guidedActions['calibrate-accelerometer'])
      )
      this.emit()
    }, this.accelerometerInitialWarmupMs)
  }

  private scheduleAccelerometerStepAdvance(stepIndex: number): void {
    this.clearAccelerometerAdvanceTimer()
    this.accelerometerAdvanceTimer = setTimeout(() => {
      this.accelerometerAdvanceTimer = undefined
      const current = this.guidedActions['calibrate-accelerometer']
      const state = this.accelerometerCalibration
      if (!state || state.stepIndex !== stepIndex || current.status === 'failed' || current.status === 'succeeded') {
        return
      }

      if (stepIndex + 1 < ACCELEROMETER_CALIBRATION_STEPS.length) {
        this.accelerometerCalibration = {
          stepIndex: stepIndex + 1,
          waitingForCompletion: false
        }
        this.setGuidedAction(
          'calibrate-accelerometer',
          buildAccelerometerCalibrationGuidedAction(stepIndex + 1, this.guidedActions['calibrate-accelerometer'])
        )
      } else {
        this.accelerometerCalibration = {
          stepIndex,
          waitingForCompletion: true
        }
        this.setGuidedAction('calibrate-accelerometer', {
          ...this.guidedActions['calibrate-accelerometer'],
          status: 'running',
          summary: 'Finalizing accelerometer calibration…',
          instructions: ['Keep the vehicle still while ArduPilot stores the new accelerometer calibration.'],
          ctaLabel: undefined,
          updatedAtMs: Date.now(),
          completedAtMs: undefined
        })
        this.scheduleAccelerometerCompletionFallback(stepIndex)
      }
      this.emit()
    }, this.accelerometerStepAdvanceMs)
  }

  private scheduleAccelerometerCompletionFallback(stepIndex: number): void {
    this.clearAccelerometerAdvanceTimer()
    this.accelerometerAdvanceTimer = setTimeout(() => {
      this.accelerometerAdvanceTimer = undefined
      const current = this.guidedActions['calibrate-accelerometer']
      const state = this.accelerometerCalibration
      if (
        !state ||
        state.stepIndex !== stepIndex ||
        !state.waitingForCompletion ||
        current.status === 'failed' ||
        current.status === 'succeeded'
      ) {
        return
      }

      this.completeAccelerometerCalibration()
      this.emit()
    }, this.accelerometerCompletionFallbackMs)
  }

  private scheduleCompassGuidanceTimeout(): void {
    this.clearCompassGuidanceTimer()
    this.compassGuidanceTimer = setTimeout(() => {
      this.compassGuidanceTimer = undefined
      const current = this.guidedActions['calibrate-compass']
      if ((current.status !== 'requested' && current.status !== 'running') || current.statusTexts.length > 0) {
        return
      }

      const message =
        'No compass calibration guidance arrived from the autopilot. This vehicle may not have a usable compass, or compass calibration may be unsupported on this setup.'
      this.failGuidedAction('calibrate-compass', new Error(message))
      this.appendStatusEntry('warning', message)
      this.emit()
    }, this.compassGuidanceTimeoutMs)
  }

  private scheduleMotorTestCompletion(): void {
    this.clearMotorTestTimer()
    const motorCount = Math.max(this.motorTest.selectedOutputCount ?? 1, 1)
    const durationMs = Math.max((this.motorTest.durationSeconds ?? 0) * 1000, 0)
    const totalDurationMs = this.motorTest.allOutputsSelected
      ? durationMs * motorCount + durationMs * 0.5 * Math.max(motorCount - 1, 0)
      : durationMs
    this.motorTestTimer = setTimeout(() => {
      if (this.motorTest.status !== 'running') {
        return
      }

      const selectedOutputLabel =
        this.motorTest.allOutputsSelected
          ? `all ${this.motorTest.selectedOutputCount ?? 0} mapped motors`
          : this.motorTest.selectedOutputChannel !== undefined
          ? `OUT${this.motorTest.selectedOutputChannel}${this.motorTest.selectedMotorNumber !== undefined ? ` / M${this.motorTest.selectedMotorNumber}` : ''}`
          : 'the selected output'
      this.motorTest = {
        ...this.motorTest,
        status: 'succeeded',
        summary: this.motorTest.allOutputsSelected
          ? `Motor test completed across ${selectedOutputLabel}.`
          : `Motor test completed on ${selectedOutputLabel}.`,
        updatedAtMs: Date.now(),
        completedAtMs: Date.now()
      }
      this.appendStatusEntry(
        'info',
        this.motorTest.allOutputsSelected
          ? `Motor test sequence elapsed for ${selectedOutputLabel}.`
          : `Motor test window elapsed for ${selectedOutputLabel}.`
      )
      this.emit()
      this.motorTestTimer = undefined
    }, totalDurationMs + MOTOR_TEST_COMPLETION_BUFFER_MS)
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

  private async runCompassCalibrationAction(): Promise<void> {
    this.clearCompassGuidanceTimer()
    await this.performCommandGuidedAction(
      'calibrate-compass',
      'Compass calibration command queued.',
      'Compass calibration command sent. Waiting for autopilot guidance.',
      defaultInstructionsForAction('calibrate-compass', this.sessionProfile),
      async () => {
        await this.sendCommand(MAV_CMD.PREFLIGHT_CALIBRATION, [0, 1, 0, 0, 0, 0, 0], {
          waitForAck: true,
          ackTimeoutMs: 3000
        })
      }
    )

    const current = this.guidedActions['calibrate-compass']
    if (current.status === 'requested' || current.status === 'running') {
      this.scheduleCompassGuidanceTimeout()
    }
  }

  private async runAccelerometerCalibrationAction(): Promise<void> {
    const current = this.guidedActions['calibrate-accelerometer']
    const calibrationState = this.accelerometerCalibration

    if (calibrationState && (current.status === 'requested' || current.status === 'running')) {
      await this.advanceAccelerometerCalibration(calibrationState.stepIndex)
      return
    }

    const startedAtMs = Date.now()
    this.setGuidedAction('calibrate-accelerometer', {
      actionId: 'calibrate-accelerometer',
      status: 'requested',
      summary: 'Accelerometer calibration command queued.',
      instructions: defaultInstructionsForAction('calibrate-accelerometer', this.sessionProfile),
      statusTexts: [],
      startedAtMs,
      updatedAtMs: startedAtMs,
      completedAtMs: undefined
    })
    this.emit()

    try {
      await this.sendCommand(MAV_CMD.PREFLIGHT_CALIBRATION, [0, 0, 0, 0, 1, 0, 0], {
        waitForAck: true,
        ackTimeoutMs: 3000
      })
      this.accelerometerCalibration = {
        stepIndex: 0,
        waitingForCompletion: false
      }
      this.setGuidedAction('calibrate-accelerometer', {
        ...this.guidedActions['calibrate-accelerometer'],
        status: 'running',
        summary: 'Preparing accelerometer calibration…',
        instructions: ['Keep the vehicle level and still while ArduPilot prepares the first posture sample.'],
        ctaLabel: undefined,
        updatedAtMs: Date.now(),
        completedAtMs: undefined
      })
      this.scheduleAccelerometerPromptFallback(0)
      this.emit()
    } catch (error) {
      this.clearAccelerometerPromptFallbackTimer()
      this.clearAccelerometerAdvanceTimer()
      this.accelerometerCalibration = undefined
      this.failGuidedAction('calibrate-accelerometer', error)
      this.emit()
      throw error
    }
  }

  private async advanceAccelerometerCalibration(stepIndex: number): Promise<void> {
    const step = ACCELEROMETER_CALIBRATION_STEPS[stepIndex]
    if (!step) {
      throw new Error('Accelerometer calibration is already waiting for completion.')
    }

    const current = this.guidedActions['calibrate-accelerometer']
    this.setGuidedAction('calibrate-accelerometer', {
      ...current,
      status: 'running',
      summary: `Confirming ${step.ctaLabel.replace(/^Confirm /, '').replace(/ Position$/, '').toLowerCase()}...`,
      instructions: [`Hold the frame still while ArduPilot records the ${step.ctaLabel.replace(/^Confirm /, '').replace(/ Position$/, '').toLowerCase()} posture.`],
      ctaLabel: undefined,
      updatedAtMs: Date.now(),
      completedAtMs: undefined
    })
    this.emit()

    try {
      this.clearAccelerometerPromptFallbackTimer()
      this.clearAccelerometerAdvanceTimer()
      await this.session.send({
        type: 'COMMAND_ACK',
        command: 0,
        result: MAV_RESULT.TEMPORARILY_REJECTED,
        progress: 0,
        resultParam2: 0,
        targetSystem: this.vehicle?.systemId ?? 1,
        targetComponent: this.vehicle?.componentId ?? 1
      })
      this.scheduleAccelerometerStepAdvance(stepIndex)
      this.emit()
    } catch (error) {
      this.clearAccelerometerPromptFallbackTimer()
      this.clearAccelerometerAdvanceTimer()
      this.accelerometerCalibration = undefined
      this.failGuidedAction('calibrate-accelerometer', error)
      this.emit()
      throw error
    }
  }

  private completeAccelerometerCalibration(): void {
    const current = this.guidedActions['calibrate-accelerometer']
    const now = Date.now()
    this.clearAccelerometerPromptFallbackTimer()
    this.clearAccelerometerAdvanceTimer()
    this.accelerometerCalibration = undefined
    this.appendStatusEntry('info', 'Accelerometer calibration complete.')
    this.setGuidedAction('calibrate-accelerometer', {
      ...current,
      status: 'succeeded',
      summary: 'Accelerometer calibration complete.',
      instructions: ['Review the updated setup state before moving on to compass or radio setup.'],
      ctaLabel: undefined,
      updatedAtMs: now,
      completedAtMs: now
    })
  }

  private failGuidedAction(actionId: GuidedActionId, error: unknown): void {
    const message = error instanceof Error ? error.message : 'Unknown guided action error.'
    if (actionId === 'calibrate-compass') {
      this.clearCompassGuidanceTimer()
    }
    this.setGuidedAction(actionId, {
      ...this.guidedActions[actionId],
      status: 'failed',
      summary: message,
      ctaLabel: undefined,
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

      if (actionId === 'calibrate-compass') {
        this.clearCompassGuidanceTimer()
      }

      const nextStatus = match.status ?? (current.status === 'idle' ? 'running' : current.status)
      this.setGuidedAction(actionId, {
        actionId,
        status: nextStatus,
        summary: match.summary,
        instructions: match.instructions ?? current.instructions,
        statusTexts: appendGuidedActionText(current.statusTexts, text),
        ctaLabel: nextStatus === 'running' ? current.ctaLabel : undefined,
        startedAtMs: current.startedAtMs ?? now,
        updatedAtMs: now,
        completedAtMs: nextStatus === 'succeeded' || nextStatus === 'failed' ? now : undefined
      })

      if (actionId === 'calibrate-accelerometer' && (nextStatus === 'succeeded' || nextStatus === 'failed')) {
        this.accelerometerCalibration = undefined
        this.clearAccelerometerPromptFallbackTimer()
        this.clearAccelerometerAdvanceTimer()
        if (nextStatus === 'succeeded') {
          this.appendStatusEntry('info', 'Accelerometer calibration complete.')
        }
      }
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

  private recordPreArmIssue(text: string, severity: StatusTextEntry['severity']): void {
    const normalized = normalizePreArmIssueText(text)
    if (!normalized) {
      return
    }

    const now = Date.now()
    const existing = this.preArmIssues.get(normalized)
    this.preArmIssues.set(normalized, {
      text: normalized,
      severity,
      firstSeenAtMs: existing?.firstSeenAtMs ?? now,
      lastSeenAtMs: now
    })
    this.schedulePreArmExpiry()
  }

  private buildPreArmStatus(): PreArmStatusState {
    this.prunePreArmIssues()
    const issues = [...this.preArmIssues.values()].sort((left, right) => right.lastSeenAtMs - left.lastSeenAtMs)
    return {
      healthy: issues.length === 0,
      issues,
      lastUpdatedAtMs: issues[0]?.lastSeenAtMs
    }
  }

  private prunePreArmIssues(referenceTimeMs = Date.now()): boolean {
    let removed = false
    this.preArmIssues.forEach((issue, key) => {
      if (referenceTimeMs - issue.lastSeenAtMs > PRE_ARM_ISSUE_TTL_MS) {
        this.preArmIssues.delete(key)
        removed = true
      }
    })
    return removed
  }

  private clearPreArmExpiryTimer(): void {
    if (this.preArmExpiryTimer) {
      clearTimeout(this.preArmExpiryTimer)
      this.preArmExpiryTimer = undefined
    }
  }

  private schedulePreArmExpiry(): void {
    this.clearPreArmExpiryTimer()
    const nextExpiryAtMs = [...this.preArmIssues.values()].reduce<number | undefined>((earliest, issue) => {
      const candidate = issue.lastSeenAtMs + PRE_ARM_ISSUE_TTL_MS
      return earliest === undefined ? candidate : Math.min(earliest, candidate)
    }, undefined)

    if (nextExpiryAtMs === undefined) {
      return
    }

    const delayMs = Math.max(nextExpiryAtMs - Date.now(), 0)
    this.preArmExpiryTimer = setTimeout(() => {
      const changed = this.prunePreArmIssues()
      this.preArmExpiryTimer = undefined
      if (changed) {
        this.emit()
      }
      this.schedulePreArmExpiry()
    }, delayMs + 1)
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

function createIdleUartsFileState(): BoardFileState {
  return {
    status: 'idle',
    path: UARTS_FILE_PATH,
    mappings: []
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
    },
    attitudeTelemetry: {
      verified: false
    },
    globalPosition: {
      verified: false
    }
  }
}

function createIdleMotorTestState(): MotorTestState {
  return {
    status: 'idle',
    summary: 'No motor test has been requested.',
    instructions: ['Motor tests remain disabled until the vehicle is connected, synced, disarmed, and explicitly acknowledged as a props-off bench session.']
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

function buildAccelerometerCalibrationGuidedAction(
  stepIndex: number,
  current: GuidedActionState
): GuidedActionState {
  const step = ACCELEROMETER_CALIBRATION_STEPS[stepIndex]
  if (!step) {
    return {
      ...current,
      status: 'running',
      summary: 'Finalizing accelerometer calibration…',
      instructions: ['Keep the vehicle still while ArduPilot stores the new accelerometer calibration.'],
      ctaLabel: undefined,
      updatedAtMs: Date.now(),
      completedAtMs: undefined
    }
  }

  const now = Date.now()
  return {
    ...current,
    status: 'running',
    summary: step.summary,
    instructions: Array.from(step.instructions),
    ctaLabel: step.ctaLabel,
    updatedAtMs: now,
    completedAtMs: undefined,
    startedAtMs: current.startedAtMs ?? now
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
    },
    attitudeTelemetry: {
      ...liveVerification.attitudeTelemetry
    },
    globalPosition: {
      ...liveVerification.globalPosition
    }
  }
}

function clonePreArmStatus(preArmStatus: PreArmStatusState): PreArmStatusState {
  return {
    healthy: preArmStatus.healthy,
    lastUpdatedAtMs: preArmStatus.lastUpdatedAtMs,
    issues: preArmStatus.issues.map((issue) => ({
      ...issue
    }))
  }
}

function cloneMotorTestState(motorTest: MotorTestState): MotorTestState {
  return {
    ...motorTest,
    instructions: [...motorTest.instructions]
  }
}

function cloneBoardFileState(boardFile: BoardFileState): BoardFileState {
  return {
    ...boardFile,
    mappings: boardFile.mappings.map((mapping) => ({ ...mapping }))
  }
}

function cloneHardwareState(hardware: HardwareState): HardwareState {
  return {
    board: hardware.board ? { ...hardware.board } : undefined,
    uartsFile: cloneBoardFileState(hardware.uartsFile)
  }
}

function sortMavftpDirectoryEntries(left: MavftpDirectoryEntry, right: MavftpDirectoryEntry): number {
  if (left.kind !== right.kind) {
    return left.kind === 'directory' ? -1 : 1
  }
  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base', numeric: true })
}

function hasActiveGuidedAction(guidedActions: Record<GuidedActionId, GuidedActionState>): boolean {
  return GUIDED_ACTION_IDS.some((actionId) => {
    const status = guidedActions[actionId].status
    return status === 'requested' || status === 'running'
  })
}

function approximatelyEqualParameterValue(left: number, right: number, tolerance = DEFAULT_PARAMETER_WRITE_TOLERANCE): boolean {
  const relativeTolerance = Math.max(Math.abs(right) * 1e-6, tolerance)
  return Math.abs(left - right) <= relativeTolerance
}

function formatParameterValueForLog(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/\.?0+$/, '')
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

function enabledCompassCountFromParameters(parameters: Map<string, ParameterState>): number {
  return ['COMPASS_USE', 'COMPASS_USE2', 'COMPASS_USE3'].filter((paramId) => {
    const value = parameters.get(paramId)?.value
    return value !== undefined && Math.round(value) > 0
  }).length
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

function includesAny(text: string, fragments: string[]): boolean {
  return fragments.some((fragment) => text.includes(fragment))
}

function matchesGenericCalibrationSuccess(text: string): boolean {
  return includesAny(text, [
    'successful',
    'succeeded',
    'finished',
    'done',
    'complete',
    'completed'
  ])
}

function matchesGenericCalibrationFailure(text: string): boolean {
  return includesAny(text, [
    'failed',
    'failure',
    'cancelled',
    'canceled',
    'aborted'
  ])
}

function normalizePreArmIssueText(text: string): string | undefined {
  const normalized = text.trim()
  const prefixedMatch = normalized.match(/^prearm[:\s-]*(.+)$/i)
  if (prefixedMatch) {
    return `PreArm: ${prefixedMatch[1].trim()}`
  }

  const inlineMatch = normalized.match(/\bprearm[:\s-]*(.+)$/i)
  if (inlineMatch) {
    return `PreArm: ${inlineMatch[1].trim()}`
  }

  return undefined
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
    if (
      normalized.includes('accelerometer calibration complete') ||
      (actionIsActive &&
        includesAny(normalized, [
          'accel calibration successful',
          'accelerometer calibration successful',
          'accel cal successful',
          'calibration successful',
          'calibration complete',
          'calibration completed'
        ])) ||
      (actionIsActive && matchesGenericCalibrationSuccess(normalized))
    ) {
      return {
        status: 'succeeded',
        summary: 'Accelerometer calibration complete.',
        instructions: ['Review the updated setup state before moving on to compass or radio setup.']
      }
    }
    if (
      normalized.includes('accelerometer calibration failed') ||
      normalized.includes('accel cal failed') ||
      (actionIsActive &&
        includesAny(normalized, [
          'accelerometer calibration failed',
          'accel calibration failed',
          'accel cal failed',
          'calibration failed',
          'calibration cancelled',
          'calibration canceled'
        ])) ||
      (actionIsActive && matchesGenericCalibrationFailure(normalized))
    ) {
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
        instructions: current.ctaLabel ? current.instructions : defaultInstructionsForAction(actionId, sessionProfile)
      }
    }
  }

  if (actionId === 'calibrate-compass') {
    if (
      normalized.includes('compass calibration complete') ||
      (actionIsActive &&
        includesAny(normalized, [
          'compass calibration successful',
          'mag calibration successful',
          'calibration successful',
          'calibration complete',
          'calibration completed'
        ])) ||
      (actionIsActive && matchesGenericCalibrationSuccess(normalized))
    ) {
      return {
        status: 'succeeded',
        summary: 'Compass calibration complete.',
        instructions: ['Review compass health before flight, especially if this was a USB-only bench session.']
      }
    }
    if (
      normalized.includes('compass calibration failed') ||
      normalized.includes('mag calibration failed') ||
      (actionIsActive &&
        includesAny(normalized, [
          'compass calibration failed',
          'mag calibration failed',
          'calibration failed',
          'calibration cancelled',
          'calibration canceled'
        ])) ||
      (actionIsActive && matchesGenericCalibrationFailure(normalized))
    ) {
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

function isAuthoritativeHeartbeat(message: HeartbeatMessage): boolean {
  return message.autopilot === MAV_AUTOPILOT.ARDUPILOTMEGA
}

function createVehicleIdentity(message: HeartbeatMessage, systemId: number, componentId: number): VehicleIdentity {
  const isCopter = ARDUCOPTER_MAV_TYPES.has(message.vehicleType)
  return {
    firmware: 'ArduPilot',
    vehicle: isCopter ? 'ArduCopter' : 'Unknown',
    systemId,
    componentId,
    armed: Boolean(message.baseMode & MAV_MODE_FLAG.SAFETY_ARMED),
    flightMode: formatArduPilotMode(message.customMode)
  }
}

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

function radiansToDegrees(value: number): number {
  return Number((value * (180 / Math.PI)).toFixed(1))
}

function isValidGlobalCoordinates(latitudeE7: number, longitudeE7: number): boolean {
  const latitudeDeg = latitudeE7 / 1e7
  const longitudeDeg = longitudeE7 / 1e7
  return latitudeE7 !== 0 && longitudeE7 !== 0 && Math.abs(latitudeDeg) <= 90 && Math.abs(longitudeDeg) <= 180
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

function mavCommandLabel(command: number): string {
  switch (command) {
    case MAV_CMD.PREFLIGHT_CALIBRATION:
      return 'PREFLIGHT_CALIBRATION'
    case MAV_CMD.PREFLIGHT_REBOOT_SHUTDOWN:
      return 'PREFLIGHT_REBOOT_SHUTDOWN'
    case MAV_CMD.SET_MESSAGE_INTERVAL:
      return 'SET_MESSAGE_INTERVAL'
    case MAV_CMD.REQUEST_MESSAGE:
      return 'REQUEST_MESSAGE'
    case MAV_CMD.DO_MOTOR_TEST:
      return 'DO_MOTOR_TEST'
    case MAV_CMD.ACCELCAL_VEHICLE_POS:
      return 'ACCELCAL_VEHICLE_POS'
    default:
      return `COMMAND(${command})`
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
