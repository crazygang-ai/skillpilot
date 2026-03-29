import { describe, it, expect } from 'vitest'
import { parseLeaderboardHTML } from '../../electron/services/skill-registry-service'

describe('SkillRegistryService (parseLeaderboardHTML)', () => {
  it('extracts skills from RSC payload with brackets and escapes', () => {
    const payload = String.raw`\"initialSkills\":[{\"id\":\"org/skill-a\",\"skillId\":\"skill-a\",\"name\":\"Name [A] with \\\"quotes\\\" and \\\\backslash\",\"installs\":120,\"source\":\"org/repo\",\"installs_yesterday\":3,\"change\":-1},{\"id\":\"org/skill-b\",\"skillId\":\"skill-b\",\"name\":\"Line\\nBreak\",\"installs\":5,\"source\":\"org/repo\"}],\"totalSkills\":2`
    const html = `<html><body>${payload}</body></html>`
    const result = parseLeaderboardHTML(html)
    expect(result.skills).toHaveLength(2)
    expect(result.totalCount).toBe(2)
    expect(result.skills[0].skillId).toBe('skill-a')
    expect(result.skills[0].name).toBe('Name [A] with "quotes" and \\backslash')
    expect(result.skills[1].name).toBe('Line\nBreak')
  })

  it('returns empty skills when marker missing', () => {
    const html = '<html><body>No marker here</body></html>'
    const result = parseLeaderboardHTML(html)
    expect(result.skills).toEqual([])
    expect(result.totalCount).toBe(0)
  })
})
