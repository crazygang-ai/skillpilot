import { AgentType } from '../../shared/types'
import os from 'os'
import path from 'path'

const HOME = os.homedir()

export interface AgentConfig {
  type: AgentType
  displayName: string
  brandColor: string
  /** CLI command to detect installation (used with `which`) */
  detectCommand: string
  /** Config directory (existence check) */
  configDirectoryPath: string
  /** Skills directory where symlinks are created */
  skillsDirectoryPath: string
  /** Other agents' skill directories this agent can read (soft inheritance) */
  additionalReadableSkillsDirectories: Array<{
    agentType: AgentType
    path: string
  }>
}

export const AGENT_CONFIGS: AgentConfig[] = [
  {
    type: AgentType.CLAUDE,
    displayName: 'Claude Code',
    brandColor: '#d97706',
    detectCommand: 'claude',
    configDirectoryPath: path.join(HOME, '.claude'),
    skillsDirectoryPath: path.join(HOME, '.claude', 'skills'),
    additionalReadableSkillsDirectories: [],
  },
  {
    type: AgentType.CODEX,
    displayName: 'Codex',
    brandColor: '#22c55e',
    detectCommand: 'codex',
    configDirectoryPath: path.join(HOME, '.codex'),
    skillsDirectoryPath: path.join(HOME, '.codex', 'skills'),
    additionalReadableSkillsDirectories: [
      { agentType: AgentType.CLAUDE, path: path.join(HOME, '.agents', 'skills') },
    ],
  },
  {
    type: AgentType.GEMINI,
    displayName: 'Gemini CLI',
    brandColor: '#4285f4',
    detectCommand: 'gemini',
    configDirectoryPath: path.join(HOME, '.gemini'),
    skillsDirectoryPath: path.join(HOME, '.gemini', 'skills'),
    additionalReadableSkillsDirectories: [
      { agentType: AgentType.CLAUDE, path: path.join(HOME, '.agents', 'skills') },
    ],
  },
  {
    type: AgentType.COPILOT,
    displayName: 'Copilot CLI',
    brandColor: '#6366f1',
    detectCommand: 'gh',
    configDirectoryPath: path.join(HOME, '.copilot'),
    skillsDirectoryPath: path.join(HOME, '.copilot', 'skills'),
    additionalReadableSkillsDirectories: [
      { agentType: AgentType.CLAUDE, path: path.join(HOME, '.claude', 'skills') },
    ],
  },
  {
    type: AgentType.OPENCODE,
    displayName: 'OpenCode',
    brandColor: '#ef4444',
    detectCommand: 'opencode',
    configDirectoryPath: path.join(HOME, '.config', 'opencode'),
    skillsDirectoryPath: path.join(HOME, '.config', 'opencode', 'skills'),
    additionalReadableSkillsDirectories: [
      { agentType: AgentType.CLAUDE, path: path.join(HOME, '.claude', 'skills') },
      { agentType: AgentType.CLAUDE, path: path.join(HOME, '.agents', 'skills') },
    ],
  },
  {
    type: AgentType.ANTIGRAVITY,
    displayName: 'Antigravity',
    brandColor: '#a855f7',
    detectCommand: 'antigravity',
    configDirectoryPath: path.join(HOME, '.gemini'),
    skillsDirectoryPath: path.join(HOME, '.gemini', 'antigravity', 'skills'),
    additionalReadableSkillsDirectories: [],
  },
  {
    type: AgentType.CURSOR,
    displayName: 'Cursor',
    brandColor: '#06b6d4',
    detectCommand: 'cursor',
    configDirectoryPath: path.join(HOME, '.cursor'),
    skillsDirectoryPath: path.join(HOME, '.cursor', 'skills'),
    additionalReadableSkillsDirectories: [
      { agentType: AgentType.CLAUDE, path: path.join(HOME, '.claude', 'skills') },
      { agentType: AgentType.CLAUDE, path: path.join(HOME, '.agents', 'skills') },
    ],
  },
  {
    type: AgentType.KIRO,
    displayName: 'Kiro',
    brandColor: '#ec4899',
    detectCommand: 'kiro',
    configDirectoryPath: path.join(HOME, '.kiro'),
    skillsDirectoryPath: path.join(HOME, '.kiro', 'skills'),
    additionalReadableSkillsDirectories: [],
  },
  {
    type: AgentType.CODEBUDDY,
    displayName: 'CodeBuddy',
    brandColor: '#f97316',
    detectCommand: 'codebuddy',
    configDirectoryPath: path.join(HOME, '.codebuddy'),
    skillsDirectoryPath: path.join(HOME, '.codebuddy', 'skills'),
    additionalReadableSkillsDirectories: [],
  },
  {
    type: AgentType.OPENCLAW,
    displayName: 'OpenClaw',
    brandColor: '#14b8a6',
    detectCommand: 'openclaw',
    configDirectoryPath: path.join(HOME, '.openclaw'),
    skillsDirectoryPath: path.join(HOME, '.openclaw', 'skills'),
    additionalReadableSkillsDirectories: [],
  },
  {
    type: AgentType.TRAE,
    displayName: 'Trae',
    brandColor: '#8b5cf6',
    detectCommand: 'trae',
    configDirectoryPath: path.join(HOME, '.trae'),
    skillsDirectoryPath: path.join(HOME, '.trae', 'skills'),
    additionalReadableSkillsDirectories: [],
  },
]

export function getAgentConfig(type: AgentType): AgentConfig | undefined {
  return AGENT_CONFIGS.find(c => c.type === type)
}
