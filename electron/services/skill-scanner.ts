import fsPromises from 'fs/promises'
import path from 'path'
import log from 'electron-log'
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

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsPromises.access(p)
    return true
  } catch {
    return false
  }
}

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
  const lockEntries = (await lockFileManager.read()).skills

  // 1. Scan shared global directory
  await scanDirectory(SHARED_SKILLS_DIR, { kind: 'sharedGlobal' }, skillMap, lockEntries)

  // 2. Scan each agent's skill directory
  for (const config of AGENT_CONFIGS) {
    await scanDirectory(
      config.skillsDirectoryPath,
      { kind: 'agentLocal', agentType: config.type },
      skillMap,
      lockEntries,
    )
  }

  // 3. Parse each skill's SKILL.md and build full Skill objects
  const skills: Skill[] = []
  for (const [skillId, scanned] of skillMap) {
    const skill = await buildSkill(skillId, scanned)
    if (skill) skills.push(skill)
  }

  // Sort by name
  skills.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name))

  return skills
}

async function scanDirectory(
  dirPath: string,
  defaultScope: SkillScope,
  skillMap: Map<string, ScannedSkill>,
  lockEntries: Record<string, Skill['lockEntry']>,
): Promise<void> {
  if (!await pathExists(dirPath)) return

  let entries: string[]
  try {
    entries = await fsPromises.readdir(dirPath)
  } catch (err) {
    log.warn('Failed to read skill directory:', dirPath, err)
    return
  }

  for (const entry of entries) {
    if (entry.startsWith('.') || entry === '__MACOSX' || entry === 'node_modules') continue

    const fullPath = path.join(dirPath, entry)
    try {
      const stat = await fsPromises.lstat(fullPath)
      if (!stat.isDirectory() && !stat.isSymbolicLink()) continue
    } catch (err) {
      log.warn('Failed to stat entry:', fullPath, err)
      continue
    }

    const canonicalPath = await symlinkManager.resolveCanonical(fullPath)
    const storageName = entry
    const initialLockEntry = lockEntries[storageName]
    const resolvedSkillId = resolveStableSkillId(canonicalPath, initialLockEntry)
    const lockEntry = lockEntries[resolvedSkillId] ?? initialLockEntry
    const skillId = resolveStableSkillId(canonicalPath, lockEntry)
    const directoryName = resolveDirectoryName(storageName, canonicalPath, lockEntry)

    const skillMdPath = path.join(canonicalPath, 'SKILL.md')
    if (!await pathExists(skillMdPath)) continue

    if (skillMap.has(skillId)) {
      const existing = skillMap.get(skillId)!
      await mergeInstallation(existing, storageName, canonicalPath)
    } else {
      const installations = await symlinkManager.findInstallations(storageName, canonicalPath)
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

async function mergeInstallation(
  skill: ScannedSkill,
  storageName: string,
  canonicalPath: string,
): Promise<void> {
  const existingPaths = new Set(skill.installations.map((installation) => installation.path))
  for (const installation of await symlinkManager.findInstallations(storageName, canonicalPath)) {
    if (!existingPaths.has(installation.path)) {
      skill.installations.push(installation)
    }
  }
}

async function buildSkill(skillId: string, scanned: ScannedSkill): Promise<Skill | null> {
  const skillMdPath = path.join(scanned.canonicalPath, 'SKILL.md')
  if (!await pathExists(skillMdPath)) return null

  try {
    const { metadata, markdownBody } = await skillMDParser.parseFile(skillMdPath)
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
  } catch (err) {
    log.warn('Failed to parse SKILL.md:', skillMdPath, err)
    return null
  }
}
