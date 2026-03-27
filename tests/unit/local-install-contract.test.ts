/** @vitest-environment jsdom */

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../src/i18n'
import UploadSkillModal from '../../src/components/install/UploadSkillModal'
import { IPC_CHANNELS } from '../../shared/ipc'
import { AgentType } from '../../shared/types'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockAddNotification = vi.fn()
const mockMutateAsync = vi.fn()
const tempDirs: string[] = []

vi.mock('../../src/components/install/AgentSelector', () => ({
  default: ({ onChange }: { onChange: (selected: string[]) => void }) =>
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => onChange(['claude']),
      },
      'Select Claude',
    ),
}))

vi.mock('../../src/hooks/useSkills', () => ({
  useInstallSkillFromLocal: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}))

vi.mock('../../src/stores/notificationStore', () => ({
  useNotificationStore: (
    selector: (state: { addNotification: typeof mockAddNotification }) => unknown,
  ) => selector({ addNotification: mockAddNotification }),
}))

function createFileDrop(name: string, filePath: string): DragEvent {
  const file = new File(['test'], name, { type: 'application/octet-stream' })
  Object.defineProperty(file, 'path', {
    configurable: true,
    value: filePath,
  })

  const event = new Event('drop', {
    bubbles: true,
    cancelable: true,
  }) as DragEvent

  Object.defineProperty(event, 'dataTransfer', {
    configurable: true,
    value: {
      files: [file],
    } satisfies Partial<DataTransfer>,
  })

  return event
}

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function writeFiles(baseDir: string, files: Record<string, string>): void {
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = path.join(baseDir, relativePath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, contents)
  }
}

async function loadSkillManagerForLocalInstall(sharedSkillsDir: string) {
  const updateEntry = vi.fn()
  const createSymlink = vi.fn()

  class MockWatcher extends EventEmitter {
    startWatching() {}
    stopWatching() {}
  }

  vi.doMock('../../electron/utils/constants', () => ({
    SHARED_SKILLS_DIR: sharedSkillsDir,
    LOCK_FILE_PATH: path.join(path.dirname(sharedSkillsDir), '.skill-lock.json'),
    CACHE_FILE_PATH: path.join(path.dirname(sharedSkillsDir), '.skillpilot-cache.json'),
    LOCK_FILE_VERSION: 3,
    GITHUB_RAW_BASE: 'https://raw.githubusercontent.com',
    GITHUB_API_BASE: 'https://api.github.com',
    SKILLS_SH_BASE: 'https://skills.sh',
    FILE_WATCHER_DEBOUNCE_MS: 500,
    REGISTRY_CACHE_TTL_MS: 300000,
    CONTENT_CACHE_TTL_MS: 600000,
  }))
  vi.doMock('../../electron/services/agent-detector', () => ({
    detectAll: vi.fn().mockResolvedValue([]),
  }))
  vi.doMock('../../electron/services/skill-scanner', () => ({
    scanAll: vi.fn().mockResolvedValue([]),
  }))
  vi.doMock('../../electron/services/lock-file-manager', () => ({
    read: vi.fn(() => ({
      version: 3,
      skills: {},
    })),
    updateEntry,
    removeEntry: vi.fn(),
    invalidateCache: vi.fn(),
    createIfNotExists: vi.fn(),
  }))
  vi.doMock('../../electron/services/symlink-manager', () => ({
    removeSymlink: vi.fn(),
    createSymlink,
    resolveCanonical: vi.fn((value: string) => value),
  }))
  vi.doMock('../../electron/services/git-service', () => ({
    isGitAvailable: vi.fn(),
    shallowClone: vi.fn(),
    scanSkillsInRepo: vi.fn(),
    extractOwnerRepo: vi.fn(),
    normalizeRepoURL: vi.fn(),
    getTreeHash: vi.fn(),
    getCommitHash: vi.fn(),
  }))
  vi.doMock('../../electron/services/commit-hash-cache', () => ({
    removeCommitHash: vi.fn(),
    setCommitHash: vi.fn(),
    getCommitHash: vi.fn(),
  }))
  vi.doMock('../../electron/services/skill-md-parser', () => ({
    serialize: vi.fn(),
  }))
  vi.doMock('../../electron/services/update-checker', () => ({
    checkSkillUpdate: vi.fn(),
  }))
  vi.doMock('../../electron/services/file-system-watcher', () => ({
    FileSystemWatcher: MockWatcher,
  }))

  const module = await import('../../electron/services/skill-manager')

  return {
    SkillManager: module.SkillManager,
    updateEntry,
    createSymlink,
  }
}

