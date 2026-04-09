import { app, BrowserWindow, shell } from 'electron'
import path from 'path'
import log from 'electron-log'
import { SkillManager } from '../services/skill-manager'
import { AppUpdater } from '../services/app-updater'
import { setupIpcHandlers } from '../ipc/handlers'
import { applyProxySettingsToElectronSession } from '../services/proxy-settings'

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'test'

let mainWindow: BrowserWindow | null = null
let skillManager: SkillManager | null = null
let appUpdater: AppUpdater | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    icon: path.join(__dirname, '../../../resources/icon.png'),
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 18 },
    vibrancy: 'under-window',
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(url)
      }
    } catch {
      // invalid URL, ignore
    }
    return { action: 'deny' }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(async () => {
  log.info('SkillPilot starting...')

  if (process.platform === 'darwin') {
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(__dirname, '../../../resources/icon.png')
    app.dock?.setIcon(iconPath)
  }

  skillManager = new SkillManager()
  appUpdater = new AppUpdater()

  await applyProxySettingsToElectronSession()
  setupIpcHandlers(skillManager, appUpdater)
  createWindow()

  try {
    await skillManager.refresh()
    log.info(`Detected ${skillManager.agents.filter(a => a.isInstalled).length} agents, ${skillManager.skills.length} skills`)
  } catch (err) {
    log.error('Initial refresh failed:', err)
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  skillManager?.destroy()
})
