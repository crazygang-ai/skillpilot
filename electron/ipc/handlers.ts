import { ipcMain, shell, dialog, BrowserWindow, app } from 'electron'
import { SkillManager } from '../services/skill-manager'
import * as registryService from '../services/skill-registry-service'
import * as contentFetcher from '../services/skill-content-fetcher'
import { getProxySettings, setProxySettings } from '../services/proxy-settings'
import { type LeaderboardCategory } from '../../shared/types'
import { IPC_CHANNELS } from '../../shared/ipc'
import {
  assertAllowedPath,
  assertString,
  assertValidAgentType,
  validateContentFetchArgs,
  validateInstallFromLocalArgs,
  validateInstallInput,
  validateRemoveLocalInstallationInput,
  validateSetProxySettingsInput,
  validateSkillSaveArgs,
} from './validators'

export function setupIpcHandlers(skillManager: SkillManager): void {
  // ---- Agent ----
  ipcMain.handle(IPC_CHANNELS.AGENT.DETECT, async () => {
    return skillManager.agents
  })

  // ---- Skill ----
  ipcMain.handle(IPC_CHANNELS.SKILL.SCAN_ALL, async () => {
    if (skillManager.skills.length === 0) {
      await skillManager.refresh()
    }
    return skillManager.skills
  })

  ipcMain.handle(IPC_CHANNELS.SKILL.ASSIGN, async (_e, skillPath: string, agentType: string) => {
    assertAllowedPath(skillPath)
    assertValidAgentType(agentType)
    await skillManager.assignSkillToAgent(skillPath, agentType)
  })

  ipcMain.handle(IPC_CHANNELS.SKILL.UNASSIGN, async (_e, skillPath: string, agentType: string) => {
    assertAllowedPath(skillPath)
    assertValidAgentType(agentType)
    await skillManager.removeSkillFromAgent(skillPath, agentType)
  })

  ipcMain.handle(IPC_CHANNELS.SKILL.DELETE, async (_e, skillId: string) => {
    assertString(skillId, 'skillId')
    await skillManager.deleteSkill(skillId)
  })

  ipcMain.handle(IPC_CHANNELS.SKILL.REMOVE_LOCAL_INSTALLATION, async (_e, input: unknown) => {
    const validatedInput = validateRemoveLocalInstallationInput(input)
    await skillManager.removeLocalInstallation(validatedInput.skillId, validatedInput.agentType)
  })

  ipcMain.handle(IPC_CHANNELS.SKILL.INSTALL, async (_e, input: unknown) => {
    const installInput = validateInstallInput(input)

    if (installInput.source !== 'github') {
      throw new Error(`Unsupported install source for skill:install: ${installInput.source}`)
    }

    const result = await skillManager.installFromRemote(installInput)
    if (!result.success) {
      console.error(`Install failed [${installInput.source}] ${installInput.repoUrl}: ${result.error}`)
    }
    return result
  })

  ipcMain.handle(IPC_CHANNELS.SKILL.INSTALL_FROM_LOCAL, async (_e, localPath: unknown, agentTypes: unknown) => {
    const input = validateInstallFromLocalArgs(localPath, agentTypes)
    return skillManager.installFromLocal(input.localPath, input.agentTypes)
  })

  ipcMain.handle(IPC_CHANNELS.SKILL.SAVE, async (_e, skillId: unknown, metadata: unknown, body: unknown) => {
    const input = validateSkillSaveArgs(skillId, metadata, body)
    await skillManager.saveSkillMD(input.skillId, input.metadata, input.body)
  })

  ipcMain.handle(IPC_CHANNELS.SKILL.CHECK_UPDATE, async (_e, skillId: string) => {
    assertString(skillId, 'skillId')
    return skillManager.checkForUpdate(skillId)
  })

  ipcMain.handle(IPC_CHANNELS.SKILL.CHECK_ALL_UPDATES, async () => {
    await skillManager.checkAllUpdates()
  })

  ipcMain.handle(IPC_CHANNELS.SKILL.UPDATE_SKILL, async (_e, skillId: string) => {
    assertString(skillId, 'skillId')
    return skillManager.updateSkill(skillId)
  })

  // ---- Registry ----
  ipcMain.handle(IPC_CHANNELS.REGISTRY.LEADERBOARD, async (_e, category: LeaderboardCategory) => {
    return registryService.leaderboard(category)
  })

  ipcMain.handle(IPC_CHANNELS.REGISTRY.SEARCH, async (_e, query: string) => {
    if (typeof query !== 'string') throw new Error('query must be a string')
    return registryService.search(query)
  })

  // ---- Content Fetcher ----
  ipcMain.handle(IPC_CHANNELS.CONTENT.FETCH, async (_e, source: unknown, skillId: unknown) => {
    const input = validateContentFetchArgs(source, skillId)
    return contentFetcher.fetchContent(input.source, input.skillId)
  })

  // ---- Filesystem ----
  ipcMain.handle(IPC_CHANNELS.FS.REVEAL_IN_FINDER, async (_e, filePath: string) => {
    assertAllowedPath(filePath)
    shell.showItemInFolder(filePath)
  })

  // ---- Dialog ----
  ipcMain.handle(IPC_CHANNELS.DIALOG.OPEN_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ---- Settings ----
  ipcMain.handle(IPC_CHANNELS.SETTINGS.GET_PROXY, async () => {
    return getProxySettings()
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS.SET_PROXY, async (_e, settings: unknown) => {
    await setProxySettings(validateSetProxySettingsInput(settings))
  })

  // ---- Updater ----
  ipcMain.handle(IPC_CHANNELS.UPDATER.GET_VERSION, async () => {
    return app.getVersion()
  })

  // ---- Forward watcher events to renderer ----
  skillManager.on('watcherChanged', () => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.WATCHER.ON_CHANGE)
      }
    }
  })
}
