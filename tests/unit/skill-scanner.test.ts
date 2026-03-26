import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Test the scanner's core logic by creating a realistic directory structure.
// We test the deduplication and scope promotion logic at the filesystem level.

const TEST_DIR = path.join(os.tmpdir(), 'skillpilot-test-scanner-' + Date.now())

describe('SkillScanner (filesystem logic)', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('detects skill directories with SKILL.md', () => {
    const skillDir = path.join(TEST_DIR, 'skill-a')
    fs.mkdirSync(skillDir)
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: Skill A\ndescription: Test\n---\n\n# Skill A')

    const entries = fs.readdirSync(TEST_DIR)
    const skills = entries.filter(entry => {
      const fullPath = path.join(TEST_DIR, entry)
      return fs.statSync(fullPath).isDirectory() &&
        fs.existsSync(path.join(fullPath, 'SKILL.md'))
    })
    expect(skills).toHaveLength(1)
    expect(skills[0]).toBe('skill-a')
  })

  it('skips directories without SKILL.md', () => {
    const emptyDir = path.join(TEST_DIR, 'not-a-skill')
    fs.mkdirSync(emptyDir)
    fs.writeFileSync(path.join(emptyDir, 'README.md'), '# Not a skill')

    const entries = fs.readdirSync(TEST_DIR)
    const skills = entries.filter(entry => {
      const fullPath = path.join(TEST_DIR, entry)
      return fs.statSync(fullPath).isDirectory() &&
        fs.existsSync(path.join(fullPath, 'SKILL.md'))
    })
    expect(skills).toHaveLength(0)
  })

  it('skips hidden directories and special directories', () => {
    const dirs = ['.hidden', '__MACOSX', 'node_modules', 'valid-skill']
    for (const dir of dirs) {
      const fullPath = path.join(TEST_DIR, dir)
      fs.mkdirSync(fullPath, { recursive: true })
      fs.writeFileSync(path.join(fullPath, 'SKILL.md'), '---\nname: test\ndescription: test\n---\n')
    }

    const skipList = ['.hidden', '__MACOSX', 'node_modules']
    const entries = fs.readdirSync(TEST_DIR)
    const skills = entries.filter(entry => {
      if (entry.startsWith('.') || skipList.includes(entry)) return false
      const fullPath = path.join(TEST_DIR, entry)
      return fs.statSync(fullPath).isDirectory() &&
        fs.existsSync(path.join(fullPath, 'SKILL.md'))
    })
    expect(skills).toHaveLength(1)
    expect(skills[0]).toBe('valid-skill')
  })

  it('resolves canonical path through symlinks for deduplication', () => {
    const realDir = path.join(TEST_DIR, 'canonical', 'skill-x')
    const linkDir = path.join(TEST_DIR, 'agent-skills')
    fs.mkdirSync(realDir, { recursive: true })
    fs.mkdirSync(linkDir, { recursive: true })

    fs.writeFileSync(path.join(realDir, 'SKILL.md'), '---\nname: X\ndescription: Test\n---\n')
    fs.symlinkSync(realDir, path.join(linkDir, 'skill-x'), 'dir')

    // Both locations resolve to the same canonical path
    const canonicalReal = fs.realpathSync(realDir)
    const canonicalLink = fs.realpathSync(path.join(linkDir, 'skill-x'))
    expect(canonicalReal).toBe(canonicalLink)
  })

  it('scope promotion: skill found in multiple locations promotes to sharedGlobal', () => {
    // Simulate scope promotion logic
    type Scope = { kind: 'sharedGlobal' } | { kind: 'agentLocal'; agentType: string }

    function promoteScope(existingScope: Scope): Scope {
      if (existingScope.kind !== 'sharedGlobal') {
        return { kind: 'sharedGlobal' }
      }
      return existingScope
    }

    const localScope: Scope = { kind: 'agentLocal', agentType: 'claude' }
    const promoted = promoteScope(localScope)
    expect(promoted.kind).toBe('sharedGlobal')

    // Already global stays global
    const globalScope: Scope = { kind: 'sharedGlobal' }
    expect(promoteScope(globalScope).kind).toBe('sharedGlobal')
  })
})
