import { execFile } from 'child_process'
import fsPromises from 'fs/promises'
import path from 'path'
import os from 'os'
import log from 'electron-log'

const TEMP_BASE = path.join(os.tmpdir(), 'skillpilot-repos')

async function pathExists(p: string): Promise<boolean> {
  try { await fsPromises.access(p); return true } catch { return false }
}

function exec(command: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, timeout: 60000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve(stdout.trim())
    })
  })
}

export async function isGitAvailable(): Promise<boolean> {
  try {
    await exec('which', ['git'])
    return true
  } catch {
    return false
  }
}

const KNOWN_GIT_HOSTS = ['github.com', 'gitlab.com', 'bitbucket.org']

export function normalizeRepoURL(input: string): string {
  let url = input.trim()

  // owner/repo shorthand — GitHub only
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) {
    return `https://github.com/${url}.git`
  }

  // HTTPS without .git for known hosts
  if (!url.endsWith('.git')) {
    const isKnownHost = KNOWN_GIT_HOSTS.some(host => url.includes(`://${host}/`) || url.includes(`@${host}:`))
    if (isKnownHost) {
      url = url.replace(/\/$/, '') + '.git'
    }
  }

  return url
}

export function extractOwnerRepo(repoUrl: string): string {
  const match = repoUrl.match(/(?:github\.com|gitlab\.com|bitbucket\.org)[/:](.+?)(?:\.git)?$/)
  return match ? match[1] : repoUrl
}

const inflightClones = new Map<string, Promise<string>>()

export async function shallowClone(repoURL: string): Promise<string> {
  const normalized = normalizeRepoURL(repoURL)

  const inflight = inflightClones.get(normalized)
  if (inflight) return inflight

  const promise = shallowCloneInternal(normalized)
  inflightClones.set(normalized, promise)

  try {
    return await promise
  } finally {
    inflightClones.delete(normalized)
  }
}

async function shallowCloneInternal(normalized: string): Promise<string> {
  const repoName = extractOwnerRepo(normalized).replace(/\//g, '_')
  const destDir = path.join(TEMP_BASE, repoName)

  if (!(await pathExists(TEMP_BASE))) {
    await fsPromises.mkdir(TEMP_BASE, { recursive: true })
  }

  if (await pathExists(destDir)) {
    try {
      await exec('git', ['pull', '--ff-only'], destDir)
      return destDir
    } catch (pullErr) {
      log.warn(`git pull failed for ${destDir}:`, (pullErr as Error).message)
      const staleDir = destDir + '.stale'
      await fsPromises.rm(staleDir, { recursive: true, force: true }).catch(() => {})
      await fsPromises.rename(destDir, staleDir)
      try {
        await exec('git', ['clone', '--depth', '1', normalized, destDir])
        await fsPromises.rm(staleDir, { recursive: true, force: true }).catch(() => {})
        return destDir
      } catch (cloneErr) {
        log.warn(`Re-clone also failed for ${normalized}, falling back to stale cache:`, (cloneErr as Error).message)
        await fsPromises.rename(staleDir, destDir)
        return destDir
      }
    }
  }

  await exec('git', ['clone', '--depth', '1', normalized, destDir])
  return destDir
}

export async function getTreeHash(folderPath: string, repoDir: string): Promise<string> {
  const relativePath = path.relative(repoDir, folderPath)
  const ref = relativePath ? `HEAD:${relativePath}` : 'HEAD^{tree}'
  return exec('git', ['rev-parse', ref], repoDir)
}

export async function getCommitHash(repoDir: string): Promise<string> {
  return exec('git', ['rev-parse', 'HEAD'], repoDir)
}

/**
 * Scan a cloned repo for SKILL.md files (max 4 levels deep).
 */
export async function scanSkillsInRepo(repoDir: string): Promise<string[]> {
  const results: string[] = []
  await scanRecursive(repoDir, repoDir, 0, 5, results)
  return results
}

async function scanRecursive(
  base: string,
  dir: string,
  depth: number,
  maxDepth: number,
  results: string[],
): Promise<void> {
  if (depth > maxDepth) return

  let entries: string[]
  try {
    entries = await fsPromises.readdir(dir)
  } catch {
    return
  }

  if (entries.includes('SKILL.md')) {
    results.push(dir)
    return
  }

  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '__MACOSX') continue
    if (entry.startsWith('.') && entry !== '.claude' && entry !== '.cursor' && entry !== '.codex') continue

    const fullPath = path.join(dir, entry)
    try {
      const stat = await fsPromises.stat(fullPath)
      if (stat.isDirectory()) {
        await scanRecursive(base, fullPath, depth + 1, maxDepth, results)
      }
    } catch {
      continue
    }
  }
}

export function githubCompareURL(source: string, oldHash: string, newHash: string): string {
  return `https://github.com/${source}/compare/${oldHash.slice(0, 7)}...${newHash.slice(0, 7)}`
}

export function githubWebURL(sourceUrl: string): string {
  return sourceUrl
    .replace(/\.git$/, '')
    .replace('git@github.com:', 'https://github.com/')
}

export async function cleanupTempRepos(maxAgeMs = 24 * 60 * 60 * 1000): Promise<void> {
  if (!(await pathExists(TEMP_BASE))) return
  try {
    for (const entry of await fsPromises.readdir(TEMP_BASE)) {
      const entryPath = path.join(TEMP_BASE, entry)
      try {
        const stat = await fsPromises.stat(entryPath)
        if (Date.now() - stat.mtimeMs > maxAgeMs) {
          await fsPromises.rm(entryPath, { recursive: true, force: true })
        }
      } catch {
        // skip entries that can't be stat'd
      }
    }
  } catch {
    // skip if temp dir is inaccessible
  }
}
