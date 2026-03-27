import fs from 'fs'
import path from 'path'
import { AgentType, SkillInstallation, InheritedSource } from '../../shared/types'
import { AGENT_CONFIGS } from '../types/agent-config'
import { SHARED_SKILLS_DIR } from '../utils/constants'

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

function canInherit(canonicalPath: string, agentType: AgentType): boolean {
  const config = AGENT_CONFIGS.find(c => c.type === agentType)
  if (!config) return false
  const skillName = path.basename(canonicalPath)
  for (const readable of config.additionalReadableSkillsDirectories) {
    const inheritedPath = path.join(readable.path, skillName)
    if (!fs.existsSync(inheritedPath)) continue
    try {
      if (fs.realpathSync(inheritedPath) === fs.realpathSync(canonicalPath)) return true
    } catch { /* ignore */ }
  }
  return false
}

export function createSymlink(canonicalPath: string, agentType: AgentType): void {
  if (canInherit(canonicalPath, agentType)) return

  const config = AGENT_CONFIGS.find(c => c.type === agentType)
  if (!config) throw new Error(`Unknown agent type: ${agentType}`)

  const skillName = path.basename(canonicalPath)
  assertSafeName(skillName)

  const targetDir = config.skillsDirectoryPath
  const linkPath = path.join(targetDir, skillName)
  assertWithinDir(linkPath, targetDir)

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  if (fs.existsSync(linkPath)) {
    const stat = fs.lstatSync(linkPath)
    if (stat.isSymbolicLink()) {
      const existingTarget = fs.readlinkSync(linkPath)
      if (existingTarget === canonicalPath) return
      fs.unlinkSync(linkPath)
    } else {
      return
    }
  }

  fs.symlinkSync(canonicalPath, linkPath, 'dir')
}

export function removeSymlink(skillName: string, agentType: AgentType): void {
  const config = AGENT_CONFIGS.find(c => c.type === agentType)
  if (!config) throw new Error(`Unknown agent type: ${agentType}`)

  assertSafeName(skillName)
  const linkPath = path.join(config.skillsDirectoryPath, skillName)
  assertWithinDir(linkPath, config.skillsDirectoryPath)

  if (!fs.existsSync(linkPath)) return

  const stat = fs.lstatSync(linkPath)
  if (stat.isSymbolicLink()) {
    fs.unlinkSync(linkPath)
  }
}

export function isSymlink(filePath: string): boolean {
  try {
    return fs.lstatSync(filePath).isSymbolicLink()
  } catch {
    return false
  }
}

export function resolveCanonical(filePath: string): string {
  try {
    return fs.realpathSync(filePath)
  } catch {
    return filePath
  }
}

/**
 * Find all installations of a skill across agents.
 * Two-pass: 1) direct installations in agent dirs, 2) inherited via additionalReadableSkillsDirectories
 */
export function findInstallations(skillId: string, canonicalPath: string): SkillInstallation[] {
  const installations: SkillInstallation[] = []

  // Pass 1: Direct installations
  for (const config of AGENT_CONFIGS) {
    const skillPath = path.join(config.skillsDirectoryPath, skillId)
    if (!fs.existsSync(skillPath)) continue

    const resolved = resolveCanonical(skillPath)
    if (resolved !== canonicalPath) continue

    installations.push({
      agentType: config.type,
      path: skillPath,
      isSymlink: isSymlink(skillPath),
      isInherited: false,
    })
  }

  // Pass 2: Inherited installations (read-only, from other agents' directories)
  for (const config of AGENT_CONFIGS) {
    // Skip if already has direct installation
    if (installations.some(i => i.agentType === config.type)) continue

    for (const readable of config.additionalReadableSkillsDirectories) {
      const skillPath = path.join(readable.path, skillId)
      if (!fs.existsSync(skillPath)) continue

      const resolved = resolveCanonical(skillPath)
      if (resolved !== canonicalPath) continue

      const inheritedFrom: InheritedSource = readable.sourceKind === 'agent'
        ? { sourceKind: 'agent', agentType: readable.agentType }
        : { sourceKind: 'shared' }

      installations.push({
        agentType: config.type,
        path: skillPath,
        isSymlink: isSymlink(skillPath),
        isInherited: true,
        inheritedFrom,
      })
      break // Only count first inherited source per agent
    }
  }

  // Also check shared directory
  const sharedPath = path.join(SHARED_SKILLS_DIR, skillId)
  if (fs.existsSync(sharedPath)) {
    const resolved = resolveCanonical(sharedPath)
    if (resolved === canonicalPath) {
      // Check if any agent doesn't already have this
      // (shared skills are available to agents that scan shared dir)
    }
  }

  return installations
}
