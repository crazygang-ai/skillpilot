import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc'

export const electronAPI = {
  // Agent
  agents: {
    detect: () => ipcRenderer.invoke(IPC_CHANNELS.AGENT.DETECT),
  },

  // Skills
  skills: {
    scanAll: () => ipcRenderer.invoke(IPC_CHANNELS.SKILL.SCAN_ALL),
    assign: (skillPath: string, agentType: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILL.ASSIGN, skillPath, agentType),
    unassign: (skillPath: string, agentType: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILL.UNASSIGN, skillPath, agentType),
    removeLocalInstallation: (input: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILL.REMOVE_LOCAL_INSTALLATION, input),
    delete: (skillId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILL.DELETE, skillId),
    install: (input: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILL.INSTALL, input),
    installFromLocal: (localPath: string, agentTypes: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILL.INSTALL_FROM_LOCAL, localPath, agentTypes),
    save: (skillId: string, metadata: unknown, body: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILL.SAVE, skillId, metadata, body),
    checkUpdate: (skillId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILL.CHECK_UPDATE, skillId),
    checkAllUpdates: () =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILL.CHECK_ALL_UPDATES),
    updateSkill: (skillId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILL.UPDATE_SKILL, skillId),
    onStateChanged: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on(IPC_CHANNELS.SKILL.ON_STATE_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SKILL.ON_STATE_CHANGED, handler)
    },
    onRefreshFailed: (callback: (message: string) => void) => {
      const handler = (_event: unknown, message: string) => callback(message)
      ipcRenderer.on(IPC_CHANNELS.SKILL.ON_REFRESH_FAILED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SKILL.ON_REFRESH_FAILED, handler)
    },
  },

  // Registry
  registry: {
    leaderboard: (category: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.REGISTRY.LEADERBOARD, category),
    search: (query: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.REGISTRY.SEARCH, query),
  },

  // Content Fetcher
  content: {
    fetch: (source: string, skillId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONTENT.FETCH, source, skillId),
  },

  // Filesystem
  fs: {
    revealInFinder: (path: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FS.REVEAL_IN_FINDER, path),
  },

  // Dialog
  dialog: {
    openDirectory: () =>
      ipcRenderer.invoke(IPC_CHANNELS.DIALOG.OPEN_DIRECTORY),
  },

  // Settings
  settings: {
    getProxy: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET_PROXY),
    setProxy: (settings: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.SET_PROXY, settings),
  },

  // Updater
  updater: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER.GET_STATE),
    getCurrentVersion: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER.GET_VERSION),
    checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER.CHECK_FOR_UPDATES),
    downloadUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER.DOWNLOAD_UPDATE),
    quitAndInstall: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER.QUIT_AND_INSTALL),
    onStateChanged: (callback: (state: unknown) => void) => {
      const handler = (_event: unknown, state: unknown) => callback(state)
      ipcRenderer.on(IPC_CHANNELS.UPDATER.ON_STATE_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATER.ON_STATE_CHANGED, handler)
    },
  },

  // Watcher
  watcher: {
    onChange: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on(IPC_CHANNELS.WATCHER.ON_CHANGE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.WATCHER.ON_CHANGE, handler)
    },
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
