import { createHash } from 'crypto'
import path from 'path'
import type { LockEntry } from '../../shared/types'
import * as gitService from './git-service'

export function createGitHubSkillId(sourceUrl: string, skillPath: string): string {
  return `skill_${hashIdentity([
    'github',
    gitService.normalizeRepoURL(sourceUrl),
    normalizeSkillPath(skillPath),
  ].join('::'))}`
}

export function createLocalSkillId(canonicalPath: string): string {
  return `skill_${hashIdentity([
    'local',
    normalizePath(canonicalPath),
  ].join('::'))}`
}

export function resolveStableSkillId(canonicalPath: string, lockEntry?: LockEntry): string {
  const explicitStableId = lockEntry?.stableId?.trim()
  if (explicitStableId) {
    return explicitStableId
  }

  if (lockEntry?.sourceType === 'github' && lockEntry.sourceUrl && lockEntry.skillPath) {
    return createGitHubSkillId(lockEntry.sourceUrl, lockEntry.skillPath)
  }

  return createLocalSkillId(canonicalPath)
}

export function resolveLocalStableSkillId(
  canonicalPath: string,
  lockEntries: Record<string, LockEntry>,
): string {
  const normalizedCanonicalPath = normalizePath(canonicalPath)

  for (const entry of Object.values(lockEntries)) {
    if (entry.sourceType !== 'local') {
      continue
    }

    if (normalizePath(entry.sourceUrl) !== normalizedCanonicalPath) {
      continue
    }

    if (entry.stableId?.trim()) {
      return entry.stableId.trim()
    }
  }

  return createLocalSkillId(canonicalPath)
}

export function resolveDirectoryName(
  storageName: string,
  canonicalPath: string,
  lockEntry?: LockEntry,
): string {
  if (lockEntry?.sourceType === 'github' && lockEntry.skillPath) {
    const skillDir = path.dirname(normalizeSkillPath(lockEntry.skillPath))
    return path.posix.basename(skillDir)
  }

  if (lockEntry?.sourceType === 'local' && lockEntry.sourceUrl) {
    return path.basename(normalizePath(lockEntry.sourceUrl))
  }

  return path.basename(canonicalPath) || storageName
}

function normalizeSkillPath(skillPath: string): string {
  return skillPath.replace(/\\/g, '/').replace(/^\.\/+/, '')
}

function normalizePath(filePath: string): string {
  return path.resolve(filePath)
}

function hashIdentity(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}
