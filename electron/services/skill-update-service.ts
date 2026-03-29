import fsPromises from 'fs/promises'
import path from 'path'
import {
  Skill, SkillUpdateStatus, SkillUpdateCheckResult, SkillUpdateApplyResult,
} from '../../shared/types'
import * as lockFileManager from './lock-file-manager'
import * as gitService from './git-service'
import * as commitHashCache from './commit-hash-cache'
import * as updateChecker from './update-checker'
import { copyDirectoryWithoutSymlinks } from './local-skill-importer'
import { safeGetTreeHash, safeGetCommitHash } from './skill-install-service'

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsPromises.access(p)
    return true
  } catch {
    return false
  }
}

export class SkillUpdateService {
  readonly updateStatuses = new Map<string, SkillUpdateStatus>()
  private cachedRemoteTreeHashes = new Map<string, string>()
  private cachedRemoteCommitHashes = new Map<string, string>()

  async checkForUpdate(skill: Skill): Promise<SkillUpdateCheckResult> {
    const skillId = skill.id

    this.updateStatuses.set(skillId, 'checking')

    try {
      const result = await updateChecker.checkSkillUpdate(skill)

      if (skill.lockEntry && !skill.lockEntry.skillFolderHash && result.localTreeHash) {
        const repairedLockEntry = {
          ...skill.lockEntry,
          stableId: skill.id,
          skillFolderHash: result.localTreeHash,
        }
        await lockFileManager.updateEntry(skillId, repairedLockEntry)
        skill.lockEntry = repairedLockEntry
      }

      this.updateStatuses.set(skillId, result.status)

      if (result.status === 'hasUpdate') {
        if (result.remoteTreeHash) {
          this.cachedRemoteTreeHashes.set(skillId, result.remoteTreeHash)
        }
        if (result.remoteCommitHash) {
          this.cachedRemoteCommitHashes.set(skillId, result.remoteCommitHash)
        }
      } else {
        this.cachedRemoteTreeHashes.delete(skillId)
        this.cachedRemoteCommitHashes.delete(skillId)
      }

      return result
    } catch (err) {
      this.updateStatuses.set(skillId, 'error')
      this.cachedRemoteTreeHashes.delete(skillId)
      this.cachedRemoteCommitHashes.delete(skillId)
      throw err instanceof Error ? err : new Error(`Failed to check updates for ${skillId}`)
    }
  }

  async checkAllUpdates(skills: Skill[]): Promise<void> {
    const updatable = skills.filter(s => s.lockEntry?.sourceType === 'github')
    await Promise.allSettled(updatable.map(s => this.checkForUpdate(s)))
  }

  async applyUpdate(skill: Skill): Promise<SkillUpdateApplyResult> {
    const skillId = skill.id
    if (!skill.lockEntry || skill.lockEntry.sourceType !== 'github') {
      throw new Error(`Skill is not updatable: ${skillId}`)
    }

    try {
      const repoDir = await gitService.shallowClone(skill.lockEntry.sourceUrl)
      const skillFolderPath = skill.lockEntry.skillPath.replace(/\/SKILL\.md$/, '')
      const sourceDir = path.resolve(path.join(repoDir, skillFolderPath))
      const resolvedRepo = path.resolve(repoDir)
      if (!sourceDir.startsWith(resolvedRepo + path.sep) && sourceDir !== resolvedRepo) {
        throw new Error(`Skill path escapes repo directory: ${skillFolderPath}`)
      }

      if (!await pathExists(sourceDir)) {
        throw new Error(`Skill source not found in repository: ${skill.lockEntry.skillPath}`)
      }

      const destDir = skill.canonicalPath
      const tempDir = destDir + '.new'
      const backupDir = destDir + '.bak'

      await fsPromises.rm(tempDir, { recursive: true, force: true })
      await fsPromises.rm(backupDir, { recursive: true, force: true })
      await copyDirectoryWithoutSymlinks(sourceDir, tempDir)

      try {
        if (await pathExists(destDir)) {
          await fsPromises.rename(destDir, backupDir)
        }
        await fsPromises.rename(tempDir, destDir)
        await fsPromises.rm(backupDir, { recursive: true, force: true }).catch(() => {})
      } catch (swapErr) {
        if (await pathExists(backupDir) && !(await pathExists(destDir))) {
          await fsPromises.rename(backupDir, destDir)
        }
        await fsPromises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
        throw swapErr
      }

      const treeHash = await safeGetTreeHash(sourceDir, repoDir)
      const commitHash = await safeGetCommitHash(repoDir)
      const now = new Date().toISOString()

      await lockFileManager.updateEntry(skillId, {
        ...skill.lockEntry,
        stableId: skill.id,
        skillFolderHash: treeHash,
        updatedAt: now,
      })

      if (commitHash) {
        await commitHashCache.setCommitHash(skillId, commitHash)
      }

      this.updateStatuses.set(skillId, 'upToDate')
      this.cachedRemoteTreeHashes.delete(skillId)
      this.cachedRemoteCommitHashes.delete(skillId)

      return {
        skillId,
        status: 'updated',
        remoteTreeHash: treeHash || undefined,
        remoteCommitHash: commitHash || undefined,
      }
    } catch (err) {
      this.updateStatuses.set(skillId, 'error')
      throw err instanceof Error ? err : new Error(`Failed to update skill ${skillId}`)
    }
  }

  async restoreTransientFields(skills: Skill[]): Promise<Skill[]> {
    return Promise.all(skills.map(async skill => {
      const localCommitHash = await commitHashCache.getCommitHash(skill.id) ?? await commitHashCache.getCommitHash(skill.storageName)
      return {
        ...skill,
        updateStatus: this.updateStatuses.get(skill.id) ?? 'notChecked',
        hasUpdate: this.updateStatuses.get(skill.id) === 'hasUpdate',
        remoteTreeHash: this.cachedRemoteTreeHashes.get(skill.id),
        remoteCommitHash: this.cachedRemoteCommitHashes.get(skill.id),
        localCommitHash,
      }
    }))
  }

  clearSkillCache(skillId: string): void {
    this.updateStatuses.delete(skillId)
    this.cachedRemoteTreeHashes.delete(skillId)
    this.cachedRemoteCommitHashes.delete(skillId)
  }
}
