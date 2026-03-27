import { AGENT_BRANDS } from '@shared/agent-metadata'

export const AGENT_DISPLAY_NAMES: Record<string, string> = Object.fromEntries(
  Object.values(AGENT_BRANDS).map(b => [b.type, b.displayName])
)

export const AGENT_BRAND_COLORS: Record<string, string> = Object.fromEntries(
  Object.values(AGENT_BRANDS).map(b => [b.type, b.brandColor])
)

export const AGENT_TEXT_COLORS: Record<string, string> = {
  claude: 'text-agent-claude',
  codex: 'text-agent-codex',
  gemini: 'text-agent-gemini',
  copilot: 'text-agent-copilot',
  opencode: 'text-agent-opencode',
  antigravity: 'text-agent-antigravity',
  cursor: 'text-agent-cursor',
  kiro: 'text-agent-kiro',
  codebuddy: 'text-agent-codebuddy',
  openclaw: 'text-agent-openclaw',
  trae: 'text-agent-trae',
}

export const AGENT_BG_COLORS: Record<string, string> = {
  claude: 'bg-agent-claude',
  codex: 'bg-agent-codex',
  gemini: 'bg-agent-gemini',
  copilot: 'bg-agent-copilot',
  opencode: 'bg-agent-opencode',
  antigravity: 'bg-agent-antigravity',
  cursor: 'bg-agent-cursor',
  kiro: 'bg-agent-kiro',
  codebuddy: 'bg-agent-codebuddy',
  openclaw: 'bg-agent-openclaw',
  trae: 'bg-agent-trae',
}

export function getAgentDisplayName(agentType: string): string {
  return AGENT_DISPLAY_NAMES[agentType] ?? agentType
}
