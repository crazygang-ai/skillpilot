import { EventEmitter } from 'events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentType, type Skill } from '../../shared/types'
import { IPC_CHANNELS } from '../../shared/ipc'

function createSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'opaque-skill-id',
    storageName: 'shared-skill',
    directoryName: 'shared-skill',
    canonicalPath: '/Users/test/.agents/skills/shared-skill',
    metadata: {
      name: 'Shared Skill',
      description: 'Test skill',
    },
    markdownBody: '',
    scope: { kind: 'sharedGlobal' },
    installations: [],
    hasUpdate: false,
    updateStatus: 'notChecked',
    ...overrides,
  }
}

async function loadSkillManagerContract() {
  const removeSymlink = vi.fn()
  const createSymlink = vi.fn()
  const resolveCanonical = vi.fn((value: string) => value)
  const mockFs = {
    existsSync: vi.fn(() => true),
    rmSync: vi.fn(),
  }
  const removeEntry = vi.fn()
  const updateEntry = vi.fn()
  const invalidateCache = vi.fn()
  const createIfNotExists = vi.fn()
  const removeCommitHash = vi.fn()
  const getCommitHash = vi.fn()

  class MockWatcher extends EventEmitter {
    startWatching() {}
    stopWatching() {}
  }

  vi.doMock('fs', () => ({ default: mockFs }))
  vi.doMock('../../electron/services/agent-detector', () => ({
    detectAll: vi.fn().mockResolvedValue([]),
  }))
  vi.doMock('../../electron/services/skill-scanner', () => ({
    scanAll: vi.fn().mockResolvedValue([]),
  }))
  vi.doMock('../../electron/services/lock-file-manager', () => ({
    removeEntry,
    updateEntry,
    invalidateCache,
    createIfNotExists,
  }))
  vi.doMock('../../electron/services/symlink-manager', () => ({
    removeSymlink,
    createSymlink,
    resolveCanonical,
  }))
  vi.doMock('../../electron/services/git-service', () => ({
    isGitAvailable: vi.fn(),
    shallowClone: vi.fn(),
    scanSkillsInRepo: vi.fn(),
    extractOwnerRepo: vi.fn(),
    normalizeRepoURL: vi.fn(),
    getTreeHash: vi.fn(),
    getCommitHash: vi.fn(),
  }))
  vi.doMock('../../electron/services/commit-hash-cache', () => ({
    removeCommitHash,
    setCommitHash: vi.fn(),
    getCommitHash,
  }))
  vi.doMock('../../electron/services/skill-md-parser', () => ({
    serialize: vi.fn(),
  }))
  vi.doMock('../../electron/services/update-checker', () => ({
    checkSkillUpdate: vi.fn(),
  }))
  vi.doMock('../../electron/services/file-system-watcher', () => ({
    FileSystemWatcher: MockWatcher,
  }))

  const module = await import('../../electron/services/skill-manager')

  return {
    SkillManager: module.SkillManager,
    mockFs,
    removeSymlink,
    removeEntry,
    removeCommitHash,
  }
}

async function loadRemovalHandlerContract() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
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
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  }

  vi.doMock('electron', () => ({
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler)
      }),
    },
    shell: { showItemInFolder: vi.fn() },
    dialog: { showOpenDialog: vi.fn() },
    BrowserWindow: { getAllWindows: vi.fn(() => []) },
    app: { getVersion: vi.fn(() => '0.1.1') },
  }))
  vi.doMock('../../electron/services/skill-registry-service', () => ({
    leaderboard: vi.fn(),
    search: vi.fn(),
  }))
  vi.doMock('../../electron/services/skill-content-fetcher', () => ({
    fetchContent: vi.fn(),
  }))
  vi.doMock('../../electron/services/proxy-settings', () => ({
    getProxySettings: vi.fn(),
    setProxySettings: vi.fn(),
  }))

  const { setupIpcHandlers } = await import('../../electron/ipc/handlers')
  setupIpcHandlers(skillManager as never, appUpdater as never)

  return {
    handlers,
    skillManager,
  }
}

