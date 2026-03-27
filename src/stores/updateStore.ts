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
    } catch {
      // Main process stateChanged events drive the user-visible error state.
    }
  },

  downloadUpdate: async () => {
    try {
      await api.updater.downloadUpdate()
    } catch {
      // Main process stateChanged events drive the user-visible error state.
    }
  },

  quitAndInstall: async () => {
    try {
      await api.updater.quitAndInstall()
    } catch {
      // The app may terminate before a response returns, so callers should not rely on resolution.
    }
  },
}))
