export const AGENT_DISPLAY_NAMES: Record<string, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  gemini: 'Gemini CLI',
  copilot: 'Copilot CLI',
  opencode: 'OpenCode',
  antigravity: 'Antigravity',
  cursor: 'Cursor',
  kiro: 'Kiro',
  codebuddy: 'CodeBuddy',
  openclaw: 'OpenClaw',
  trae: 'Trae',
}

export const AGENT_BRAND_COLORS: Record<string, string> = {
  claude: '#d97706',
  codex: '#16a34a',
  gemini: '#2563eb',
  copilot: '#4f46e5',
  opencode: '#dc2626',
  antigravity: '#9333ea',
  cursor: '#0891b2',
  kiro: '#db2777',
  codebuddy: '#ea580c',
  openclaw: '#0d9488',
  trae: '#7c3aed',
}

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
