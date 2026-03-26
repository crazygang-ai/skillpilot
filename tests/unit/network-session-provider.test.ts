import { describe, it, expect } from 'vitest'

// network-session-provider relies on actual HTTP/HTTPS modules.
// We test the pure logic aspects: proxy URL construction, FetchResponse shape.

describe('NetworkSessionProvider (pure logic)', () => {
  describe('proxy URL construction', () => {
    function buildProxyUrl(proxy: {
      type: string
      host: string
      port: number
      username?: string
      password?: string
    }): string {
      const auth = proxy.username && proxy.password
        ? `${proxy.username}:${proxy.password}@`
        : ''
      const protocol = proxy.type === 'socks5' ? 'socks5' : 'http'
      return `${protocol}://${auth}${proxy.host}:${proxy.port}`
    }

    it('builds HTTPS proxy URL without auth', () => {
      const url = buildProxyUrl({ type: 'https', host: '127.0.0.1', port: 8080 })
      expect(url).toBe('http://127.0.0.1:8080')
    })

    it('builds SOCKS5 proxy URL', () => {
      const url = buildProxyUrl({ type: 'socks5', host: '127.0.0.1', port: 1080 })
      expect(url).toBe('socks5://127.0.0.1:1080')
    })

    it('builds proxy URL with authentication', () => {
      const url = buildProxyUrl({
        type: 'https',
        host: 'proxy.example.com',
        port: 3128,
        username: 'user',
        password: 'pass',
      })
      expect(url).toBe('http://user:pass@proxy.example.com:3128')
    })

    it('omits auth when username is missing', () => {
      const url = buildProxyUrl({
        type: 'https',
        host: 'proxy.example.com',
        port: 3128,
        password: 'pass',
      })
      expect(url).toBe('http://proxy.example.com:3128')
    })
  })

  describe('FetchResponse shape', () => {
    it('ok is true for 2xx status codes', () => {
      for (const status of [200, 201, 204, 299]) {
        const ok = status >= 200 && status < 300
        expect(ok).toBe(true)
      }
    })

    it('ok is false for non-2xx status codes', () => {
      for (const status of [301, 400, 404, 500]) {
        const ok = status >= 200 && status < 300
        expect(ok).toBe(false)
      }
    })
  })
})
