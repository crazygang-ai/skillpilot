import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import os from 'os'
import log from 'electron-log'
import { session, type ProxyConfig } from 'electron'
import { ProxySettings, SetProxySettingsInput } from '../../shared/types'
import * as keychainService from './keychain-service'

const SETTINGS_PATH = path.join(os.homedir(), '.agents', '.skillpilot-settings.json')
const PROXY_PASSWORD_KEY = 'proxy-password'

interface SettingsFile {
  proxy?: ProxySettings
}

async function pathExists(p: string): Promise<boolean> {
  try { await fsPromises.access(p); return true } catch { return false }
}

async function readSettings(): Promise<SettingsFile> {
  try {
    if (await pathExists(SETTINGS_PATH)) {
      return JSON.parse(await fsPromises.readFile(SETTINGS_PATH, 'utf-8'))
    }
  } catch (err) {
    log.warn('Failed to parse proxy settings file:', err)
  }
  return {}
}

async function writeSettings(settings: SettingsFile): Promise<void> {
  const dir = path.dirname(SETTINGS_PATH)
  if (!(await pathExists(dir))) {
    await fsPromises.mkdir(dir, { recursive: true })
  }
  const tmpPath = SETTINGS_PATH + '.tmp'
  await fsPromises.writeFile(tmpPath, JSON.stringify(settings, null, 2))
  fs.renameSync(tmpPath, SETTINGS_PATH)
}

export async function getProxySettings(): Promise<ProxySettings> {
  const settings = await readSettings()
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
  await session.defaultSession.setProxy(toElectronProxyConfig(await getProxySettings()))
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

  const settings = await readSettings()
  settings.proxy = input.proxy
  await writeSettings(settings)

  await invalidateNetworkSessionCache()
  await applyProxySettingsToElectronSession()
}
