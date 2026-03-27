import https from 'https'
import http from 'http'
import { getProxySettings } from './proxy-settings'
import * as keychainService from './keychain-service'
import type { ProxySettings } from '../../shared/types'

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024 // 10 MB

interface FetchOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
  timeout?: number
  maxResponseBytes?: number
}

interface FetchResponse {
  status: number
  ok: boolean
  text: () => Promise<string>
  json: () => Promise<unknown>
}

let cachedProxySignature = ''
let cachedAgent: http.Agent | https.Agent | undefined

function shouldBypassProxy(url: string, proxy: ProxySettings): boolean {
  const hostname = new URL(url).hostname.toLowerCase()

  return proxy.bypassList.some((entry) => {
    const normalizedEntry = entry.trim().toLowerCase()
    if (!normalizedEntry) return false

    if (normalizedEntry.startsWith('*.')) {
      const suffix = normalizedEntry.slice(1)
      return hostname.endsWith(suffix) && hostname.length > suffix.length
    }

    return hostname === normalizedEntry
  })
}

async function buildProxyAgent(proxy: ProxySettings): Promise<http.Agent | https.Agent | undefined> {
  if (!proxy.isEnabled || !proxy.host || !proxy.port) {
    return undefined
  }

  const password = proxy.username
    ? await keychainService.getPassword('proxy-password')
    : null

  const signature = JSON.stringify({
    type: proxy.type, host: proxy.host, port: proxy.port,
    username: proxy.username, hasPassword: !!password,
  })
  if (signature === cachedProxySignature && cachedAgent) {
    return cachedAgent
  }

  const auth = proxy.username && password
    ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(password)}@`
    : ''

  if (proxy.type === 'socks5') {
    const proxyUrl = `socks5://${auth}${proxy.host}:${proxy.port}`
    const { SocksProxyAgent } = await import('socks-proxy-agent')
    cachedAgent = new SocksProxyAgent(proxyUrl)
  } else {
    const proxyUrl = `http://${auth}${proxy.host}:${proxy.port}`
    const { HttpsProxyAgent } = await import('https-proxy-agent')
    cachedAgent = new HttpsProxyAgent(proxyUrl)
  }

  cachedProxySignature = signature
  return cachedAgent
}

export async function fetch(url: string, options: FetchOptions = {}): Promise<FetchResponse> {
  const proxy = getProxySettings()
  const agent = shouldBypassProxy(url, proxy)
    ? undefined
    : await buildProxyAgent(proxy)
  const maxBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    const isHttps = parsedUrl.protocol === 'https:'
    const mod = isHttps ? https : http

    const reqOptions: https.RequestOptions = {
      method: options.method ?? 'GET',
      headers: {
        'User-Agent': 'SkillPilot/0.1.0',
        ...options.headers,
      },
      timeout: options.timeout ?? 30000,
    }
    if (agent) reqOptions.agent = agent

    const req = mod.request(url, reqOptions, (res) => {
      let data = ''
      let received = 0

      res.on('data', (chunk: Buffer) => {
        received += chunk.length
        if (received > maxBytes) {
          res.destroy()
          reject(new Error(`Response exceeded ${maxBytes} bytes limit: ${url}`))
          return
        }
        data += chunk.toString()
      })
      res.on('end', () => {
        const status = res.statusCode ?? 0
        resolve({
          status,
          ok: status >= 200 && status < 300,
          text: async () => data,
          json: async () => JSON.parse(data),
        })
      })
    })

    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error(`Request timeout: ${url}`))
    })

    if (options.body) {
      req.write(options.body)
    }
    req.end()
  })
}

export function invalidateCache(): void {
  cachedProxySignature = ''
  cachedAgent = undefined
}
