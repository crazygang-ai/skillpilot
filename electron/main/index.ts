import { app, BrowserWindow, shell } from 'electron'
import path from 'path'
import log from 'electron-log'
import { SkillManager } from '../services/skill-manager'
import { setupIpcHandlers } from '../ipc/handlers'

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'test'

let mainWindow: BrowserWindow | null = null
const skillManager = new SkillManager()

function createWindow(): void {
  mainWindow = new BrowserWindow({
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
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
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
  setupIpcHandlers(skillManager)
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
  skillManager.destroy()
})
