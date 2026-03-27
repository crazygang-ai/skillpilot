import { execFile } from 'child_process'
import fsPromises from 'fs/promises'
import { Agent, AgentType } from '../../shared/types'
import { AGENT_CONFIGS, AgentConfig } from '../types/agent-config'
import { SHARED_SKILLS_DIR } from '../utils/constants'

async function pathExists(p: string): Promise<boolean> {
  try { await fsPromises.access(p); return true } catch { return false }
}

function detectCommand(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('which', [command], (err) => {
      resolve(!err)
    })
  })
}

async function countSkills(dirPath: string): Promise<number> {
  try {
    if (!(await pathExists(dirPath))) return 0
    const entries = await fsPromises.readdir(dirPath)
    let count = 0
    for (const name of entries) {
      if (name.startsWith('.')) continue
      const fullPath = await fsPromises.realpath(`${dirPath}/${name}`)
      try {
        const stat = await fsPromises.stat(fullPath)
        if (stat.isDirectory()) count++
      } catch {
        // skip entries that can't be stat'd
      }
    }
    return count
  } catch {
    return 0
  }
}

async function detectAgent(config: AgentConfig): Promise<Agent> {
  const cliExists = await detectCommand(config.detectCommand)
  const configDirExists = await pathExists(config.configDirectoryPath)
  const skillsDirExists = await pathExists(config.skillsDirectoryPath)
  const skillCount = await countSkills(config.skillsDirectoryPath)

  return {
    type: config.type,
    displayName: config.displayName,
    isInstalled: cliExists || configDirExists,
    configDirectoryExists: configDirExists,
    skillsDirectoryExists: skillsDirExists,
    skillCount,
  }
}

export async function detectAll(): Promise<Agent[]> {
  const results = await Promise.all(AGENT_CONFIGS.map(detectAgent))
  return results
}

export function getAgentSkillsDir(agentType: AgentType): string {
  const config = AGENT_CONFIGS.find(c => c.type === agentType)
  return config?.skillsDirectoryPath ?? ''
}

export function getSharedSkillsDir(): string {
  return SHARED_SKILLS_DIR
}
