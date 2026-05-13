import { expect, test, type Page } from '@playwright/test'

async function connectViaHeader(page: Page): Promise<void> {
  await page.getByTestId('transport-mode-select').selectOption('demo')
  await page.getByTestId('connect-button').click()
  await expect(page.getByTestId('session-vehicle-name')).toHaveText('ArduCopter')
}

async function openView(page: Page, viewId: string): Promise<void> {
  await page.getByTestId(`view-button-${viewId}`).click()
}

test.describe('disconnected landing screen', () => {
  test('renders pre-connect and is replaced by Setup after connect', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByTestId('disconnected-landing')).toBeVisible()
    await expect(page.getByTestId('landing-connect-button')).toBeVisible()
    await expect(page.getByTestId('landing-transport-select')).toBeVisible()
    await expect(page.getByTestId('landing-session-profile-select')).toBeVisible()

    await expect(page.getByRole('heading', { name: 'Configure your ArduPilot flight controller.' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What you can do' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Supported boards' })).toBeVisible()
  })

  test('landing connect button connects via demo transport', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByTestId('disconnected-landing')).toBeVisible()
    await page.getByTestId('landing-transport-select').selectOption('demo')
    await page.getByTestId('landing-connect-button').click()

    await expect(page.getByTestId('session-vehicle-name')).toHaveText('ArduCopter')
    await expect(page.getByTestId('disconnected-landing')).toHaveCount(0)
    await expect(page.getByTestId('workspace-view-title')).toHaveText('Setup')
  })
})

test.describe('Modes view', () => {
  test('renders six slot rows with the demo live slot highlighted', async ({ page }) => {
    await page.goto('/')
    await connectViaHeader(page)
    await openView(page, 'modes')

    await expect(page.getByTestId('workspace-view-title')).toHaveText('Modes')
    await expect(page.getByTestId('modes-slot-table')).toBeVisible()

    for (const slot of [1, 2, 3, 4, 5, 6]) {
      await expect(page.getByTestId(`modes-slot-${slot}`)).toBeVisible()
    }

    // Demo scenario has FLTMODE_CH = 7 and the mock holds the switch in slot 4's PWM range.
    await expect(page.getByText('CH7')).toBeVisible()
    await expect(page.getByTestId('modes-slot-4')).toHaveClass(/is-active/)

    await expect(page.getByTestId('modes-go-to-flight-mode-task')).toBeVisible()
  })

  test('deep-link button navigates to Receiver flight-mode task', async ({ page }) => {
    await page.goto('/')
    await connectViaHeader(page)
    await openView(page, 'modes')

    await page.getByTestId('modes-go-to-flight-mode-task').click()

    await expect(page.getByTestId('workspace-view-title')).toHaveText('Receiver')
  })
})

test.describe('Failsafe view', () => {
  test('renders the summary table populated from the demo scenario', async ({ page }) => {
    await page.goto('/')
    await connectViaHeader(page)
    await openView(page, 'failsafe')

    await expect(page.getByTestId('workspace-view-title')).toHaveText('Failsafe')
    await expect(page.getByTestId('failsafe-summary-table')).toBeVisible()

    // Demo scenario seeds these specific values; the rows should reflect them.
    await expect(page.getByTestId('failsafe-row-FS_THR_VALUE')).toContainText('975 us')
    await expect(page.getByTestId('failsafe-row-BATT_LOW_VOLT')).toContainText('14.40 V')
    await expect(page.getByTestId('failsafe-row-BATT_CRT_VOLT')).toContainText('13.80 V')

    await expect(page.getByTestId('failsafe-go-to-power')).toBeVisible()
  })

  test('deep-link button navigates to Power view', async ({ page }) => {
    await page.goto('/')
    await connectViaHeader(page)
    await openView(page, 'failsafe')

    await page.getByTestId('failsafe-go-to-power').click()

    await expect(page.getByTestId('workspace-view-title')).toHaveText('Power')
  })
})