describe('skill removal contract', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('removes only the requested symlink installation without touching canonical storage', async () => {
    const { SkillManager, mockFs, removeSymlink, removeEntry, removeCommitHash } =
      await loadSkillManagerContract()
    const manager = new SkillManager()
    manager.skills = [
      createSkill({
        installations: [
          {
            agentType: AgentType.CLAUDE,
            path: '/Users/test/.claude/skills/shared-skill',
            isSymlink: true,
            isInherited: false,
          },
        ],
      }),
    ]
    vi.spyOn(manager, 'refresh').mockResolvedValue(undefined)

    await manager.removeLocalInstallation('opaque-skill-id', AgentType.CLAUDE)

    expect(removeSymlink).toHaveBeenCalledWith('shared-skill', AgentType.CLAUDE)
    expect(mockFs.rmSync).not.toHaveBeenCalledWith('/Users/test/.agents/skills/shared-skill', expect.anything())
    expect(removeEntry).not.toHaveBeenCalled()
    expect(removeCommitHash).not.toHaveBeenCalled()
  })

  it('removes only the requested direct local installation directory', async () => {
    const { SkillManager, mockFs, removeSymlink, removeEntry, removeCommitHash } =
      await loadSkillManagerContract()
    const manager = new SkillManager()
    manager.skills = [
      createSkill({
        installations: [
          {
            agentType: AgentType.CURSOR,
            path: '/Users/test/.cursor/skills/shared-skill',
            isSymlink: false,
            isInherited: false,
          },
        ],
      }),
    ]
    vi.spyOn(manager, 'refresh').mockResolvedValue(undefined)

    await manager.removeLocalInstallation('opaque-skill-id', AgentType.CURSOR)

    expect(mockFs.rmSync).toHaveBeenCalledWith('/Users/test/.cursor/skills/shared-skill', {
      recursive: true,
      force: true,
    })
    expect(mockFs.rmSync).not.toHaveBeenCalledWith('/Users/test/.agents/skills/shared-skill', expect.anything())
    expect(removeSymlink).not.toHaveBeenCalled()
    expect(removeEntry).not.toHaveBeenCalled()
    expect(removeCommitHash).not.toHaveBeenCalled()
  })

  it('keeps destructive delete behavior separate', async () => {
    const { SkillManager, mockFs, removeSymlink, removeEntry, removeCommitHash } =
      await loadSkillManagerContract()
    const manager = new SkillManager()
    manager.skills = [
      createSkill({
        installations: [
          {
            agentType: AgentType.CLAUDE,
            path: '/Users/test/.claude/skills/shared-skill',
            isSymlink: true,
            isInherited: false,
          },
        ],
      }),
    ]
    vi.spyOn(manager, 'refresh').mockResolvedValue(undefined)

    await manager.deleteSkill('opaque-skill-id')

    expect(removeSymlink).toHaveBeenCalledWith('shared-skill', AgentType.CLAUDE)
    expect(mockFs.rmSync).toHaveBeenCalledWith('/Users/test/.agents/skills/shared-skill', {
      recursive: true,
      force: true,
    })
    expect(removeEntry).toHaveBeenCalledWith('opaque-skill-id')
    expect(removeCommitHash).toHaveBeenCalledWith('opaque-skill-id')
  })

  it('routes the new IPC to removeLocalInstallation instead of destructive delete', async () => {
    const { handlers, skillManager } = await loadRemovalHandlerContract()
    const removeLocalInstallation = handlers.get(IPC_CHANNELS.SKILL.REMOVE_LOCAL_INSTALLATION)

    expect(removeLocalInstallation).toBeTypeOf('function')

    await removeLocalInstallation?.({}, {
      skillId: 'opaque-skill-id',
      agentType: AgentType.CLAUDE,
    })

    expect(skillManager.removeLocalInstallation).toHaveBeenCalledWith('opaque-skill-id', AgentType.CLAUDE)
    expect(skillManager.deleteSkill).not.toHaveBeenCalled()
  })
})
