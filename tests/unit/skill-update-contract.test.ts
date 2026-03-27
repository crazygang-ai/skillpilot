/** @vitest-environment jsdom */

import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import React, { useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  Skill,
  SkillUpdateApplyResult,
  SkillUpdateCheckResult,
} from '../../shared/types'
import { IPC_CHANNELS } from '../../shared/ipc'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const tempDirs: string[] = []

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
    lockEntry: {
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner/repo',
      skillPath: 'skills/shared-skill/SKILL.md',
      skillFolderHash: 'local-tree',
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    ...overrides,
  }
}

function createTempDir(prefix: string): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempDirs.push(tempDir)
  return tempDir
}

function writeFiles(baseDir: string, files: Record<string, string>): void {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(baseDir, relativePath)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, contents)
  }
}

function createCommittedSkillRepo(skillFolder: string, files: Record<string, string>) {
  const tempDir = createTempDir('skillpilot-update-repo-')
  const repoDir = path.join(tempDir, 'repo')
  const skillDir = path.join(repoDir, skillFolder)

  fs.mkdirSync(skillDir, { recursive: true })
  writeFiles(skillDir, files)

  execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' })
  execFileSync('git', ['add', '.'], { cwd: repoDir, stdio: 'ignore' })
  execFileSync('git', ['commit', '-m', 'init'], {
    cwd: repoDir,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'SkillPilot Tests',
      GIT_AUTHOR_EMAIL: 'tests@example.com',
      GIT_COMMITTER_NAME: 'SkillPilot Tests',
      GIT_COMMITTER_EMAIL: 'tests@example.com',
    },
  })

  return {
    repoDir,
    remoteTreeHash: execFileSync('git', ['rev-parse', `HEAD:${skillFolder}`], {
      cwd: repoDir,
      encoding: 'utf8',
    }).trim(),
    remoteCommitHash: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoDir,
      encoding: 'utf8',
    }).trim(),
  }
}

async function loadSkillManagerContract(options?: {
  updateCheckResult?: SkillUpdateCheckResult
  shallowCloneError?: Error
}) {
  const updateCheckResult = options?.updateCheckResult ?? {
    skillId: 'opaque-skill-id',
    status: 'hasUpdate',
    hasUpdate: true,
    remoteTreeHash: 'remote-tree',
    remoteCommitHash: 'remote-commit',
  }

  const mockFs = {
    existsSync: vi.fn(() => true),
    rmSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(),
    copyFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
  }
  const updateEntry = vi.fn()
  const getCommitHash = vi.fn()
  const updateChecker = {
    checkSkillUpdate: vi.fn().mockResolvedValue(updateCheckResult),
  }
  const gitService = {
    isGitAvailable: vi.fn(),
    shallowClone: options?.shallowCloneError
      ? vi.fn().mockRejectedValue(options.shallowCloneError)
      : vi.fn().mockResolvedValue('/tmp/repo'),
    scanSkillsInRepo: vi.fn(),
    extractOwnerRepo: vi.fn(),
    normalizeRepoURL: vi.fn(),
    getTreeHash: vi.fn().mockResolvedValue('remote-tree'),
    getCommitHash: vi.fn().mockResolvedValue('remote-commit'),
  }

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
    updateEntry,
    removeEntry: vi.fn(),
    invalidateCache: vi.fn(),
    createIfNotExists: vi.fn(),
  }))
  vi.doMock('../../electron/services/symlink-manager', () => ({
    removeSymlink: vi.fn(),
    createSymlink: vi.fn(),
    resolveCanonical: vi.fn((value: string) => value),
  }))
  vi.doMock('../../electron/services/git-service', () => gitService)
  vi.doMock('../../electron/services/commit-hash-cache', () => ({
    removeCommitHash: vi.fn(),
    setCommitHash: vi.fn(),
    getCommitHash,
  }))
  vi.doMock('../../electron/services/skill-md-parser', () => ({
    serialize: vi.fn(),
  }))
  vi.doMock('../../electron/services/update-checker', () => updateChecker)
  vi.doMock('../../electron/services/file-system-watcher', () => ({
    FileSystemWatcher: MockWatcher,
  }))

  const module = await import('../../electron/services/skill-manager')

  return {
    SkillManager: module.SkillManager,
    updateChecker,
    gitService,
  }
}

