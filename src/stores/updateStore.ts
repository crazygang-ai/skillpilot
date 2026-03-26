import { create } from 'zustand'
import type { AppUpdateStatus, AppUpdateInfo, AppUpdateProgress } from '@/types'

interface UpdateState {
  status: AppUpdateStatus
  info: AppUpdateInfo | null
  progress: AppUpdateProgress | null
  error: string | null
  currentVersion: string
  autoDownload: boolean
  initialized: boolean
  init: () => Promise<void>
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  quitAndInstall: () => void
  setAutoDownload: (value: boolean) => void
  dismissUpdate: () => void
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: 'idle',
  info: null,
  progress: null,
  error: null,
  currentVersion: '0.1.0',
  autoDownload: localStorage.getItem('skillpilot:autoDownload') === 'true',
  initialized: false,

  init: async () => {
    if (get().initialized) return
    try {
      const version = await window.electronAPI.updater.getCurrentVersion()
      set({ currentVersion: version, initialized: true })
      window.electronAPI.updater.onUpdateStatus((statusData: unknown) => {
        const data = statusData as { status: AppUpdateStatus; info?: AppUpdateInfo; progress?: AppUpdateProgress; error?: string }
        set({
          status: data.status,
          info: data.info ?? null,
          progress: data.progress ?? null,
          error: data.error ?? null,
        })
      })
    } catch {
      set({ initialized: true })
    }
  },

  checkForUpdates: async () => {
    set({ status: 'checking' })
    await window.electronAPI.updater.checkForUpdates()
  },

  downloadUpdate: async () => {
    await window.electronAPI.updater.downloadUpdate()
  },

  quitAndInstall: () => {
    window.electronAPI.updater.quitAndInstall()
  },

  setAutoDownload: (value) => {
    localStorage.setItem('skillpilot:autoDownload', String(value))
    set({ autoDownload: value })
    window.electronAPI.updater.setAutoDownload(value)
  },

  dismissUpdate: () => {
    const { status } = get()
    if (['available', 'error', 'not-available'].includes(status)) {
      set({ status: 'idle' })
    }
  },
}))
