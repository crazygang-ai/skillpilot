import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import { Skill, SkillUpdateCheckResult } from '../../shared/types'
import * as gitService from './git-service'

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
  const localTreeHash = lockHash || computeLocalGitTreeHash(skill.canonicalPath)
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

function computeLocalGitTreeHash(dirPath: string): string | undefined {
  try {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      return undefined
    }

    return buildTreeHash(dirPath, true)
  } catch {
    return undefined
  }
}

function buildTreeHash(dirPath: string, allowEmpty: boolean): string | undefined {
  const entries: Array<{
    name: string
    mode: string
    hash: Buffer
    isDirectory: boolean
  }> = []

  for (const entry of fs.readdirSync(dirPath)) {
    if (entry === '.git') {
      continue
    }

    const fullPath = path.join(dirPath, entry)
    const stat = fs.lstatSync(fullPath)

    if (stat.isDirectory()) {
      const childTreeHash = buildTreeHash(fullPath, false)
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
        hash: hashGitObject('blob', Buffer.from(fs.readlinkSync(fullPath))),
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
      hash: hashGitObject('blob', fs.readFileSync(fullPath)),
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
