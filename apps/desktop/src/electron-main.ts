import { basename } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'

import { createDesktopWebPreferences } from './electron-window-options.js'
import { desktopPlatformManifest } from './platform.js'
import { startHostedWebUi, type HostedWebUi } from './web-ui-server.js'

const DESKTOP_DEV_SERVER_URL = process.env.ARDUCONFIG_DESKTOP_DEV_SERVER_URL
const DESKTOP_DEVTOOLS = process.env.ARDUCONFIG_DESKTOP_DEVTOOLS === '1'
const PRELOAD_PATH = fileURLToPath(new URL('./preload.js', import.meta.url))

let hostedWebUi: HostedWebUi | undefined

app.name = 'ArduConfigurator'

void app.whenReady().then(async () => {
  registerDesktopSnapshotFileHandlers()
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
    webPreferences: createDesktopWebPreferences(PRELOAD_PATH)
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

function registerDesktopSnapshotFileHandlers(): void {
  ipcMain.handle('desktop:snapshots:open-file', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open Snapshot or Library',
      properties: ['openFile'],
      filters: [
        { name: 'JSON files', extensions: ['json'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return undefined
    }

    const targetPath = result.filePaths[0]
    return {
      path: targetPath,
      name: basename(targetPath),
      contents: await readFile(targetPath, 'utf8')
    }
  })

  ipcMain.handle('desktop:snapshots:save-library', async (_event, request: DesktopSaveFileRequest) =>
    saveTextFileWithDialog(request, 'arduconfig-snapshot-library.json')
  )
  ipcMain.handle('desktop:snapshots:save-backup', async (_event, request: DesktopSaveFileRequest) =>
    saveTextFileWithDialog(request, 'arduconfig-snapshot.json')
  )
}

interface DesktopSaveFileRequest {
  title: string
  suggestedName: string
  contents: string
  existingPath?: string
}

async function saveTextFileWithDialog(
  request: DesktopSaveFileRequest,
  fallbackName: string
): Promise<{ path: string; name: string } | undefined> {
  const targetPath =
    request.existingPath ||
    (
      await dialog.showSaveDialog({
        title: request.title,
        defaultPath: request.suggestedName.trim() || fallbackName,
        filters: [
          { name: 'JSON files', extensions: ['json'] },
          { name: 'All files', extensions: ['*'] }
        ]
      })
    ).filePath

  if (!targetPath) {
    return undefined
  }

  await writeFile(targetPath, request.contents, 'utf8')
  return {
    path: targetPath,
    name: basename(targetPath)
  }
}
