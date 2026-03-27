import { app } from 'electron'
import path from 'path'
import { Skill } from '../../shared/types'
import * as gitService from './git-service'
import * as networkProvider from './network-session-provider'
import { GITHUB_API_BASE } from '../utils/constants'

export async function checkAppUpdate(): Promise<{
  hasUpdate: boolean
  version?: string
  releaseNotes?: string
  downloadUrl?: string
}> {
  try {
    // This will be replaced by electron-updater in production
    const currentVersion = app.getVersion()
    const url = `${GITHUB_API_BASE}/repos/user/skillpilot/releases/latest`
    const res = await networkProvider.fetch(url, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    })

    if (!res.ok) return { hasUpdate: false }

    const data = (await res.json()) as {
      tag_name?: string
      body?: string
      assets?: Array<{ browser_download_url: string }>
    }

    const latestVersion = (data.tag_name ?? '').replace(/^v/, '')
    if (!latestVersion) return { hasUpdate: false }

    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0

    return {
      hasUpdate,
      version: latestVersion,
      releaseNotes: data.body,
      downloadUrl: data.assets?.[0]?.browser_download_url,
    }
  } catch {
    return { hasUpdate: false }
  }
}

/**
 * Check if a skill has updates by comparing local tree hash vs remote.
 * Supports GitHub sources via git tree hash comparison.
 */
export async function checkSkillUpdate(skill: Skill): Promise<{
  hasUpdate: boolean
  remoteTreeHash?: string
  remoteCommitHash?: string
}> {
  if (!skill.lockEntry) return { hasUpdate: false }

  if (skill.lockEntry.sourceType !== 'github') {
    return { hasUpdate: false }
  }

  try {
    const repoDir = await gitService.shallowClone(skill.lockEntry.sourceUrl)
    const skillFolderPath = getSkillFolderPath(repoDir, skill.lockEntry.skillPath)

    const remoteTreeHash = await gitService.getTreeHash(skillFolderPath, repoDir)
    const remoteCommitHash = await gitService.getCommitHash(repoDir)

    const localHash = skill.lockEntry.skillFolderHash
    const hasUpdate = !!localHash && remoteTreeHash !== localHash

    return { hasUpdate, remoteTreeHash, remoteCommitHash }
  } catch {
    return { hasUpdate: false }
  }
}

function getSkillFolderPath(repoDir: string, skillPath: string): string {
  const parts = skillPath.split('/')
  parts.pop() // Remove SKILL.md
  const relativePath = parts.join('/')
  const resolved = relativePath
    ? path.resolve(path.join(repoDir, relativePath))
    : path.resolve(repoDir)
  const resolvedRepo = path.resolve(repoDir)
  if (!resolved.startsWith(resolvedRepo + path.sep) && resolved !== resolvedRepo) {
    throw new Error(`Skill path escapes repo directory: ${skillPath}`)
  }
  return resolved
}

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
