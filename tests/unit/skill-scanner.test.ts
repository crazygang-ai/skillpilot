import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

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

    const canonicalReal = fs.realpathSync(realDir)
    const canonicalLink = fs.realpathSync(path.join(linkDir, 'skill-x'))
    expect(canonicalReal).toBe(canonicalLink)
  })
})

describe('SkillScanner (production scanAll)', () => {
  beforeEach(() => {
    vi.resetModules()
    fs.mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
  })

  function mockScannerDeps(dirs: {
    shared: string
    agents: Array<{ type: string; skillsDir: string; readable: Array<{ sourceKind: string; agentType?: string; path: string }> }>
  }) {
    vi.doMock('../../electron/utils/constants', () => ({
      SHARED_SKILLS_DIR: dirs.shared,
    }))
    vi.doMock('../../electron/types/agent-config', () => ({
      AGENT_CONFIGS: dirs.agents.map(a => ({
        type: a.type,
        skillsDirectoryPath: a.skillsDir,
        additionalReadableSkillsDirectories: a.readable,
      })),
    }))
    vi.doMock('../../electron/services/lock-file-manager', () => ({
      read: () => ({ version: 3, skills: {} }),
    }))
    vi.doMock('../../electron/services/symlink-manager', () => ({
      resolveCanonical: (p: string) => {
        try { return fs.realpathSync(p) } catch { return p }
      },
      findInstallations: (skillId: string, canonicalPath: string) => {
        const installations: Array<Record<string, unknown>> = []
        for (const agent of dirs.agents) {
          const skillPath = path.join(agent.skillsDir, skillId)
          if (!fs.existsSync(skillPath)) continue
          try {
            if (fs.realpathSync(skillPath) !== canonicalPath) continue
          } catch { continue }
          const isLink = fs.lstatSync(skillPath).isSymbolicLink()
          installations.push({
            agentType: agent.type,
            path: skillPath,
            isSymlink: isLink,
            isInherited: isLink,
          })
        }
        return installations
      },
    }))
    vi.doMock('../../electron/services/skill-md-parser', () => ({
      parseFile: () => ({
        metadata: { name: 'Test Skill', description: 'test' },
        markdownBody: '',
      }),
    }))
    vi.doMock('../../electron/services/skill-identity', () => ({
      resolveStableSkillId: (canonicalPath: string) => path.basename(canonicalPath),
      resolveDirectoryName: (storageName: string) => storageName,
    }))
  }

  it('agent-local skill inherited by another agent retains agentLocal scope', async () => {
    const sharedDir = path.join(TEST_DIR, 'shared', 'skills')
    const claudeDir = path.join(TEST_DIR, 'claude', 'skills')
    const cursorDir = path.join(TEST_DIR, 'cursor', 'skills')

    const skillDir = path.join(claudeDir, 'my-skill')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: My Skill\ndescription: test\n---\n')

    fs.mkdirSync(cursorDir, { recursive: true })
    fs.symlinkSync(skillDir, path.join(cursorDir, 'my-skill'), 'dir')

    mockScannerDeps({
      shared: sharedDir,
      agents: [
        { type: 'claude', skillsDir: claudeDir, readable: [] },
        { type: 'cursor', skillsDir: cursorDir, readable: [
          { sourceKind: 'agent', agentType: 'claude', path: claudeDir },
        ] },
      ],
    })

    const { scanAll } = await import('../../electron/services/skill-scanner')
    const skills = await scanAll()

    expect(skills).toHaveLength(1)
    expect(skills[0].scope).toEqual({ kind: 'agentLocal', agentType: 'claude' })
    expect(skills[0].installations.length).toBeGreaterThanOrEqual(2)
  })

  it('skill stored in shared directory gets sharedGlobal scope regardless of installation count', async () => {
    const sharedDir = path.join(TEST_DIR, 'shared', 'skills')
    const claudeDir = path.join(TEST_DIR, 'claude', 'skills')

    const skillDir = path.join(sharedDir, 'global-skill')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: Global\ndescription: test\n---\n')

    mockScannerDeps({
      shared: sharedDir,
      agents: [
        { type: 'claude', skillsDir: claudeDir, readable: [] },
      ],
    })

    const { scanAll } = await import('../../electron/services/skill-scanner')
    const skills = await scanAll()

    expect(skills).toHaveLength(1)
    expect(skills[0].scope).toEqual({ kind: 'sharedGlobal' })
  })
})
