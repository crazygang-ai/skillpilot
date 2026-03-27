import type { ElectronAPI } from '../../electron/preload/index'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

const api: ElectronAPI = new Proxy({} as ElectronAPI, {
  get(_, prop: string) {
    return window.electronAPI?.[prop as keyof ElectronAPI]
  },
})

export default api
