import assert from 'node:assert/strict'
import test from 'node:test'

import {
  arducopterMetadata,
  formatArducopterNotificationLedBrightness,
  formatArducopterOsdType,
  formatArducopterVtxEnable,
  normalizeFirmwareMetadata
} from '../packages/param-metadata/dist/index.js'

test('metadata catalog exposes VTX parameters on the ports/peripherals surface', () => {
  const metadata = normalizeFirmwareMetadata(arducopterMetadata)

  const vtxEnable = metadata.parameters.VTX_ENABLE
  const vtxFrequency = metadata.parameters.VTX_FREQ
  const vtxPower = metadata.parameters.VTX_POWER
  const vtxMaxPower = metadata.parameters.VTX_MAX_POWER
  const vtxOptions = metadata.parameters.VTX_OPTIONS

  assert.equal(vtxEnable.categoryDefinition.id, 'peripherals')
  assert.equal(vtxEnable.categoryDefinition.viewId, 'ports')
  assert.equal(vtxEnable.options.length, 2)
  assert.equal(vtxFrequency.unit, 'MHz')
  assert.equal(vtxPower.unit, 'mW')
  assert.equal(vtxMaxPower.unit, 'mW')
  assert.equal(vtxOptions.categoryDefinition.viewId, 'ports')
})

test('metadata catalog exposes OSD and notification parameters on product surfaces', () => {
  const metadata = normalizeFirmwareMetadata(arducopterMetadata)

  assert.equal(metadata.parameters.OSD_TYPE.categoryDefinition.viewId, 'ports')
  assert.equal(metadata.parameters.OSD_CHAN.categoryDefinition.viewId, 'ports')
  assert.equal(metadata.parameters.MSP_OPTIONS.categoryDefinition.viewId, 'ports')
  assert.equal(metadata.parameters.MSP_OSD_NCELLS.options.length, 15)

  assert.equal(metadata.parameters.NTF_LED_TYPES.categoryDefinition.viewId, 'outputs')
  assert.equal(metadata.parameters.NTF_LED_LEN.categoryDefinition.viewId, 'outputs')
  assert.equal(metadata.parameters.NTF_LED_BRIGHT.options.length, 4)
  assert.equal(metadata.parameters.NTF_BUZZ_TYPES.categoryDefinition.viewId, 'outputs')
  assert.equal(metadata.parameters.NTF_BUZZ_VOLUME.unit, '%')
})

test('VTX enable formatting stays user-facing', () => {
  assert.equal(formatArducopterVtxEnable(0), 'Disabled')
  assert.equal(formatArducopterVtxEnable(1), 'Enabled')
  assert.equal(formatArducopterVtxEnable(undefined), 'Unknown')
})

test('OSD and notification formatting stays user-facing', () => {
  assert.equal(formatArducopterOsdType(5), 'MSP DisplayPort')
  assert.equal(formatArducopterNotificationLedBrightness(2), 'Medium')
})
