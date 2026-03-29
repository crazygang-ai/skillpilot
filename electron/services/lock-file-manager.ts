import fsPromises from 'fs/promises'
import path from 'path'
import log from 'electron-log'
import { LockEntry, LockFile } from '../../shared/types'
import { LOCK_FILE_PATH, LOCK_FILE_VERSION } from '../utils/constants'
import * as commitHashCache from './commit-hash-cache'
import {
  createGitHubSkillId,
  createLocalSkillId,
} from './skill-identity'

let cache: LockFile | null = null
let cachedMtimeMs: number | null = null

const LOCK_PATH = LOCK_FILE_PATH + '.lock'
const LOCK_STALE_MS = 30_000

async function pathExists(p: string): Promise<boolean> {
  try { await fsPromises.access(p); return true } catch { return false }
}

async function acquireLock(maxWaitMs = 5000): Promise<void> {
  const start = Date.now()
  while (true) {
    try {
      await fsPromises.writeFile(LOCK_PATH, String(process.pid), { flag: 'wx' })
      return
    } catch {
      try {
        const stat = await fsPromises.stat(LOCK_PATH)
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          await fsPromises.unlink(LOCK_PATH)
          continue
        }
      } catch { continue }

      if (Date.now() - start > maxWaitMs) {
        throw new Error('Failed to acquire lock file after ' + maxWaitMs + 'ms')
      }
      await new Promise(r => setTimeout(r, 50))
    }
  }
}

async function releaseLock(): Promise<void> {
  try { await fsPromises.unlink(LOCK_PATH) } catch { /* ignore */ }
}

async function cleanStaleLock(): Promise<void> {
  try {
    const stat = await fsPromises.stat(LOCK_PATH)
    if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
      await fsPromises.unlink(LOCK_PATH)
      log.warn('Cleaned up stale lock file')
    }
  } catch { /* no lock file or already removed */ }
}

async function ensureDirectory(): Promise<void> {
  const dir = path.dirname(LOCK_FILE_PATH)
  if (!(await pathExists(dir))) {
    await fsPromises.mkdir(dir, { recursive: true })
  }
}

function createEmpty(): LockFile {
  return { version: LOCK_FILE_VERSION, skills: {} }
}

