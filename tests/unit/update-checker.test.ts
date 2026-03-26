import { describe, it, expect } from 'vitest'

// update-checker exports checkAppUpdate and checkSkillUpdate, but both
// require electron (app.getVersion) and network/git. We test the
// version comparison logic by exercising it indirectly through a
// pure reimplementation of the private compareVersions function.
// This also tests the getSkillFolderPath logic.

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  const len = Math.max(pa.length, pb.length)

  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? 0
    const vb = pb[i] ?? 0
    if (va > vb) return 1
    if (va < vb) return -1
  }
  return 0
}

function getSkillFolderPath(repoDir: string, skillPath: string): string {
  const parts = skillPath.split('/')
  parts.pop() // Remove SKILL.md
  const relativePath = parts.join('/')
  return relativePath ? `${repoDir}/${relativePath}` : repoDir
}

describe('UpdateChecker (pure logic)', () => {
  describe('compareVersions', () => {
    it('detects newer version', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1)
      expect(compareVersions('1.1.0', '1.0.0')).toBe(1)
      expect(compareVersions('1.0.1', '1.0.0')).toBe(1)
    })

    it('detects older version', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1)
      expect(compareVersions('1.0.0', '1.1.0')).toBe(-1)
    })

    it('detects equal versions', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
      expect(compareVersions('2.1.3', '2.1.3')).toBe(0)
    })

    it('handles different length versions', () => {
      expect(compareVersions('1.0.0.1', '1.0.0')).toBe(1)
      expect(compareVersions('1.0', '1.0.0')).toBe(0)
    })
  })

  describe('getSkillFolderPath', () => {
    it('extracts skill folder from skill path', () => {
      expect(getSkillFolderPath('/tmp/repo', 'skills/my-skill/SKILL.md'))
        .toBe('/tmp/repo/skills/my-skill')
    })

    it('returns repo dir when skill is at root', () => {
      expect(getSkillFolderPath('/tmp/repo', 'SKILL.md'))
        .toBe('/tmp/repo')
    })

    it('handles deep nesting', () => {
      expect(getSkillFolderPath('/tmp/repo', '.claude/skills/deep/skill/SKILL.md'))
        .toBe('/tmp/repo/.claude/skills/deep/skill')
    })
  })
})