async function loadHandlersContract() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const showOpenDialog = vi.fn().mockResolvedValue({
    canceled: true,
    filePaths: [],
  })
  const skillManager = {
    agents: [],
    skills: [],
    refresh: vi.fn(),
    assignSkillToAgent: vi.fn(),
    removeSkillFromAgent: vi.fn(),
    removeLocalInstallation: vi.fn(),
    deleteSkill: vi.fn(),
    installFromRemote: vi.fn().mockResolvedValue({ success: true }),
    installFromLocal: vi.fn().mockResolvedValue({ success: true }),
    saveSkillMD: vi.fn().mockResolvedValue(undefined),
    checkForUpdate: vi.fn().mockResolvedValue(undefined),
    checkAllUpdates: vi.fn().mockResolvedValue(undefined),
    updateSkill: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  }

  vi.doMock('electron', () => ({
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler)
      }),
    },
    shell: {
      showItemInFolder: vi.fn(),
    },
    dialog: {
      showOpenDialog,
    },
    BrowserWindow: {
      getAllWindows: vi.fn(() => []),
    },
    app: {
      getVersion: vi.fn(() => '0.1.1'),
    },
  }))

  vi.doMock('../../electron/services/skill-registry-service', () => ({
    leaderboard: vi.fn(),
    search: vi.fn(),
  }))

  vi.doMock('../../electron/services/skill-content-fetcher', () => ({
    fetchContent: vi.fn(),
  }))

  vi.doMock('../../electron/services/proxy-settings', () => ({
    getProxySettings: vi.fn(() => ({
      isEnabled: false,
      type: 'https',
      host: '',
      port: 0,
      bypassList: [],
    })),
    setProxySettings: vi.fn(),
  }))

  const appUpdater = {
    getState: vi.fn().mockReturnValue({
      currentVersion: '0.1.1',
      status: 'idle',
      isSupported: true,
    }),
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  }

  const { setupIpcHandlers } = await import('../../electron/ipc/handlers')
  setupIpcHandlers(skillManager as never, appUpdater as never)

  return {
    handlers,
    showOpenDialog,
  }
}

