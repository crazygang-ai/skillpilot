import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import {
  Skill, Agent, AgentType, SkillMetadata,
  InstallInput, InstallResult, LockEntry, SkillUpdateApplyResult, SkillUpdateCheckResult, SkillUpdateStatus,
} from '../../shared/types'
import { SHARED_SKILLS_DIR } from '../utils/constants'
import { AGENT_CONFIGS } from '../types/agent-config'
import * as agentDetector from './agent-detector'
import * as skillScanner from './skill-scanner'
import * as lockFileManager from './lock-file-manager'
import * as symlinkManager from './symlink-manager'
import * as gitService from './git-service'
import * as commitHashCache from './commit-hash-cache'
import * as skillMDParser from './skill-md-parser'
import * as updateChecker from './update-checker'
import { FileSystemWatcher } from './file-system-watcher'
import {
  copyDirectoryWithoutSymlinks,
  resolveLocalSkillImport,
} from './local-skill-importer'
import {
  createGitHubSkillId,
  resolveLocalStableSkillId,
} from './skill-identity'

export class SkillManager extends EventEmitter {
  skills: Skill[] = []
  agents: Agent[] = []
  isLoading = false

  private updateStatuses = new Map<string, SkillUpdateStatus>()
  private cachedRemoteTreeHashes = new Map<string, string>()
  private cachedRemoteCommitHashes = new Map<string, string>()

  private watcher = new FileSystemWatcher()
  private refreshInProgress = false
  private refreshQueued = false

  constructor() {
    super()
    this.watcher.on('change', () => {
      this.emit('watcherChanged')
      this.refresh().catch(console.error)
    })
  }

  // ---- Lifecycle ----

  async refresh(): Promise<void> {
    if (this.refreshInProgress) {
      this.refreshQueued = true
      return
    }

    this.refreshInProgress = true
    this.isLoading = true
    this.emit('stateChanged')

    try {
      lockFileManager.invalidateCache()
      lockFileManager.createIfNotExists()

      const [agents, skills] = await Promise.all([
        agentDetector.detectAll(),
        skillScanner.scanAll(),
      ])

      this.skills = this.restoreTransientFields(skills)
      this.agents = agents.map(agent => ({
        ...agent,
        skillCount: skills.filter(s =>
          s.installations.some(i => i.agentType === agent.type)
        ).length,
      }))

      const watchPaths = [
        SHARED_SKILLS_DIR,
        ...AGENT_CONFIGS
          .filter(c => agents.some(a => a.type === c.type && a.isInstalled))
          .map(c => c.skillsDirectoryPath),
      ]
      this.watcher.startWatching(watchPaths)
    } catch (err) {
      console.error('Refresh failed:', err)
    } finally {
      this.isLoading = false
      this.refreshInProgress = false
      this.emit('stateChanged')

      if (this.refreshQueued) {
        this.refreshQueued = false
        this.refresh().catch(console.error)
      }
    }
  }

  // ---- Skill Assignment ----

  async assignSkillToAgent(skillPath: string, agentType: AgentType): Promise<void> {
    const canonicalPath = symlinkManager.resolveCanonical(skillPath)
    symlinkManager.createSymlink(canonicalPath, agentType)
    await this.refresh()
  }

  async removeSkillFromAgent(skillPath: string, agentType: AgentType): Promise<void> {
    const skillName = path.basename(skillPath)
    symlinkManager.removeSymlink(skillName, agentType)
    await this.refresh()
  }

  async removeLocalInstallation(skillId: string, agentType: AgentType): Promise<void> {
    const skill = this.skills.find((s) => s.id === skillId)
    if (!skill) return

    const installation = skill.installations.find(
      (inst) => inst.agentType === agentType && !inst.isInherited,
    )
    if (!installation) return

    if (installation.isSymlink) {
      symlinkManager.removeSymlink(path.basename(installation.path), agentType)
    } else if (fs.existsSync(installation.path)) {
      fs.rmSync(installation.path, { recursive: true, force: true })
    }

    await this.refresh()
  }

