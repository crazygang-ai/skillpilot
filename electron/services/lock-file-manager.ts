import fs from 'fs'
import path from 'path'
import { LockEntry, LockFile } from '../../shared/types'
import { LOCK_FILE_PATH, LOCK_FILE_VERSION } from '../utils/constants'
import * as commitHashCache from './commit-hash-cache'
import {
  createGitHubSkillId,
  createLocalSkillId,
} from './skill-identity'

let cache: LockFile | null = null

function ensureDirectory(): void {
  const dir = path.dirname(LOCK_FILE_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function createEmpty(): LockFile {
  return { version: LOCK_FILE_VERSION, skills: {} }
}

export function read(): LockFile {
  if (cache) return cache

  try {
    if (!fs.existsSync(LOCK_FILE_PATH)) {
      cache = createEmpty()
      return cache
    }
    const raw = fs.readFileSync(LOCK_FILE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<LockFile>
    const migrated = migrateLegacyEntries(normalizeLockFile(parsed))
    cache = migrated
    return migrated
  } catch (error) {
    console.warn('Lock file corrupt, backing up and recovering:', error)
    backupCorruptFile()
    cache = createEmpty()
    return cache
  }
}

function backupCorruptFile(): void {
  try {
    if (!fs.existsSync(LOCK_FILE_PATH)) return
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = LOCK_FILE_PATH.replace('.json', `.corrupt-${timestamp}.json`)
    fs.copyFileSync(LOCK_FILE_PATH, backupPath)
    console.warn(`Corrupt lock file backed up to: ${backupPath}`)
  } catch {
    // backup is best-effort
  }
}

export function getEntry(skillId: string): LockEntry | undefined {
  const lockFile = read()
  return lockFile.skills[skillId]
}

export function updateEntry(skillId: string, entry: LockEntry): void {
  const lockFile = read()
  const stableSkillId = entry.stableId?.trim() || skillId
  lockFile.skills[stableSkillId] = {
    ...entry,
    stableId: stableSkillId,
  }
  if (stableSkillId !== skillId) {
    delete lockFile.skills[skillId]
  }
  write(lockFile)
}

export function removeEntry(skillId: string): void {
  const lockFile = read()
  delete lockFile.skills[skillId]
  write(lockFile)
}

export function invalidateCache(): void {
  cache = null
}

function write(lockFile: LockFile): void {
  ensureDirectory()
  const tmpPath = LOCK_FILE_PATH + '.tmp'
  fs.writeFileSync(tmpPath, JSON.stringify(lockFile, null, 2))
  fs.renameSync(tmpPath, LOCK_FILE_PATH)
  cache = lockFile
}

export function createIfNotExists(): void {
  if (!fs.existsSync(LOCK_FILE_PATH)) {
    ensureDirectory()
    write(createEmpty())
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

function migrateLegacyEntries(lockFile: LockFile): LockFile {
  const migratedSkills: Record<string, LockEntry> = {}
  let shouldWrite = lockFile.version !== LOCK_FILE_VERSION

  for (const [legacyKey, entry] of Object.entries(lockFile.skills)) {
    try {
      const stableSkillId = resolveStableSkillIdForLockEntry(legacyKey, entry)
      const normalizedEntry: LockEntry = {
        ...entry,
        stableId: stableSkillId,
      }

      const existing = migratedSkills[stableSkillId]
      if (existing) {
        migratedSkills[stableSkillId] = choosePreferredEntry(existing, normalizedEntry)
        console.warn(
          `Lock entry collision during stable ID migration: ${legacyKey} -> ${stableSkillId}`,
        )
      } else {
        migratedSkills[stableSkillId] = normalizedEntry
      }

      if (legacyKey !== stableSkillId || entry.stableId?.trim() !== stableSkillId) {
        shouldWrite = true
      }

      if (legacyKey !== stableSkillId) {
        commitHashCache.migrateCommitHashKey(legacyKey, stableSkillId)
      }
    } catch (error) {
      migratedSkills[legacyKey] = entry
      console.warn(`Failed to migrate lock entry "${legacyKey}", keeping legacy record:`, error)
    }
  }

  const migratedLockFile: LockFile = {
    ...lockFile,
    version: LOCK_FILE_VERSION,
    skills: migratedSkills,
  }

  if (shouldWrite) {
    write(migratedLockFile)
  }

  return migratedLockFile
}

function resolveStableSkillIdForLockEntry(legacyKey: string, entry: LockEntry): string {
  const explicitStableId = entry.stableId?.trim()
  if (explicitStableId) {
    return explicitStableId
  }

  if (entry.sourceType === 'github' && entry.sourceUrl && entry.skillPath) {
    return createGitHubSkillId(entry.sourceUrl, entry.skillPath)
  }

  if (entry.sourceType === 'local' && entry.sourceUrl) {
    const canonicalPath = fs.realpathSync(entry.sourceUrl)
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
