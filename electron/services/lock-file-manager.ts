import fs from 'fs'
import path from 'path'
import { LockEntry, LockFile } from '../../shared/types'
import { LOCK_FILE_PATH, LOCK_FILE_VERSION } from '../utils/constants'

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
    const parsed = JSON.parse(raw) as LockFile
    cache = parsed
    return parsed
  } catch {
    cache = createEmpty()
    return cache
  }
}

export function getEntry(skillId: string): LockEntry | undefined {
  const lockFile = read()
  return lockFile.skills[skillId]
}

export function updateEntry(skillId: string, entry: LockEntry): void {
  const lockFile = read()
  lockFile.skills[skillId] = entry
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