  async deleteSkill(skillId: string): Promise<void> {
    const skill = this.skills.find(s => s.id === skillId)
    if (!skill) return

    // Remove all direct symlinks
    for (const inst of skill.installations) {
      if (!inst.isInherited && inst.isSymlink) {
        symlinkManager.removeSymlink(path.basename(inst.path), inst.agentType)
      }
    }

    // Delete canonical directory
    if (fs.existsSync(skill.canonicalPath)) {
      fs.rmSync(skill.canonicalPath, { recursive: true, force: true })
    }

    // Remove lock entry
    lockFileManager.removeEntry(skillId)
    if (skill.storageName !== skillId) {
      lockFileManager.removeEntry(skill.storageName)
    }
    commitHashCache.removeCommitHash(skillId)
    if (skill.storageName !== skillId) {
      commitHashCache.removeCommitHash(skill.storageName)
    }

    // Clean transient caches
    this.updateStatuses.delete(skillId)
    this.cachedRemoteTreeHashes.delete(skillId)
    this.cachedRemoteCommitHashes.delete(skillId)

    await this.refresh()
  }

  // ---- Installation ----

  async installFromRemote(input: InstallInput): Promise<InstallResult> {
    try {
      const available = await gitService.isGitAvailable()
      if (!available) {
        return { success: false, error: 'GIT_NOT_FOUND' }
      }

      const repoDir = await gitService.shallowClone(input.repoUrl)
      let skillDirs = gitService.scanSkillsInRepo(repoDir)

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
        const directoryName = path.basename(skillDir)
        const skillPath = path.relative(repoDir, skillDir) + '/SKILL.md'
        const skillId = createGitHubSkillId(input.repoUrl, skillPath)
        const destDir = path.join(SHARED_SKILLS_DIR, skillId)

        // Copy to canonical location
        if (!fs.existsSync(SHARED_SKILLS_DIR)) {
          fs.mkdirSync(SHARED_SKILLS_DIR, { recursive: true })
        }
        if (fs.existsSync(destDir)) {
          fs.rmSync(destDir, { recursive: true, force: true })
        }
        copyDirectoryWithoutSymlinks(skillDir, destDir)

        // Create symlinks for target agents
        for (const agentType of input.agentTypes) {
          symlinkManager.createSymlink(destDir, agentType)
        }

        // Update lock file
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
        lockFileManager.updateEntry(skillId, lockEntry)

        if (commitHash) {
          commitHashCache.setCommitHash(skillId, commitHash)
        }

        installedIds.push(skillId)
      }

      await this.refresh()
      return { success: true, skillCount: installedIds.length, installedSkillIds: installedIds }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Installation failed'
      return { success: false, error: message }
    }
  }

  async installFromLocal(localPath: string, agentTypes: AgentType[]): Promise<InstallResult> {
    try {
      const {
        realPath,
        directoryName,
      } = resolveLocalSkillImport(localPath)
      const skillId = resolveLocalStableSkillId(realPath, lockFileManager.read().skills)

      const destDir = path.join(SHARED_SKILLS_DIR, skillId)
      if (!fs.existsSync(SHARED_SKILLS_DIR)) {
        fs.mkdirSync(SHARED_SKILLS_DIR, { recursive: true })
      }
      if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true, force: true })
      }
      copyDirectoryWithoutSymlinks(realPath, destDir)

      for (const agentType of agentTypes) {
        symlinkManager.createSymlink(destDir, agentType)
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
      lockFileManager.updateEntry(skillId, lockEntry)

      await this.refresh()
      return { success: true, skillCount: 1, installedSkillIds: [skillId] }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Local install failed'
      return { success: false, error: message }
    }
  }

  // ---- Editor ----

  async saveSkillMD(skillId: string, metadata: SkillMetadata, body: string): Promise<void> {
    const skill = this.skills.find(s => s.id === skillId)
    if (!skill) throw new Error(`Skill not found: ${skillId}`)

    const content = skillMDParser.serialize(metadata, body)
    const filePath = path.join(skill.canonicalPath, 'SKILL.md')

    const tmpPath = filePath + '.tmp'
    fs.writeFileSync(tmpPath, content)
    fs.renameSync(tmpPath, filePath)

    await this.refresh()
  }

  // ---- Update Detection ----

  async checkForUpdate(skillId: string): Promise<SkillUpdateCheckResult> {
    const skill = this.skills.find(s => s.id === skillId)
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`)
    }

    this.updateStatuses.set(skillId, 'checking')
    this.emit('stateChanged')

    try {
      const result = await updateChecker.checkSkillUpdate(skill)

      if (skill.lockEntry && !skill.lockEntry.skillFolderHash && result.localTreeHash) {
        const repairedLockEntry = {
          ...skill.lockEntry,
          stableId: skill.id,
          skillFolderHash: result.localTreeHash,
        }
        lockFileManager.updateEntry(skillId, repairedLockEntry)
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

      this.emit('stateChanged')
      return result
    } catch (err) {
      this.updateStatuses.set(skillId, 'error')
      this.cachedRemoteTreeHashes.delete(skillId)
      this.cachedRemoteCommitHashes.delete(skillId)
      this.emit('stateChanged')
      throw err instanceof Error ? err : new Error(`Failed to check updates for ${skillId}`)
    }
  }

  async checkAllUpdates(): Promise<void> {
    const updatable = this.skills.filter(
      s => s.lockEntry?.sourceType === 'github',
    )
    await Promise.allSettled(updatable.map(s => this.checkForUpdate(s.id)))
  }

  async updateSkill(skillId: string): Promise<SkillUpdateApplyResult> {
    const skill = this.skills.find(s => s.id === skillId)
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`)
    }
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

      if (!fs.existsSync(sourceDir)) {
        throw new Error(`Skill source not found in repository: ${skill.lockEntry.skillPath}`)
      }

      // Replace canonical directory content
      const destDir = skill.canonicalPath
      fs.rmSync(destDir, { recursive: true, force: true })
      copyDirectoryWithoutSymlinks(sourceDir, destDir)

      // Update lock entry
      const treeHash = await safeGetTreeHash(sourceDir, repoDir)
      const commitHash = await safeGetCommitHash(repoDir)
      const now = new Date().toISOString()

      lockFileManager.updateEntry(skillId, {
        ...skill.lockEntry,
        stableId: skill.id,
        skillFolderHash: treeHash,
        updatedAt: now,
      })

      if (commitHash) {
        commitHashCache.setCommitHash(skillId, commitHash)
      }

      this.updateStatuses.set(skillId, 'upToDate')
      this.cachedRemoteTreeHashes.delete(skillId)
      this.cachedRemoteCommitHashes.delete(skillId)

      await this.refresh()
      return {
        skillId,
        status: 'updated',
        remoteTreeHash: treeHash || undefined,
        remoteCommitHash: commitHash || undefined,
      }
    } catch (err) {
      this.updateStatuses.set(skillId, 'error')
      this.emit('stateChanged')
      console.error(`Failed to update skill ${skillId}:`, err)
      throw err instanceof Error ? err : new Error(`Failed to update skill ${skillId}`)
    }
  }

  // ---- Private Helpers ----

  private restoreTransientFields(skills: Skill[]): Skill[] {
    return skills.map(skill => ({
      ...skill,
      updateStatus: this.updateStatuses.get(skill.id) ?? 'notChecked',
      hasUpdate: this.updateStatuses.get(skill.id) === 'hasUpdate',
      remoteTreeHash: this.cachedRemoteTreeHashes.get(skill.id),
      remoteCommitHash: this.cachedRemoteCommitHashes.get(skill.id),
      localCommitHash: commitHashCache.getCommitHash(skill.id) ?? commitHashCache.getCommitHash(skill.storageName),
    }))
  }

  destroy(): void {
    this.watcher.stopWatching()
    this.removeAllListeners()
  }
}

async function safeGetTreeHash(skillDir: string, repoDir: string): Promise<string> {
  try {
    return await gitService.getTreeHash(skillDir, repoDir)
  } catch {
    return ''
  }
}

async function safeGetCommitHash(repoDir: string): Promise<string> {
  try {
    return await gitService.getCommitHash(repoDir)
  } catch {
    return ''
  }
}
