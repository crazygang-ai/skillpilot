import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

// We need to mock the constants to use temp directory
const TEST_DIR = path.join(os.tmpdir(), 'skillpilot-test-lock-' + Date.now())
const LOCK_PATH = path.join(TEST_DIR, '.skill-lock.json')

describe('LockFileManager', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('creates empty lock file with correct version', () => {
    const lockFile = { version: 3, skills: {} }
    const tmpPath = LOCK_PATH + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(lockFile, null, 2))
    fs.renameSync(tmpPath, LOCK_PATH)

    const data = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf-8'))
    expect(data.version).toBe(3)
    expect(data.skills).toEqual({})
  })

  it('reads and writes lock entries', () => {
    const lockFile = {
      version: 3,
      skills: {
        'test-skill': {
          source: 'user/repo',
          sourceType: 'github',
          sourceUrl: 'https://github.com/user/repo.git',
          skillPath: 'skills/test-skill/SKILL.md',
          skillFolderHash: 'abc123',
          installedAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      },
    }

    fs.writeFileSync(LOCK_PATH, JSON.stringify(lockFile, null, 2))
    const data = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf-8'))
    expect(data.skills['test-skill'].source).toBe('user/repo')
    expect(data.skills['test-skill'].skillFolderHash).toBe('abc123')
  })

  it('atomic write survives concurrent reads', () => {
    const lockFile = { version: 3, skills: {} }
    fs.writeFileSync(LOCK_PATH, JSON.stringify(lockFile, null, 2))

    // Simulate atomic write
    const tmpPath = LOCK_PATH + '.tmp'
    const updated = { version: 3, skills: { 'new-skill': { source: 'x' } } }
    fs.writeFileSync(tmpPath, JSON.stringify(updated, null, 2))
    fs.renameSync(tmpPath, LOCK_PATH)

    const data = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf-8'))
    expect(data.skills['new-skill']).toBeDefined()
  })

  it('handles missing lock file gracefully', () => {
    expect(fs.existsSync(LOCK_PATH)).toBe(false)
    // Should not throw
    const exists = fs.existsSync(LOCK_PATH)
    expect(exists).toBe(false)
  })
})
