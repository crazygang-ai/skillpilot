import fs from 'fs'
import path from 'path'
import { Skill, SkillScope, AgentType, SkillInstallation } from '../../shared/types'
import { AGENT_CONFIGS } from '../types/agent-config'
import { SHARED_SKILLS_DIR } from '../utils/constants'
import * as skillMDParser from './skill-md-parser'
import * as symlinkManager from './symlink-manager'
import * as lockFileManager from './lock-file-manager'

interface ScannedSkill {
  id: string
  canonicalPath: string
  scope: SkillScope
  installations: SkillInstallation[]
}

/**
 * Scan all skill directories and return deduplicated skill list.
 */
export async function scanAll(): Promise<Skill[]> {
  const skillMap = new Map<string, ScannedSkill>()

  // 1. Scan shared global directory
  scanDirectory(SHARED_SKILLS_DIR, { kind: 'sharedGlobal' }, skillMap)

  // 2. Scan each agent's skill directory
  for (const config of AGENT_CONFIGS) {
    scanDirectory(
      config.skillsDirectoryPath,
      { kind: 'agentLocal', agentType: config.type },
      skillMap,
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
    const skillId = entry

    // Check if this skill directory contains SKILL.md
    const skillMdPath = path.join(canonicalPath, 'SKILL.md')
    if (!fs.existsSync(skillMdPath)) continue

    if (skillMap.has(skillId)) {
      // Merge: add installation to existing skill
      const existing = skillMap.get(skillId)!
      mergeInstallation(existing, fullPath, defaultScope)
    } else {
      // New skill
      const installations = symlinkManager.findInstallations(skillId, canonicalPath)
      skillMap.set(skillId, {
        id: skillId,
        canonicalPath,
        scope: installations.length > 1 ? { kind: 'sharedGlobal' } : defaultScope,
        installations,
      })
    }
  }
}

function mergeInstallation(
  skill: ScannedSkill,
  _foundPath: string,
  _scope: SkillScope,
): void {
  // Promote scope to sharedGlobal if found in multiple locations
  if (skill.scope.kind !== 'sharedGlobal') {
    skill.scope = { kind: 'sharedGlobal' }
  }
}

function buildSkill(skillId: string, scanned: ScannedSkill): Skill | null {
  const skillMdPath = path.join(scanned.canonicalPath, 'SKILL.md')
  if (!fs.existsSync(skillMdPath)) return null

  try {
    const { metadata, markdownBody } = skillMDParser.parseFile(skillMdPath)
    const lockEntry = lockFileManager.getEntry(skillId)

    return {
      id: skillId,
      canonicalPath: scanned.canonicalPath,
      metadata: {
        ...metadata,
        name: metadata.name || skillId,
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
