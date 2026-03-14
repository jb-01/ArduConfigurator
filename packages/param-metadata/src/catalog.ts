import type {
  AppViewDefinition,
  FirmwareMetadataBundle,
  NormalizedFirmwareMetadataBundle,
  NormalizedParameterDefinition,
  ParameterCategoryDefinition
} from './types.js'

const DEFAULT_APP_VIEWS: AppViewDefinition[] = [
  {
    id: 'setup',
    label: 'Setup',
    description: 'Connection, identity, and calibration surfaces.',
    order: 1
  },
  {
    id: 'receiver',
    label: 'Receiver',
    description: 'RC mapping, ranges, and mode-switch setup.',
    order: 2
  },
  {
    id: 'outputs',
    label: 'Outputs',
    description: 'Airframe, output mapping, motor tests, and ESC review.',
    order: 3
  },
  {
    id: 'power',
    label: 'Power',
    description: 'Battery, failsafe, and pre-arm review.',
    order: 4
  },
  {
    id: 'parameters',
    label: 'Parameters',
    description: 'Low-level parameter editing, diffing, and backup work.',
    order: 5
  }
]

function fallbackCategoryDefinition(categoryId: string): ParameterCategoryDefinition {
  return {
    id: categoryId,
    label: startCase(categoryId),
    description: `${startCase(categoryId)} parameters.`,
    order: 999,
    viewId: 'parameters'
  }
}

export function normalizeFirmwareMetadata(bundle: FirmwareMetadataBundle): NormalizedFirmwareMetadataBundle {
  const appViews = [...(bundle.appViews ?? DEFAULT_APP_VIEWS)].sort((left, right) => left.order - right.order)
  const categoryById = { ...(bundle.categories ?? {}) }

  const parameters = Object.fromEntries(
    Object.entries(bundle.parameters).map(([parameterId, definition]) => {
      const categoryDefinition = categoryById[definition.category] ?? fallbackCategoryDefinition(definition.category)
      categoryById[definition.category] = categoryDefinition

      const normalizedDefinition: NormalizedParameterDefinition = {
        ...definition,
        categoryDefinition
      }

      return [parameterId, normalizedDefinition]
    })
  ) as Record<string, NormalizedParameterDefinition>

  const categories = Object.values(categoryById).sort((left, right) => left.order - right.order || left.label.localeCompare(right.label))
  const parametersByCategory = categories.reduce<Record<string, NormalizedParameterDefinition[]>>((grouped, category) => {
    grouped[category.id] = Object.values(parameters)
      .filter((definition) => definition.category === category.id)
      .sort((left, right) => left.id.localeCompare(right.id))
    return grouped
  }, {})

  return {
    firmware: bundle.firmware,
    appViews,
    categories,
    categoryById,
    parameters,
    parametersByCategory
  }
}

function startCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
}
