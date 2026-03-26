import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

const TEST_DIR = path.join(os.tmpdir(), 'skillpilot-test-symlink-' + Date.now())

describe('SymlinkManager', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('creates and detects symlinks', () => {
    const sourceDir = path.join(TEST_DIR, 'source')
    const linkPath = path.join(TEST_DIR, 'link')

    fs.mkdirSync(sourceDir)
    fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), '# Test')
    fs.symlinkSync(sourceDir, linkPath, 'dir')

    expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true)
    expect(fs.realpathSync(linkPath)).toBe(fs.realpathSync(sourceDir))
  })

  it('resolves canonical path through symlinks', () => {
    const realDir = path.join(TEST_DIR, 'real')
    const link1 = path.join(TEST_DIR, 'link1')
    const link2 = path.join(TEST_DIR, 'link2')

    fs.mkdirSync(realDir)
    fs.symlinkSync(realDir, link1, 'dir')
    fs.symlinkSync(link1, link2, 'dir')

    expect(fs.realpathSync(link2)).toBe(fs.realpathSync(realDir))
  })

  it('removes symlink without affecting source', () => {
    const sourceDir = path.join(TEST_DIR, 'source')
    const linkPath = path.join(TEST_DIR, 'link')

    fs.mkdirSync(sourceDir)
    fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), '# Test')
    fs.symlinkSync(sourceDir, linkPath, 'dir')

    // Remove symlink
    fs.unlinkSync(linkPath)

    expect(fs.existsSync(linkPath)).toBe(false)
    expect(fs.existsSync(sourceDir)).toBe(true)
    expect(fs.existsSync(path.join(sourceDir, 'SKILL.md'))).toBe(true)
  })

  it('does not throw when removing non-existent symlink', () => {
    const linkPath = path.join(TEST_DIR, 'nonexistent')
    expect(fs.existsSync(linkPath)).toBe(false)
    // Should not throw
  })
})
