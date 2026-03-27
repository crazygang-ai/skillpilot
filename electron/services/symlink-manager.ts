import fsPromises from 'fs/promises'
import path from 'path'
import log from 'electron-log'
import { AgentType, SkillInstallation, InheritedSource } from '../../shared/types'
import { AGENT_CONFIGS } from '../types/agent-config'
import { SHARED_SKILLS_DIR } from '../utils/constants'

async function pathExists(p: string): Promise<boolean> {
  try { await fsPromises.access(p); return true } catch { return false }
}

function assertSafeName(name: string): void {
  if (!name || name.includes('..') || name.includes(path.sep) || name.includes('/')) {
    throw new Error(`Unsafe skill name: ${name}`)
  }
}

function assertWithinDir(filePath: string, parentDir: string): void {
  const resolved = path.resolve(filePath)
  const resolvedParent = path.resolve(parentDir)
  if (!resolved.startsWith(resolvedParent + path.sep) && resolved !== resolvedParent) {
    throw new Error(`Path ${resolved} escapes directory ${resolvedParent}`)
  }
}

async function canInherit(canonicalPath: string, agentType: AgentType): Promise<boolean> {
  const config = AGENT_CONFIGS.find(c => c.type === agentType)
  if (!config) return false
  const skillName = path.basename(canonicalPath)
  for (const readable of config.additionalReadableSkillsDirectories) {
    const inheritedPath = path.join(readable.path, skillName)
    if (!(await pathExists(inheritedPath))) continue
    try {
      const [resolvedInherited, resolvedCanonical] = await Promise.all([
        fsPromises.realpath(inheritedPath),
        fsPromises.realpath(canonicalPath),
      ])
      if (resolvedInherited === resolvedCanonical) return true
    } catch (err) {
      log.warn('Failed to resolve realpath for inheritance check:', inheritedPath, err)
    }
  }
  return false
}

export async function createSymlink(canonicalPath: string, agentType: AgentType): Promise<void> {
  if (await canInherit(canonicalPath, agentType)) return

  const config = AGENT_CONFIGS.find(c => c.type === agentType)
  if (!config) throw new Error(`Unknown agent type: ${agentType}`)

  const skillName = path.basename(canonicalPath)
  assertSafeName(skillName)

  const targetDir = config.skillsDirectoryPath
  const linkPath = path.join(targetDir, skillName)
  assertWithinDir(linkPath, targetDir)

  if (!(await pathExists(targetDir))) {
    await fsPromises.mkdir(targetDir, { recursive: true })
  }

  if (await pathExists(linkPath)) {
    const stat = await fsPromises.lstat(linkPath)
    if (stat.isSymbolicLink()) {
      const existingTarget = await fsPromises.readlink(linkPath)
      if (existingTarget === canonicalPath) return
      await fsPromises.unlink(linkPath)
    } else {
      throw new Error(
        `Cannot create symlink at ${linkPath}: a non-symlink entry already exists. ` +
        `Remove it manually or use a different skill name.`
      )
    }
  }

  await fsPromises.symlink(canonicalPath, linkPath, 'dir')
}

export async function removeSymlink(skillName: string, agentType: AgentType): Promise<void> {
  const config = AGENT_CONFIGS.find(c => c.type === agentType)
  if (!config) throw new Error(`Unknown agent type: ${agentType}`)

  assertSafeName(skillName)
  const linkPath = path.join(config.skillsDirectoryPath, skillName)
  assertWithinDir(linkPath, config.skillsDirectoryPath)

  if (!(await pathExists(linkPath))) return

  const stat = await fsPromises.lstat(linkPath)
  if (stat.isSymbolicLink()) {
    await fsPromises.unlink(linkPath)
  }
}

export async function isSymlink(filePath: string): Promise<boolean> {
  try {
    return (await fsPromises.lstat(filePath)).isSymbolicLink()
  } catch (err) {
    log.warn('Failed to check symlink status:', filePath, err)
    return false
  }
}

export async function resolveCanonical(filePath: string): Promise<string> {
  try {
    return await fsPromises.realpath(filePath)
  } catch (err) {
    log.warn('Failed to resolve canonical path:', filePath, err)
    return filePath
  }
}

/**
 * Find all installations of a skill across agents.
 * Two-pass: 1) direct installations in agent dirs, 2) inherited via additionalReadableSkillsDirectories
 */
export async function findInstallations(skillId: string, canonicalPath: string): Promise<SkillInstallation[]> {
  const installations: SkillInstallation[] = []

  // Pass 1: Direct installations
  for (const config of AGENT_CONFIGS) {
    const skillPath = path.join(config.skillsDirectoryPath, skillId)
    if (!(await pathExists(skillPath))) continue

    const resolved = await resolveCanonical(skillPath)
    if (resolved !== canonicalPath) continue

    installations.push({
      agentType: config.type,
      path: skillPath,
      isSymlink: await isSymlink(skillPath),
      isInherited: false,
    })
  }

  // Pass 2: Inherited installations (read-only, from other agents' directories)
  for (const config of AGENT_CONFIGS) {
    if (installations.some(i => i.agentType === config.type)) continue

    for (const readable of config.additionalReadableSkillsDirectories) {
      const skillPath = path.join(readable.path, skillId)
      if (!(await pathExists(skillPath))) continue

      const resolved = await resolveCanonical(skillPath)
      if (resolved !== canonicalPath) continue

      const inheritedFrom: InheritedSource = readable.sourceKind === 'agent'
        ? { sourceKind: 'agent', agentType: readable.agentType }
        : { sourceKind: 'shared' }

      installations.push({
        agentType: config.type,
        path: skillPath,
        isSymlink: await isSymlink(skillPath),
        isInherited: true,
        inheritedFrom,
      })
      break
    }
  }

  return installations
}
