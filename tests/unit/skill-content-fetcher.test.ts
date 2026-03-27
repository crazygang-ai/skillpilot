import { describe, it, expect } from 'vitest'
import { buildCandidateURLs } from '../../electron/services/skill-content-fetcher'

describe('SkillContentFetcher', () => {
  describe('8-path probe URL construction', () => {
    it('generates 8 candidate URLs', () => {
      const urls = buildCandidateURLs('user/repo', 'my-skill')
      expect(urls).toHaveLength(8)
    })

    it('tries main branch first', () => {
      const urls = buildCandidateURLs('user/repo', 'my-skill')
      expect(urls[0]).toContain('/main/')
      expect(urls[4]).toContain('/master/')
    })

    it('includes all 4 layout patterns per branch', () => {
      const urls = buildCandidateURLs('user/repo', 'my-skill')
      expect(urls[0]).toBe('https://raw.githubusercontent.com/user/repo/main/my-skill/SKILL.md')
      expect(urls[1]).toBe('https://raw.githubusercontent.com/user/repo/main/skills/my-skill/SKILL.md')
      expect(urls[2]).toBe('https://raw.githubusercontent.com/user/repo/main/.claude/skills/my-skill/SKILL.md')
      expect(urls[3]).toBe('https://raw.githubusercontent.com/user/repo/main/SKILL.md')
    })

    it('constructs correct master branch URLs', () => {
      const urls = buildCandidateURLs('org/project', 'test')
      expect(urls[4]).toBe('https://raw.githubusercontent.com/org/project/master/test/SKILL.md')
      expect(urls[7]).toBe('https://raw.githubusercontent.com/org/project/master/SKILL.md')
    })
  })
})
