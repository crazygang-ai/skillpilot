import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import {
  Skill, Agent, AgentType, SkillMetadata,
  InstallInput, InstallResult, LockEntry, SkillUpdateStatus,
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

  async deleteSkill(skillId: string): Promise<void> {
    const skill = this.skills.find(s => s.id === skillId)
    if (!skill) return

    // Remove all direct symlinks
    for (const inst of skill.installations) {
      if (!inst.isInherited && inst.isSymlink) {
        symlinkManager.removeSymlink(skillId, inst.agentType)
      }
    }

    // Delete canonical directory
    if (fs.existsSync(skill.canonicalPath)) {
      fs.rmSync(skill.canonicalPath, { recursive: true, force: true })
    }

    // Remove lock entry
    lockFileManager.removeEntry(skillId)
    commitHashCache.removeCommitHash(skillId)

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
        const skillId = path.basename(skillDir)
        const destDir = path.join(SHARED_SKILLS_DIR, skillId)

        // Copy to canonical location
        if (!fs.existsSync(SHARED_SKILLS_DIR)) {
          fs.mkdirSync(SHARED_SKILLS_DIR, { recursive: true })
        }
        if (fs.existsSync(destDir)) {
          fs.rmSync(destDir, { recursive: true, force: true })
        }
        copyDirSync(skillDir, destDir)

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
          source: ownerRepo,
          sourceType: input.source,
          sourceUrl: gitService.normalizeRepoURL(input.repoUrl),
          skillPath: path.relative(repoDir, skillDir) + '/SKILL.md',
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
      const resolvedLocal = path.resolve(localPath)
      if (resolvedLocal.includes('..')) {
        return { success: false, error: 'Invalid local path' }
      }
      const skillId = path.basename(resolvedLocal)
      if (!skillId || skillId === '.' || skillId === '..') {
        return { success: false, error: 'Invalid skill directory name' }
      }
      const skillMdPath = path.join(resolvedLocal, 'SKILL.md')

      if (!fs.existsSync(skillMdPath)) {
        return { success: false, error: 'No SKILL.md found in directory' }
      }

      const destDir = path.join(SHARED_SKILLS_DIR, skillId)
      if (!fs.existsSync(SHARED_SKILLS_DIR)) {
        fs.mkdirSync(SHARED_SKILLS_DIR, { recursive: true })
      }
      if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true, force: true })
      }
      copyDirSync(resolvedLocal, destDir)

      for (const agentType of agentTypes) {
        symlinkManager.createSymlink(destDir, agentType)
      }

      const now = new Date().toISOString()
      const lockEntry: LockEntry = {
        source: skillId,
        sourceType: 'local',
        sourceUrl: resolvedLocal,
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

  async installFromClawHub(
    slug: string,
    version: string,
    agentTypes: AgentType[],
    archivePath: string,
  ): Promise<InstallResult> {
    try {
      const destDir = path.join(SHARED_SKILLS_DIR, slug)
      if (!fs.existsSync(SHARED_SKILLS_DIR)) {
        fs.mkdirSync(SHARED_SKILLS_DIR, { recursive: true })
      }
      if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true, force: true })
      }
      copyDirSync(archivePath, destDir)

      for (const agentType of agentTypes) {
        symlinkManager.createSymlink(destDir, agentType)
      }

      const now = new Date().toISOString()
      const lockEntry: LockEntry = {
        source: slug,
        sourceType: 'clawhub',
        sourceUrl: `https://clawhub.ai/skills/${slug}`,
        skillPath: 'SKILL.md',
        skillFolderHash: version,
        installedAt: now,
        updatedAt: now,
      }
      lockFileManager.updateEntry(slug, lockEntry)

      await this.refresh()
      return { success: true, skillCount: 1, installedSkillIds: [slug] }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ClawHub install failed'
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

  async checkForUpdate(skillId: string): Promise<void> {
    const skill = this.skills.find(s => s.id === skillId)
    if (!skill) return

    this.updateStatuses.set(skillId, 'checking')
    this.emit('stateChanged')

    try {
      const result = await updateChecker.checkSkillUpdate(skill)
      if (result.hasUpdate) {
        this.updateStatuses.set(skillId, 'hasUpdate')
        if (result.remoteTreeHash) this.cachedRemoteTreeHashes.set(skillId, result.remoteTreeHash)
        if (result.remoteCommitHash) this.cachedRemoteCommitHashes.set(skillId, result.remoteCommitHash)
      } else {
        this.updateStatuses.set(skillId, 'upToDate')
      }
    } catch {
      this.updateStatuses.set(skillId, 'error')
    }

    this.emit('stateChanged')
  }

  async checkAllUpdates(): Promise<void> {
    const updatable = this.skills.filter(
      s => s.lockEntry && s.lockEntry.sourceType === 'github',
    )
    await Promise.allSettled(updatable.map(s => this.checkForUpdate(s.id)))
  }

  async updateSkill(skillId: string): Promise<void> {
    const skill = this.skills.find(s => s.id === skillId)
    if (!skill?.lockEntry) return

    try {
      const repoDir = await gitService.shallowClone(skill.lockEntry.sourceUrl)
      const skillFolderPath = skill.lockEntry.skillPath.replace(/\/SKILL\.md$/, '')
      const sourceDir = path.resolve(path.join(repoDir, skillFolderPath))
      const resolvedRepo = path.resolve(repoDir)
      if (!sourceDir.startsWith(resolvedRepo + path.sep) && sourceDir !== resolvedRepo) {
        throw new Error(`Skill path escapes repo directory: ${skillFolderPath}`)
      }

      if (!fs.existsSync(sourceDir)) return

      // Replace canonical directory content
      const destDir = skill.canonicalPath
      fs.rmSync(destDir, { recursive: true, force: true })
      copyDirSync(sourceDir, destDir)

      // Update lock entry
      const treeHash = await safeGetTreeHash(sourceDir, repoDir)
      const commitHash = await safeGetCommitHash(repoDir)
      const now = new Date().toISOString()

      lockFileManager.updateEntry(skillId, {
        ...skill.lockEntry,
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
    } catch (err) {
      console.error(`Failed to update skill ${skillId}:`, err)
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
      localCommitHash: commitHashCache.getCommitHash(skill.id),
    }))
  }

  destroy(): void {
    this.watcher.stopWatching()
    this.removeAllListeners()
  }
}

// ---- Utility Functions ----

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry)
    const destPath = path.join(dest, entry)
    const stat = fs.statSync(srcPath)
    if (stat.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
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