export async function read(): Promise<LockFile> {
  if (cache) return cache

  await cleanStaleLock()

  try {
    if (!(await pathExists(LOCK_FILE_PATH))) {
      cache = createEmpty()
      return cache
    }
    const stat = await fsPromises.stat(LOCK_FILE_PATH)
    cachedMtimeMs = stat.mtimeMs
    const raw = await fsPromises.readFile(LOCK_FILE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<LockFile>
    const migrated = await migrateLegacyEntries(normalizeLockFile(parsed))
    cache = migrated
    return migrated
  } catch (error) {
    log.warn('Lock file corrupt, backing up and recovering:', error)
    await backupCorruptFile()
    cache = createEmpty()
    return cache
  }
}

async function backupCorruptFile(): Promise<void> {
  try {
    if (!(await pathExists(LOCK_FILE_PATH))) return
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = LOCK_FILE_PATH.replace('.json', `.corrupt-${timestamp}.json`)
    await fsPromises.copyFile(LOCK_FILE_PATH, backupPath)
    log.warn(`Corrupt lock file backed up to: ${backupPath}`)
  } catch {
    // backup is best-effort
  }
}

export async function getEntry(skillId: string): Promise<LockEntry | undefined> {
  const lockFile = await read()
  return lockFile.skills[skillId]
}

export async function updateEntry(skillId: string, entry: LockEntry): Promise<void> {
  const lockFile = await read()
  const stableSkillId = entry.stableId?.trim() || skillId
  lockFile.skills[stableSkillId] = {
    ...entry,
    stableId: stableSkillId,
  }
  if (stableSkillId !== skillId) {
    delete lockFile.skills[skillId]
  }
  await write(lockFile)
}

export async function removeEntry(skillId: string): Promise<void> {
  const lockFile = await read()
  delete lockFile.skills[skillId]
  await write(lockFile)
}

export function invalidateCache(): void {
  cache = null
  cachedMtimeMs = null
}

let lockHeld = false

async function write(lockFile: LockFile): Promise<void> {
  const needsLock = !lockHeld
  if (needsLock) {
    await acquireLock()
    lockHeld = true
  }
  try {
    await ensureDirectory()

    if (cachedMtimeMs !== null && (await pathExists(LOCK_FILE_PATH))) {
      try {
        const currentStat = await fsPromises.stat(LOCK_FILE_PATH)
        if (currentStat.mtimeMs !== cachedMtimeMs) {
          log.warn('Lock file modified externally since last read, re-reading before write')
          cache = null
          const fresh = await read()
          lockFile = { ...fresh, ...lockFile, skills: { ...fresh.skills, ...lockFile.skills } }
        }
      } catch {
        // stat failed, proceed with write
      }
    }

    const tmpPath = LOCK_FILE_PATH + '.tmp'
    await fsPromises.writeFile(tmpPath, JSON.stringify(lockFile, null, 2))
    try {
      await fsPromises.rename(tmpPath, LOCK_FILE_PATH)
    } catch (renameErr) {
      await fsPromises.rm(tmpPath, { force: true }).catch(() => {})
      throw renameErr
    }
    try {
      const newStat = await fsPromises.stat(LOCK_FILE_PATH)
      cachedMtimeMs = newStat.mtimeMs
    } catch {
      cachedMtimeMs = null
    }
    cache = lockFile
  } finally {
    if (needsLock) {
      lockHeld = false
      await releaseLock()
    }
  }
}

export async function createIfNotExists(): Promise<void> {
  if (!(await pathExists(LOCK_FILE_PATH))) {
    await ensureDirectory()
    await write(createEmpty())
  }
}

function normalizeLockFile(parsed: Partial<LockFile>): LockFile {
  return {
    version: typeof parsed.version === 'number' ? parsed.version : LOCK_FILE_VERSION,
    skills: parsed.skills && typeof parsed.skills === 'object' ? parsed.skills : {},
    dismissed: parsed.dismissed && typeof parsed.dismissed === 'object' ? parsed.dismissed : undefined,
    lastSelectedAgents: Array.isArray(parsed.lastSelectedAgents) ? parsed.lastSelectedAgents : undefined,
  }
}

async function migrateLegacyEntries(lockFile: LockFile): Promise<LockFile> {
  const migratedSkills: Record<string, LockEntry> = {}
  let shouldWrite = lockFile.version !== LOCK_FILE_VERSION

  for (const [legacyKey, entry] of Object.entries(lockFile.skills)) {
    try {
      const stableSkillId = await resolveStableSkillIdForLockEntry(legacyKey, entry)
      const normalizedEntry: LockEntry = {
        ...entry,
        stableId: stableSkillId,
      }

      const existing = migratedSkills[stableSkillId]
      if (existing) {
        migratedSkills[stableSkillId] = choosePreferredEntry(existing, normalizedEntry)
        log.warn(
          `Lock entry collision during stable ID migration: ${legacyKey} -> ${stableSkillId}`,
        )
      } else {
        migratedSkills[stableSkillId] = normalizedEntry
      }

      if (legacyKey !== stableSkillId || entry.stableId?.trim() !== stableSkillId) {
        shouldWrite = true
      }

      if (legacyKey !== stableSkillId) {
        await commitHashCache.migrateCommitHashKey(legacyKey, stableSkillId)
      }
    } catch (error) {
      migratedSkills[legacyKey] = entry
      log.warn(`Failed to migrate lock entry "${legacyKey}", keeping legacy record:`, error)
    }
  }

  const migratedLockFile: LockFile = {
    ...lockFile,
    version: LOCK_FILE_VERSION,
    skills: migratedSkills,
  }

  if (shouldWrite) {
    await write(migratedLockFile)
  }

  return migratedLockFile
}

async function resolveStableSkillIdForLockEntry(legacyKey: string, entry: LockEntry): Promise<string> {
  const explicitStableId = entry.stableId?.trim()
  if (explicitStableId) {
    return explicitStableId
  }

  if (entry.sourceType === 'github' && entry.sourceUrl && entry.skillPath) {
    return createGitHubSkillId(entry.sourceUrl, entry.skillPath)
  }

  if (entry.sourceType === 'local' && entry.sourceUrl) {
    const canonicalPath = await fsPromises.realpath(entry.sourceUrl)
    return createLocalSkillId(canonicalPath)
  }

  return legacyKey
}

function choosePreferredEntry(current: LockEntry, incoming: LockEntry): LockEntry {
  return scoreEntry(incoming) > scoreEntry(current) ? incoming : current
}

function scoreEntry(entry: LockEntry): number {
  const populatedFieldScore = [
    entry.stableId,
    entry.source,
    entry.sourceType,
    entry.sourceUrl,
    entry.skillPath,
    entry.skillFolderHash,
    entry.installedAt,
    entry.updatedAt,
  ].filter((value) => typeof value === 'string' && value.trim().length > 0).length * 10

  return populatedFieldScore
    + pathSpecificity(entry.skillPath)
    + pathSpecificity(entry.sourceUrl)
    + timestampSpecificity(entry.updatedAt)
}

function pathSpecificity(value: string): number {
  return value
    .split(/[\\/]/)
    .filter(Boolean)
    .length
}

function timestampSpecificity(value: string): number {
  return value.trim() ? 1 : 0
}
