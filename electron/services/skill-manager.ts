import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
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

      this.skills = this.updateService.restoreTransientFields(skills)
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

    for (const inst of skill.installations) {
      if (!inst.isInherited && inst.isSymlink) {
        symlinkManager.removeSymlink(path.basename(inst.path), inst.agentType)
      }
    }

    if (fs.existsSync(skill.canonicalPath)) {
      fs.rmSync(skill.canonicalPath, { recursive: true, force: true })
    }

    lockFileManager.removeEntry(skillId)
    if (skill.storageName !== skillId) {
      lockFileManager.removeEntry(skill.storageName)
    }
    commitHashCache.removeCommitHash(skillId)
    if (skill.storageName !== skillId) {
      commitHashCache.removeCommitHash(skill.storageName)
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
    fs.writeFileSync(tmpPath, content)
    fs.renameSync(tmpPath, filePath)

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
      console.error(`Failed to update skill ${skillId}:`, err)
      throw err
    }
  }

  destroy(): void {
    this.watcher.stopWatching()
    this.removeAllListeners()
  }
}
