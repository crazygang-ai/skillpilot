import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

const TEMP_BASE = path.join(os.tmpdir(), 'skillpilot-repos')

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

export function normalizeRepoURL(input: string): string {
  let url = input.trim()

  // owner/repo format
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) {
    return `https://github.com/${url}.git`
  }

  // HTTPS without .git
  if (url.startsWith('https://github.com/') && !url.endsWith('.git')) {
    url = url.replace(/\/$/, '') + '.git'
  }

  return url
}

export function extractOwnerRepo(repoUrl: string): string {
  const match = repoUrl.match(/github\.com[/:](.+?)(?:\.git)?$/)
  return match ? match[1] : repoUrl
}

export async function shallowClone(repoURL: string): Promise<string> {
  const normalized = normalizeRepoURL(repoURL)
  const repoName = extractOwnerRepo(normalized).replace(/\//g, '_')
  const destDir = path.join(TEMP_BASE, repoName)

  if (!fs.existsSync(TEMP_BASE)) {
    fs.mkdirSync(TEMP_BASE, { recursive: true })
  }

  if (fs.existsSync(destDir)) {
    // Pull latest
    try {
      await exec('git', ['pull', '--ff-only'], destDir)
      return destDir
    } catch {
      // If pull fails, re-clone
      fs.rmSync(destDir, { recursive: true, force: true })
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

export async function findCommitForTreeHash(
  _treeHash: string,
  _folderPath: string,
  repoDir: string,
): Promise<string | undefined> {
  try {
    const hash = await exec('git', ['log', '--format=%H', '-1'], repoDir)
    return hash || undefined
  } catch {
    return undefined
  }
}

/**
 * Scan a cloned repo for SKILL.md files (max 4 levels deep).
 */
export function scanSkillsInRepo(repoDir: string): string[] {
  const results: string[] = []
  scanRecursive(repoDir, repoDir, 0, 5, results)
  return results
}

function scanRecursive(
  base: string,
  dir: string,
  depth: number,
  maxDepth: number,
  results: string[],
): void {
  if (depth > maxDepth) return

  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return
  }

  // Check if current dir has SKILL.md
  if (entries.includes('SKILL.md')) {
    results.push(dir)
    return // Don't recurse into skill directories
  }

  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '__MACOSX') continue
    if (entry.startsWith('.') && entry !== '.claude' && entry !== '.cursor' && entry !== '.codex') continue

    const fullPath = path.join(dir, entry)
    try {
      if (fs.statSync(fullPath).isDirectory()) {
        scanRecursive(base, fullPath, depth + 1, maxDepth, results)
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
