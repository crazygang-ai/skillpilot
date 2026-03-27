/** @vitest-environment jsdom */

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppUpdateState } from '../../shared/types'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('updateStore', () => {
  let container: HTMLDivElement
  let root: Root
  let getState: ReturnType<typeof vi.fn>
  let getCurrentVersion: ReturnType<typeof vi.fn>
  let checkForUpdates: ReturnType<typeof vi.fn>
  let downloadUpdate: ReturnType<typeof vi.fn>
  let quitAndInstall: ReturnType<typeof vi.fn>
  let unsubscribe: ReturnType<typeof vi.fn>
  let onStateChanged: ReturnType<typeof vi.fn>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    getState = vi.fn().mockResolvedValue({
      currentVersion: '0.1.1',
      status: 'idle',
      isSupported: true,
    } satisfies AppUpdateState)
    getCurrentVersion = vi.fn().mockResolvedValue('0.1.1')
    checkForUpdates = vi.fn().mockResolvedValue(undefined)
    downloadUpdate = vi.fn().mockResolvedValue(undefined)
    quitAndInstall = vi.fn().mockResolvedValue(undefined)
    unsubscribe = vi.fn()
    onStateChanged = vi.fn().mockImplementation(() => unsubscribe)

    ;(window as typeof window & { electronAPI: unknown }).electronAPI = {
      updater: {
        getState,
        getCurrentVersion,
        checkForUpdates,
        downloadUpdate,
        quitAndInstall,
        onStateChanged,
      },
    }
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    vi.resetModules()
  })

  it('hydrates initial updater state from the main process snapshot', async () => {
    const { useUpdateStore } = await import('../../src/stores/updateStore')

    await act(async () => {
      await useUpdateStore.getState().init()
    })

    expect(getState).toHaveBeenCalledTimes(1)
    expect(useUpdateStore.getState()).toMatchObject({
      currentVersion: '0.1.1',
      status: 'idle',
      isSupported: true,
      initialized: true,
    })
  })

  it('falls back to the packaged app version if the full update snapshot fails', async () => {
    getState.mockRejectedValueOnce(new Error('snapshot unavailable'))
    const { useUpdateStore } = await import('../../src/stores/updateStore')

    await act(async () => {
      await useUpdateStore.getState().init()
    })

    expect(getCurrentVersion).toHaveBeenCalledTimes(1)
    expect(useUpdateStore.getState()).toMatchObject({
      currentVersion: '0.1.1',
      initialized: true,
    })
  })

  it('delegates update actions to the preload api', async () => {
    const { useUpdateStore } = await import('../../src/stores/updateStore')

    await act(async () => {
      await useUpdateStore.getState().checkForUpdates()
      await useUpdateStore.getState().downloadUpdate()
      await useUpdateStore.getState().quitAndInstall()
    })

    expect(checkForUpdates).toHaveBeenCalledTimes(1)
    expect(downloadUpdate).toHaveBeenCalledTimes(1)
    expect(quitAndInstall).toHaveBeenCalledTimes(1)
  })

  it('swallows updater command rejections and waits for state sync instead', async () => {
    checkForUpdates.mockRejectedValueOnce(new Error('offline'))
    const { useUpdateStore } = await import('../../src/stores/updateStore')

    await expect(useUpdateStore.getState().checkForUpdates()).resolves.toBeUndefined()
  })

  it('subscribes to updater state changes and keeps the store in sync', async () => {
    let pushedState: ((state: AppUpdateState) => void) | undefined
    onStateChanged.mockImplementation((callback: (state: AppUpdateState) => void) => {
      pushedState = callback
      return unsubscribe
    })

    const { useUpdateStore } = await import('../../src/stores/updateStore')
    const { useAppUpdateSync } = await import('../../src/hooks/useAppUpdateSync')

    function TestComponent() {
      useAppUpdateSync()
      return null
    }

    await act(async () => {
      root.render(React.createElement(TestComponent))
    })

    expect(getState).toHaveBeenCalledTimes(1)
    expect(onStateChanged).toHaveBeenCalledTimes(1)

    await act(async () => {
      pushedState?.({
        currentVersion: '0.1.1',
        status: 'available',
        isSupported: true,
        info: {
          version: '0.1.2',
          releaseNotes: 'Bug fixes',
        },
      })
    })

    expect(useUpdateStore.getState()).toMatchObject({
      status: 'available',
      info: {
        version: '0.1.2',
        releaseNotes: 'Bug fixes',
      },
    })

    await act(async () => {
      root.unmount()
    })

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
