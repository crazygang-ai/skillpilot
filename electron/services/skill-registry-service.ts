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

function parseLeaderboardHTML(html: string): LeaderboardResult {
  // skills.sh uses Next.js App Router with RSC flight payload
  // Data is double-escaped: \\"initialSkills\\":[...],\\"totalSkills\\":N
  const marker = '\\"initialSkills\\":'
  const idx = html.indexOf(marker)
  if (idx === -1) return { skills: [], totalCount: 0 }

  try {
    const start = idx + marker.length
    let depth = 0
    let end = start
    for (let i = start; i < html.length; i++) {
      if (html[i] === '[') depth++
      else if (html[i] === ']') {
        depth--
        if (depth === 0) { end = i + 1; break }
      }
    }

    const chunk = html.slice(start, end).replace(/\\"/g, '"')
    const rawSkills = JSON.parse(chunk) as Array<Record<string, unknown>>

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
  } catch {
    return { skills: [], totalCount: 0 }
  }
}
