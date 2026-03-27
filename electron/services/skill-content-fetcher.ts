import * as networkProvider from './network-session-provider'
import { GITHUB_RAW_BASE, GITHUB_API_BASE, SKILLS_SH_BASE, CONTENT_CACHE_TTL_MS } from '../utils/constants'

interface CacheEntry {
  content: string
  timestamp: number
}

const cache = new Map<string, CacheEntry>()

const HTML_PREFIX = '<!-- HTML -->'

/**
 * Fetch SKILL.md content. Strategy:
 * 1. GitHub raw URLs (8 candidates in parallel)
 * 2. skills.sh RSC payload (rendered HTML, always available for registry skills)
 * 3. GitHub Tree API discovery (fallback, may hit rate limits)
 */
export async function fetchContent(source: string, skillId: string): Promise<string> {
  const cacheKey = `${source}/${skillId}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CONTENT_CACHE_TTL_MS) {
    return cached.content
  }

  // Strategy 1: GitHub raw URLs in parallel
  const candidates = buildCandidateURLs(source, skillId)

  try {
    const content = await Promise.any(
      candidates.map(async (url) => {
        const res = await networkProvider.fetch(url, { timeout: 8000 })
        if (!res.ok) throw new Error(`${res.status}`)
        return res.text()
      })
    )
    cache.set(cacheKey, { content, timestamp: Date.now() })
    return content
  } catch {
    // All candidates failed
  }

  // Strategy 2: skills.sh RSC payload (HTML)
  const htmlContent = await fetchFromSkillsSh(source, skillId)
  if (htmlContent) {
    const content = HTML_PREFIX + htmlContent
    cache.set(cacheKey, { content, timestamp: Date.now() })
    return content
  }

  // Strategy 3: GitHub Tree API discovery
  const treeContent = await discoverViaTreeAPI(source, skillId)
  if (treeContent) {
    cache.set(cacheKey, { content: treeContent, timestamp: Date.now() })
    return treeContent
  }

  return ''
}

/**
 * Extract SKILL.md rendered HTML from skills.sh RSC flight payload.
 * The payload contains text chunks in format: `{ref}:T{hexSize},{html}`
 */
async function fetchFromSkillsSh(source: string, skillId: string): Promise<string | null> {
  try {
    const url = `${SKILLS_SH_BASE}/${source}/${skillId}`
    const res = await networkProvider.fetch(url, {
      headers: {
        Accept: 'text/x-component',
        RSC: '1',
        'Next-Router-State-Tree': '%5B%22%22%5D',
      },
      timeout: 10000,
    })
    if (!res.ok) return null

    const payload = await res.text()

    // Find the largest T (text) chunk — it's the SKILL.md HTML content
    const chunkRegex = /^\w+:T([0-9a-f]+),/gm
    let bestOffset = -1
    let bestSize = 0

    let match: RegExpExecArray | null
    while ((match = chunkRegex.exec(payload)) !== null) {
      const size = parseInt(match[1], 16)
      if (size > bestSize) {
        bestSize = size
        bestOffset = match.index + match[0].length
      }
    }

    if (bestOffset === -1 || bestSize < 50) return null

    const html = payload.slice(bestOffset, bestOffset + bestSize)
    if (!html.includes('<')) return null

    return html
  } catch {
    return null
  }
}

async function discoverViaTreeAPI(source: string, skillId: string): Promise<string | null> {
  for (const branch of ['main', 'master']) {
    try {
      const url = `${GITHUB_API_BASE}/repos/${source}/git/trees/${branch}?recursive=1`
      const res = await networkProvider.fetch(url, {
        headers: { Accept: 'application/vnd.github.v3+json' },
        timeout: 15000,
      })
      if (!res.ok) continue

      const data = (await res.json()) as { tree?: Array<{ path: string; type: string }> }
      const tree = data.tree ?? []

      // Find SKILL.md that matches the skillId
      const match = tree.find(
        (node) =>
          node.type === 'blob' &&
          node.path.endsWith('SKILL.md') &&
          node.path.includes(skillId),
      )

      if (match) {
        const contentUrl = `${GITHUB_RAW_BASE}/${source}/${branch}/${match.path}`
        const contentRes = await networkProvider.fetch(contentUrl, { timeout: 10000 })
        if (contentRes.ok) {
          return await contentRes.text()
        }
      }
    } catch {
      continue
    }
  }

  return null
}

export function buildCandidateURLs(source: string, skillId: string): string[] {
  const branches = ['main', 'master']
  const layouts = [
    `${skillId}/SKILL.md`,
    `skills/${skillId}/SKILL.md`,
    `.claude/skills/${skillId}/SKILL.md`,
    'SKILL.md',
  ]
  return branches.flatMap(branch =>
    layouts.map(layout => `${GITHUB_RAW_BASE}/${source}/${branch}/${layout}`)
  )
}

export function invalidateCache(source?: string, skillId?: string): void {
  if (source && skillId) {
    cache.delete(`${source}/${skillId}`)
  } else {
    cache.clear()
  }
}