async function loadSkillManagerWithRealUpdateCheck(options: {
  repoDir: string
}) {
  const updateEntry = vi.fn()
  const getCommitHash = vi.fn()
  const actualGitService = await vi.importActual<typeof import('../../electron/services/git-service')>(
    '../../electron/services/git-service',
  )

  class MockWatcher extends EventEmitter {
    startWatching() {}
    stopWatching() {}
  }

  vi.doMock('electron', () => ({
    app: { getVersion: vi.fn(() => '0.1.1') },
  }))
  vi.doMock('../../electron/services/agent-detector', () => ({
    detectAll: vi.fn().mockResolvedValue([]),
  }))
  vi.doMock('../../electron/services/skill-scanner', () => ({
    scanAll: vi.fn().mockResolvedValue([]),
  }))
  vi.doMock('../../electron/services/lock-file-manager', () => ({
    updateEntry,
    removeEntry: vi.fn(),
    invalidateCache: vi.fn(),
    createIfNotExists: vi.fn(),
  }))
  vi.doMock('../../electron/services/symlink-manager', () => ({
    removeSymlink: vi.fn(),
    createSymlink: vi.fn(),
    resolveCanonical: vi.fn((value: string) => value),
  }))
  vi.doMock('../../electron/services/git-service', () => ({
    ...actualGitService,
    shallowClone: vi.fn().mockResolvedValue(options.repoDir),
  }))
  vi.doMock('../../electron/services/commit-hash-cache', () => ({
    removeCommitHash: vi.fn(),
    setCommitHash: vi.fn(),
    getCommitHash,
  }))
  vi.doUnmock('fs')
  vi.doUnmock('../../electron/services/update-checker')
  vi.doMock('../../electron/services/skill-md-parser', () => ({
    serialize: vi.fn(),
  }))
  vi.doMock('../../electron/services/file-system-watcher', () => ({
    FileSystemWatcher: MockWatcher,
  }))

  const module = await import('../../electron/services/skill-manager')

  return {
    SkillManager: module.SkillManager,
    updateEntry,
  }
}

async function loadHandlerContract() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const checkResult: SkillUpdateCheckResult = {
    skillId: 'opaque-skill-id',
    status: 'hasUpdate',
    hasUpdate: true,
    remoteTreeHash: 'remote-tree',
    remoteCommitHash: 'remote-commit',
  }
  const updateResult: SkillUpdateApplyResult = {
    skillId: 'opaque-skill-id',
    status: 'updated',
    remoteTreeHash: 'remote-tree',
    remoteCommitHash: 'remote-commit',
  }
  const skillManager = {
    agents: [],
    skills: [],
    refresh: vi.fn(),
    assignSkillToAgent: vi.fn(),
    removeSkillFromAgent: vi.fn(),
    removeLocalInstallation: vi.fn(),
    deleteSkill: vi.fn(),
    installFromRemote: vi.fn().mockResolvedValue({ success: true }),
    installFromLocal: vi.fn().mockResolvedValue({ success: true }),
    saveSkillMD: vi.fn().mockResolvedValue(undefined),
    checkForUpdate: vi.fn().mockResolvedValue(checkResult),
    checkAllUpdates: vi.fn().mockResolvedValue(undefined),
    updateSkill: vi.fn().mockResolvedValue(updateResult),
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

  return { handlers, skillManager, checkResult, updateResult }
}

function renderWithQueryClient(
  element: React.ReactElement,
  queryClient: QueryClient,
): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      React.createElement(QueryClientProvider, { client: queryClient }, element),
    )
  })

  return { container, root }
}

