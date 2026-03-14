import {
  arducopterMotorNumberForServoFunction,
  expectedMotorCountForArducopterFrameClass,
  formatArducopterFrameClass,
  formatArducopterFrameType,
  formatArducopterServoFunction,
  isArducopterFrameTypeIgnored,
} from '@arduconfig/param-metadata'

import type { ConfiguratorSnapshot } from './types.js'

export interface AirframeSummary {
  frameClassValue?: number
  frameClassLabel: string
  frameTypeValue?: number
  frameTypeLabel: string
  expectedMotorCount?: number
  frameTypeIgnored: boolean
}

export type ServoOutputKind = 'motor' | 'unused' | 'pass-through' | 'peripheral' | 'other'

export interface ServoOutputAssignment {
  channelNumber: number
  paramId: string
  functionValue: number
  functionLabel: string
  kind: ServoOutputKind
  motorNumber?: number
}

export interface OutputMappingSummary {
  airframe: AirframeSummary
  outputs: ServoOutputAssignment[]
  motorOutputs: ServoOutputAssignment[]
  configuredAuxOutputs: ServoOutputAssignment[]
  disabledOutputs: ServoOutputAssignment[]
  notes: string[]
}

const DEFAULT_MAX_SERVO_OUTPUTS = 16

export function deriveArducopterAirframe(snapshot: ConfiguratorSnapshot): AirframeSummary {
  const frameClassValue = readRoundedParameter(snapshot, 'FRAME_CLASS')
  const frameTypeValue = readRoundedParameter(snapshot, 'FRAME_TYPE')
  const frameTypeIgnored = isArducopterFrameTypeIgnored(frameClassValue)

  return {
    frameClassValue,
    frameClassLabel: formatArducopterFrameClass(frameClassValue),
    frameTypeValue,
    frameTypeLabel: frameTypeIgnored ? `${formatArducopterFrameType(frameTypeValue)} (ignored)` : formatArducopterFrameType(frameTypeValue),
    expectedMotorCount: expectedMotorCountForArducopterFrameClass(frameClassValue),
    frameTypeIgnored,
  }
}

export function deriveServoOutputAssignments(
  snapshot: ConfiguratorSnapshot,
  maxServoOutputs = DEFAULT_MAX_SERVO_OUTPUTS
): ServoOutputAssignment[] {
  const parameterValues = new Map(snapshot.parameters.map((parameter) => [parameter.id, parameter.value]))
  const assignments: ServoOutputAssignment[] = []

  for (let channelNumber = 1; channelNumber <= maxServoOutputs; channelNumber += 1) {
    const paramId = `SERVO${channelNumber}_FUNCTION`
    const rawValue = parameterValues.get(paramId)
    if (rawValue === undefined) {
      continue
    }

    const functionValue = Math.round(rawValue)
    const motorNumber = arducopterMotorNumberForServoFunction(functionValue)
    assignments.push({
      channelNumber,
      paramId,
      functionValue,
      functionLabel: formatArducopterServoFunction(functionValue),
      kind: classifyServoOutput(functionValue, motorNumber),
      motorNumber,
    })
  }

  return assignments
}

export function deriveOutputMappingSummary(
  snapshot: ConfiguratorSnapshot,
  maxServoOutputs = DEFAULT_MAX_SERVO_OUTPUTS
): OutputMappingSummary {
  const airframe = deriveArducopterAirframe(snapshot)
  const outputs = deriveServoOutputAssignments(snapshot, maxServoOutputs)
  const motorOutputs = outputs.filter((output) => output.kind === 'motor').sort(sortByMotorNumber)
  const configuredAuxOutputs = outputs.filter(
    (output) => output.kind !== 'motor' && output.kind !== 'unused'
  )
  const disabledOutputs = outputs.filter((output) => output.kind === 'unused')
  const notes = buildOutputMappingNotes(airframe, outputs, motorOutputs)

  return {
    airframe,
    outputs,
    motorOutputs,
    configuredAuxOutputs,
    disabledOutputs,
    notes,
  }
}

