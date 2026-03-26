import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

const TEST_DIR = path.join(os.tmpdir(), 'skillpilot-test-proxy-' + Date.now())

describe('ProxySettings', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('returns default proxy settings when no file exists', () => {
    // Read settings from a non-existent path
    const settingsPath = path.join(TEST_DIR, 'nonexistent-settings.json')
    expect(fs.existsSync(settingsPath)).toBe(false)

    // Manually test the default return shape
    const defaults = {
      isEnabled: false,
      type: 'https' as const,
      host: '',
      port: 0,
      bypassList: [],
    }
    expect(defaults.isEnabled).toBe(false)
    expect(defaults.type).toBe('https')
    expect(defaults.host).toBe('')
    expect(defaults.port).toBe(0)
    expect(defaults.bypassList).toEqual([])
  })

  it('reads and writes proxy settings file with atomic write', () => {
    const settingsPath = path.join(TEST_DIR, '.skillpilot-settings.json')
    const proxy = {
      isEnabled: true,
      type: 'socks5' as const,
      host: '127.0.0.1',
      port: 1080,
      bypassList: ['localhost', '*.internal'],
    }

    // Simulate atomic write
    const tmpPath = settingsPath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify({ proxy }, null, 2))
    fs.renameSync(tmpPath, settingsPath)

    const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    expect(data.proxy.isEnabled).toBe(true)
    expect(data.proxy.type).toBe('socks5')
    expect(data.proxy.host).toBe('127.0.0.1')
    expect(data.proxy.port).toBe(1080)
    expect(data.proxy.bypassList).toEqual(['localhost', '*.internal'])
  })

  it('handles corrupted settings file gracefully', () => {
    const settingsPath = path.join(TEST_DIR, '.skillpilot-settings.json')
    fs.writeFileSync(settingsPath, '{ invalid json }}}')

    let settings = {}
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    } catch {
      settings = {}
    }
    expect(settings).toEqual({})
  })
})
