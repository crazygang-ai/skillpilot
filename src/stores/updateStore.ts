import { create } from 'zustand'

interface UpdateState {
  currentVersion: string
  initialized: boolean
  appUpdatesSupported: boolean
  init: () => Promise<void>
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  currentVersion: '0.1.0',
  initialized: false,
  appUpdatesSupported: false,

  init: async () => {
    if (get().initialized) return
    try {
      const version = await window.electronAPI.updater.getCurrentVersion()
      set({ currentVersion: version, initialized: true })
    } catch {
      set({ initialized: true })
    }
  },
}))
