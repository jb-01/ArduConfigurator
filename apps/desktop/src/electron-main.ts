import { app, BrowserWindow, shell } from 'electron'

import { desktopPlatformManifest } from './platform.js'
import { startHostedWebUi, type HostedWebUi } from './web-ui-server.js'

const DESKTOP_DEV_SERVER_URL = process.env.ARDUCONFIG_DESKTOP_DEV_SERVER_URL
const DESKTOP_DEVTOOLS = process.env.ARDUCONFIG_DESKTOP_DEVTOOLS === '1'

let hostedWebUi: HostedWebUi | undefined

app.name = 'ArduConfigurator'

void app.whenReady().then(async () => {
  hostedWebUi = DESKTOP_DEV_SERVER_URL ? undefined : await startHostedWebUi()
  await createMainWindow(hostedWebUi?.url ?? DESKTOP_DEV_SERVER_URL ?? 'http://127.0.0.1:4173')

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow(hostedWebUi?.url ?? DESKTOP_DEV_SERVER_URL ?? 'http://127.0.0.1:4173')
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  void hostedWebUi?.close().catch(() => {})
})

async function createMainWindow(startUrl: string): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    title: 'ArduConfigurator',
    autoHideMenuBar: true,
    backgroundColor: '#0b1014',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  configurePermissions(window)

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  await window.loadURL(startUrl)
  window.setTitle(`ArduConfigurator Desktop (${desktopPlatformManifest.intent})`)

  if (DESKTOP_DEVTOOLS) {
    window.webContents.openDevTools({ mode: 'detach' })
  }

  return window
}

function configurePermissions(window: BrowserWindow): void {
  const allowedOriginPrefixes = ['http://127.0.0.1:', 'http://localhost:']

  window.webContents.session.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    if (permission === 'serial') {
      return isAllowedOrigin(requestingOrigin, allowedOriginPrefixes)
    }

    return false
  })

  window.webContents.session.setDevicePermissionHandler((details) => {
    if (details.deviceType !== 'serial') {
      return false
    }

    return isAllowedOrigin(details.origin, allowedOriginPrefixes)
  })
}

function isAllowedOrigin(origin: string, allowedOriginPrefixes: string[]): boolean {
  return allowedOriginPrefixes.some((prefix) => origin.startsWith(prefix))
}
