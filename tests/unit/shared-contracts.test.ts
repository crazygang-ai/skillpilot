import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '../../src/i18n/en'
import zh from '../../src/i18n/zh'
import { IPC_CHANNELS } from '../../shared/ipc'
import { AgentType } from '../../shared/types'

async function loadPreloadContract() {
  let exposedApi: unknown
  const invoke = vi.fn()
  const on = vi.fn()
  const removeListener = vi.fn()

  vi.doMock('electron', () => ({
    contextBridge: {
      exposeInMainWorld: vi.fn((_key: string, api: unknown) => {
        exposedApi = api
      }),
    },
    ipcRenderer: {
      invoke,
      on,
      removeListener,
    },
  }))

  await import('../../electron/preload/index')

  return {
    exposedApi: exposedApi as Record<string, unknown>,
    invoke,
    on,
    removeListener,
  }
}

async function loadHandlersContract() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const setProxySettings = vi.fn()
  const getProxySettings = vi.fn(() => ({
    isEnabled: false,
    type: 'https',
    host: '',
    port: 0,
    bypassList: [],
  }))
  const skillManager = {
    agents: [],
    skills: [],
    refresh: vi.fn(),
    assignSkillToAgent: vi.fn(),
    removeSkillFromAgent: vi.fn(),
    removeLocalInstallation: vi.fn().mockResolvedValue(undefined),
    deleteSkill: vi.fn(),
    installFromRemote: vi.fn().mockResolvedValue({ success: true }),
    installFromLocal: vi.fn().mockResolvedValue({ success: true }),
    saveSkillMD: vi.fn().mockResolvedValue(undefined),
    checkForUpdate: vi.fn().mockResolvedValue(undefined),
    checkAllUpdates: vi.fn().mockResolvedValue(undefined),
    updateSkill: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  }
  const appUpdater = {
    getState: vi.fn().mockReturnValue({
      currentVersion: '0.1.1',
      status: 'idle',
      isSupported: true,
    }),
    checkForUpdates: vi.fn().mockResolvedValue({
      currentVersion: '0.1.1',
      status: 'checking',
      isSupported: true,
    }),
    downloadUpdate: vi.fn().mockResolvedValue({
      currentVersion: '0.1.1',
      status: 'downloading',
      isSupported: true,
    }),
    quitAndInstall: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  }

  vi.doMock('electron', () => ({
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler)
      }),
    },
    shell: {
      showItemInFolder: vi.fn(),
    },
    dialog: {
      showOpenDialog: vi.fn(),
    },
    BrowserWindow: {
      getAllWindows: vi.fn(() => []),
    },
    app: {
      getVersion: vi.fn(() => '0.1.1'),
    },
  }))

  vi.doMock('../../electron/services/skill-registry-service', () => ({
    leaderboard: vi.fn(),
    search: vi.fn(),
  }))

  vi.doMock('../../electron/services/skill-content-fetcher', () => ({
    fetchContent: vi.fn(),
  }))

  vi.doMock('../../electron/services/proxy-settings', () => ({
    getProxySettings,
    setProxySettings,
  }))

  const { setupIpcHandlers } = await import('../../electron/ipc/handlers')
  setupIpcHandlers(skillManager as never, appUpdater as never)

  return {
    appUpdater,
    handlers,
    setProxySettings,
    skillManager,
  }
}

