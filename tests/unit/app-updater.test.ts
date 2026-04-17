import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import type { AppUpdateState } from '../../shared/types'
import { AppUpdater } from '../../electron/services/app-updater'

class FakeUpdater extends EventEmitter {
  autoDownload = true
  autoInstallOnAppQuit = true
  checkForUpdates = vi.fn().mockResolvedValue(undefined)
  downloadUpdate = vi.fn().mockResolvedValue(undefined)
  quitAndInstall = vi.fn()
}

describe('AppUpdater', () => {
  it('starts as unsupported for non-packaged builds', () => {
    const updater = new FakeUpdater()
    const service = new AppUpdater({
      currentVersion: '0.1.1',
      isPackaged: false,
      updater,
    })

    expect(service.getState()).toEqual({
      currentVersion: '0.1.1',
      status: 'unsupported',
      isSupported: false,
    })
  })

  it('checks for updates only when supported', async () => {
    const updater = new FakeUpdater()
    const service = new AppUpdater({
      currentVersion: '0.1.1',
      isPackaged: true,
      updater,
    })

    await service.checkForUpdates()

    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(service.getState()).toMatchObject({
      currentVersion: '0.1.1',
      status: 'checking',
      isSupported: true,
    })
  })

  it('maps updater events into shared update state', () => {
    const updater = new FakeUpdater()
    const service = new AppUpdater({
      currentVersion: '0.1.1',
      isPackaged: true,
      updater,
    })
    const seenStates: AppUpdateState[] = []
    service.on('stateChanged', (state: AppUpdateState) => {
      seenStates.push(state)
    })

    updater.emit('update-available', {
      version: '0.1.2',
      releaseNotes: 'Bug fixes',
    })
    updater.emit('download-progress', {
      percent: 42,
      bytesPerSecond: 1000,
      transferred: 420,
      total: 1000,
    })
    updater.emit('update-downloaded', {
      version: '0.1.2',
      releaseNotes: 'Bug fixes',
    })

    expect(seenStates.at(-1)).toMatchObject({
      currentVersion: '0.1.1',
      status: 'downloaded',
      isSupported: true,
      info: {
        version: '0.1.2',
        releaseNotes: 'Bug fixes',
      },
      progress: {
        percent: 42,
        bytesPerSecond: 1000,
        transferred: 420,
        total: 1000,
      },
    })
    expect(seenStates[0]?.lastCheckedAt).toBeTypeOf('string')
  })

  it('guards download and install commands by state', async () => {
    const updater = new FakeUpdater()
    const service = new AppUpdater({
      currentVersion: '0.1.1',
      isPackaged: true,
      updater,
    })

    await expect(service.downloadUpdate()).rejects.toThrow('No available update to download.')
    await expect(service.quitAndInstall()).rejects.toThrow('No downloaded update ready to install.')

    updater.emit('update-available', { version: '0.1.2' })
    await service.downloadUpdate()
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1)

    updater.emit('update-downloaded', { version: '0.1.2' })
    await service.quitAndInstall()
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1)
  })

  it('falls back to an error state when updater commands reject directly', async () => {
    const updater = new FakeUpdater()
    updater.checkForUpdates.mockRejectedValue(new Error('offline'))
    const service = new AppUpdater({
      currentVersion: '0.1.1',
      isPackaged: true,
      updater,
    })

    await expect(service.checkForUpdates()).rejects.toThrow('offline')

    expect(service.getState()).toMatchObject({
      currentVersion: '0.1.1',
      status: 'error',
      isSupported: true,
      errorMessage: 'offline',
    })
  })

  it('surfaces updater errors in shared state', () => {
    const updater = new FakeUpdater()
    const service = new AppUpdater({
      currentVersion: '0.1.1',
      isPackaged: true,
      updater,
    })

    updater.emit('download-progress', {
      percent: 42,
      bytesPerSecond: 1000,
      transferred: 420,
      total: 1000,
    })
    updater.emit('error', new Error('network down'))

    expect(service.getState()).toMatchObject({
      currentVersion: '0.1.1',
      status: 'error',
      isSupported: true,
      errorMessage: 'network down',
    })
    expect(service.getState().progress).toBeUndefined()
  })
})

describe('AppUpdater.destroy()', () => {
  it('是幂等的,重复 destroy 只清理一次', () => {
    const updater = new FakeUpdater()
    const removeSpy = vi.spyOn(updater, 'removeAllListeners')
    const service = new AppUpdater({
      currentVersion: '0.1.1',
      isPackaged: true,
      updater,
    })

    service.destroy()
    service.destroy()

    expect(removeSpy).toHaveBeenCalledTimes(1)
  })

  it('destroy 后 updater 事件不再改变 state', () => {
    const updater = new FakeUpdater()
    const service = new AppUpdater({
      currentVersion: '0.1.1',
      isPackaged: true,
      updater,
    })

    service.destroy()
    const before = service.getState()

    updater.emit('update-available', { version: '0.1.2' })
    updater.emit('download-progress', {
      percent: 42,
      bytesPerSecond: 1000,
      transferred: 420,
      total: 1000,
    })
    updater.emit('error', new Error('boom'))

    expect(service.getState()).toEqual(before)
  })

  it('destroy 后自身订阅者不再被调用', () => {
    const updater = new FakeUpdater()
    const service = new AppUpdater({
      currentVersion: '0.1.1',
      isPackaged: true,
      updater,
    })
    const spy = vi.fn()
    service.on('stateChanged', spy)

    service.destroy()

    updater.emit('update-available', { version: '0.1.2' })

    expect(spy).not.toHaveBeenCalled()
  })

  it('unsupported build 也可以安全 destroy', () => {
    const updater = new FakeUpdater()
    const service = new AppUpdater({
      currentVersion: '0.1.1',
      isPackaged: false,
      updater,
    })

    expect(() => service.destroy()).not.toThrow()
  })
})
