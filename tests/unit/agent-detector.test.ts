import { describe, it, expect } from 'vitest'
import { getAgentSkillsDir, getSharedSkillsDir } from '../../electron/services/agent-detector'
import { AgentType } from '../../shared/types'
import { SHARED_SKILLS_DIR } from '../../electron/utils/constants'

describe('AgentDetector', () => {
  describe('getAgentSkillsDir', () => {
    it('returns skills directory for known agent', () => {
      const dir = getAgentSkillsDir(AgentType.CLAUDE)
      expect(dir).toBeTruthy()
      expect(dir).toContain('.claude')
    })

    it('returns skills directory for Codex agent', () => {
      const dir = getAgentSkillsDir(AgentType.CODEX)
      expect(dir).toBeTruthy()
      expect(dir).toContain('.codex')
    })

    it('returns empty string for unknown agent', () => {
      const dir = getAgentSkillsDir('nonexistent' as AgentType)
      expect(dir).toBe('')
    })
  })

  describe('getSharedSkillsDir', () => {
    it('returns the shared skills directory', () => {
      expect(getSharedSkillsDir()).toBe(SHARED_SKILLS_DIR)
    })
  })
})