describe('skill update contract', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('returns a structured update-check result and updates internal status caches', async () => {
    const { SkillManager } = await loadSkillManagerContract()
    const manager = new SkillManager()
    manager.skills = [createSkill()]

    const events: string[] = []
    manager.on('stateChanged', () => events.push('stateChanged'))

    const result = await manager.checkForUpdate('opaque-skill-id')

    expect(result).toEqual({
      skillId: 'opaque-skill-id',
      status: 'hasUpdate',
      hasUpdate: true,
      remoteTreeHash: 'remote-tree',
      remoteCommitHash: 'remote-commit',
    })
    const svc = (manager as unknown as { updateService: { updateStatuses: Map<string, string> } }).updateService
    expect(svc.updateStatuses.get('opaque-skill-id')).toBe('hasUpdate')
    expect(events).toHaveLength(2)
  })

  it('throws update errors instead of swallowing them', async () => {
    const { SkillManager } = await loadSkillManagerContract({
      shallowCloneError: new Error('clone failed'),
    })
    const manager = new SkillManager()
    manager.skills = [createSkill()]

    await expect(manager.updateSkill('opaque-skill-id')).rejects.toThrow('clone failed')
    const svc = (manager as unknown as { updateService: { updateStatuses: Map<string, string> } }).updateService
    expect(svc.updateStatuses.get('opaque-skill-id')).toBe('error')
  })

  it('repairs empty folder hashes by rebuilding the local tree hash and writing it back to lock', async () => {
    const { repoDir, remoteTreeHash, remoteCommitHash } = createCommittedSkillRepo(
      'skills/shared-skill',
      {
        'SKILL.md': '---\nname: Shared Skill\n---\n',
        'README.md': '# Shared Skill\n',
      },
    )
    const canonicalRoot = createTempDir('skillpilot-canonical-')
    const canonicalPath = path.join(canonicalRoot, 'shared-skill')
    fs.cpSync(path.join(repoDir, 'skills/shared-skill'), canonicalPath, { recursive: true })

    const { SkillManager, updateEntry } = await loadSkillManagerWithRealUpdateCheck({ repoDir })
    const manager = new SkillManager()
    manager.skills = [
      createSkill({
        canonicalPath,
        lockEntry: {
          source: 'owner/repo',
          sourceType: 'github',
          sourceUrl: 'https://github.com/owner/repo.git',
          skillPath: 'skills/shared-skill/SKILL.md',
          skillFolderHash: '',
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    ]

    const result = await manager.checkForUpdate('opaque-skill-id')

    expect(result).toMatchObject({
      skillId: 'opaque-skill-id',
      status: 'upToDate',
      hasUpdate: false,
      remoteTreeHash,
      remoteCommitHash,
    })
    expect(updateEntry).toHaveBeenCalledWith(
      'opaque-skill-id',
      expect.objectContaining({
        skillFolderHash: remoteTreeHash,
      }),
    )
  })

  it('returns unknownHash when an empty folder hash cannot be rebuilt', async () => {
    const { repoDir } = createCommittedSkillRepo('skills/shared-skill', {
      'SKILL.md': '---\nname: Shared Skill\n---\n',
    })
    const { SkillManager, updateEntry } = await loadSkillManagerWithRealUpdateCheck({ repoDir })
    const manager = new SkillManager()
    manager.skills = [
      createSkill({
        canonicalPath: path.join(createTempDir('skillpilot-missing-canonical-'), 'missing-skill'),
        lockEntry: {
          source: 'owner/repo',
          sourceType: 'github',
          sourceUrl: 'https://github.com/owner/repo.git',
          skillPath: 'skills/shared-skill/SKILL.md',
          skillFolderHash: '',
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    ]

    const result = await manager.checkForUpdate('opaque-skill-id')

    expect(result).toMatchObject({
      skillId: 'opaque-skill-id',
      status: 'unknownHash',
      hasUpdate: false,
    })
    expect(result.message).toBeTruthy()
    expect(updateEntry).not.toHaveBeenCalled()
    const svc = (manager as unknown as { updateService: { updateStatuses: Map<string, string> } }).updateService
    expect(svc.updateStatuses.get('opaque-skill-id')).toBe('unknownHash')
  })

  it('ipc handlers return structured results for update check and apply', async () => {
    const { handlers, skillManager, checkResult, updateResult } = await loadHandlerContract()

    const checkHandler = handlers.get(IPC_CHANNELS.SKILL.CHECK_UPDATE)
    const updateHandler = handlers.get(IPC_CHANNELS.SKILL.UPDATE_SKILL)

    await expect(checkHandler?.({}, 'opaque-skill-id')).resolves.toEqual(checkResult)
    await expect(updateHandler?.({}, 'opaque-skill-id')).resolves.toEqual(updateResult)
    expect(skillManager.checkForUpdate).toHaveBeenCalledWith('opaque-skill-id')
    expect(skillManager.updateSkill).toHaveBeenCalledWith('opaque-skill-id')
  })

  it('binds renderer watcher notifications to external watcher changes only', async () => {
    const { skillManager } = await loadHandlerContract()

    expect(skillManager.on).toHaveBeenCalledWith('watcherChanged', expect.any(Function))
    expect(skillManager.on).toHaveBeenCalledWith('stateChanged', expect.any(Function))
  })

  it('useCheckUpdate invalidates skills after a successful mutation', async () => {
    const checkUpdate = vi.fn().mockResolvedValue({
      skillId: 'opaque-skill-id',
      status: 'upToDate',
      hasUpdate: false,
    } satisfies SkillUpdateCheckResult)
    const unsubscribe = vi.fn()

    Object.assign(window, {
      electronAPI: {
        skills: {
          checkUpdate,
          updateSkill: vi.fn(),
        },
        watcher: {
          onChange: vi.fn(() => unsubscribe),
        },
      },
    })

    const { useCheckUpdate } = await import('../../src/hooks/useSkills')
    let runMutation: ((skillId: string) => Promise<unknown>) | undefined

    function Harness() {
      const mutation = useCheckUpdate()
      useEffect(() => {
        runMutation = mutation.mutateAsync
      }, [mutation])
      return null
    }

    const queryClient = new QueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { root, container } = renderWithQueryClient(React.createElement(Harness), queryClient)

    await act(async () => {
      await runMutation?.('opaque-skill-id')
    })

    expect(checkUpdate).toHaveBeenCalledWith('opaque-skill-id')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['skills'] })

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('useUpdateSkill invalidates skills after a successful mutation', async () => {
    const updateSkill = vi.fn().mockResolvedValue({
      skillId: 'opaque-skill-id',
      status: 'updated',
    } satisfies SkillUpdateApplyResult)
    const unsubscribe = vi.fn()

    Object.assign(window, {
      electronAPI: {
        skills: {
          checkUpdate: vi.fn(),
          updateSkill,
        },
        watcher: {
          onChange: vi.fn(() => unsubscribe),
        },
      },
    })

    const { useUpdateSkill } = await import('../../src/hooks/useSkills')
    let runMutation: ((skillId: string) => Promise<unknown>) | undefined

    function Harness() {
      const mutation = useUpdateSkill()
      useEffect(() => {
        runMutation = mutation.mutateAsync
      }, [mutation])
      return null
    }

    const queryClient = new QueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { root, container } = renderWithQueryClient(React.createElement(Harness), queryClient)

    await act(async () => {
      await runMutation?.('opaque-skill-id')
    })

    expect(updateSkill).toHaveBeenCalledWith('opaque-skill-id')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['skills'] })

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('debounces watcher-driven invalidation for skills and agents', async () => {
    vi.useFakeTimers()

    let watcherCallback: (() => void) | undefined
    const unsubscribe = vi.fn()

    const stateUnsubscribe = vi.fn()

    Object.assign(window, {
      electronAPI: {
        watcher: {
          onChange: vi.fn((callback: () => void) => {
            watcherCallback = callback
            return unsubscribe
          }),
        },
        skills: {
          checkUpdate: vi.fn(),
          updateSkill: vi.fn(),
          onStateChanged: vi.fn(() => stateUnsubscribe),
        },
      },
    })

    const { useSkillWatcherSync } = await import('../../src/hooks/useSkillWatcherSync')

    function Harness() {
      useSkillWatcherSync()
      return null
    }

    const queryClient = new QueryClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { root, container } = renderWithQueryClient(React.createElement(Harness), queryClient)

    act(() => {
      watcherCallback?.()
      watcherCallback?.()
      vi.advanceTimersByTime(149)
    })

    expect(invalidateSpy).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(invalidateSpy).toHaveBeenNthCalledWith(1, { queryKey: ['skills'] })
    expect(invalidateSpy).toHaveBeenNthCalledWith(2, { queryKey: ['agents'] })

    await act(async () => {
      root.unmount()
    })
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(stateUnsubscribe).toHaveBeenCalledTimes(1)
    container.remove()
  })
})
