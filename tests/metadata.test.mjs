import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ARDUPLANE_FLIGHT_MODE_LABELS,
  BOARD_CATALOG,
  arducopterMetadata,
  arduplaneFlightModeLabel,
  findBoardCatalogEntry,
  formatArducopterNotificationLedBrightness,
  formatArducopterOsdType,
  formatArducopterLogBackend,
  formatArducopterVtxEnable,
  formatArduplaneFlightMode,
  normalizeFirmwareMetadata
} from '../packages/param-metadata/dist/index.js'

test('metadata catalog exposes VTX parameters on the dedicated VTX surface', () => {
  const metadata = normalizeFirmwareMetadata(arducopterMetadata)

  const vtxEnable = metadata.parameters.VTX_ENABLE
  const vtxFrequency = metadata.parameters.VTX_FREQ
  const vtxPower = metadata.parameters.VTX_POWER
  const vtxMaxPower = metadata.parameters.VTX_MAX_POWER
  const vtxOptions = metadata.parameters.VTX_OPTIONS

  assert.equal(vtxEnable.categoryDefinition.id, 'vtx')
  assert.equal(vtxEnable.categoryDefinition.viewId, 'vtx')
  assert.equal(vtxEnable.options.length, 2)
  assert.equal(vtxFrequency.unit, 'MHz')
  assert.equal(vtxPower.unit, 'mW')
  assert.equal(vtxMaxPower.unit, 'mW')
  assert.equal(vtxOptions.categoryDefinition.viewId, 'vtx')
})

test('metadata catalog exposes OSD and notification parameters on product surfaces', () => {
  const metadata = normalizeFirmwareMetadata(arducopterMetadata)

  assert.equal(metadata.parameters.OSD_TYPE.categoryDefinition.viewId, 'osd')
  assert.equal(metadata.parameters.OSD_CHAN.categoryDefinition.viewId, 'osd')
  assert.equal(metadata.parameters.MSP_OPTIONS.categoryDefinition.viewId, 'osd')
  assert.equal(metadata.parameters.MSP_OSD_NCELLS.options.length, 15)

  assert.equal(metadata.parameters.NTF_LED_TYPES.categoryDefinition.viewId, 'outputs')
  assert.equal(metadata.parameters.NTF_LED_LEN.categoryDefinition.viewId, 'outputs')
  assert.equal(metadata.parameters.NTF_LED_BRIGHT.options.length, 4)
  assert.equal(metadata.parameters.NTF_BUZZ_TYPES.categoryDefinition.viewId, 'outputs')
  assert.equal(metadata.parameters.NTF_BUZZ_VOLUME.unit, '%')
})

test('metadata catalog exposes serial options and dedicated FPV app views', () => {
  const metadata = normalizeFirmwareMetadata(arducopterMetadata)

  assert.ok(metadata.appViews.some((view) => view.id === 'vtx'))
  assert.ok(metadata.appViews.some((view) => view.id === 'osd'))
  assert.equal(metadata.parameters.SERIAL1_OPTIONS.categoryDefinition.viewId, 'ports')
  assert.ok(metadata.parameters.SERIAL1_OPTIONS.options.length > 0)
})

test('board catalog covers the expanded hardware-aware Ports targets', () => {
  assert.ok(BOARD_CATALOG.length >= 5)
  assert.equal(findBoardCatalogEntry(53)?.label, 'Pixhawk 6X')
  assert.equal(findBoardCatalogEntry(57)?.label, 'ARKV6X')
  assert.equal(findBoardCatalogEntry(59)?.label, 'ARK FPV')
  assert.equal(findBoardCatalogEntry(1013)?.label, 'Matek H743')
  assert.equal(findBoardCatalogEntry(7000)?.label, 'CUAV-7-Nano')
  assert.ok((findBoardCatalogEntry(59)?.mediaAssets.length ?? 0) >= 2)
  assert.ok((findBoardCatalogEntry(1013)?.mediaAssets.length ?? 0) >= 2)
})

