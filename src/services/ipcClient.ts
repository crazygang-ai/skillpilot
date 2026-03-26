import type { ElectronAPI } from '../../electron/preload/index'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

const api = window.electronAPI

export default api
