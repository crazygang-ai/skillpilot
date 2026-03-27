import { execFileSync } from 'child_process'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Skill, SkillUpdateCheckResult } from '../../shared/types'
import { AgentType } from '../../shared/types'

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
      sourceUrl: 'https://github.com/owner/repo.git',
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
  const tempDir = createTempDir('skillpilot-skill-manager-repo-')
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
  }
}

async function loadSkillManagerHarness(options?: {
  updateCheckResult?: SkillUpdateCheckResult
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
  const removeSymlink = vi.fn()
  const removeEntry = vi.fn()
  const updateEntry = vi.fn()
  const removeCommitHash = vi.fn()
  const getCommitHash = vi.fn()
  const updateChecker = {
    checkSkillUpdate: vi.fn().mockResolvedValue(updateCheckResult),
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
    read: vi.fn(() => ({ version: 3, skills: {} })),
    removeEntry,
    updateEntry,
    invalidateCache: vi.fn(),
    createIfNotExists: vi.fn(),
  }))
  vi.doMock('../../electron/services/symlink-manager', () => ({
    removeSymlink,
    createSymlink: vi.fn(),
    resolveCanonical: vi.fn((value: string) => value),
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
    migrateCommitHashKey: vi.fn(),
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
    mockFs,
    removeSymlink,
    removeEntry,
    updateEntry,
    removeCommitHash,
  }
}

async function loadSkillManagerWithRealUpdateCheck(repoDir: string) {
  const updateEntry = vi.fn()
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
    read: vi.fn(() => ({ version: 3, skills: {} })),
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
    shallowClone: vi.fn().mockResolvedValue(repoDir),
  }))
  vi.doMock('../../electron/services/commit-hash-cache', () => ({
    removeCommitHash: vi.fn(),
    setCommitHash: vi.fn(),
    getCommitHash: vi.fn(),
    migrateCommitHashKey: vi.fn(),
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

describe('skill-manager', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('removes only the requested local installation without deleting canonical storage or metadata', async () => {
    const { SkillManager, mockFs, removeSymlink, removeEntry, removeCommitHash } =
      await loadSkillManagerHarness()
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

  it('keeps destructive delete separate by removing canonical storage, lock entries, and cache keys', async () => {
    const { SkillManager, mockFs, removeSymlink, removeEntry, removeCommitHash } =
      await loadSkillManagerHarness()
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
    expect(removeEntry).toHaveBeenCalledWith('shared-skill')
    expect(removeCommitHash).toHaveBeenCalledWith('opaque-skill-id')
    expect(removeCommitHash).toHaveBeenCalledWith('shared-skill')
  })

  it('tracks structured update-check results in SkillManager state caches', async () => {
    const { SkillManager } = await loadSkillManagerHarness({
      updateCheckResult: {
        skillId: 'opaque-skill-id',
        status: 'hasUpdate',
        hasUpdate: true,
        remoteTreeHash: 'remote-tree',
        remoteCommitHash: 'remote-commit',
      },
    })
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
    expect((manager as unknown as { updateStatuses: Map<string, string> }).updateStatuses.get('opaque-skill-id')).toBe('hasUpdate')
    expect((manager as unknown as { cachedRemoteTreeHashes: Map<string, string> }).cachedRemoteTreeHashes.get('opaque-skill-id')).toBe('remote-tree')
    expect((manager as unknown as { cachedRemoteCommitHashes: Map<string, string> }).cachedRemoteCommitHashes.get('opaque-skill-id')).toBe('remote-commit')
    expect(events).toHaveLength(2)
  })

  it('repairs empty folder hashes by rebuilding the local tree hash and writing it back to lock', async () => {
    const { repoDir, remoteTreeHash } = createCommittedSkillRepo(
      'skills/shared-skill',
      {
        'SKILL.md': '---\nname: Shared Skill\n---\n',
        'README.md': '# Shared Skill\n',
      },
    )
    const canonicalRoot = createTempDir('skillpilot-skill-manager-canonical-')
    const canonicalPath = path.join(canonicalRoot, 'shared-skill')
    fs.cpSync(path.join(repoDir, 'skills/shared-skill'), canonicalPath, { recursive: true })

    const { SkillManager, updateEntry } = await loadSkillManagerWithRealUpdateCheck(repoDir)
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
      localTreeHash: remoteTreeHash,
      remoteTreeHash,
    })
    expect(updateEntry).toHaveBeenCalledWith(
      'opaque-skill-id',
      expect.objectContaining({
        stableId: 'opaque-skill-id',
        skillFolderHash: remoteTreeHash,
      }),
    )
  })
})
