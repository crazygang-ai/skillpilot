import fs from 'fs'
import os from 'os'
import path from 'path'
import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentType, type LockEntry } from '../../shared/types'

const tempDirs: string[] = []

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function writeFiles(baseDir: string, files: Record<string, string>): void {
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = path.join(baseDir, relativePath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, contents)
  }
}

function createStoragePaths(baseDir: string) {
  const agentsDir = path.join(baseDir, '.agents')
  return {
    agentsDir,
    sharedSkillsDir: path.join(agentsDir, 'skills'),
    lockFilePath: path.join(agentsDir, '.skill-lock.json'),
    cacheFilePath: path.join(agentsDir, '.skillpilot-cache.json'),
  }
}

async function loadLockAndCacheModulesForMigrationTest(baseDir: string) {
  const paths = createStoragePaths(baseDir)

  vi.doUnmock('../../electron/services/lock-file-manager')
  vi.doUnmock('../../electron/services/commit-hash-cache')
  vi.doUnmock('../../electron/services/skill-identity')
  vi.doUnmock('../../electron/services/git-service')

  vi.doMock('../../electron/utils/constants', () => ({
    SHARED_SKILLS_DIR: paths.sharedSkillsDir,
    LOCK_FILE_PATH: paths.lockFilePath,
    CACHE_FILE_PATH: paths.cacheFilePath,
    LOCK_FILE_VERSION: 3,
    GITHUB_RAW_BASE: 'https://raw.githubusercontent.com',
    GITHUB_API_BASE: 'https://api.github.com',
    SKILLS_SH_BASE: 'https://skills.sh',
    FILE_WATCHER_DEBOUNCE_MS: 500,
    REGISTRY_CACHE_TTL_MS: 300000,
    CONTENT_CACHE_TTL_MS: 600000,
  }))

  const lockFileManager = await import('../../electron/services/lock-file-manager')
  const commitHashCache = await import('../../electron/services/commit-hash-cache')
  const identity = await import('../../electron/services/skill-identity')

  return {
    ...paths,
    lockFileManager,
    commitHashCache,
    identity,
  }
}

