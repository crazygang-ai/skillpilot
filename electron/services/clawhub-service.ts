import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ClawHubSkill, ClawHubSkillDetail } from '../../shared/types'
import * as networkProvider from './network-session-provider'
import { CONTENT_CACHE_TTL_MS } from '../utils/constants'

function execPromise(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve(stdout.trim())
    })
  })
}

const CONVEX_URL = 'https://wry-manatee-359.convex.cloud/api/query'

interface CacheEntry<T> {
  data: T
  timestamp: number
}

const detailCache = new Map<string, CacheEntry<ClawHubSkillDetail>>()

async function convexQuery(path: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await networkProvider.fetch(CONVEX_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  })
  if (!res.ok) throw new Error(`ClawHub query failed: ${res.status}`)
  const data = (await res.json()) as { status: string; value?: unknown; errorMessage?: string }
  if (data.status !== 'success') throw new Error(data.errorMessage ?? 'ClawHub query error')
  return data.value
}

export async function search(query: string, limit = 30, sort = 'downloads'): Promise<ClawHubSkill[]> {
  const args: Record<string, unknown> = {
    numItems: limit,
    sort,
    dir: 'desc',
    nonSuspiciousOnly: true,
  }

  const result = (await convexQuery('skills:listPublicPageV4', args)) as {
    page?: Array<Record<string, unknown>>
  }

  const items = result?.page ?? []

  if (query) {
    const q = query.toLowerCase()
    return items.filter(item => {
      const skill = (item.skill ?? item) as Record<string, unknown>
      const name = String(skill.displayName ?? skill.slug ?? '').toLowerCase()
      const summary = String(skill.summary ?? '').toLowerCase()
      return name.includes(q) || summary.includes(q)
    }).map(mapConvexItem)
  }

  return items.map(mapConvexItem)
}

export async function detail(slug: string): Promise<ClawHubSkillDetail> {
  const cached = detailCache.get(slug)
  if (cached && Date.now() - cached.timestamp < CONTENT_CACHE_TTL_MS) {
    return cached.data
  }

  const raw = (await convexQuery('skills:getBySlug', { slug })) as Record<string, unknown> | null
  if (!raw) throw new Error(`Skill not found: ${slug}`)

  const skill = (raw.skill ?? raw) as Record<string, unknown>
  const latestVer = raw.latestVersion as Record<string, unknown> | undefined
  const modInfo = raw.moderationInfo as Record<string, unknown> | undefined

  const result: ClawHubSkillDetail = {
    skill: mapSkillObj(skill, raw.ownerHandle as string | undefined),
    latestVersion: latestVer?.version as string | undefined,
    latestVersionCreatedAt: latestVer?.createdAt != null ? new Date(Number(latestVer.createdAt)).toISOString() : undefined,
    latestChangelog: latestVer?.changelog as string | undefined,
    license: undefined,
    moderationVerdict: modInfo?.verdict as string | undefined,
    moderationSummary: modInfo?.summary as string | undefined,
  }

  detailCache.set(slug, { data: result, timestamp: Date.now() })
  return result
}

const HTML_PREFIX = '<!-- HTML -->'

export async function content(slug: string): Promise<string> {
  try {
    const raw = (await convexQuery('skills:getBySlug', { slug })) as Record<string, unknown> | null
    if (!raw) return ''
    const owner = raw.owner as Record<string, unknown> | undefined
    const ownerHandle = (raw.ownerHandle as string) ?? owner?.handle as string | undefined

    // Fetch rendered SKILL.md HTML from ClawHub page
    const pageSlug = ownerHandle ? `${ownerHandle}/${slug}` : slug
    const res = await networkProvider.fetch(`https://clawhub.ai/${pageSlug}`, { timeout: 10000 })
    if (!res.ok) return ''

    const html = await res.text()
    const match = html.match(/<h1>([\s\S]*?)<\/div>\s*<div[^>]*class/)
    if (match) {
      const extracted = `<h1>${match[1]}`
      if (extracted.length > 100) {
        return HTML_PREFIX + extracted
      }
    }

    return ''
  } catch {
    return ''
  }
}

const CONVEX_SITE_URL = 'https://wry-manatee-359.convex.site'

export async function downloadAndExtract(slug: string): Promise<string> {
  const url = `${CONVEX_SITE_URL}/api/v1/download?slug=${encodeURIComponent(slug)}`
  const tmpDir = path.join(os.tmpdir(), 'skillpilot-clawhub', slug)

  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
  fs.mkdirSync(tmpDir, { recursive: true })

  const zipPath = path.join(tmpDir, 'download.zip')
  await execPromise('curl', ['-fsSL', '-o', zipPath, url])
  await execPromise('unzip', ['-o', zipPath, '-d', tmpDir])

  const entries = fs.readdirSync(tmpDir).filter(e => e !== 'download.zip' && e !== '__MACOSX')
  const skillDir = entries.length === 1 && fs.statSync(path.join(tmpDir, entries[0])).isDirectory()
    ? path.join(tmpDir, entries[0])
    : tmpDir

  return skillDir
}

function mapConvexItem(item: Record<string, unknown>): ClawHubSkill {
  const skill = (item.skill ?? item) as Record<string, unknown>
  const ownerHandle = item.ownerHandle as string | undefined
  return mapSkillObj(skill, ownerHandle)
}

function mapSkillObj(skill: Record<string, unknown>, ownerHandle?: string): ClawHubSkill {
  const stats = (skill.stats ?? {}) as Record<string, number>
  const owner = skill.ownerPublisherId as string | undefined
  return {
    slug: String(skill.slug ?? ''),
    displayName: String(skill.displayName ?? skill.slug ?? ''),
    summary: String(skill.summary ?? ''),
    latestVersion: undefined,
    downloads: stats.downloads ?? 0,
    stars: stats.stars ?? 0,
    versionCount: stats.versions,
    ownerHandle: ownerHandle ?? owner,
    ownerDisplayName: ownerHandle,
    updatedAt: skill.updatedAt != null ? new Date(Number(skill.updatedAt)).toISOString() : undefined,
    source: 'clawhub',
  }
}
