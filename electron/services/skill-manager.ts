import { EventEmitter } from 'events'
import fsPromises from 'fs/promises'
import path from 'path'
import log from 'electron-log'
import {
  Skill, Agent, AgentType, SkillMetadata,
  InstallInput, InstallResult, SkillUpdateApplyResult, SkillUpdateCheckResult,
} from '../../shared/types'
import { SHARED_SKILLS_DIR } from '../utils/constants'
import { AGENT_CONFIGS } from '../types/agent-config'
import * as agentDetector from './agent-detector'
import * as skillScanner from './skill-scanner'
import * as lockFileManager from './lock-file-manager'
import * as symlinkManager from './symlink-manager'
import * as commitHashCache from './commit-hash-cache'
import * as skillMDParser from './skill-md-parser'
import * as installService from './skill-install-service'
import { SkillUpdateService } from './skill-update-service'
import { FileSystemWatcher } from './file-system-watcher'
import * as gitService from './git-service'

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsPromises.access(p)
    return true
  } catch {
    return false
  }
}

export class SkillManager extends EventEmitter {
  skills: Skill[] = []
  agents: Agent[] = []
  isLoading = false

  private updateService = new SkillUpdateService()
  private watcher = new FileSystemWatcher()
  private refreshInProgress = false
  private refreshQueued = false

  constructor() {
    super()
    this.watcher.on('change', () => {
      this.emit('watcherChanged')
      this.refresh().catch((err) => log.error('Watcher-triggered refresh failed:', err))
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
      await lockFileManager.createIfNotExists()

      const [agents, skills] = await Promise.all([
        agentDetector.detectAll(),
        skillScanner.scanAll(),
      ])

      this.skills = await this.updateService.restoreTransientFields(skills)
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
      log.error('Refresh failed:', err)
      this.emit('refreshFailed', err instanceof Error ? err.message : String(err))
    } finally {
      this.isLoading = false
      this.refreshInProgress = false
      this.emit('stateChanged')

      if (this.refreshQueued) {
        this.refreshQueued = false
        this.refresh().catch((err) => log.error('Queued refresh failed:', err))
      }
    }
  }

  // ---- Skill Assignment ----

  async assignSkillToAgent(skillPath: string, agentType: AgentType): Promise<void> {
    const canonicalPath = await symlinkManager.resolveCanonical(skillPath)
    await symlinkManager.createSymlink(canonicalPath, agentType)
    await this.refresh()
  }

  async removeSkillFromAgent(skillPath: string, agentType: AgentType): Promise<void> {
    const skillName = path.basename(skillPath)
    await symlinkManager.removeSymlink(skillName, agentType)
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
      await symlinkManager.removeSymlink(path.basename(installation.path), agentType)
    } else if (await pathExists(installation.path)) {
      await fsPromises.rm(installation.path, { recursive: true, force: true })
    }

    await this.refresh()
  }

  async deleteSkill(skillId: string): Promise<void> {
    const skill = this.skills.find(s => s.id === skillId)
    if (!skill) return

    for (const inst of skill.installations) {
      if (!inst.isInherited && inst.isSymlink) {
        await symlinkManager.removeSymlink(path.basename(inst.path), inst.agentType)
      }
    }

    if (await pathExists(skill.canonicalPath)) {
      await fsPromises.rm(skill.canonicalPath, { recursive: true, force: true })
    }

    await lockFileManager.removeEntry(skillId)
    if (skill.storageName !== skillId) {
      await lockFileManager.removeEntry(skill.storageName)
    }
    await commitHashCache.removeCommitHash(skillId)
    if (skill.storageName !== skillId) {
      await commitHashCache.removeCommitHash(skill.storageName)
    }

    this.updateService.clearSkillCache(skillId)

    await this.refresh()
  }

  // ---- Installation (delegates to install service) ----

  async installFromRemote(input: InstallInput): Promise<InstallResult> {
    const result = await installService.installFromRemote(input)
    if (result.success) await this.refresh()
    return result
  }

  async installFromLocal(localPath: string, agentTypes: AgentType[]): Promise<InstallResult> {
    const result = await installService.installFromLocal(localPath, agentTypes)
    if (result.success) await this.refresh()
    return result
  }

  // ---- Editor ----

  async saveSkillMD(skillId: string, metadata: SkillMetadata, body: string): Promise<void> {
    const skill = this.skills.find(s => s.id === skillId)
    if (!skill) throw new Error(`Skill not found: ${skillId}`)

    const content = skillMDParser.serialize(metadata, body)
    const filePath = path.join(skill.canonicalPath, 'SKILL.md')

    const tmpPath = filePath + '.tmp'
    try {
      await fsPromises.writeFile(tmpPath, content)
      await fsPromises.rename(tmpPath, filePath)
    } catch (err) {
      await fsPromises.rm(tmpPath, { force: true }).catch(() => {})
      throw err
    }

    await this.refresh()
  }

  // ---- Update Detection (delegates to update service) ----

  async checkForUpdate(skillId: string): Promise<SkillUpdateCheckResult> {
    const skill = this.skills.find(s => s.id === skillId)
    if (!skill) throw new Error(`Skill not found: ${skillId}`)

    this.emit('stateChanged')

    try {
      const result = await this.updateService.checkForUpdate(skill)
      this.emit('stateChanged')
      return result
    } catch (err) {
      this.emit('stateChanged')
      throw err
    }
  }

  async checkAllUpdates(): Promise<void> {
    await this.updateService.checkAllUpdates(this.skills)
  }

  async updateSkill(skillId: string): Promise<SkillUpdateApplyResult> {
    const skill = this.skills.find(s => s.id === skillId)
    if (!skill) throw new Error(`Skill not found: ${skillId}`)

    try {
      const result = await this.updateService.applyUpdate(skill)
      await this.refresh()
      return result
    } catch (err) {
      this.emit('stateChanged')
      log.error(`Failed to update skill ${skillId}:`, err)
      throw err
    }
  }

  destroy(): void {
    this.watcher.stopWatching()
    gitService.cleanupTempRepos().catch(err => log.warn('Cleanup failed:', err))
    this.removeAllListeners()
  }
}
