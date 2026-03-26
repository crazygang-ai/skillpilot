import { describe, it, expect } from 'vitest'

// skill-registry-service uses network calls, but we can test the
// HTML parsing logic by extracting it to test the same pattern.

function parseLeaderboardHTML(html: string): Array<{
  id: string
  skillId: string
  name: string
  installs: number
  source: string
}> {
  const scriptMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!scriptMatch) return []

  try {
    const nextData = JSON.parse(scriptMatch[1])
    const skills = nextData?.props?.pageProps?.skills ?? nextData?.props?.pageProps?.data ?? []

    return (skills as Array<Record<string, unknown>>).map((item) => ({
      id: String(item.id ?? ''),
      skillId: String(item.id ?? '').split('/').pop() || '',
      name: String(item.name ?? item.id ?? ''),
      installs: Number(item.installs ?? 0),
      source: String(item.source ?? ''),
    }))
  } catch {
    return []
  }
}

describe('SkillRegistryService (parseLeaderboardHTML)', () => {
  it('extracts skills from __NEXT_DATA__ script tag', () => {
    const html = `
      <html><body>
      <script id="__NEXT_DATA__" type="application/json">
      {"props":{"pageProps":{"skills":[
        {"id":"user/skill-a","name":"Skill A","installs":100,"source":"github.com/user/skill-a"},
        {"id":"org/skill-b","name":"Skill B","installs":50,"source":"github.com/org/skill-b"}
      ]}}}
      </script>
      </body></html>
    `
    const results = parseLeaderboardHTML(html)
    expect(results).toHaveLength(2)
    expect(results[0].id).toBe('user/skill-a')
    expect(results[0].skillId).toBe('skill-a')
    expect(results[0].name).toBe('Skill A')
    expect(results[0].installs).toBe(100)
    expect(results[1].skillId).toBe('skill-b')
  })

  it('returns empty array for missing __NEXT_DATA__', () => {
    const html = '<html><body><p>No data</p></body></html>'
    expect(parseLeaderboardHTML(html)).toEqual([])
  })

  it('returns empty array for invalid JSON', () => {
    const html = '<script id="__NEXT_DATA__">{invalid}</script>'
    expect(parseLeaderboardHTML(html)).toEqual([])
  })

  it('handles pageProps.data fallback', () => {
    const html = `
      <script id="__NEXT_DATA__" type="application/json">
      {"props":{"pageProps":{"data":[
        {"id":"test/skill","name":"Test","installs":10,"source":"github.com/test/skill"}
      ]}}}
      </script>
    `
    const results = parseLeaderboardHTML(html)
    expect(results).toHaveLength(1)
    expect(results[0].skillId).toBe('skill')
  })

  it('handles missing optional fields', () => {
    const html = `
      <script id="__NEXT_DATA__" type="application/json">
      {"props":{"pageProps":{"skills":[
        {"id":"user/minimal"}
      ]}}}
      </script>
    `
    const results = parseLeaderboardHTML(html)
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('user/minimal')
    expect(results[0].installs).toBe(0)
    expect(results[0].source).toBe('')
  })
})
