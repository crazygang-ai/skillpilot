import { EventEmitter } from 'events'
import { app } from 'electron'
import { autoUpdater, type UpdateDownloadedEvent, type UpdateInfo, type ProgressInfo } from 'electron-updater'
import type { AppUpdateInfo, AppUpdateProgress, AppUpdateState } from '../../shared/types'

type UpdaterLike = EventEmitter & {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  checkForUpdates: () => Promise<unknown>
  downloadUpdate: () => Promise<unknown>
  quitAndInstall: () => void
}

interface AppUpdaterOptions {
  currentVersion?: string
  isPackaged?: boolean
  updater?: UpdaterLike
}

export class AppUpdater extends EventEmitter {
  private readonly updater: UpdaterLike
  private state: AppUpdateState
  private disposed = false

  constructor(options: AppUpdaterOptions = {}) {
    super()

    const currentVersion = options.currentVersion ?? app.getVersion()
    const isSupported = options.isPackaged ?? app.isPackaged

    this.updater = options.updater ?? (autoUpdater as unknown as UpdaterLike)
    this.state = {
      currentVersion,
      status: isSupported ? 'idle' : 'unsupported',
      isSupported,
    }

    if (!isSupported) {
      return
    }

    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = false

    this.updater.on('checking-for-update', () => {
      this.setState({
        status: 'checking',
        errorMessage: undefined,
      })
    })

    this.updater.on('update-available', (info: UpdateInfo) => {
      this.setState({
        status: 'available',
        info: normalizeInfo(info),
        errorMessage: undefined,
        lastCheckedAt: new Date().toISOString(),
      })
    })

    this.updater.on('update-not-available', (info: UpdateInfo) => {
      this.setState({
        status: 'not-available',
        info: normalizeInfo(info),
        progress: undefined,
        errorMessage: undefined,
        lastCheckedAt: new Date().toISOString(),
      })
    })

    this.updater.on('download-progress', (progress: ProgressInfo) => {
      this.setState({
        status: 'downloading',
        progress: normalizeProgress(progress),
        errorMessage: undefined,
      })
    })

    this.updater.on('update-downloaded', (info: UpdateDownloadedEvent) => {
      this.setState({
        status: 'downloaded',
        info: normalizeInfo(info),
        errorMessage: undefined,
        lastCheckedAt: new Date().toISOString(),
      })
    })

    this.updater.on('error', (error: Error) => {
      this.setState({
        status: 'error',
        progress: undefined,
        errorMessage: error.message,
      })
    })
  }

  getState(): AppUpdateState {
    return cloneState(this.state)
  }

  async checkForUpdates(): Promise<AppUpdateState> {
    this.ensureSupported()
    this.setState({
      status: 'checking',
      errorMessage: undefined,
    })
    try {
      await this.updater.checkForUpdates()
    } catch (error) {
      this.setState({
        status: 'error',
        progress: undefined,
        errorMessage: error instanceof Error ? error.message : 'Failed to check for updates.',
      })
      throw error
    }
    return this.getState()
  }

  async downloadUpdate(): Promise<AppUpdateState> {
    this.ensureSupported()
    if (this.state.status !== 'available') {
      throw new Error('No available update to download.')
    }

    try {
      await this.updater.downloadUpdate()
    } catch (error) {
      this.setState({
        status: 'error',
        progress: undefined,
        errorMessage: error instanceof Error ? error.message : 'Failed to download update.',
      })
      throw error
    }
    return this.getState()
  }

  async quitAndInstall(): Promise<void> {
    this.ensureSupported()
    if (this.state.status !== 'downloaded') {
      throw new Error('No downloaded update ready to install.')
    }

    this.updater.quitAndInstall()
  }

  destroy(): void {
    if (this.disposed) return
    this.disposed = true
    this.updater.removeAllListeners()
    this.removeAllListeners()
  }

  private ensureSupported(): void {
    if (!this.state.isSupported) {
      throw new Error('Automatic app updates are not supported in this build.')
    }
  }

  private setState(patch: Partial<AppUpdateState>): void {
    this.state = {
      ...this.state,
      ...patch,
    }
    this.emit('stateChanged', this.getState())
  }
}

function normalizeInfo(info?: UpdateInfo): AppUpdateInfo | undefined {
  if (!info) {
    return undefined
  }

  const releaseNotes = Array.isArray(info.releaseNotes)
    ? info.releaseNotes
      .map((entry) => entry.note)
      .filter(Boolean)
      .join('\n\n')
    : info.releaseNotes ?? undefined

  return {
    version: info.version,
    releaseNotes,
  }
}

function normalizeProgress(progress: ProgressInfo): AppUpdateProgress {
  return {
    percent: progress.percent,
    bytesPerSecond: progress.bytesPerSecond,
    transferred: progress.transferred,
    total: progress.total,
  }
}

function cloneState(state: AppUpdateState): AppUpdateState {
  return {
    ...state,
    info: state.info ? { ...state.info } : undefined,
    progress: state.progress ? { ...state.progress } : undefined,
  }
}
