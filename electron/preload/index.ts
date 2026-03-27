import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  // Agent
  agents: {
    detect: () => ipcRenderer.invoke('agent:detect'),
  },

  // Skills
  skills: {
    scanAll: () => ipcRenderer.invoke('skill:scanAll'),
    assign: (skillPath: string, agentType: string) =>
      ipcRenderer.invoke('skill:assign', skillPath, agentType),
    unassign: (skillPath: string, agentType: string) =>
      ipcRenderer.invoke('skill:unassign', skillPath, agentType),
    delete: (skillId: string) =>
      ipcRenderer.invoke('skill:delete', skillId),
    install: (input: unknown) =>
      ipcRenderer.invoke('skill:install', input),
    installFromLocal: (localPath: string, agentTypes: string[]) =>
      ipcRenderer.invoke('skill:installFromLocal', localPath, agentTypes),
    save: (skillId: string, metadata: unknown, body: string) =>
      ipcRenderer.invoke('skill:save', skillId, metadata, body),
    checkUpdate: (skillId: string) =>
      ipcRenderer.invoke('skill:checkUpdate', skillId),
    checkAllUpdates: () =>
      ipcRenderer.invoke('skill:checkAllUpdates'),
    updateSkill: (skillId: string) =>
      ipcRenderer.invoke('skill:updateSkill', skillId),
  },

  // Registry
  registry: {
    leaderboard: (category: string) =>
      ipcRenderer.invoke('registry:leaderboard', category),
    search: (query: string) =>
      ipcRenderer.invoke('registry:search', query),
  },

  // Content Fetcher
  content: {
    fetch: (source: string, skillId: string) =>
      ipcRenderer.invoke('content:fetch', source, skillId),
  },

  // Filesystem
  fs: {
    revealInFinder: (path: string) =>
      ipcRenderer.invoke('fs:revealInFinder', path),
    exportToDesktop: (skillPath: string) =>
      ipcRenderer.invoke('fs:exportToDesktop', skillPath),
  },

  // Dialog
  dialog: {
    openFileOrFolder: () =>
      ipcRenderer.invoke('dialog:openFileOrFolder'),
  },

  // Settings
  settings: {
    getProxy: () => ipcRenderer.invoke('settings:getProxy'),
    setProxy: (settings: unknown) =>
      ipcRenderer.invoke('settings:setProxy', settings),
  },

  // Updater
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:checkForUpdates'),
    downloadUpdate: () => ipcRenderer.invoke('updater:downloadUpdate'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall'),
    getCurrentVersion: () => ipcRenderer.invoke('updater:getCurrentVersion'),
    setAutoDownload: (value: boolean) =>
      ipcRenderer.invoke('updater:setAutoDownload', value),
    onUpdateStatus: (callback: (status: unknown) => void) => {
      const handler = (_event: unknown, status: unknown) => callback(status)
      ipcRenderer.on('updater:status', handler)
      return () => ipcRenderer.removeListener('updater:status', handler)
    },
  },

  // Watcher
  watcher: {
    onChange: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('watcher:onChange', handler)
      return () => ipcRenderer.removeListener('watcher:onChange', handler)
    },
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