async function loadSkillManagerForIdentityTest(options: {
  sharedSkillsDir: string
  scanSkillsInRepo: (repoDir: string) => string[]
  shallowClone: (repoUrl: string) => Promise<string>
}) {
  const updateEntry = vi.fn()
  const setCommitHash = vi.fn()
  const createSymlink = vi.fn()

  class MockWatcher extends EventEmitter {
    startWatching() {}
    stopWatching() {}
  }

  vi.doMock('../../electron/utils/constants', () => ({
    SHARED_SKILLS_DIR: options.sharedSkillsDir,
    LOCK_FILE_PATH: path.join(path.dirname(options.sharedSkillsDir), '.skill-lock.json'),
    CACHE_FILE_PATH: path.join(path.dirname(options.sharedSkillsDir), '.skillpilot-cache.json'),
    LOCK_FILE_VERSION: 3,
    GITHUB_RAW_BASE: 'https://raw.githubusercontent.com',
    GITHUB_API_BASE: 'https://api.github.com',
    SKILLS_SH_BASE: 'https://skills.sh',
    FILE_WATCHER_DEBOUNCE_MS: 500,
    REGISTRY_CACHE_TTL_MS: 300000,
    CONTENT_CACHE_TTL_MS: 600000,
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
    createSymlink,
    resolveCanonical: vi.fn((value: string) => value),
  }))
  vi.doMock('../../electron/services/git-service', async () => {
    const actual = await vi.importActual<typeof import('../../electron/services/git-service')>(
      '../../electron/services/git-service',
    )

    return {
      ...actual,
      isGitAvailable: vi.fn().mockResolvedValue(true),
      shallowClone: vi.fn(options.shallowClone),
      scanSkillsInRepo: vi.fn(options.scanSkillsInRepo),
      getTreeHash: vi.fn().mockResolvedValue('tree-hash'),
      getCommitHash: vi.fn().mockResolvedValue('commit-hash'),
    }
  })
  vi.doMock('../../electron/services/commit-hash-cache', () => ({
    removeCommitHash: vi.fn(),
    setCommitHash,
    getCommitHash: vi.fn(),
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
    updateEntry,
    setCommitHash,
    createSymlink,
  }
}

describe('skill identity migration', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('builds stable github skill ids from normalized repo url and skill path', async () => {
    const identity = await import('../../electron/services/skill-identity')

    const idFromOwnerRepo = identity.createGitHubSkillId(
      'owner/repo',
      'skills/shared-skill/SKILL.md',
    )
    const idFromHttpsGit = identity.createGitHubSkillId(
      'https://github.com/owner/repo.git',
      'skills/shared-skill/SKILL.md',
    )
    const idFromOtherRepo = identity.createGitHubSkillId(
      'https://github.com/other/repo.git',
      'skills/shared-skill/SKILL.md',
    )

    expect(idFromOwnerRepo).toBe(idFromHttpsGit)
    expect(idFromOtherRepo).not.toBe(idFromOwnerRepo)
  })

  it('reuses an existing stable id for local skills based on canonical realpath', async () => {
    const identity = await import('../../electron/services/skill-identity')
    const localSkillDir = createTempDir('skillpilot-local-identity-')
    const reusedStableId = 'skill_reused_local_id'

    const stableId = identity.resolveLocalStableSkillId(localSkillDir, {
      'legacy-local-key': {
        stableId: reusedStableId,
        source: 'legacy-local-key',
        sourceType: 'local',
        sourceUrl: localSkillDir,
        skillPath: 'SKILL.md',
        skillFolderHash: '',
        installedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    })

    expect(stableId).toBe(reusedStableId)
  })

  it('installs same-name github skills into separate stable-id directories', async () => {
    const identity = await import('../../electron/services/skill-identity')
    const sharedSkillsDir = path.join(createTempDir('skillpilot-shared-'), 'skills')
    const repoOneDir = createTempDir('skillpilot-repo-one-')
    const repoTwoDir = createTempDir('skillpilot-repo-two-')

    writeFiles(repoOneDir, {
      'skills/shared-skill/SKILL.md': '---\nname: Shared Skill\ndescription: Repo One\n---\n',
    })
    writeFiles(repoTwoDir, {
      'skills/shared-skill/SKILL.md': '---\nname: Shared Skill\ndescription: Repo Two\n---\n',
    })

    const { SkillManager, updateEntry, createSymlink } = await loadSkillManagerForIdentityTest({
      sharedSkillsDir,
      scanSkillsInRepo: (repoDir) => [path.join(repoDir, 'skills/shared-skill')],
      shallowClone: async (repoUrl) =>
        repoUrl.includes('owner-one') ? repoOneDir : repoTwoDir,
    })

    const manager = new SkillManager()
    const firstInstall = await manager.installFromRemote({
      repoUrl: 'https://github.com/owner-one/repo.git',
      agentTypes: [AgentType.CLAUDE],
      source: 'github',
    })
    const secondInstall = await manager.installFromRemote({
      repoUrl: 'https://github.com/owner-two/repo.git',
      agentTypes: [AgentType.CLAUDE],
      source: 'github',
    })

    const firstId = identity.createGitHubSkillId(
      'https://github.com/owner-one/repo.git',
      'skills/shared-skill/SKILL.md',
    )
    const secondId = identity.createGitHubSkillId(
      'https://github.com/owner-two/repo.git',
      'skills/shared-skill/SKILL.md',
    )

    expect(firstInstall.success).toBe(true)
    expect(secondInstall.success).toBe(true)
    expect(firstId).not.toBe(secondId)
    expect(fs.existsSync(path.join(sharedSkillsDir, firstId))).toBe(true)
    expect(fs.existsSync(path.join(sharedSkillsDir, secondId))).toBe(true)
    expect(updateEntry).toHaveBeenNthCalledWith(
      1,
      firstId,
      expect.objectContaining({
        stableId: firstId,
        skillPath: 'skills/shared-skill/SKILL.md',
      }),
    )
    expect(updateEntry).toHaveBeenNthCalledWith(
      2,
      secondId,
      expect.objectContaining({
        stableId: secondId,
        skillPath: 'skills/shared-skill/SKILL.md',
      }),
    )
    expect(createSymlink).toHaveBeenCalledWith(path.join(sharedSkillsDir, firstId), AgentType.CLAUDE)
    expect(createSymlink).toHaveBeenCalledWith(path.join(sharedSkillsDir, secondId), AgentType.CLAUDE)
  })

  it('derives directoryName separately from opaque stable ids', async () => {
    const identity = await import('../../electron/services/skill-identity')
    const firstId = identity.createGitHubSkillId(
      'https://github.com/owner-one/repo.git',
      'skills/shared-skill/SKILL.md',
    )
    const secondId = identity.createGitHubSkillId(
      'https://github.com/owner-two/repo.git',
      'skills/shared-skill/SKILL.md',
    )
    const firstDirectoryName = identity.resolveDirectoryName(firstId, `/tmp/${firstId}`, {
      stableId: firstId,
      source: 'owner-one/repo',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner-one/repo.git',
      skillPath: 'skills/shared-skill/SKILL.md',
      skillFolderHash: 'tree-1',
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const secondDirectoryName = identity.resolveDirectoryName(secondId, `/tmp/${secondId}`, {
      stableId: secondId,
      source: 'owner-two/repo',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner-two/repo.git',
      skillPath: 'skills/shared-skill/SKILL.md',
      skillFolderHash: 'tree-2',
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(firstDirectoryName).toBe('shared-skill')
    expect(secondDirectoryName).toBe('shared-skill')
    expect(firstId).not.toBe(firstDirectoryName)
    expect(secondId).not.toBe(secondDirectoryName)
  })

  it('migrates legacy github lock keys and commit cache entries to stable ids on read', async () => {
    const baseDir = createTempDir('skillpilot-lock-migrate-github-')
    const legacyKey = 'shared-skill'
    const legacyEntry: LockEntry = {
      source: 'owner/repo',
      sourceType: 'github',
      sourceUrl: 'owner/repo',
      skillPath: 'skills/shared-skill/SKILL.md',
      skillFolderHash: 'tree-hash',
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }
    const { lockFilePath, cacheFilePath } = createStoragePaths(baseDir)

    fs.mkdirSync(path.dirname(lockFilePath), { recursive: true })
    fs.writeFileSync(lockFilePath, JSON.stringify({
      version: 3,
      skills: {
        [legacyKey]: legacyEntry,
      },
    }, null, 2))
    fs.writeFileSync(cacheFilePath, JSON.stringify({
      commitHashes: {
        [legacyKey]: 'commit-123',
      },
      repoHistory: {},
    }, null, 2))

    const {
      lockFileManager,
      commitHashCache,
      identity,
    } = await loadLockAndCacheModulesForMigrationTest(baseDir)
    const stableId = identity.createGitHubSkillId(legacyEntry.sourceUrl, legacyEntry.skillPath)

    const migrated = lockFileManager.read()

    expect(migrated.skills[legacyKey]).toBeUndefined()
    expect(migrated.skills[stableId]).toEqual({
      ...legacyEntry,
      stableId,
    })
    expect(commitHashCache.getCommitHash(stableId)).toBe('commit-123')
    expect(commitHashCache.getCommitHash(legacyKey)).toBeUndefined()

    const writtenLockFile = JSON.parse(fs.readFileSync(lockFilePath, 'utf-8'))
    const writtenCacheFile = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'))

    expect(writtenLockFile.skills[legacyKey]).toBeUndefined()
    expect(writtenLockFile.skills[stableId].stableId).toBe(stableId)
    expect(writtenCacheFile.commitHashes[stableId]).toBe('commit-123')
    expect(writtenCacheFile.commitHashes[legacyKey]).toBeUndefined()
  })

  it('migrates legacy local lock keys using canonical realpath-derived stable ids', async () => {
    const baseDir = createTempDir('skillpilot-lock-migrate-local-')
    const realSkillDir = path.join(baseDir, 'real-skill')
    const aliasSkillDir = path.join(baseDir, 'alias-skill')
    const legacyKey = 'legacy-local-skill'

    writeFiles(realSkillDir, {
      'SKILL.md': '---\nname: Local Skill\ndescription: Real path\n---\n',
    })
    fs.symlinkSync(realSkillDir, aliasSkillDir)

    const { lockFilePath, cacheFilePath } = createStoragePaths(baseDir)
    fs.mkdirSync(path.dirname(lockFilePath), { recursive: true })
    fs.writeFileSync(lockFilePath, JSON.stringify({
      version: 3,
      skills: {
        [legacyKey]: {
          source: 'legacy-local-skill',
          sourceType: 'local',
          sourceUrl: aliasSkillDir,
          skillPath: 'SKILL.md',
          skillFolderHash: '',
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    }, null, 2))
    fs.writeFileSync(cacheFilePath, JSON.stringify({
      commitHashes: {
        [legacyKey]: 'commit-local',
      },
      repoHistory: {},
    }, null, 2))

    const {
      lockFileManager,
      commitHashCache,
      identity,
    } = await loadLockAndCacheModulesForMigrationTest(baseDir)
    const stableId = identity.createLocalSkillId(fs.realpathSync(aliasSkillDir))

    const migrated = lockFileManager.read()

    expect(migrated.skills[stableId]).toMatchObject({
      stableId,
      sourceType: 'local',
      sourceUrl: aliasSkillDir,
    })
    expect(migrated.skills[legacyKey]).toBeUndefined()
    expect(commitHashCache.getCommitHash(stableId)).toBe('commit-local')
    expect(commitHashCache.getCommitHash(legacyKey)).toBeUndefined()
  })

  it('keeps the more complete record when legacy and stable lock keys collide', async () => {
    const baseDir = createTempDir('skillpilot-lock-conflict-')
    const legacyKey = 'shared-skill'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.doUnmock('../../electron/services/skill-identity')
    const identity = await import('../../electron/services/skill-identity')
    const stableId = identity.createGitHubSkillId(
      'https://github.com/owner/repo.git',
      'skills/shared-skill/SKILL.md',
    )
    const { lockFilePath, cacheFilePath } = createStoragePaths(baseDir)

    fs.mkdirSync(path.dirname(lockFilePath), { recursive: true })
    fs.writeFileSync(lockFilePath, JSON.stringify({
      version: 3,
      skills: {
        [legacyKey]: {
          source: 'owner/repo',
          sourceType: 'github',
          sourceUrl: 'https://github.com/owner/repo.git',
          skillPath: 'skills/shared-skill/SKILL.md',
          skillFolderHash: '',
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        [stableId]: {
          stableId,
          source: 'owner/repo',
          sourceType: 'github',
          sourceUrl: 'https://github.com/owner/repo.git',
          skillPath: 'skills/shared-skill/SKILL.md',
          skillFolderHash: 'tree-hash',
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      },
    }, null, 2))
    fs.writeFileSync(cacheFilePath, JSON.stringify({
      commitHashes: {
        [legacyKey]: 'legacy-commit',
        [stableId]: 'stable-commit',
      },
      repoHistory: {},
    }, null, 2))

    const { lockFileManager, commitHashCache } = await loadLockAndCacheModulesForMigrationTest(baseDir)
    const migrated = lockFileManager.read()

    expect(migrated.skills[stableId]).toMatchObject({
      stableId,
      skillFolderHash: 'tree-hash',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
    expect(migrated.skills[legacyKey]).toBeUndefined()
    expect(commitHashCache.getCommitHash(stableId)).toBe('stable-commit')
    expect(commitHashCache.getCommitHash(legacyKey)).toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('logs and preserves legacy records when a local migration cannot resolve a stable id', async () => {
    const baseDir = createTempDir('skillpilot-lock-preserve-bad-local-')
    const legacyKey = 'broken-local-skill'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { lockFilePath, cacheFilePath } = createStoragePaths(baseDir)

    fs.mkdirSync(path.dirname(lockFilePath), { recursive: true })
    fs.writeFileSync(lockFilePath, JSON.stringify({
      version: 3,
      skills: {
        [legacyKey]: {
          source: 'broken-local-skill',
          sourceType: 'local',
          sourceUrl: path.join(baseDir, 'missing-skill-directory'),
          skillPath: 'SKILL.md',
          skillFolderHash: '',
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    }, null, 2))
    fs.writeFileSync(cacheFilePath, JSON.stringify({
      commitHashes: {
        [legacyKey]: 'legacy-broken-commit',
      },
      repoHistory: {},
    }, null, 2))

    const { lockFileManager, commitHashCache } = await loadLockAndCacheModulesForMigrationTest(baseDir)

    const migrated = lockFileManager.read()

    expect(migrated.skills[legacyKey]).toMatchObject({
      sourceType: 'local',
      source: 'broken-local-skill',
    })
    expect(commitHashCache.getCommitHash(legacyKey)).toBe('legacy-broken-commit')
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })
})
