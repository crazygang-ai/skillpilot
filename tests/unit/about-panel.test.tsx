/** @vitest-environment jsdom */

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockCheckForUpdates = vi.fn()
const mockDownloadUpdate = vi.fn()
const mockQuitAndInstall = vi.fn()

type MockUpdateState = {
  currentVersion: string
  status: string
  appUpdatesSupported: boolean
  isSupported: boolean
  initialized: boolean
  info?: {
    version?: string
    releaseNotes?: string
  }
  progress?: {
    percent: number
  }
  errorMessage?: string
  lastCheckedAt?: string
  checkForUpdates: typeof mockCheckForUpdates
  downloadUpdate: typeof mockDownloadUpdate
  quitAndInstall: typeof mockQuitAndInstall
}

let mockUpdateState: MockUpdateState

vi.mock('@/stores/updateStore', () => ({
  useUpdateStore: (selector?: (state: MockUpdateState) => unknown) =>
    selector ? selector(mockUpdateState) : mockUpdateState,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const translations: Record<string, string> = {
        'settings.appVersion': 'Version',
        'settings.appUpdatesUnsupported': 'Unsupported build',
        'settings.appUpdatesSupported': 'Updates supported',
        'settings.checkForUpdates': 'Check for Updates',
        'settings.updateAvailableVersion': `Update available: v${params?.version ?? ''}`,
        'settings.updateNotAvailable': 'Already up to date',
        'settings.downloadUpdate': 'Download Update',
        'settings.downloadingUpdate': 'Downloading update',
        'settings.restartToInstall': 'Restart to Install',
        'settings.updateError': 'Update failed',
      }

      return translations[key] ?? key
    },
  }),
}))

describe('AboutPanel', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    mockCheckForUpdates.mockReset()
    mockDownloadUpdate.mockReset()
    mockQuitAndInstall.mockReset()

    mockUpdateState = {
      currentVersion: '0.1.1',
      status: 'unsupported',
      appUpdatesSupported: false,
      isSupported: false,
      initialized: true,
      checkForUpdates: mockCheckForUpdates,
      downloadUpdate: mockDownloadUpdate,
      quitAndInstall: mockQuitAndInstall,
    }
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('shows the unsupported-build message when automatic updates are unavailable', async () => {
    const AboutPanel = (await import('../../src/components/settings/AboutPanel')).default

    await act(async () => {
      root.render(<AboutPanel />)
    })

    expect(container.textContent).toContain('Version: v0.1.1')
    expect(container.textContent).toContain('Unsupported build')
    expect(container.textContent).not.toContain('Check for Updates')
  })

  it('shows the check-for-updates action when the app can query releases', async () => {
    mockUpdateState = {
      ...mockUpdateState,
      status: 'idle',
      isSupported: true,
      appUpdatesSupported: true,
    }
    const AboutPanel = (await import('../../src/components/settings/AboutPanel')).default

    await act(async () => {
      root.render(<AboutPanel />)
    })

    expect(container.textContent).toContain('Check for Updates')
  })

  it('shows download and install actions for update-ready states', async () => {
    mockUpdateState = {
      ...mockUpdateState,
      status: 'available',
      isSupported: true,
      appUpdatesSupported: true,
      info: {
        version: '0.1.2',
      },
    }
    const AboutPanel = (await import('../../src/components/settings/AboutPanel')).default

    await act(async () => {
      root.render(<AboutPanel />)
    })

    expect(container.textContent).toContain('Update available: v0.1.2')
    expect(container.textContent).toContain('Download Update')

    mockUpdateState = {
      ...mockUpdateState,
      status: 'downloaded',
    }

    await act(async () => {
      root.render(<AboutPanel />)
    })

    expect(container.textContent).toContain('Restart to Install')
  })

  it('renders progress and errors from the shared update state', async () => {
    mockUpdateState = {
      ...mockUpdateState,
      status: 'downloading',
      isSupported: true,
      appUpdatesSupported: true,
      progress: {
        percent: 42,
      },
    }
    const AboutPanel = (await import('../../src/components/settings/AboutPanel')).default

    await act(async () => {
      root.render(<AboutPanel />)
    })

    expect(container.textContent).toContain('Downloading update')
    expect(container.textContent).toContain('42%')

    mockUpdateState = {
      ...mockUpdateState,
      status: 'error',
      errorMessage: 'network down',
    }

    await act(async () => {
      root.render(<AboutPanel />)
    })

    expect(container.textContent).toContain('Update failed')
    expect(container.textContent).toContain('network down')
  })
})
