import fs from 'fs'
import path from 'path'
import { Skill, SkillScope, AgentType, SkillInstallation } from '../../shared/types'
import { AGENT_CONFIGS } from '../types/agent-config'
import { SHARED_SKILLS_DIR } from '../utils/constants'
import * as skillMDParser from './skill-md-parser'
import * as symlinkManager from './symlink-manager'
import * as lockFileManager from './lock-file-manager'
import {
  resolveDirectoryName,
  resolveStableSkillId,
} from './skill-identity'

interface ScannedSkill {
  id: string
  storageName: string
  directoryName: string
  canonicalPath: string
  scope: SkillScope
  installations: SkillInstallation[]
  lockEntry?: Skill['lockEntry']
}

/**
 * Scan all skill directories and return deduplicated skill list.
 */
export async function scanAll(): Promise<Skill[]> {
  const skillMap = new Map<string, ScannedSkill>()
  const lockEntries = lockFileManager.read().skills

  // 1. Scan shared global directory
  scanDirectory(SHARED_SKILLS_DIR, { kind: 'sharedGlobal' }, skillMap, lockEntries)

  // 2. Scan each agent's skill directory
  for (const config of AGENT_CONFIGS) {
    scanDirectory(
      config.skillsDirectoryPath,
      { kind: 'agentLocal', agentType: config.type },
      skillMap,
      lockEntries,
    )
  }

  // 3. Parse each skill's SKILL.md and build full Skill objects
  const skills: Skill[] = []
  for (const [skillId, scanned] of skillMap) {
    const skill = buildSkill(skillId, scanned)
    if (skill) skills.push(skill)
  }

  // Sort by name
  skills.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name))

  return skills
}

function scanDirectory(
  dirPath: string,
  defaultScope: SkillScope,
  skillMap: Map<string, ScannedSkill>,
  lockEntries: Record<string, Skill['lockEntry']>,
): void {
  if (!fs.existsSync(dirPath)) return

  let entries: string[]
  try {
    entries = fs.readdirSync(dirPath)
  } catch {
    return
  }

  for (const entry of entries) {
    if (entry.startsWith('.') || entry === '__MACOSX' || entry === 'node_modules') continue

    const fullPath = path.join(dirPath, entry)
    try {
      const stat = fs.lstatSync(fullPath)
      if (!stat.isDirectory() && !stat.isSymbolicLink()) continue
    } catch {
      continue
    }

    const canonicalPath = symlinkManager.resolveCanonical(fullPath)
    const storageName = entry
    const initialLockEntry = lockEntries[storageName]
    const resolvedSkillId = resolveStableSkillId(canonicalPath, initialLockEntry)
    const lockEntry = lockEntries[resolvedSkillId] ?? initialLockEntry
    const skillId = resolveStableSkillId(canonicalPath, lockEntry)
    const directoryName = resolveDirectoryName(storageName, canonicalPath, lockEntry)

    // Check if this skill directory contains SKILL.md
    const skillMdPath = path.join(canonicalPath, 'SKILL.md')
    if (!fs.existsSync(skillMdPath)) continue

    if (skillMap.has(skillId)) {
      // Merge: add installation to existing skill
      const existing = skillMap.get(skillId)!
      mergeInstallation(existing, storageName, canonicalPath)
    } else {
      // New skill
      const installations = symlinkManager.findInstallations(storageName, canonicalPath)
      const storageScope = resolveStorageScope(canonicalPath, defaultScope)
      skillMap.set(skillId, {
        id: skillId,
        storageName,
        directoryName,
        canonicalPath,
        scope: storageScope,
        installations,
        lockEntry,
      })
    }
  }
}

function resolveStorageScope(canonicalPath: string, defaultScope: SkillScope): SkillScope {
  const resolved = path.resolve(canonicalPath)
  const sharedDir = path.resolve(SHARED_SKILLS_DIR)
  if (resolved.startsWith(sharedDir + path.sep) || resolved === sharedDir) {
    return { kind: 'sharedGlobal' }
  }
  return defaultScope
}

function mergeInstallation(
  skill: ScannedSkill,
  storageName: string,
  canonicalPath: string,
): void {
  const existingPaths = new Set(skill.installations.map((installation) => installation.path))
  for (const installation of symlinkManager.findInstallations(storageName, canonicalPath)) {
    if (!existingPaths.has(installation.path)) {
      skill.installations.push(installation)
    }
  }
}

function buildSkill(skillId: string, scanned: ScannedSkill): Skill | null {
  const skillMdPath = path.join(scanned.canonicalPath, 'SKILL.md')
  if (!fs.existsSync(skillMdPath)) return null

  try {
    const { metadata, markdownBody } = skillMDParser.parseFile(skillMdPath)
    const lockEntry = scanned.lockEntry
      ? {
          ...scanned.lockEntry,
          stableId: scanned.lockEntry.stableId ?? skillId,
        }
      : undefined

    return {
      id: skillId,
      storageName: scanned.storageName,
      directoryName: scanned.directoryName,
      canonicalPath: scanned.canonicalPath,
      metadata: {
        ...metadata,
        name: metadata.name || scanned.directoryName,
      },
      markdownBody,
      scope: scanned.scope,
      installations: scanned.installations,
      lockEntry,
      hasUpdate: false,
      updateStatus: 'notChecked',
    }
  } catch {
    return null
  }
}
