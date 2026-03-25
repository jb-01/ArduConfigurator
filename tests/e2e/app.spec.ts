import { expect, test, type Page } from '@playwright/test'

async function expectParameterSummaryComplete(page: Page): Promise<void> {
  await expect(page.getByTestId('session-parameter-summary')).toHaveText(/^(134 params|Params 134)$/)
}

async function connectToVehicle(page: Page, transportMode: 'demo' | 'websocket' = 'demo'): Promise<void> {
  await page.goto('/')

  await page.getByTestId('transport-mode-select').selectOption(transportMode)

  await page.getByTestId('connect-button').click()
  await expect(page.getByTestId('session-vehicle-name')).toHaveText('ArduCopter')
  await expectParameterSummaryComplete(page)
}

async function openView(page: Page, viewId: string): Promise<void> {
  await page.getByTestId(`view-button-${viewId}`).click()
}

async function expectWorkspaceViewTitle(page: Page, title: string): Promise<void> {
  await expect(page.getByTestId('workspace-view-title')).toHaveText(title)
}

async function pullParameters(page: Page): Promise<void> {
  const pullParametersButton = page.getByRole('button', { name: 'Pull Parameters' })
  await expect(pullParametersButton).toBeVisible()
  await pullParametersButton.click()
  await expect(pullParametersButton).toHaveCount(0)
  await expectParameterSummaryComplete(page)
}

async function applySingleTuningChange(page: Page, value: string): Promise<void> {
  await openView(page, 'tuning')
  await page.getByTestId('tuning-input-ATC_INPUT_TC').fill(value)
  await page.getByTestId('apply-tuning-changes-button').click()
  await expect(page.getByText('Verified 1 tuning change(s) from this view.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pull Parameters' })).toBeVisible()
}

