import fsPromises from 'fs/promises'
import path from 'path'
import {
  AgentType, InstallInput, InstallResult, LockEntry,
} from '../../shared/types'
import { SHARED_SKILLS_DIR } from '../utils/constants'
import * as lockFileManager from './lock-file-manager'
import * as symlinkManager from './symlink-manager'
import * as gitService from './git-service'
import * as commitHashCache from './commit-hash-cache'
import {
  copyDirectoryWithoutSymlinks,
  resolveLocalSkillImport,
} from './local-skill-importer'
import {
  createGitHubSkillId,
  resolveLocalStableSkillId,
} from './skill-identity'

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsPromises.access(p)
    return true
  } catch {
    return false
  }
}

export async function installFromRemote(input: InstallInput): Promise<InstallResult> {
  try {
    const available = await gitService.isGitAvailable()
    if (!available) {
      return { success: false, error: 'GIT_NOT_FOUND' }
    }

    const repoDir = await gitService.shallowClone(input.repoUrl)
    let skillDirs = await gitService.scanSkillsInRepo(repoDir)

    if (skillDirs.length === 0) {
      return { success: false, error: 'No skills found in repository' }
    }

    if (input.skillId) {
      const target = skillDirs.filter(d => path.basename(d) === input.skillId)
      if (target.length === 0) {
        return { success: false, error: `Skill "${input.skillId}" not found in repository (found: ${skillDirs.map(d => path.basename(d)).join(', ')})` }
      }
      skillDirs = target
    }

    const installedIds: string[] = []

    for (const skillDir of skillDirs) {
      const skillPath = path.relative(repoDir, skillDir) + '/SKILL.md'
      const skillId = createGitHubSkillId(input.repoUrl, skillPath)
      const destDir = path.join(SHARED_SKILLS_DIR, skillId)

      if (!await pathExists(SHARED_SKILLS_DIR)) {
        await fsPromises.mkdir(SHARED_SKILLS_DIR, { recursive: true })
      }
      if (await pathExists(destDir)) {
        await fsPromises.rm(destDir, { recursive: true, force: true })
      }
      await copyDirectoryWithoutSymlinks(skillDir, destDir)

      for (const agentType of input.agentTypes) {
        await symlinkManager.createSymlink(destDir, agentType)
      }

      const ownerRepo = gitService.extractOwnerRepo(input.repoUrl)
      const treeHash = await safeGetTreeHash(skillDir, repoDir)
      const commitHash = await safeGetCommitHash(repoDir)
      const now = new Date().toISOString()

      const lockEntry: LockEntry = {
        stableId: skillId,
        source: ownerRepo,
        sourceType: input.source,
        sourceUrl: gitService.normalizeRepoURL(input.repoUrl),
        skillPath,
        skillFolderHash: treeHash,
        installedAt: now,
        updatedAt: now,
      }
      await lockFileManager.updateEntry(skillId, lockEntry)

      if (commitHash) {
        await commitHashCache.setCommitHash(skillId, commitHash)
      }

      installedIds.push(skillId)
    }

    return { success: true, skillCount: installedIds.length, installedSkillIds: installedIds }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Installation failed'
    return { success: false, error: message }
  }
}

export async function installFromLocal(localPath: string, agentTypes: AgentType[]): Promise<InstallResult> {
  try {
    const {
      realPath,
      directoryName,
    } = await resolveLocalSkillImport(localPath)
    const skillId = resolveLocalStableSkillId(realPath, (await lockFileManager.read()).skills)

    const destDir = path.join(SHARED_SKILLS_DIR, skillId)
    if (!await pathExists(SHARED_SKILLS_DIR)) {
      await fsPromises.mkdir(SHARED_SKILLS_DIR, { recursive: true })
    }
    if (await pathExists(destDir)) {
      await fsPromises.rm(destDir, { recursive: true, force: true })
    }
    await copyDirectoryWithoutSymlinks(realPath, destDir)

    for (const agentType of agentTypes) {
      await symlinkManager.createSymlink(destDir, agentType)
    }

    const now = new Date().toISOString()
    const lockEntry: LockEntry = {
      stableId: skillId,
      source: directoryName,
      sourceType: 'local',
      sourceUrl: realPath,
      skillPath: 'SKILL.md',
      skillFolderHash: '',
      installedAt: now,
      updatedAt: now,
    }
    await lockFileManager.updateEntry(skillId, lockEntry)

    return { success: true, skillCount: 1, installedSkillIds: [skillId] }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Local install failed'
    return { success: false, error: message }
  }
}

export async function safeGetTreeHash(skillDir: string, repoDir: string): Promise<string> {
  try {
    return await gitService.getTreeHash(skillDir, repoDir)
  } catch {
    return ''
  }
}

export async function safeGetCommitHash(repoDir: string): Promise<string> {
  try {
    return await gitService.getCommitHash(repoDir)
  } catch {
    return ''
  }
}
