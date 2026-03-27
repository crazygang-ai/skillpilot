import { describe, expect, it } from 'vitest'
import en from '../../src/i18n/en'
import zh from '../../src/i18n/zh'
import { IPC_CHANNELS } from '../../shared/ipc'

describe('shared contracts', () => {
  it('exposes only supported IPC channel groups', () => {
    expect(Object.keys(IPC_CHANNELS).sort()).toEqual([
      'AGENT',
      'CONTENT',
      'DIALOG',
      'FS',
      'REGISTRY',
      'SETTINGS',
      'SKILL',
      'UPDATER',
      'WATCHER',
    ])
  })

  it('keeps sidebar translations aligned across locales', () => {
    const expectedKeys = [
      'allAgents',
      'checkAllUpdates',
      'dashboard',
      'refresh',
      'settings',
      'skillsSh',
    ]

    expect(Object.keys(en.sidebar).sort()).toEqual(expectedKeys)
    expect(Object.keys(zh.sidebar).sort()).toEqual(expectedKeys)
  })
})
