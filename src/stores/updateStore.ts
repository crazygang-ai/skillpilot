import { create } from 'zustand'
import type { AppUpdateState } from '../../shared/types'
import api from '@/services/ipcClient'

interface UpdateStoreState extends AppUpdateState {
  initialized: boolean
  appUpdatesSupported: boolean
  hydrate: (state: AppUpdateState) => void
  init: () => Promise<void>
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  quitAndInstall: () => Promise<void>
}

const DEFAULT_UPDATE_STATE: AppUpdateState = {
  currentVersion: '0.1.0',
  status: 'unsupported',
  isSupported: false,
}

export const useUpdateStore = create<UpdateStoreState>((set, get) => ({
  ...DEFAULT_UPDATE_STATE,
  initialized: false,
  appUpdatesSupported: false,
  hydrate: (state) => {
    set({
      ...state,
      initialized: true,
      appUpdatesSupported: state.isSupported,
    })
  },

  init: async () => {
    if (get().initialized) return
    try {
      const state = await api.updater.getState()
      get().hydrate(state)
    } catch {
      try {
        const currentVersion = await api.updater.getCurrentVersion()
        set({
          currentVersion,
          initialized: true,
        })
      } catch {
        set({ initialized: true })
      }
    }
  },

  checkForUpdates: async () => {
    try {
      await api.updater.checkForUpdates()
    } catch (err) {
      console.warn('checkForUpdates IPC call failed (UI state driven by events):', err)
    }
  },

  downloadUpdate: async () => {
    try {
      await api.updater.downloadUpdate()
    } catch (err) {
      console.warn('downloadUpdate IPC call failed (UI state driven by events):', err)
    }
  },

  quitAndInstall: async () => {
    try {
      await api.updater.quitAndInstall()
    } catch (err) {
      console.warn('quitAndInstall IPC call failed (app may have terminated):', err)
    }
  },
}))
