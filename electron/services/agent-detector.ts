import { execFile } from 'child_process'
import fs from 'fs'
import { Agent, AgentType } from '../../shared/types'
import { AGENT_CONFIGS, AgentConfig } from '../types/agent-config'
import { SHARED_SKILLS_DIR } from '../utils/constants'

function detectCommand(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('which', [command], (err) => {
      resolve(!err)
    })
  })
}

function countSkills(dirPath: string): number {
  try {
    if (!fs.existsSync(dirPath)) return 0
    return fs.readdirSync(dirPath).filter(name => {
      if (name.startsWith('.')) return false
      const fullPath = fs.realpathSync(`${dirPath}/${name}`)
      try {
        return fs.statSync(fullPath).isDirectory()
      } catch {
        return false
      }
    }).length
  } catch {
    return 0
  }
}

async function detectAgent(config: AgentConfig): Promise<Agent> {
  const cliExists = await detectCommand(config.detectCommand)
  const configDirExists = fs.existsSync(config.configDirectoryPath)
  const skillsDirExists = fs.existsSync(config.skillsDirectoryPath)
  const skillCount = countSkills(config.skillsDirectoryPath)

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
