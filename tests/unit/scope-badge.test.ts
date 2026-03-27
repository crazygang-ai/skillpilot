import { describe, it, expect } from 'vitest'
import { getAgentDisplayName, AGENT_DISPLAY_NAMES } from '../../src/lib/agent-constants'

describe('agent-constants', () => {
  describe('getAgentDisplayName', () => {
    it('returns display name for known agent types', () => {
      expect(getAgentDisplayName('claude')).toBe('Claude Code')
      expect(getAgentDisplayName('codex')).toBe('Codex')
      expect(getAgentDisplayName('gemini')).toBe('Gemini CLI')
      expect(getAgentDisplayName('copilot')).toBe('Copilot CLI')
      expect(getAgentDisplayName('cursor')).toBe('Cursor')
    })

    it('falls back to raw value for unknown agent types', () => {
      expect(getAgentDisplayName('unknown-agent')).toBe('unknown-agent')
    })

    it('covers all 11 supported agents', () => {
      const expectedAgents = [
        'claude', 'codex', 'gemini', 'copilot', 'opencode',
        'antigravity', 'cursor', 'kiro', 'codebuddy', 'openclaw', 'trae',
      ]
      for (const agent of expectedAgents) {
        expect(AGENT_DISPLAY_NAMES[agent]).toBeTruthy()
        expect(getAgentDisplayName(agent)).not.toBe(agent)
      }
    })
  })

  describe('ScopeBadge label logic', () => {
    it('agentLocal scope uses display name, not enum value', () => {
      const agentType = 'claude'
      const label = getAgentDisplayName(agentType)
      expect(label).toBe('Claude Code')
      expect(label).not.toBe('claude')
    })

    it('each agent display name is human-readable (contains uppercase or space)', () => {
      for (const [key, name] of Object.entries(AGENT_DISPLAY_NAMES)) {
        expect(name).toMatch(/[A-Z\s]/)
      }
    })
  })
})
