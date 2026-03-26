import { describe, it, expect } from 'vitest'
import { parse, serialize } from '../../electron/services/skill-md-parser'

describe('SkillMDParser', () => {
  it('parses standard SKILL.md with frontmatter', () => {
    const content = `---
name: test-skill
description: A test skill
license: MIT
metadata:
  author: Test Author
  version: "1.0.0"
allowed-tools: Bash(npm *)
---

# Test Skill

This is a test skill.`

    const result = parse(content)
    expect(result.metadata.name).toBe('test-skill')
    expect(result.metadata.description).toBe('A test skill')
    expect(result.metadata.license).toBe('MIT')
    expect(result.metadata.author).toBe('Test Author')
    expect(result.metadata.version).toBe('1.0.0')
    expect(result.metadata.allowedTools).toBe('Bash(npm *)')
    expect(result.markdownBody).toContain('# Test Skill')
  })

  it('parses SKILL.md without frontmatter (fallback to markdown)', () => {
    const content = `# My Skill

This is a skill without frontmatter.`

    const result = parse(content)
    expect(result.metadata.name).toBe('My Skill')
    expect(result.metadata.description).toBe('This is a skill without frontmatter.')
    expect(result.markdownBody).toBe(content)
  })

  it('handles empty content', () => {
    const result = parse('')
    expect(result.metadata.name).toBe('')
    expect(result.metadata.description).toBe('')
    expect(result.markdownBody).toBe('')
  })

  it('handles frontmatter with missing optional fields', () => {
    const content = `---
name: minimal-skill
description: Minimal
---

Content here.`

    const result = parse(content)
    expect(result.metadata.name).toBe('minimal-skill')
    expect(result.metadata.description).toBe('Minimal')
    expect(result.metadata.license).toBeUndefined()
    expect(result.metadata.author).toBeUndefined()
    expect(result.metadata.version).toBeUndefined()
    expect(result.metadata.allowedTools).toBeUndefined()
  })

  it('handles malformed YAML gracefully', () => {
    const content = `---
name: [invalid yaml
---

Body text.`

    const result = parse(content)
    // Should fall back to markdown extraction
    expect(result.markdownBody).toBeDefined()
  })

  it('serializes metadata and markdown body', () => {
    const metadata = {
      name: 'test',
      description: 'A test',
      license: 'MIT',
      author: 'Author',
      version: '1.0.0',
      allowedTools: 'Bash(*)',
    }
    const body = '# Content\n\nSome text.'

    const result = serialize(metadata, body)
    expect(result).toContain('---')
    expect(result).toContain('name: test')
    expect(result).toContain('description: A test')
    expect(result).toContain('license: MIT')
    expect(result).toContain('allowed-tools: Bash(*)')
    expect(result).toContain('author: Author')
    expect(result).toContain('version: 1.0.0')
    expect(result).toContain('# Content')
  })

  it('roundtrips parse → serialize → parse', () => {
    const original = `---
name: roundtrip
description: Roundtrip test
metadata:
  author: Me
  version: "2.0.0"
---

# Hello World`

    const parsed = parse(original)
    const serialized = serialize(parsed.metadata, parsed.markdownBody)
    const reparsed = parse(serialized)

    expect(reparsed.metadata.name).toBe('roundtrip')
    expect(reparsed.metadata.description).toBe('Roundtrip test')
    expect(reparsed.metadata.author).toBe('Me')
    expect(reparsed.metadata.version).toBe('2.0.0')
    expect(reparsed.markdownBody).toContain('# Hello World')
  })
})