function classifyServoOutput(functionValue: number, motorNumber: number | undefined): ServoOutputKind {
  if (motorNumber !== undefined) {
    return 'motor'
  }

  if (functionValue === 0) {
    return 'unused'
  }

  if ((functionValue >= 51 && functionValue <= 66) || (functionValue >= 140 && functionValue <= 155) || functionValue === 1) {
    return 'pass-through'
  }

  if (
    functionValue === -1 ||
    functionValue === 6 ||
    functionValue === 7 ||
    functionValue === 8 ||
    functionValue === 9 ||
    functionValue === 10 ||
    functionValue === 12 ||
    functionValue === 13 ||
    functionValue === 14 ||
    functionValue === 15 ||
    functionValue === 27 ||
    functionValue === 29 ||
    functionValue === 30 ||
    functionValue === 31 ||
    functionValue === 32 ||
    functionValue === 41 ||
    functionValue === 45 ||
    functionValue === 46 ||
    functionValue === 47 ||
    functionValue === 70 ||
    functionValue === 73 ||
    functionValue === 74 ||
    functionValue === 75 ||
    functionValue === 76 ||
    functionValue === 81 ||
    functionValue === 88 ||
    functionValue === 90 ||
    functionValue === 91 ||
    functionValue === 92 ||
    functionValue === 93 ||
    (functionValue >= 120 && functionValue <= 123)
  ) {
    return 'peripheral'
  }

  return 'other'
}

function buildOutputMappingNotes(
  airframe: AirframeSummary,
  outputs: ServoOutputAssignment[],
  motorOutputs: ServoOutputAssignment[]
): string[] {
  const notes: string[] = []

  if (outputs.length === 0) {
    return ['No SERVOx_FUNCTION parameters were available in the current snapshot.']
  }

  if (airframe.frameTypeIgnored) {
    notes.push(`FRAME_TYPE is not used for ${airframe.frameClassLabel} airframes.`)
  }

  if (airframe.expectedMotorCount !== undefined) {
    if (motorOutputs.length < airframe.expectedMotorCount) {
      notes.push(`Expected ${airframe.expectedMotorCount} motor outputs for ${airframe.frameClassLabel}, but only ${motorOutputs.length} are mapped.`)
    } else if (motorOutputs.length > airframe.expectedMotorCount) {
      notes.push(`Detected ${motorOutputs.length} motor outputs, which is more than the usual ${airframe.expectedMotorCount} for ${airframe.frameClassLabel}.`)
    }

    const missingMotorNumbers = []
    for (let motorNumber = 1; motorNumber <= airframe.expectedMotorCount; motorNumber += 1) {
      if (!motorOutputs.some((output) => output.motorNumber === motorNumber)) {
        missingMotorNumbers.push(motorNumber)
      }
    }

    if (missingMotorNumbers.length > 0) {
      notes.push(`Missing motor assignments: ${missingMotorNumbers.map((motorNumber) => `M${motorNumber}`).join(', ')}.`)
    }
  }

  if (motorOutputs.length === 0) {
    notes.push('No motor outputs are currently mapped in the inspected SERVO function range.')
  }

  if (notes.length === 0) {
    notes.push('Frame geometry and primary output mapping look internally consistent in the current parameter snapshot.')
  }

  return notes
}

function sortByMotorNumber(left: ServoOutputAssignment, right: ServoOutputAssignment): number {
  return (left.motorNumber ?? Number.MAX_SAFE_INTEGER) - (right.motorNumber ?? Number.MAX_SAFE_INTEGER)
}

function readRoundedParameter(snapshot: ConfiguratorSnapshot, paramId: string): number | undefined {
  const parameter = snapshot.parameters.find((candidate) => candidate.id === paramId)
  return parameter === undefined ? undefined : Math.round(parameter.value)
}
