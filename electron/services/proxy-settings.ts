import fs from 'fs'
import path from 'path'
import os from 'os'
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

async function invalidateNetworkSessionCache(): Promise<void> {
  const networkProvider = await import('./network-session-provider.js')
  networkProvider.invalidateCache()
}

export async function setProxySettings(input: SetProxySettingsInput): Promise<void> {
  const settings = readSettings()
  settings.proxy = input.proxy
  writeSettings(settings)

  if (!input.proxy.isEnabled || input.password === '') {
    await keychainService.deletePassword(PROXY_PASSWORD_KEY)
  } else if (input.password !== undefined) {
    await keychainService.setPassword(PROXY_PASSWORD_KEY, input.password)
  }

  await invalidateNetworkSessionCache()
}
