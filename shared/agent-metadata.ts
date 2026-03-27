import { AgentType } from './types'

export interface AgentBrandInfo {
  type: AgentType
  displayName: string
  brandColor: string
}

export const AGENT_BRANDS: Record<AgentType, AgentBrandInfo> = {
  [AgentType.CLAUDE]: { type: AgentType.CLAUDE, displayName: 'Claude Code', brandColor: '#d97706' },
  [AgentType.CODEX]: { type: AgentType.CODEX, displayName: 'Codex', brandColor: '#16a34a' },
  [AgentType.GEMINI]: { type: AgentType.GEMINI, displayName: 'Gemini CLI', brandColor: '#2563eb' },
  [AgentType.COPILOT]: { type: AgentType.COPILOT, displayName: 'Copilot CLI', brandColor: '#4f46e5' },
  [AgentType.OPENCODE]: { type: AgentType.OPENCODE, displayName: 'OpenCode', brandColor: '#dc2626' },
  [AgentType.ANTIGRAVITY]: { type: AgentType.ANTIGRAVITY, displayName: 'Antigravity', brandColor: '#9333ea' },
  [AgentType.CURSOR]: { type: AgentType.CURSOR, displayName: 'Cursor', brandColor: '#0891b2' },
  [AgentType.KIRO]: { type: AgentType.KIRO, displayName: 'Kiro', brandColor: '#db2777' },
  [AgentType.CODEBUDDY]: { type: AgentType.CODEBUDDY, displayName: 'CodeBuddy', brandColor: '#ea580c' },
  [AgentType.OPENCLAW]: { type: AgentType.OPENCLAW, displayName: 'OpenClaw', brandColor: '#0d9488' },
  [AgentType.TRAE]: { type: AgentType.TRAE, displayName: 'Trae', brandColor: '#7c3aed' },
}

export function getAgentBrand(type: AgentType): AgentBrandInfo {
  return AGENT_BRANDS[type]
}
