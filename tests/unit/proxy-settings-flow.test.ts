import fs from 'fs'
import path from 'path'
import os from 'os'
import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_HOME = path.join(os.tmpdir(), `skillpilot-proxy-flow-${Date.now()}`)

function createProxyConfig() {
  return {
    isEnabled: true,
    type: 'https' as const,
    host: 'proxy.example.com',
    port: 3128,
    username: 'alice',
    bypassList: ['localhost', '*.local'],
  }
}

function createRequestMock() {
  return vi.fn((url: string, options: unknown, callback: (res: EventEmitter & { statusCode?: number }) => void) => {
    const response = new EventEmitter() as EventEmitter & { statusCode?: number }
    response.statusCode = 200

    callback(response)
    queueMicrotask(() => {
      response.emit('data', Buffer.from('ok'))
      response.emit('end')
    })

    return {
      on: vi.fn().mockReturnThis(),
      write: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
    }
  })
}

function createAgentClassMock() {
  return vi.fn(
    class MockProxyAgent {
      proxyUrl: string

      constructor(proxyUrl: string) {
        this.proxyUrl = proxyUrl
      }
    },
  )
}

describe('proxy settings flow', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    fs.rmSync(TEST_HOME, { recursive: true, force: true })
    fs.mkdirSync(TEST_HOME, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true })
  })

  it('persists proxy settings, stores password in Keychain, and invalidates runtime cache', async () => {
    const setPassword = vi.fn().mockResolvedValue(undefined)
    const deletePassword = vi.fn().mockResolvedValue(undefined)
    const invalidateCache = vi.fn()

    vi.doMock('os', () => ({
      default: { homedir: () => TEST_HOME },
      homedir: () => TEST_HOME,
    }))
    vi.doMock('../../electron/services/keychain-service', () => ({
      setPassword,
      deletePassword,
      getPassword: vi.fn(),
    }))
    vi.doMock('../../electron/services/network-session-provider', () => ({
      invalidateCache,
    }))

    const { setProxySettings, getProxySettings } = await import('../../electron/services/proxy-settings')

    await setProxySettings({
      proxy: createProxyConfig(),
      password: 'super-secret',
    })

    const settingsPath = path.join(TEST_HOME, '.agents', '.skillpilot-settings.json')
    const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      proxy: Record<string, unknown>
    }

    expect(saved.proxy).toMatchObject(createProxyConfig())
    expect(saved.proxy).not.toHaveProperty('password')
    expect(getProxySettings()).toEqual(createProxyConfig())
    expect(setPassword).toHaveBeenCalledWith('proxy-password', 'super-secret')
    expect(deletePassword).not.toHaveBeenCalled()
    expect(invalidateCache).toHaveBeenCalledTimes(1)
  })

  it('clears stored proxy password when password is emptied or proxy is disabled', async () => {
    const setPassword = vi.fn().mockResolvedValue(undefined)
    const deletePassword = vi.fn().mockResolvedValue(undefined)
    const invalidateCache = vi.fn()

    vi.doMock('os', () => ({
      default: { homedir: () => TEST_HOME },
      homedir: () => TEST_HOME,
    }))
    vi.doMock('../../electron/services/keychain-service', () => ({
      setPassword,
      deletePassword,
      getPassword: vi.fn(),
    }))
    vi.doMock('../../electron/services/network-session-provider', () => ({
      invalidateCache,
    }))

    const { setProxySettings } = await import('../../electron/services/proxy-settings')

    await setProxySettings({
      proxy: {
        ...createProxyConfig(),
        isEnabled: false,
      },
      password: '',
    })

    expect(setPassword).not.toHaveBeenCalled()
    expect(deletePassword).toHaveBeenCalledWith('proxy-password')
    expect(invalidateCache).toHaveBeenCalledTimes(1)
  })

  it('propagates Keychain failures instead of silently succeeding', async () => {
    const invalidateCache = vi.fn()

    vi.doMock('os', () => ({
      default: { homedir: () => TEST_HOME },
      homedir: () => TEST_HOME,
    }))
    vi.doMock('../../electron/services/keychain-service', () => ({
      setPassword: vi.fn().mockRejectedValue(new Error('Keychain unavailable')),
      deletePassword: vi.fn(),
      getPassword: vi.fn(),
    }))
    vi.doMock('../../electron/services/network-session-provider', () => ({
      invalidateCache,
    }))

    const { setProxySettings } = await import('../../electron/services/proxy-settings')

    await expect(
      setProxySettings({
        proxy: createProxyConfig(),
        password: 'super-secret',
      }),
    ).rejects.toThrow('Keychain unavailable')

    expect(invalidateCache).not.toHaveBeenCalled()
  })

  it('bypasses the proxy for exact host matches before building an agent', async () => {
    const httpsRequest = createRequestMock()
    const getPassword = vi.fn().mockResolvedValue('super-secret')
    const HttpsProxyAgent = createAgentClassMock()

    vi.doUnmock('../../electron/services/network-session-provider')
    vi.doMock('https', () => ({
      default: { request: httpsRequest },
      request: httpsRequest,
    }))
    vi.doMock('http', () => ({
      default: { request: createRequestMock() },
      request: createRequestMock(),
    }))
    vi.doMock('../../electron/services/proxy-settings', () => ({
      getProxySettings: vi.fn(() => createProxyConfig()),
    }))
    vi.doMock('../../electron/services/keychain-service', () => ({
      getPassword,
    }))
    vi.doMock('https-proxy-agent', () => ({
      HttpsProxyAgent,
    }))

    const networkProvider = await import('../../electron/services/network-session-provider')
    const response = await networkProvider.fetch('https://localhost/docs')

    expect(await response.text()).toBe('ok')
    expect(httpsRequest).toHaveBeenCalled()
    expect(httpsRequest.mock.calls[0][1]).not.toHaveProperty('agent')
    expect(getPassword).not.toHaveBeenCalled()
    expect(HttpsProxyAgent).not.toHaveBeenCalled()
  })

  it('bypasses wildcard .local hosts and still uses proxy for other hosts', async () => {
    const httpsRequest = createRequestMock()
    const getPassword = vi.fn().mockResolvedValue('super-secret')
    const HttpsProxyAgent = createAgentClassMock()

    vi.doUnmock('../../electron/services/network-session-provider')
    vi.doMock('https', () => ({
      default: { request: httpsRequest },
      request: httpsRequest,
    }))
    vi.doMock('http', () => ({
      default: { request: createRequestMock() },
      request: createRequestMock(),
    }))
    vi.doMock('../../electron/services/proxy-settings', () => ({
      getProxySettings: vi.fn(() => createProxyConfig()),
    }))
    vi.doMock('../../electron/services/keychain-service', () => ({
      getPassword,
    }))
    vi.doMock('https-proxy-agent', () => ({
      HttpsProxyAgent,
    }))

    const networkProvider = await import('../../electron/services/network-session-provider')

    await networkProvider.fetch('https://service.local/health')
    await networkProvider.fetch('https://api.example.com/skills')

    expect(httpsRequest).toHaveBeenCalledTimes(2)
    expect(httpsRequest.mock.calls[0][1]).not.toHaveProperty('agent')
    expect(httpsRequest.mock.calls[1][1]).toMatchObject({
      agent: { proxyUrl: 'http://alice:super-secret@proxy.example.com:3128' },
    })
    expect(getPassword).toHaveBeenCalledTimes(1)
    expect(HttpsProxyAgent).toHaveBeenCalledTimes(1)
  })
})
