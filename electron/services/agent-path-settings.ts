import fs from 'fs'
import path from 'path'
import os from 'os'

const SETTINGS_PATH = path.join(os.homedir(), '.agents', '.skillpilot-settings.json')

interface AgentPaths {
  [agentType: string]: string | undefined
}

function readPaths(): AgentPaths {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'))
      return data.agentPaths ?? {}
    }
  } catch {
    // ignore
  }
  return {}
}

export function getCustomPath(agentType: string): string | undefined {
  return readPaths()[agentType]
}

export function setCustomPath(agentType: string, customPath: string): void {
  try {
    const raw = fs.existsSync(SETTINGS_PATH)
      ? JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'))
      : {}
    raw.agentPaths = raw.agentPaths ?? {}
    raw.agentPaths[agentType] = customPath
    const dir = path.dirname(SETTINGS_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const tmpPath = SETTINGS_PATH + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(raw, null, 2))
    fs.renameSync(tmpPath, SETTINGS_PATH)
  } catch {
    // ignore
  }
}