describe('local install contract', () => {
  let container: HTMLDivElement
  let root: Root
  let openDirectory: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    openDirectory = vi.fn()

    Object.assign(window, {
      electronAPI: {
        dialog: {
          openDirectory,
        },
      },
    })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('opens the local import dialog in directory-only mode', async () => {
    const { handlers, showOpenDialog } = await loadHandlersContract()
    const openDialog = handlers.get(IPC_CHANNELS.DIALOG.OPEN_DIRECTORY)

    await openDialog?.({})

    expect(showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: ['openDirectory'],
      }),
    )
    expect(showOpenDialog).not.toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.anything(),
      }),
    )
  })

  it('rejects dropped zip files before attempting local install', async () => {
    await act(async () => {
      root.render(React.createElement(UploadSkillModal, { onClose: vi.fn() }))
    })

    const dropZone = Array.from(container.querySelectorAll('div')).find(
      (element) =>
        element.textContent?.includes('Drop a folder here or')
        && element.className.includes('border-dashed'),
    )

    expect(dropZone).toBeTruthy()

    await act(async () => {
      dropZone!.dispatchEvent(createFileDrop('example.zip', '/tmp/example.zip'))
    })

    expect(mockAddNotification).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('ZIP'),
    )
    expect(mockMutateAsync).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain('example.zip')
  })

  it('rejects dropped standalone SKILL.md files before attempting local install', async () => {
    await act(async () => {
      root.render(React.createElement(UploadSkillModal, { onClose: vi.fn() }))
    })

    const dropZone = Array.from(container.querySelectorAll('div')).find(
      (element) =>
        element.textContent?.includes('Drop a folder here or')
        && element.className.includes('border-dashed'),
    )

    expect(dropZone).toBeTruthy()

    await act(async () => {
      dropZone!.dispatchEvent(createFileDrop('SKILL.md', '/tmp/SKILL.md'))
    })

    expect(mockAddNotification).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('folder'),
    )
    expect(mockMutateAsync).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain('/tmp/SKILL.md')
  })

  it('shows the backend failure reason instead of a generic local install success', async () => {
    mockMutateAsync.mockResolvedValue({
      success: false,
      error: 'Directory import only supports folders containing SKILL.md.',
    })

    await act(async () => {
      root.render(React.createElement(UploadSkillModal, { onClose: vi.fn() }))
    })

    const dropZone = Array.from(container.querySelectorAll('div')).find(
      (element) =>
        element.textContent?.includes('Drop a folder here or')
        && element.className.includes('border-dashed'),
    )
    const selectAgentButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Select Claude'),
    )

    expect(dropZone).toBeTruthy()
    expect(selectAgentButton).toBeTruthy()

    await act(async () => {
      dropZone!.dispatchEvent(createFileDrop('example-skill', '/tmp/example-skill'))
    })
    expect(container.textContent).toContain('/tmp/example-skill')

    await act(async () => {
      selectAgentButton!.click()
    })

    const installButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Install'),
    )

    expect(installButton).toBeTruthy()

    await act(async () => {
      installButton!.click()
    })

    expect(mockMutateAsync).toHaveBeenCalledWith({
      localPath: '/tmp/example-skill',
      agentTypes: ['claude'],
    })
    expect(mockAddNotification).toHaveBeenCalledWith(
      'error',
      'Directory import only supports folders containing SKILL.md.',
    )
    expect(mockAddNotification).not.toHaveBeenCalledWith(
      'success',
      expect.any(String),
    )
  })

  it('rejects local imports when the selected path does not exist', async () => {
    const sharedSkillsDir = path.join(createTempDir('skillpilot-shared-'), 'skills')
    const { SkillManager } = await loadSkillManagerForLocalInstall(sharedSkillsDir)
    const manager = new SkillManager()

    const result = await manager.installFromLocal(
      path.join(createTempDir('skillpilot-missing-parent-'), 'missing-skill'),
      [AgentType.CLAUDE],
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('does not exist')
  })

  it('rejects local imports when the selected path resolves to a file', async () => {
    const sharedSkillsDir = path.join(createTempDir('skillpilot-shared-'), 'skills')
    const sourceDir = createTempDir('skillpilot-local-file-')
    const filePath = path.join(sourceDir, 'SKILL.md')
    fs.writeFileSync(filePath, '---\nname: Example\ndescription: Test\n---\n')

    const { SkillManager } = await loadSkillManagerForLocalInstall(sharedSkillsDir)
    const manager = new SkillManager()

    const result = await manager.installFromLocal(filePath, [AgentType.CLAUDE])

    expect(result.success).toBe(false)
    expect(result.error).toContain('must be a directory')
  })

  it('rejects local imports when the directory tree contains a symlink', async () => {
    const sharedSkillsDir = path.join(createTempDir('skillpilot-shared-'), 'skills')
    const sourceDir = createTempDir('skillpilot-local-symlink-')
    const externalDir = createTempDir('skillpilot-external-target-')
    writeFiles(sourceDir, {
      'SKILL.md': '---\nname: Example\ndescription: Test\n---\n',
      'docs/guide.md': '# Guide\n',
    })
    writeFiles(externalDir, {
      'secret.txt': 'outside',
    })
    fs.symlinkSync(externalDir, path.join(sourceDir, 'docs', 'linked-dir'), 'dir')

    const { SkillManager } = await loadSkillManagerForLocalInstall(sharedSkillsDir)
    const manager = new SkillManager()

    const result = await manager.installFromLocal(sourceDir, [AgentType.CLAUDE])

    expect(result.success).toBe(false)
    expect(result.error).toContain('symlink')
    expect(fs.existsSync(path.join(sharedSkillsDir, path.basename(sourceDir)))).toBe(false)
  })
})
