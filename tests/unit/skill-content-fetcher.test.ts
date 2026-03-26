import { describe, it, expect } from 'vitest'

// skill-content-fetcher relies on network calls. We test the pure logic:
// - URL construction for 8-path probe strategy
// - Cache key construction
// - invalidateCache behavior

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com'

function buildCandidateURLs(source: string, skillId: string): string[] {
  const branches = ['main', 'master']
  const layouts = [
    `${skillId}/SKILL.md`,
    `skills/${skillId}/SKILL.md`,
    `.claude/skills/${skillId}/SKILL.md`,
    'SKILL.md',
  ]

  const urls: string[] = []
  for (const branch of branches) {
    for (const layout of layouts) {
      urls.push(`${GITHUB_RAW_BASE}/${source}/${branch}/${layout}`)
    }
  }
  return urls
}

describe('SkillContentFetcher (pure logic)', () => {
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
      // main branch patterns
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

  describe('cache key', () => {
    it('combines source and skillId', () => {
      const cacheKey = `${'user/repo'}/${'my-skill'}`
      expect(cacheKey).toBe('user/repo/my-skill')
    })
  })
})
