import { createHash } from 'crypto'
import fsPromises from 'fs/promises'
import path from 'path'
import { Skill, SkillUpdateCheckResult } from '../../shared/types'
import * as gitService from './git-service'

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsPromises.access(p)
    return true
  } catch {
    return false
  }
}

/**
 * Check if a skill has updates by comparing local tree hash vs remote.
 * Supports GitHub sources via git tree hash comparison.
 */
export async function checkSkillUpdate(skill: Skill): Promise<SkillUpdateCheckResult> {
  if (!skill.lockEntry) {
    return {
      skillId: skill.id,
      status: 'notSupported',
      hasUpdate: false,
      message: 'This skill has no update metadata.',
    }
  }

  if (skill.lockEntry.sourceType !== 'github') {
    return {
      skillId: skill.id,
      status: 'notSupported',
      hasUpdate: false,
      message: 'Only GitHub-backed skills support update checks.',
    }
  }

  const repoDir = await gitService.shallowClone(skill.lockEntry.sourceUrl)
  const skillFolderPath = getSkillFolderPath(repoDir, skill.lockEntry.skillPath)

  const remoteTreeHash = await gitService.getTreeHash(skillFolderPath, repoDir)
  const remoteCommitHash = await gitService.getCommitHash(repoDir)

  const lockHash = skill.lockEntry.skillFolderHash.trim()
  const localTreeHash = lockHash || await computeLocalGitTreeHash(skill.canonicalPath)
  if (!localTreeHash) {
    return {
      skillId: skill.id,
      status: 'unknownHash',
      hasUpdate: false,
      remoteTreeHash,
      remoteCommitHash,
      message: 'Unable to determine the local baseline hash for this skill. Reinstall or update it to create a fresh baseline.',
    }
  }

  const hasUpdate = remoteTreeHash !== localTreeHash

  return {
    skillId: skill.id,
    status: hasUpdate ? 'hasUpdate' : 'upToDate',
    hasUpdate,
    localTreeHash,
    remoteTreeHash,
    remoteCommitHash,
  }
}

function getSkillFolderPath(repoDir: string, skillPath: string): string {
  const parts = skillPath.split('/')
  parts.pop() // Remove SKILL.md
  const relativePath = parts.join('/')
  const resolved = relativePath
    ? path.resolve(path.join(repoDir, relativePath))
    : path.resolve(repoDir)
  const resolvedRepo = path.resolve(repoDir)
  if (!resolved.startsWith(resolvedRepo + path.sep) && resolved !== resolvedRepo) {
    throw new Error(`Skill path escapes repo directory: ${skillPath}`)
  }
  return resolved
}

async function computeLocalGitTreeHash(dirPath: string): Promise<string | undefined> {
  try {
    if (!await pathExists(dirPath) || !(await fsPromises.stat(dirPath)).isDirectory()) {
      return undefined
    }

    return await buildTreeHash(dirPath, true)
  } catch {
    return undefined
  }
}

async function buildTreeHash(dirPath: string, allowEmpty: boolean): Promise<string | undefined> {
  const entries: Array<{
    name: string
    mode: string
    hash: Buffer
    isDirectory: boolean
  }> = []

  for (const entry of await fsPromises.readdir(dirPath)) {
    if (entry === '.git') {
      continue
    }

    const fullPath = path.join(dirPath, entry)
    const stat = await fsPromises.lstat(fullPath)

    if (stat.isDirectory()) {
      const childTreeHash = await buildTreeHash(fullPath, false)
      if (!childTreeHash) {
        continue
      }

      entries.push({
        name: entry,
        mode: '40000',
        hash: Buffer.from(childTreeHash, 'hex'),
        isDirectory: true,
      })
      continue
    }

    if (stat.isSymbolicLink()) {
      entries.push({
        name: entry,
        mode: '120000',
        hash: hashGitObject('blob', Buffer.from(await fsPromises.readlink(fullPath))),
        isDirectory: false,
      })
      continue
    }

    if (!stat.isFile()) {
      continue
    }

    const mode = stat.mode & 0o111 ? '100755' : '100644'
    entries.push({
      name: entry,
      mode,
      hash: hashGitObject('blob', await fsPromises.readFile(fullPath)),
      isDirectory: false,
    })
  }

  if (entries.length === 0) {
    return allowEmpty ? EMPTY_TREE_HASH : undefined
  }

  entries.sort((left, right) => {
    const leftName = left.isDirectory ? `${left.name}/` : left.name
    const rightName = right.isDirectory ? `${right.name}/` : right.name
    return Buffer.from(leftName).compare(Buffer.from(rightName))
  })

  const body = Buffer.concat(
    entries.map((entry) =>
      Buffer.concat([
        Buffer.from(`${entry.mode} ${entry.name}\0`),
        entry.hash,
      ]),
    ),
  )

  return hashGitObject('tree', body).toString('hex')
}

function hashGitObject(type: 'blob' | 'tree', content: Buffer): Buffer {
  const header = Buffer.from(`${type} ${content.length}\0`)
  return createHash('sha1').update(header).update(content).digest()
}

const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
