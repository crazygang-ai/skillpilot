import { ipcMain, shell, dialog, BrowserWindow, app } from 'electron'
import path from 'path'
import os from 'os'
import { SkillManager } from '../services/skill-manager'
import * as registryService from '../services/skill-registry-service'
import * as clawHubService from '../services/clawhub-service'
import * as contentFetcher from '../services/skill-content-fetcher'
import { getProxySettings, setProxySettings } from '../services/proxy-settings'
import { AgentType, InstallInput, ProxySettings, LeaderboardCategory, SkillMetadata } from '../../shared/types'

const VALID_AGENT_TYPES = new Set(Object.values(AgentType))
const HOME = os.homedir()
const ALLOWED_PATH_ROOTS = [
  path.join(HOME, '.agents'),
  path.join(HOME, '.claude'),
  path.join(HOME, '.codex'),
  path.join(HOME, '.gemini'),
  path.join(HOME, '.copilot'),
  path.join(HOME, '.config', 'opencode'),
  path.join(HOME, '.cursor'),
  path.join(HOME, '.kiro'),
  path.join(HOME, '.codebuddy'),
  path.join(HOME, '.openclaw'),
  path.join(HOME, '.trae'),
]

function assertValidAgentType(value: unknown): asserts value is AgentType {
  if (typeof value !== 'string' || !VALID_AGENT_TYPES.has(value as AgentType)) {
    throw new Error(`Invalid agent type: ${String(value)}`)
  }
}

function assertValidAgentTypes(values: unknown): asserts values is AgentType[] {
  if (!Array.isArray(values)) throw new Error('agentTypes must be an array')
  for (const v of values) assertValidAgentType(v)
}

function assertAllowedPath(filePath: unknown): asserts filePath is string {
  if (typeof filePath !== 'string') throw new Error('Path must be a string')
  const resolved = path.resolve(filePath)
  if (!ALLOWED_PATH_ROOTS.some(root => resolved.startsWith(root + path.sep) || resolved === root)) {
    throw new Error(`Path outside allowed directories: ${resolved}`)
  }
}

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`)
  }
}

const OWNER_REPO_RE = /^[\w.-]+\/[\w.-]+$/

function assertValidSource(source: unknown): asserts source is string {
  assertString(source, 'source')
  if (!OWNER_REPO_RE.test(source as string)) {
    throw new Error(`Invalid source format (expected owner/repo): ${String(source)}`)
  }
}

export function setupIpcHandlers(skillManager: SkillManager): void {
  // ---- Agent ----
  ipcMain.handle('agent:detect', async () => {
    return skillManager.agents
  })

  // ---- Skill ----
  ipcMain.handle('skill:scanAll', async () => {
    if (skillManager.skills.length === 0) {
      await skillManager.refresh()
    }
    return skillManager.skills
  })

  ipcMain.handle('skill:assign', async (_e, skillPath: string, agentType: string) => {
    assertAllowedPath(skillPath)
    assertValidAgentType(agentType)
    await skillManager.assignSkillToAgent(skillPath, agentType)
  })

  ipcMain.handle('skill:unassign', async (_e, skillPath: string, agentType: string) => {
    assertAllowedPath(skillPath)
    assertValidAgentType(agentType)
    await skillManager.removeSkillFromAgent(skillPath, agentType)
  })

  ipcMain.handle('skill:delete', async (_e, skillId: string) => {
    assertString(skillId, 'skillId')
    await skillManager.deleteSkill(skillId)
  })

  ipcMain.handle('skill:install', async (_e, input: InstallInput) => {
    assertValidAgentTypes(input?.agentTypes)
    const result = await skillManager.installFromRemote(input)
    if (!result.success) {
      console.error(`Install failed [${input.source}] ${input.repoUrl}: ${result.error}`)
    }
    return result
  })

  ipcMain.handle('skill:installFromLocal', async (_e, localPath: string, agentTypes: string[]) => {
    assertString(localPath, 'localPath')
    assertValidAgentTypes(agentTypes)
    return skillManager.installFromLocal(localPath, agentTypes)
  })

  ipcMain.handle('skill:save', async (_e, skillId: string, metadata: SkillMetadata, body: string) => {
    assertString(skillId, 'skillId')
    await skillManager.saveSkillMD(skillId, metadata, body)
  })

  ipcMain.handle('skill:checkUpdate', async (_e, skillId: string) => {
    assertString(skillId, 'skillId')
    await skillManager.checkForUpdate(skillId)
  })

  ipcMain.handle('skill:checkAllUpdates', async () => {
    await skillManager.checkAllUpdates()
  })

  ipcMain.handle('skill:updateSkill', async (_e, skillId: string) => {
    assertString(skillId, 'skillId')
    await skillManager.updateSkill(skillId)
  })

  // ---- Registry ----
  ipcMain.handle('registry:leaderboard', async (_e, category: LeaderboardCategory) => {
    return registryService.leaderboard(category)
  })

  ipcMain.handle('registry:search', async (_e, query: string) => {
    if (typeof query !== 'string') throw new Error('query must be a string')
    return registryService.search(query)
  })

  // ---- ClawHub ----
  ipcMain.handle('clawhub:search', async (_e, query: string, sort: string) => {
    if (typeof query !== 'string') throw new Error('query must be a string')
    return clawHubService.search(query, 30, sort || 'downloads')
  })

  ipcMain.handle('clawhub:detail', async (_e, slug: string) => {
    assertString(slug, 'slug')
    return clawHubService.detail(slug)
  })

  ipcMain.handle('clawhub:content', async (_e, slug: string) => {
    assertString(slug, 'slug')
    return clawHubService.content(slug)
  })

  // ---- Content Fetcher ----
  ipcMain.handle('content:fetch', async (_e, source: string, skillId: string) => {
    assertValidSource(source)
    assertString(skillId, 'skillId')
    return contentFetcher.fetchContent(source, skillId)
  })

  // ---- Filesystem ----
  ipcMain.handle('fs:revealInFinder', async (_e, filePath: string) => {
    assertAllowedPath(filePath)
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('fs:exportToDesktop', async (_e, _skillPath: string) => {
    // TODO: implement zip export
    return { success: false, error: 'Not implemented' }
  })

  // ---- Dialog ----
  ipcMain.handle('dialog:openFileOrFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'openDirectory'],
      filters: [{ name: 'ZIP Archives', extensions: ['zip'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ---- Settings ----
  ipcMain.handle('settings:getProxy', async () => {
    return getProxySettings()
  })

  ipcMain.handle('settings:setProxy', async (_e, settings: ProxySettings) => {
    setProxySettings(settings)
  })

  // ---- Updater ----
  ipcMain.handle('updater:getCurrentVersion', async () => {
    return app.getVersion()
  })

  ipcMain.handle('updater:checkForUpdates', async () => {
    // electron-updater integration
    return { hasUpdate: false }
  })

  ipcMain.handle('updater:downloadUpdate', async () => {
    // electron-updater integration
  })

  ipcMain.handle('updater:quitAndInstall', async () => {
    // electron-updater integration
  })

  ipcMain.handle('updater:setAutoDownload', async (_e, _value: boolean) => {
    // electron-updater integration
  })

  // ---- Forward watcher events to renderer ----
  skillManager.on('stateChanged', () => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('watcher:onChange')
      }
    }
  })
}
