import { create } from 'zustand'
import type { ProxySettings, SetProxySettingsInput } from '@/types'
import api from '@/services/ipcClient'

interface SettingsState {
  proxy: ProxySettings
  language: string
  loadProxy: () => Promise<void>
  saveProxy: (input: SetProxySettingsInput) => Promise<void>
  setLanguage: (lang: string) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  proxy: {
    isEnabled: false,
    type: 'https',
    host: '',
    port: 0,
    bypassList: [],
  },
  language: localStorage.getItem('skillpilot:language') ?? 'en',

  loadProxy: async () => {
    try {
      const proxy = await api.settings.getProxy()
      set({ proxy })
    } catch {
      // ignore
    }
  },

  saveProxy: async (input) => {
    await api.settings.setProxy(input)
    set({ proxy: input.proxy })
  },

  setLanguage: (lang) => {
    localStorage.setItem('skillpilot:language', lang)
    set({ language: lang })
  },
}))
