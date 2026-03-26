import type { ConfiguratorSnapshot, MotorTestRequest } from './types.js'
import { deriveOutputMappingSummary, type ServoOutputAssignment } from './airframe-outputs.js'

export const MAX_MOTOR_TEST_THROTTLE_PERCENT = 20
export const MAX_MOTOR_TEST_DURATION_SECONDS = 2
export const MIN_MOTOR_TEST_DURATION_SECONDS = 0.1

export interface MotorTestEligibility {
  allowed: boolean
  reasons: string[]
  selectedOutput?: ServoOutputAssignment
  selectedOutputs: ServoOutputAssignment[]
}

export function evaluateMotorTestEligibility(
  snapshot: ConfiguratorSnapshot,
  request: Partial<MotorTestRequest> = {}
): MotorTestEligibility {
  const reasons: string[] = []

  if (snapshot.connection.kind !== 'connected') {
    reasons.push('The transport is not connected.')
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

  if (snapshot.sessionProfile !== 'full-power') {
    reasons.push('Switch the session profile to Full power before requesting a motor test.')
  }

  const hasRunningGuidedAction = Object.values(snapshot.guidedActions).some(
    (action) => action.status === 'requested' || action.status === 'running'
  )
  if (hasRunningGuidedAction) {
    reasons.push('Wait for the current guided action to finish before running a motor test.')
  }

  if (snapshot.motorTest.status === 'requested' || snapshot.motorTest.status === 'running') {
    reasons.push('A motor test is already in progress.')
  }

  const outputMapping = deriveOutputMappingSummary(snapshot)
  if (outputMapping.motorOutputs.length === 0) {
    reasons.push('No mapped motor outputs were found in the current SERVO function range.')
  }

  let selectedOutput: ServoOutputAssignment | undefined
  const selectedOutputs = outputMapping.motorOutputs

  if (request.runAllOutputs) {
    if (!hasContiguousMotorSequence(selectedOutputs)) {
      reasons.push('All-motor tests require a contiguous motor sequence starting at M1. Fix the motor mapping or use an individual motor slider.')
    }
  } else {
    if (request.outputChannel === undefined) {
      reasons.push('Select a mapped motor output.')
    } else {
      selectedOutput = selectedOutputs.find((output) => output.channelNumber === request.outputChannel)
      if (!selectedOutput) {
        reasons.push(`OUT${request.outputChannel} is not mapped as a motor output.`)
      }
    }
  }

  if (request.throttlePercent === undefined || Number.isNaN(request.throttlePercent)) {
    reasons.push(`Throttle must be set between 1 and ${MAX_MOTOR_TEST_THROTTLE_PERCENT} percent.`)
  } else if (request.throttlePercent < 1 || request.throttlePercent > MAX_MOTOR_TEST_THROTTLE_PERCENT) {
    reasons.push(`Throttle must stay between 1 and ${MAX_MOTOR_TEST_THROTTLE_PERCENT} percent.`)
  }

  if (request.durationSeconds === undefined || Number.isNaN(request.durationSeconds)) {
    reasons.push(`Duration must be set between ${MIN_MOTOR_TEST_DURATION_SECONDS} and ${MAX_MOTOR_TEST_DURATION_SECONDS} seconds.`)
  } else if (
    request.durationSeconds < MIN_MOTOR_TEST_DURATION_SECONDS ||
    request.durationSeconds > MAX_MOTOR_TEST_DURATION_SECONDS
  ) {
    reasons.push(`Duration must stay between ${MIN_MOTOR_TEST_DURATION_SECONDS} and ${MAX_MOTOR_TEST_DURATION_SECONDS} seconds.`)
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    selectedOutput,
    selectedOutputs,
  }
}

export function motorTestInstructions(
  request: MotorTestRequest,
  selectedOutput?: ServoOutputAssignment,
  selectedOutputs: ServoOutputAssignment[] = []
): string[] {
  if (request.runAllOutputs) {
    return [
      'Remove all propellers before running any motor test.',
      'Keep the vehicle restrained and the test area clear of people, tools, and loose objects.',
      `This request spins all ${selectedOutputs.length} mapped motors in sequence at ${request.throttlePercent}% for ${request.durationSeconds.toFixed(1)} seconds per motor.`,
      'ArduPilot runs the ALL test one motor at a time in sequence, not all motors simultaneously.',
    ]
  }

  return [
    'Remove all propellers before running any motor test.',
    'Keep the vehicle restrained and the test area clear of people, tools, and loose objects.',
    `This request spins ${selectedOutput ? `OUT${selectedOutput.channelNumber}${selectedOutput.motorNumber !== undefined ? ` / M${selectedOutput.motorNumber}` : ''}` : 'the selected output'} at ${request.throttlePercent}% for ${request.durationSeconds.toFixed(1)} seconds and then stops automatically.`,
  ]
}

function hasContiguousMotorSequence(outputs: ServoOutputAssignment[]): boolean {
  return outputs.every((output, index) => output.motorNumber === index + 1)
}
