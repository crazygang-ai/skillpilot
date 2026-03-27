import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import log from 'electron-log'
import { CACHE_FILE_PATH } from '../utils/constants'

interface CacheFile {
  commitHashes: Record<string, string>  // skillId → commit hash
  repoHistory: Record<string, string>   // repoURL → last commit hash
}

let cache: CacheFile | null = null

async function pathExists(p: string): Promise<boolean> {
  try { await fsPromises.access(p); return true } catch { return false }
}

async function ensureDirectory(): Promise<void> {
  const dir = path.dirname(CACHE_FILE_PATH)
  if (!(await pathExists(dir))) {
    await fsPromises.mkdir(dir, { recursive: true })
  }
}

async function load(): Promise<CacheFile> {
  if (cache) return cache

  try {
    if (await pathExists(CACHE_FILE_PATH)) {
      const raw = await fsPromises.readFile(CACHE_FILE_PATH, 'utf-8')
      cache = JSON.parse(raw) as CacheFile
      return cache
    }
  } catch (err) {
    log.warn('Failed to parse commit hash cache file:', err)
  }

  cache = { commitHashes: {}, repoHistory: {} }
  return cache
}

async function save(): Promise<void> {
  if (!cache) return
  await ensureDirectory()
  const tmpPath = CACHE_FILE_PATH + '.tmp'
  await fsPromises.writeFile(tmpPath, JSON.stringify(cache, null, 2))
  fs.renameSync(tmpPath, CACHE_FILE_PATH)
}

export async function getCommitHash(skillId: string): Promise<string | undefined> {
  return (await load()).commitHashes[skillId]
}

export async function setCommitHash(skillId: string, hash: string): Promise<void> {
  (await load()).commitHashes[skillId] = hash
  await save()
}

export async function removeCommitHash(skillId: string): Promise<void> {
  const data = await load()
  delete data.commitHashes[skillId]
  await save()
}

export async function migrateCommitHashKey(legacySkillId: string, stableSkillId: string): Promise<void> {
  if (!legacySkillId || !stableSkillId || legacySkillId === stableSkillId) {
    return
  }

  const data = await load()
  const legacyCommitHash = data.commitHashes[legacySkillId]
  if (!legacyCommitHash) {
    return
  }

  if (!data.commitHashes[stableSkillId]) {
    data.commitHashes[stableSkillId] = legacyCommitHash
  }

  delete data.commitHashes[legacySkillId]
  await save()
}

export async function getRepoHistory(repoURL: string): Promise<string | undefined> {
  return (await load()).repoHistory[repoURL]
}

export async function setRepoHistory(repoURL: string, commitHash: string): Promise<void> {
  (await load()).repoHistory[repoURL] = commitHash
  await save()
}

export function invalidateCache(): void {
  cache = null
}
