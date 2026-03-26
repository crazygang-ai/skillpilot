import type { Skill } from '@/types'

export type OwnershipFilter = 'all' | 'user' | 'builtin'

export function isBuiltinSkill(skill: Skill): boolean {
  return skill.installations.some((i) => i.isInherited) && !skill.lockEntry
}

export function matchesOwnershipFilter(
  skill: Skill,
  filter: OwnershipFilter,
): boolean {
  if (filter === 'all') return true
  const builtin = isBuiltinSkill(skill)
  return filter === 'builtin' ? builtin : !builtin
}
