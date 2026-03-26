import fs from 'fs'
import path from 'path'
import os from 'os'
import { ProxySettings } from '../../shared/types'

const SETTINGS_PATH = path.join(os.homedir(), '.agents', '.skillpilot-settings.json')

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

export function setProxySettings(proxy: ProxySettings): void {
  const settings = readSettings()
  settings.proxy = proxy
  writeSettings(settings)
}