describe('shared contracts', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('exposes only supported IPC channel groups', () => {
    expect(Object.keys(IPC_CHANNELS).sort()).toEqual([
      'AGENT',
      'CONTENT',
      'DIALOG',
      'FS',
      'REGISTRY',
      'SETTINGS',
      'SKILL',
      'UPDATER',
      'WATCHER',
    ])
  })

  it('does not keep stale desktop export channels around', () => {
    expect(Object.keys(IPC_CHANNELS.FS).sort()).toEqual(['REVEAL_IN_FINDER'])
    expect('EXPORT_TO_DESKTOP' in IPC_CHANNELS.SKILL).toBe(false)
  })

  it('does not keep placeholder updater channels around', () => {
    expect(Object.keys(IPC_CHANNELS.UPDATER).sort()).toEqual([
      'CHECK_FOR_UPDATES',
      'DOWNLOAD_UPDATE',
      'GET_STATE',
      'GET_VERSION',
      'ON_STATE_CHANGED',
      'QUIT_AND_INSTALL',
    ])
  })

  it('does not expose desktop export in preload', async () => {
    const { exposedApi } = await loadPreloadContract()

    expect(Object.keys(exposedApi.fs as Record<string, unknown>).sort()).toEqual([
      'revealInFinder',
    ])
  })

  it('does not expose unsupported updater actions in preload', async () => {
    const { exposedApi } = await loadPreloadContract()

    expect(Object.keys(exposedApi.updater as Record<string, unknown>).sort()).toEqual([
      'checkForUpdates',
      'downloadUpdate',
      'getCurrentVersion',
      'getState',
      'onStateChanged',
      'quitAndInstall',
    ])
  })

  it('exposes the supported skill api surface in preload', async () => {
    const { exposedApi } = await loadPreloadContract()

    expect(Object.keys(exposedApi.skills as Record<string, unknown>).sort()).toEqual([
      'assign',
      'checkAllUpdates',
      'checkUpdate',
      'delete',
      'install',
      'installFromLocal',
      'onStateChanged',
      'removeLocalInstallation',
      'save',
      'scanAll',
      'unassign',
      'updateSkill',
    ])
  })

  it('rejects malformed remote install payloads before touching the skill manager', async () => {
    const { handlers, skillManager } = await loadHandlersContract()
    const install = handlers.get(IPC_CHANNELS.SKILL.INSTALL)

    expect(install).toBeTypeOf('function')

    await expect(
      install?.({}, {
        source: 'github',
        agentTypes: [AgentType.CLAUDE],
      }),
    ).rejects.toThrow()

    expect(skillManager.installFromRemote).not.toHaveBeenCalled()
  })

  it('rejects malformed save payloads before writing skill files', async () => {
    const { handlers, skillManager } = await loadHandlersContract()
    const save = handlers.get(IPC_CHANNELS.SKILL.SAVE)

    expect(save).toBeTypeOf('function')

    await expect(
      save?.({}, 'skill-1', null, 123),
    ).rejects.toThrow()

    expect(skillManager.saveSkillMD).not.toHaveBeenCalled()
  })

  it('rejects malformed proxy settings payloads', async () => {
    const { handlers, setProxySettings } = await loadHandlersContract()
    const setProxy = handlers.get(IPC_CHANNELS.SETTINGS.SET_PROXY)

    expect(setProxy).toBeTypeOf('function')

    await expect(
      setProxy?.({}, {
        isEnabled: true,
        type: 'invalid',
        host: 'proxy.example.com',
        port: '8080',
        bypassList: 'localhost',
      }),
    ).rejects.toThrow()

    expect(setProxySettings).not.toHaveBeenCalled()
  })

  it('rejects malformed remove-local payloads before touching the skill manager', async () => {
    const { handlers, skillManager } = await loadHandlersContract()
    const removeLocal = handlers.get(IPC_CHANNELS.SKILL.REMOVE_LOCAL_INSTALLATION)

    expect(removeLocal).toBeTypeOf('function')

    await expect(
      removeLocal?.({}, {
        skillId: '',
        agentType: 'not-an-agent',
      }),
    ).rejects.toThrow()

    expect(skillManager.removeLocalInstallation).not.toHaveBeenCalled()
  })

  it('exposes app updater handlers through IPC', async () => {
    const { appUpdater, handlers } = await loadHandlersContract()

    const getState = handlers.get(IPC_CHANNELS.UPDATER.GET_STATE)
    const checkForUpdates = handlers.get(IPC_CHANNELS.UPDATER.CHECK_FOR_UPDATES)
    const downloadUpdate = handlers.get(IPC_CHANNELS.UPDATER.DOWNLOAD_UPDATE)
    const quitAndInstall = handlers.get(IPC_CHANNELS.UPDATER.QUIT_AND_INSTALL)

    await expect(getState?.({})).resolves.toEqual({
      currentVersion: '0.1.1',
      status: 'idle',
      isSupported: true,
    })
    await expect(checkForUpdates?.({})).resolves.toEqual({
      currentVersion: '0.1.1',
      status: 'checking',
      isSupported: true,
    })
    await expect(downloadUpdate?.({})).resolves.toEqual({
      currentVersion: '0.1.1',
      status: 'downloading',
      isSupported: true,
    })
    await expect(quitAndInstall?.({})).resolves.toBeUndefined()

    expect(appUpdater.getState).toHaveBeenCalledTimes(1)
    expect(appUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(appUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
    expect(appUpdater.quitAndInstall).toHaveBeenCalledTimes(1)
    expect(appUpdater.on).toHaveBeenCalledWith('stateChanged', expect.any(Function))
  })

  it('keeps sidebar translations aligned across locales', () => {
    const expectedKeys = [
      'allAgents',
      'checkAllUpdates',
      'dashboard',
      'refresh',
      'settings',
      'skillsSh',
    ]

    expect(Object.keys(en.sidebar).sort()).toEqual(expectedKeys)
    expect(Object.keys(zh.sidebar).sort()).toEqual(expectedKeys)
  })

  it('keeps Task 12 i18n sections aligned across locales', () => {
    expect(Object.keys(en.registry).sort()).toEqual(Object.keys(zh.registry).sort())
    expect(Object.keys(en.settings).sort()).toEqual(Object.keys(zh.settings).sort())
    expect(Object.keys(en.skillDetail).sort()).toEqual(Object.keys(zh.skillDetail).sort())
    expect(Object.keys(en.install.local).sort()).toEqual(Object.keys(zh.install.local).sort())
  })
})
