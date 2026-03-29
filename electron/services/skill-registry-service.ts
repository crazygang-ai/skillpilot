import log from 'electron-log'
import { RegistrySkill, LeaderboardCategory, LeaderboardResult } from '../../shared/types'
import * as networkProvider from './network-session-provider'
import { SKILLS_SH_BASE, REGISTRY_CACHE_TTL_MS } from '../utils/constants'

interface CacheEntry {
  data: LeaderboardResult
  timestamp: number
}

const leaderboardCache = new Map<string, CacheEntry>()

export async function search(query: string, limit = 50): Promise<RegistrySkill[]> {
  const url = `${SKILLS_SH_BASE}/api/search?q=${encodeURIComponent(query)}&limit=${limit}`
  const res = await networkProvider.fetch(url)
  if (!res.ok) throw new Error(`Registry search failed: ${res.status}`)

  const data = (await res.json()) as {
    skills?: Array<{
      id: string
      skillId?: string
      name: string
      installs: number
      source: string
      installs_yesterday?: number
      change?: number
    }>
  }

  return (data.skills ?? []).map((item) => ({
    id: item.id,
    skillId: item.skillId || item.id.split('/').pop() || item.id,
    name: item.name || item.id.split('/').pop() || '',
    installs: item.installs,
    source: item.source,
    installsYesterday: item.installs_yesterday,
    change: item.change,
  }))
}

export async function leaderboard(category: LeaderboardCategory): Promise<LeaderboardResult> {
  const cached = leaderboardCache.get(category)
  if (cached && Date.now() - cached.timestamp < REGISTRY_CACHE_TTL_MS) {
    return cached.data
  }

  const pathMap: Record<LeaderboardCategory, string> = {
    allTime: '',
    trending: '/trending',
    hot: '/hot',
  }

  const url = `${SKILLS_SH_BASE}${pathMap[category]}`
  const res = await networkProvider.fetch(url, {
    headers: { Accept: 'text/html' },
  })
  if (!res.ok) throw new Error(`Registry leaderboard failed: ${res.status}`)

  const html = await res.text()
  const result = parseLeaderboardHTML(html)

  leaderboardCache.set(category, { data: result, timestamp: Date.now() })
  return result
}

export function parseLeaderboardHTML(html: string): LeaderboardResult {
  const marker = '\\"initialSkills\\":'
  const idx = html.indexOf(marker)
  if (idx === -1) return { skills: [], totalCount: 0 }

  try {
    const start = idx + marker.length
    const rawChunk = extractDoubleEscapedArray(html, start)
    if (!rawChunk) {
      log.warn('Could not extract initialSkills array from RSC payload')
      return { skills: [], totalCount: 0 }
    }

    const decoded = decodeDoubleEscapedJson(rawChunk)
    const rawSkills = JSON.parse(decoded) as Array<Record<string, unknown>>

    const totalMatch = html.match(/\\"totalSkills\\":(\d+)/)
    const totalCount = totalMatch ? Number(totalMatch[1]) : rawSkills.length

    const skills = rawSkills.map((item) => ({
      id: String(item.id ?? `${item.source}/${item.skillId}`),
      skillId: String(item.skillId ?? ''),
      name: String(item.name ?? item.skillId ?? ''),
      installs: Number(item.installs ?? 0),
      source: String(item.source ?? ''),
      installsYesterday: item.installs_yesterday != null ? Number(item.installs_yesterday) : undefined,
      change: item.change != null ? Number(item.change) : undefined,
    }))

    return { skills, totalCount }
  } catch (err) {
    log.warn('Failed to parse leaderboard RSC payload:', err)
    return { skills: [], totalCount: 0 }
  }
}

/**
 * Single-pass state machine that extracts a JSON array from a payload where
 * the content is a JSON-stringified string body (the inside of a
 * JSON.stringify'd value — "Model B" / full JSON string escaping).
 *
 * Only two 2-char escape sequences matter at the payload level:
 *   \\   → literal backslash (skip both chars)
 *   \"   → literal quote = inner-JSON string delimiter
 *
 * No `escaped` state is needed — `\\` is always consumed as an atomic pair,
 * so `\\\"` is correctly split as `\\` + `\"` (escaped-backslash then
 * string-terminator), never mis-read as `\` + `\"` (escape-prefix then
 * escaped-quote).
 */
function extractDoubleEscapedArray(html: string, start: number): string | null {
  if (html[start] !== '[') {
    log.warn(`Expected '[' at RSC payload offset ${start}, got '${html[start]}'`)
    return null
  }

  let depth = 0
  let inString = false
  let i = start

  while (i < html.length) {
    if (inString) {
      if (html[i] === '\\' && html[i + 1] === '\\') {
        i += 2
      } else if (html[i] === '\\' && html[i + 1] === '"') {
        inString = false
        i += 2
      } else {
        i += 1
      }
    } else {
      if (html[i] === '\\' && html[i + 1] === '"') {
        inString = true
        i += 2
      } else if (html[i] === '[') {
        depth++
        i += 1
      } else if (html[i] === ']') {
        depth--
        if (depth === 0) return html.slice(start, i + 1)
        i += 1
      } else {
        i += 1
      }
    }
  }

  return null
}

function decodeDoubleEscapedJson(rawChunk: string): string {
  return JSON.parse(`"${rawChunk}"`) as string
}