test.describe('browser configurator regression flows', () => {
  test('bundled websocket demo keeps core configuration surfaces reachable', async ({ page }) => {
    await connectToVehicle(page, 'demo')

    await expect(page.getByTestId('view-button-setup')).toBeVisible()
    await expect(page.getByTestId('view-button-ports')).toBeVisible()
    await expect(page.getByTestId('view-button-vtx')).toBeVisible()
    await expect(page.getByTestId('view-button-osd')).toBeVisible()
    await expect(page.getByTestId('view-button-receiver')).toBeVisible()
    await expect(page.getByTestId('view-button-outputs')).toBeVisible()
    await expect(page.getByTestId('view-button-power')).toBeVisible()
    await expect(page.getByTestId('view-button-snapshots')).toBeVisible()
    await expect(page.getByTestId('view-button-tuning')).toBeVisible()
    await expect(page.getByTestId('view-button-presets')).toBeVisible()
    await expect(page.getByTestId('view-button-parameters')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Setup' })).toBeVisible()
    await expect(page.getByTestId('setup-craft-preview')).toBeVisible()
    await expect(page.getByTestId('flight-deck-zero-heading-button')).toBeVisible()
    await page.getByTestId('flight-deck-zero-heading-button').click()
    await expect(page.getByText('Bench-forward zeroed')).toBeVisible()
    await expect(page.getByTestId('flight-deck-clear-heading-button')).toBeVisible()
    await expect(page.getByTestId('setup-gps-map-widget')).toBeVisible()
    await expect(page.getByTestId('setup-start-guided-button')).toBeVisible()
    await page.getByTestId('setup-start-guided-button').click()
    await expect(page.getByTestId('setup-wizard')).toBeVisible()
    await expect(page.getByTestId('wizard-orientation-task')).toBeVisible()
    await expect(page.getByTestId('wizard-orientation-primary')).toBeVisible()
    await page.getByTestId('wizard-orientation-primary').click()
    await expect(page.getByTestId('wizard-orientation-task')).toContainText('running')
    await page.getByRole('button', { name: 'Open Start Orientation Check' }).first().click()
    await expect(page.getByRole('heading', { name: 'Airframe & Outputs' })).toBeVisible()
    await expect
      .poll(async () => page.locator('#outputs-orientation-start').evaluate((element) => element.getBoundingClientRect().top))
      .toBeGreaterThanOrEqual(0)
    await expect
      .poll(async () => page.locator('#outputs-orientation-start').evaluate((element) => element.getBoundingClientRect().top))
      .toBeLessThan(220)
    await page.getByRole('button', { name: 'Mark Failed' }).first().click()
    await expect(page.getByRole('heading', { name: 'Guided Setup' })).toBeVisible()
    await expect(page.getByTestId('wizard-orientation-primary')).toContainText('Retry Orientation Check')
    await expect(page.getByRole('button', { name: 'Back to Setup' })).toBeVisible()
    await page.getByRole('button', { name: 'Back to Setup' }).click()
    await expect(page.getByRole('heading', { name: 'Setup' })).toBeVisible()

    await openView(page, 'ports')
    await expect(page.getByRole('heading', { name: 'Ports & Peripherals' })).toBeVisible()
    await expect(page.getByTestId('ports-gps-map-widget')).toBeVisible()
    await expect(page.getByText('OSD routed through dedicated tab')).toBeVisible()
    await expect(page.getByText('VTX routed through dedicated tab')).toBeVisible()
    await openView(page, 'setup')
    await expect(page.getByRole('heading', { name: 'Setup' })).toBeVisible()

    await openView(page, 'vtx')
    await expectWorkspaceViewTitle(page, 'VTX')
    await expect(page.getByText('VTX Table', { exact: true })).toBeVisible()

    await openView(page, 'osd')
    await expectWorkspaceViewTitle(page, 'OSD')
    await expect(page.getByText('Live editor roadmap', { exact: true })).toBeVisible()

    await openView(page, 'receiver')
    await expect(page.getByText('Receiver status')).toBeVisible()
    await expect(page.getByText('Receiver link & signal setup')).toBeVisible()

    await openView(page, 'outputs')
    await expect(page.getByText('Output assignments', { exact: true })).toBeVisible()
    await expect(page.getByText('LED & buzzer notifications', { exact: true })).toBeVisible()
    await page.getByLabel('All propellers are removed.').check()
    await page.getByLabel('The vehicle is restrained and the test area is clear.').check()
    await page.getByTestId('motor-test-sliders').getByRole('button', { name: 'Test' }).click()
    await expect(page.locator('#outputs-motor-confirm')).toBeEnabled()
    await expect(page.locator('#outputs-motor-confirm')).toHaveClass(/guided-action-pulse/)

    await openView(page, 'power')
    await expect(page.getByRole('heading', { name: 'Power & Failsafe' })).toBeVisible()
    await expect(page.getByText('Power & failsafe configuration')).toBeVisible()

    await page.getByTestId('product-mode-expert').click()
    await expect(page.getByTestId('view-button-parameters')).toBeVisible()

    await openView(page, 'parameters')
    await expect(page.getByTestId('mavftp-browser')).toBeVisible()
    await expect(page.getByText('@SYS/scripts')).toBeVisible()
    const scriptsRow = page.locator('.mavftp-browser__row').filter({ hasText: '@SYS/scripts' })
    await scriptsRow.getByRole('button', { name: 'Open' }).click()
    await expect(page.getByTestId('mavftp-path-input')).toHaveValue('@SYS/scripts')

    await openView(page, 'ports')
    await page.getByRole('button', { name: 'Port Map' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).click()
  })

  test('snapshots and presets stay consistent through a tuning-write round-trip', async ({ page }) => {
    await connectToVehicle(page, 'demo')

    await openView(page, 'snapshots')
    await page.getByTestId('snapshot-label-input').fill('E2E baseline')
    await page.getByTestId('snapshot-protected-toggle').check()
    await page.getByTestId('capture-live-snapshot-button').click()

    await expect(page.getByText('Saved snapshot "E2E baseline" with 134 parameters.')).toBeVisible()
    await expect(page.getByTestId('active-baseline-label')).toHaveText('E2E baseline')

    await openView(page, 'presets')
    await page.getByTestId('preset-card-flight-feel-soft').click()
    await expect(page.getByRole('heading', { name: 'Smooth Explorer' })).toBeVisible()
    await expect(page.getByTestId('apply-preset-button')).toBeVisible()

    await applySingleTuningChange(page, '0.2')

    await openView(page, 'snapshots')
    await expect(page.getByText('restore available')).toBeVisible()

    await expect(page.getByTestId('snapshot-restore-ack')).not.toBeChecked()
    await page.getByTestId('snapshot-restore-ack').check()
    await expect(page.getByTestId('apply-snapshot-restore-button')).toBeDisabled()
    await pullParameters(page)
    await expect(page.getByTestId('snapshot-restore-ack')).not.toBeChecked()
    await page.getByTestId('snapshot-restore-ack').check()
    await page.getByTestId('apply-snapshot-restore-button').click()

    await expect(page.getByText('already matched')).toBeVisible()
    await expect(page.getByTestId('active-baseline-label')).toHaveText('E2E baseline')
  })

  test('websocket transport connects through the bundled demo bridge', async ({ page }) => {
    await connectToVehicle(page, 'websocket')

    await expect(page.getByText('ws://127.0.0.1:14550')).toBeVisible()
    await openView(page, 'ports')
    await expect(page.getByRole('heading', { name: 'Ports & Peripherals' })).toBeVisible()
  })

  test('connection failures surface a clear session notice instead of leaving the UI idle and ambiguous', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('transport-mode-select').selectOption('websocket')
    await page.getByTestId('websocket-url-input').fill('ws://127.0.0.1:1')
    await page.getByTestId('connect-button').click()

    await expect(page.getByTestId('session-connection-notice')).toBeVisible()
    await expect(page.getByTestId('session-connection-notice')).toContainText('Failed to open WebSocket')
    await expect(page.getByTestId('session-vehicle-name')).toHaveText('No vehicle')
  })

  test('refresh-required follow-up blocks additional preset writes until parameters are pulled again', async ({ page }) => {
    await connectToVehicle(page, 'demo')

    await applySingleTuningChange(page, '0.2')

    await openView(page, 'presets')
    await page.getByTestId('preset-card-flight-feel-balanced').click()
    await expect(page.getByTestId('preset-apply-ack')).not.toBeChecked()
    await page.getByTestId('preset-apply-ack').check()
    await expect(page.getByTestId('apply-preset-button')).toBeDisabled()

    await pullParameters(page)
    await expect(page.getByTestId('preset-apply-ack')).not.toBeChecked()
  })

  test('destructive acknowledgments reset when preset and snapshot diffs change', async ({ page }) => {
    await connectToVehicle(page, 'demo')

    await openView(page, 'snapshots')
    await page.getByTestId('snapshot-label-input').fill('Ack reset baseline')
    await page.getByTestId('capture-live-snapshot-button').click()
    await expect(page.getByText('Saved snapshot "Ack reset baseline" with 134 parameters.')).toBeVisible()

    await openView(page, 'presets')
    await page.getByTestId('preset-card-flight-feel-soft').click()
    await expect(page.getByTestId('preset-apply-ack')).not.toBeChecked()
    await page.getByTestId('preset-apply-ack').check()
    await expect(page.getByTestId('preset-apply-ack')).toBeChecked()

    await applySingleTuningChange(page, '0.2')

    await openView(page, 'presets')
    await expect(page.getByTestId('preset-apply-ack')).not.toBeChecked()

    await pullParameters(page)

    await openView(page, 'snapshots')
    await expect(page.getByTestId('snapshot-restore-ack')).not.toBeChecked()
    await page.getByTestId('snapshot-restore-ack').check()
    await expect(page.getByTestId('snapshot-restore-ack')).toBeChecked()

    await applySingleTuningChange(page, '0.24')

    await openView(page, 'snapshots')
    await expect(page.getByTestId('snapshot-restore-ack')).not.toBeChecked()
  })

  test('protected snapshots must be unprotected before deletion', async ({ page }) => {
    await connectToVehicle(page, 'demo')

    await openView(page, 'snapshots')
    await page.getByTestId('snapshot-label-input').fill('Protected baseline')
    await page.getByTestId('snapshot-protected-toggle').check()
    await page.getByTestId('capture-live-snapshot-button').click()

    await expect(page.getByText('Saved snapshot "Protected baseline" with 134 parameters.')).toBeVisible()
    await expect(page.getByTestId('delete-selected-snapshot-button')).toBeDisabled()

    await page.getByTestId('toggle-selected-snapshot-protection-button').click()
    await expect(page.getByText('is no longer protected.')).toBeVisible()
    await expect(page.getByTestId('delete-selected-snapshot-button')).toBeEnabled()
  })

  test('snapshot view degrades gracefully when browser local storage is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      const originalGetItem = Storage.prototype.getItem
      const originalSetItem = Storage.prototype.setItem

      Object.defineProperty(Storage.prototype, 'getItem', {
        configurable: true,
        value(this: Storage, key: string) {
          if (this === window.localStorage && key === 'arduconfig:snapshot-library') {
            throw new Error('local storage unavailable for test')
          }

          return originalGetItem.call(this, key)
        }
      })

      Object.defineProperty(Storage.prototype, 'setItem', {
        configurable: true,
        value(this: Storage, key: string, value: string) {
          if (this === window.localStorage && key === 'arduconfig:snapshot-library') {
            throw new Error('local storage unavailable for test')
          }

          return originalSetItem.call(this, key, value)
        }
      })
    })

    await connectToVehicle(page, 'demo')
    await openView(page, 'snapshots')
    await expect(page.getByText('Browser snapshot storage is unavailable.')).toBeVisible()

    await page.getByTestId('snapshot-label-input').fill('In-memory baseline')
    await page.getByTestId('capture-live-snapshot-button').click()
    await expect(page.getByText('Saved snapshot "In-memory baseline" with 134 parameters.')).toBeVisible()
  })
})
