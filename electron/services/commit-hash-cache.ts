import fs from 'fs'
import path from 'path'
import { CACHE_FILE_PATH } from '../utils/constants'

interface CacheFile {
  commitHashes: Record<string, string>  // skillId → commit hash
  repoHistory: Record<string, string>   // repoURL → last commit hash
}

let cache: CacheFile | null = null

function ensureDirectory(): void {
  const dir = path.dirname(CACHE_FILE_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function load(): CacheFile {
  if (cache) return cache

  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      const raw = fs.readFileSync(CACHE_FILE_PATH, 'utf-8')
      cache = JSON.parse(raw) as CacheFile
      return cache
    }
  } catch {
    // ignore parse errors
  }

  cache = { commitHashes: {}, repoHistory: {} }
  return cache
}

function save(): void {
  if (!cache) return
  ensureDirectory()
  const tmpPath = CACHE_FILE_PATH + '.tmp'
  fs.writeFileSync(tmpPath, JSON.stringify(cache, null, 2))
  fs.renameSync(tmpPath, CACHE_FILE_PATH)
}

export function getCommitHash(skillId: string): string | undefined {
  return load().commitHashes[skillId]
}

export function setCommitHash(skillId: string, hash: string): void {
  load().commitHashes[skillId] = hash
  save()
}

export function removeCommitHash(skillId: string): void {
  const data = load()
  delete data.commitHashes[skillId]
  save()
}

export function getRepoHistory(repoURL: string): string | undefined {
  return load().repoHistory[repoURL]
}

export function setRepoHistory(repoURL: string, commitHash: string): void {
  load().repoHistory[repoURL] = commitHash
  save()
}

export function invalidateCache(): void {
  cache = null
}
