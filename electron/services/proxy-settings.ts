import fs from 'fs'
import path from 'path'
import os from 'os'
import { session, type ProxyConfig } from 'electron'
import { ProxySettings, SetProxySettingsInput } from '../../shared/types'
import * as keychainService from './keychain-service'

const SETTINGS_PATH = path.join(os.homedir(), '.agents', '.skillpilot-settings.json')
const PROXY_PASSWORD_KEY = 'proxy-password'

interface SettingsFile {
  proxy?: ProxySettings
}

function readSettings(): SettingsFile {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'))
    }
  } catch {
    // ignore parse errors
  }
  return {}
}

function writeSettings(settings: SettingsFile): void {
  const dir = path.dirname(SETTINGS_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const tmpPath = SETTINGS_PATH + '.tmp'
  fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2))
  fs.renameSync(tmpPath, SETTINGS_PATH)
}

export function getProxySettings(): ProxySettings {
  const settings = readSettings()
  return settings.proxy ?? {
    isEnabled: false,
    type: 'https',
    host: '',
    port: 0,
    bypassList: [],
  }
}

function toElectronProxyConfig(proxy: ProxySettings): ProxyConfig {
  if (!proxy.isEnabled || !proxy.host || !proxy.port) {
    return { mode: 'direct' }
  }

  const proxyRules = proxy.type === 'socks5'
    ? `socks5://${proxy.host}:${proxy.port}`
    : `http=${proxy.host}:${proxy.port};https=${proxy.host}:${proxy.port}`

  const proxyBypassRules = proxy.bypassList
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join(',')

  return proxyBypassRules
    ? { proxyRules, proxyBypassRules }
    : { proxyRules }
}

export async function applyProxySettingsToElectronSession(): Promise<void> {
  await session.defaultSession.setProxy(toElectronProxyConfig(getProxySettings()))
}

async function invalidateNetworkSessionCache(): Promise<void> {
  const networkProvider = await import('./network-session-provider.js')
  networkProvider.invalidateCache()
}

export async function setProxySettings(input: SetProxySettingsInput): Promise<void> {
  if (!input.proxy.isEnabled || input.password === '') {
    await keychainService.deletePassword(PROXY_PASSWORD_KEY)
  } else if (input.password !== undefined) {
    await keychainService.setPassword(PROXY_PASSWORD_KEY, input.password)
  }

  const settings = readSettings()
  settings.proxy = input.proxy
  writeSettings(settings)

  await invalidateNetworkSessionCache()
  await applyProxySettingsToElectronSession()
}
