import { EventEmitter } from 'events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function createProxyConfig(overrides: Partial<{
  isEnabled: boolean
  type: 'https' | 'socks5'
  host: string
  port: number
  username?: string
  bypassList: string[]
}> = {}) {
  return {
    isEnabled: true,
    type: 'https' as const,
    host: 'proxy.example.com',
    port: 3128,
    username: 'alice',
    bypassList: ['localhost', '*.local'],
    ...overrides,
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

async function loadNetworkSessionProvider(options?: {
  proxy?: Partial<ReturnType<typeof createProxyConfig>>
}) {
  const httpsRequest = createRequestMock()
  const httpRequest = createRequestMock()
  const getPassword = vi.fn().mockResolvedValue('super-secret')
  const HttpsProxyAgent = createAgentClassMock()
  const SocksProxyAgent = createAgentClassMock()

  vi.doUnmock('../../electron/services/network-session-provider')
  vi.doMock('https', () => ({
    default: { request: httpsRequest },
    request: httpsRequest,
  }))
  vi.doMock('http', () => ({
    default: { request: httpRequest },
    request: httpRequest,
  }))
  vi.doMock('../../electron/services/proxy-settings', () => ({
    getProxySettings: vi.fn(() => createProxyConfig(options?.proxy)),
  }))
  vi.doMock('../../electron/services/keychain-service', () => ({
    getPassword,
  }))
  vi.doMock('https-proxy-agent', () => ({
    HttpsProxyAgent,
  }))
  vi.doMock('socks-proxy-agent', () => ({
    SocksProxyAgent,
  }))

  const networkSessionProvider = await import('../../electron/services/network-session-provider')

  return {
    networkSessionProvider,
    httpsRequest,
    httpRequest,
    getPassword,
    HttpsProxyAgent,
    SocksProxyAgent,
  }
}

describe('network-session-provider', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('bypasses exact-host proxy matches before building an agent', async () => {
    const {
      networkSessionProvider,
      httpsRequest,
      getPassword,
      HttpsProxyAgent,
    } = await loadNetworkSessionProvider()

    const response = await networkSessionProvider.fetch('https://localhost/docs')

    expect(await response.text()).toBe('ok')
    expect(httpsRequest).toHaveBeenCalledTimes(1)
    expect(httpsRequest.mock.calls[0][1]).not.toHaveProperty('agent')
    expect(getPassword).not.toHaveBeenCalled()
    expect(HttpsProxyAgent).not.toHaveBeenCalled()
  })

  it('uses the real proxy agent path for non-bypassed hosts and reuses the cached agent', async () => {
    const {
      networkSessionProvider,
      httpsRequest,
      getPassword,
      HttpsProxyAgent,
    } = await loadNetworkSessionProvider()

    await networkSessionProvider.fetch('https://service.local/health')
    await networkSessionProvider.fetch('https://api.example.com/skills')
    await networkSessionProvider.fetch('https://api.example.com/skills?page=2')

    expect(httpsRequest).toHaveBeenCalledTimes(3)
    expect(httpsRequest.mock.calls[0][1]).not.toHaveProperty('agent')
    expect(httpsRequest.mock.calls[1][1]).toMatchObject({
      agent: { proxyUrl: 'http://alice:super-secret@proxy.example.com:3128' },
    })
    expect(httpsRequest.mock.calls[2][1]).toMatchObject({
      agent: httpsRequest.mock.calls[1][1].agent,
    })
    expect(getPassword).toHaveBeenCalledTimes(2)
    expect(HttpsProxyAgent).toHaveBeenCalledTimes(1)
  })

  it('rebuilds the proxy agent after invalidateCache is called', async () => {
    const {
      networkSessionProvider,
      httpsRequest,
      HttpsProxyAgent,
    } = await loadNetworkSessionProvider()

    await networkSessionProvider.fetch('https://api.example.com/skills')
    networkSessionProvider.invalidateCache()
    await networkSessionProvider.fetch('https://api.example.com/skills?page=2')

    expect(httpsRequest).toHaveBeenCalledTimes(2)
    expect(HttpsProxyAgent).toHaveBeenCalledTimes(2)
  })

  it('builds a socks5 proxy agent for non-bypassed requests', async () => {
    const {
      networkSessionProvider,
      httpsRequest,
      SocksProxyAgent,
    } = await loadNetworkSessionProvider({
      proxy: {
        type: 'socks5',
        port: 1080,
        bypassList: [],
      },
    })

    await networkSessionProvider.fetch('https://api.example.com/skills')

    expect(httpsRequest).toHaveBeenCalledTimes(1)
    expect(httpsRequest.mock.calls[0][1]).toMatchObject({
      agent: { proxyUrl: 'socks5://alice:super-secret@proxy.example.com:1080' },
    })
    expect(SocksProxyAgent).toHaveBeenCalledTimes(1)
  })
})
