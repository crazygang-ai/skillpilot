import { create } from 'zustand'
import type { ProxySettings } from '@/types'

interface SettingsState {
  proxy: ProxySettings
  language: string
  loadProxy: () => Promise<void>
  saveProxy: (proxy: ProxySettings) => Promise<void>
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
      const proxy = await window.electronAPI.settings.getProxy()
      set({ proxy })
    } catch {
      // ignore
    }
  },

  saveProxy: async (proxy) => {
    await window.electronAPI.settings.setProxy(proxy)
    set({ proxy })
  },

  setLanguage: (lang) => {
    localStorage.setItem('skillpilot:language', lang)
    set({ language: lang })
  },
}))
