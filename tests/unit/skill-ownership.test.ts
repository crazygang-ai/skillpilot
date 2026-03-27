import { describe, it, expect } from 'vitest'
import { isBuiltinSkill, matchesOwnershipFilter } from '../../src/components/skill/skill-ownership'
import type { Skill } from '../../shared/types'

function makeSkill(overrides: {
  isInherited?: boolean
  hasLockEntry?: boolean
}): Skill {
  return {
    id: 'test',
    storageName: 'test',
    directoryName: 'test',
    canonicalPath: '/test',
    metadata: { name: 'test', description: 'test' },
    markdownBody: '',
    scope: { kind: 'sharedGlobal' },
    installations: [
      {
        agentType: 'claude' as any,
        path: '/agent/skills/test',
        isSymlink: true,
        isInherited: overrides.isInherited ?? false,
      },
    ],
    hasUpdate: false,
    updateStatus: 'notChecked',
    lockEntry: overrides.hasLockEntry
      ? {
          source: 'user/repo',
          sourceType: 'github',
          sourceUrl: 'https://github.com/user/repo.git',
          skillPath: 'skills/test/SKILL.md',
          skillFolderHash: 'abc123',
          installedAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        }
      : undefined,
  }
}

describe('skill-ownership', () => {
  describe('isBuiltinSkill', () => {
    it('returns true when inherited and no lock entry', () => {
      const skill = makeSkill({ isInherited: true, hasLockEntry: false })
      expect(isBuiltinSkill(skill)).toBe(true)
    })

    it('returns false when inherited but has lock entry', () => {
      const skill = makeSkill({ isInherited: true, hasLockEntry: true })
      expect(isBuiltinSkill(skill)).toBe(false)
    })

    it('returns false when not inherited', () => {
      const skill = makeSkill({ isInherited: false, hasLockEntry: false })
      expect(isBuiltinSkill(skill)).toBe(false)
    })
  })

  describe('matchesOwnershipFilter', () => {
    it('all filter matches everything', () => {
      expect(matchesOwnershipFilter(makeSkill({ isInherited: true }), 'all')).toBe(true)
      expect(matchesOwnershipFilter(makeSkill({ isInherited: false }), 'all')).toBe(true)
    })

    it('user filter excludes builtin-only', () => {
      expect(matchesOwnershipFilter(makeSkill({ isInherited: false }), 'user')).toBe(true)
      expect(matchesOwnershipFilter(makeSkill({ isInherited: true }), 'user')).toBe(false)
    })

    it('builtin filter includes only builtin', () => {
      expect(matchesOwnershipFilter(makeSkill({ isInherited: true }), 'builtin')).toBe(true)
      expect(matchesOwnershipFilter(makeSkill({ isInherited: false }), 'builtin')).toBe(false)
    })
  })
})
