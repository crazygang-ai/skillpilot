import { AgentType } from '../../shared/types'
import { AGENT_BRANDS } from '../../shared/agent-metadata'
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
  additionalReadableSkillsDirectories: ReadableSkillsDirectory[]
}

export type ReadableSkillsDirectory =
  | { sourceKind: 'shared'; path: string }
  | { sourceKind: 'agent'; agentType: AgentType; path: string }

export const AGENT_CONFIGS: AgentConfig[] = [
  {
    type: AgentType.CLAUDE,
    displayName: AGENT_BRANDS[AgentType.CLAUDE].displayName,
    brandColor: AGENT_BRANDS[AgentType.CLAUDE].brandColor,
    detectCommand: 'claude',
    configDirectoryPath: path.join(HOME, '.claude'),
    skillsDirectoryPath: path.join(HOME, '.claude', 'skills'),
    additionalReadableSkillsDirectories: [],
  },
  {
    type: AgentType.CODEX,
    displayName: AGENT_BRANDS[AgentType.CODEX].displayName,
    brandColor: AGENT_BRANDS[AgentType.CODEX].brandColor,
    detectCommand: 'codex',
    configDirectoryPath: path.join(HOME, '.codex'),
    skillsDirectoryPath: path.join(HOME, '.codex', 'skills'),
    additionalReadableSkillsDirectories: [
      { sourceKind: 'shared', path: path.join(HOME, '.agents', 'skills') },
    ],
  },
  {
    type: AgentType.GEMINI,
    displayName: AGENT_BRANDS[AgentType.GEMINI].displayName,
    brandColor: AGENT_BRANDS[AgentType.GEMINI].brandColor,
    detectCommand: 'gemini',
    configDirectoryPath: path.join(HOME, '.gemini'),
    skillsDirectoryPath: path.join(HOME, '.gemini', 'skills'),
    additionalReadableSkillsDirectories: [
      { sourceKind: 'shared', path: path.join(HOME, '.agents', 'skills') },
    ],
  },
  {
    type: AgentType.COPILOT,
    displayName: AGENT_BRANDS[AgentType.COPILOT].displayName,
    brandColor: AGENT_BRANDS[AgentType.COPILOT].brandColor,
    detectCommand: 'gh',
    configDirectoryPath: path.join(HOME, '.copilot'),
    skillsDirectoryPath: path.join(HOME, '.copilot', 'skills'),
    additionalReadableSkillsDirectories: [
      { sourceKind: 'agent', agentType: AgentType.CLAUDE, path: path.join(HOME, '.claude', 'skills') },
    ],
  },
  {
    type: AgentType.OPENCODE,
    displayName: AGENT_BRANDS[AgentType.OPENCODE].displayName,
    brandColor: AGENT_BRANDS[AgentType.OPENCODE].brandColor,
    detectCommand: 'opencode',
    configDirectoryPath: path.join(HOME, '.config', 'opencode'),
    skillsDirectoryPath: path.join(HOME, '.config', 'opencode', 'skills'),
    additionalReadableSkillsDirectories: [
      { sourceKind: 'agent', agentType: AgentType.CLAUDE, path: path.join(HOME, '.claude', 'skills') },
      { sourceKind: 'shared', path: path.join(HOME, '.agents', 'skills') },
    ],
  },
  {
    type: AgentType.ANTIGRAVITY,
    displayName: AGENT_BRANDS[AgentType.ANTIGRAVITY].displayName,
    brandColor: AGENT_BRANDS[AgentType.ANTIGRAVITY].brandColor,
    detectCommand: 'antigravity',
    configDirectoryPath: path.join(HOME, '.gemini'),
    skillsDirectoryPath: path.join(HOME, '.gemini', 'antigravity', 'skills'),
    additionalReadableSkillsDirectories: [],
  },
  {
    type: AgentType.CURSOR,
    displayName: AGENT_BRANDS[AgentType.CURSOR].displayName,
    brandColor: AGENT_BRANDS[AgentType.CURSOR].brandColor,
    detectCommand: 'cursor',
    configDirectoryPath: path.join(HOME, '.cursor'),
    skillsDirectoryPath: path.join(HOME, '.cursor', 'skills'),
    additionalReadableSkillsDirectories: [
      { sourceKind: 'agent', agentType: AgentType.CLAUDE, path: path.join(HOME, '.claude', 'skills') },
      { sourceKind: 'shared', path: path.join(HOME, '.agents', 'skills') },
    ],
  },
  {
    type: AgentType.KIRO,
    displayName: AGENT_BRANDS[AgentType.KIRO].displayName,
    brandColor: AGENT_BRANDS[AgentType.KIRO].brandColor,
    detectCommand: 'kiro',
    configDirectoryPath: path.join(HOME, '.kiro'),
    skillsDirectoryPath: path.join(HOME, '.kiro', 'skills'),
    additionalReadableSkillsDirectories: [],
  },
  {
    type: AgentType.CODEBUDDY,
    displayName: AGENT_BRANDS[AgentType.CODEBUDDY].displayName,
    brandColor: AGENT_BRANDS[AgentType.CODEBUDDY].brandColor,
    detectCommand: 'codebuddy',
    configDirectoryPath: path.join(HOME, '.codebuddy'),
    skillsDirectoryPath: path.join(HOME, '.codebuddy', 'skills'),
    additionalReadableSkillsDirectories: [],
  },
  {
    type: AgentType.OPENCLAW,
    displayName: AGENT_BRANDS[AgentType.OPENCLAW].displayName,
    brandColor: AGENT_BRANDS[AgentType.OPENCLAW].brandColor,
    detectCommand: 'openclaw',
    configDirectoryPath: path.join(HOME, '.openclaw'),
    skillsDirectoryPath: path.join(HOME, '.openclaw', 'skills'),
    additionalReadableSkillsDirectories: [],
  },
  {
    type: AgentType.TRAE,
    displayName: AGENT_BRANDS[AgentType.TRAE].displayName,
    brandColor: AGENT_BRANDS[AgentType.TRAE].brandColor,
    detectCommand: 'trae',
    configDirectoryPath: path.join(HOME, '.trae'),
    skillsDirectoryPath: path.join(HOME, '.trae', 'skills'),
    additionalReadableSkillsDirectories: [],
  },
]

export function getAgentConfig(type: AgentType): AgentConfig | undefined {
  return AGENT_CONFIGS.find(c => c.type === type)
}