test('metadata catalog exposes advanced setup, receiver, and failsafe parameters on product surfaces', () => {
  const metadata = normalizeFirmwareMetadata(arducopterMetadata)

  assert.equal(metadata.parameters.COMPASS_USE2.categoryDefinition.viewId, 'setup')
  assert.equal(metadata.parameters.COMPASS_USE3.categoryDefinition.viewId, 'setup')

  assert.equal(metadata.parameters.RC_SPEED.categoryDefinition.viewId, 'receiver')
  assert.equal(metadata.parameters.RC_OPTIONS.categoryDefinition.viewId, 'receiver')
  assert.equal(metadata.parameters.RC_SPEED.unit, 'Hz')

  assert.equal(metadata.parameters.DISARM_DELAY.categoryDefinition.viewId, 'power')
  assert.equal(metadata.parameters.BATT_LOW_TIMER.categoryDefinition.viewId, 'power')
  assert.equal(metadata.parameters.RC_FS_TIMEOUT.categoryDefinition.viewId, 'power')
  assert.equal(metadata.parameters.FS_OPTIONS.categoryDefinition.viewId, 'power')
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

test('ArduPlane flight-mode labels resolve common Plane and QuadPlane modes', () => {
  // Core Plane fixed-wing modes
  assert.equal(arduplaneFlightModeLabel(0), 'Manual')
  assert.equal(arduplaneFlightModeLabel(5), 'FBWA')
  assert.equal(arduplaneFlightModeLabel(10), 'Auto')
  assert.equal(arduplaneFlightModeLabel(11), 'RTL')

  // QuadPlane modes (the 17-23 range)
  assert.equal(arduplaneFlightModeLabel(17), 'QStabilize')
  assert.equal(arduplaneFlightModeLabel(20), 'QLand')

  // Unknown mode falls through to the numbered placeholder
  assert.equal(formatArduplaneFlightMode(99), 'Mode 99')
  assert.equal(formatArduplaneFlightMode(undefined), 'Unknown')

  // The label table itself exposes the expected size for the current Plane build
  assert.equal(Object.keys(ARDUPLANE_FLIGHT_MODE_LABELS).length, 25)
})

test('metadata catalog exposes per-element OSD layout parameters on the OSD surface', () => {
  const metadata = normalizeFirmwareMetadata(arducopterMetadata)

  const batEnable = metadata.parameters.OSD1_BAT_VOLT_EN
  assert.equal(batEnable.categoryDefinition.viewId, 'osd')
  assert.equal(batEnable.options.length, 2)
  assert.equal(batEnable.options[0].label, 'Disabled')
  assert.equal(batEnable.options[1].label, 'Enabled')

  assert.equal(metadata.parameters.OSD1_RSSI_X.minimum, 0)
  assert.equal(metadata.parameters.OSD1_RSSI_X.maximum, 29)
  assert.equal(metadata.parameters.OSD1_RSSI_Y.minimum, 0)
  assert.equal(metadata.parameters.OSD1_RSSI_Y.maximum, 15)

  const expectedElements = [
    'BAT_VOLT',
    'RSSI',
    'ALTITUDE',
    'THROTTLE',
    'CURRENT',
    'HEADING',
    'GSPEED',
    'HOME',
    'HORIZON',
    'FLTMODE'
  ]
  for (const screen of [1, 2, 3, 4]) {
    for (const element of expectedElements) {
      for (const suffix of ['EN', 'X', 'Y']) {
        const id = `OSD${screen}_${element}_${suffix}`
        const entry = metadata.parameters[id]
        assert.ok(entry, `expected ${id} in catalog`)
        assert.equal(entry.categoryDefinition.viewId, 'osd')
      }
    }
  }

  // Spot-check a screen-2 entry and a newly added element label
  assert.equal(metadata.parameters.OSD2_HEADING_X.maximum, 29)
  assert.equal(metadata.parameters.OSD3_HORIZON_EN.options.length, 2)
  assert.equal(metadata.parameters.OSD1_HEADING_EN.label, 'OSD1 Heading Enabled')
})

test('metadata catalog exposes onboard logging parameters under a dedicated logging category', () => {
  const metadata = normalizeFirmwareMetadata(arducopterMetadata)

  const backend = metadata.parameters.LOG_BACKEND_TYPE
  assert.equal(backend.categoryDefinition.id, 'logging')
  assert.equal(backend.categoryDefinition.viewId, 'parameters')
  assert.equal(backend.options.length, 5)
  assert.equal(backend.options[0].label, 'None')
  assert.equal(backend.options[4].label, 'Block')
  assert.equal(backend.rebootRequired, true)

  // The MB-free retention knob carries a unit and a non-trivial upper bound
  assert.equal(metadata.parameters.LOG_FILE_MB_FREE.unit, 'MB')
  assert.ok(metadata.parameters.LOG_FILE_MB_FREE.maximum >= 1024)

  // The boolean LOG_* knobs reuse the shared Disabled/Enabled option pair
  for (const id of ['LOG_FILE_DSRMROT', 'LOG_REPLAY', 'LOG_DISARMED']) {
    const entry = metadata.parameters[id]
    assert.equal(entry.categoryDefinition.id, 'logging')
    assert.equal(entry.options.length, 2)
    assert.equal(entry.options[0].label, 'Disabled')
    assert.equal(entry.options[1].label, 'Enabled')
  }
})

test('Log-backend formatting stays user-facing', () => {
  assert.equal(formatArducopterLogBackend(0), 'None')
  assert.equal(formatArducopterLogBackend(3), 'File + MAVLink')
  assert.equal(formatArducopterLogBackend(undefined), 'Unknown')
  assert.equal(formatArducopterLogBackend(99), 'Backend 99')
})
