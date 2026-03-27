import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

const TEST_DIR = path.join(os.tmpdir(), 'skillpilot-test-cache-' + Date.now())
const TEST_CACHE_PATH = path.join(TEST_DIR, '.skillpilot-cache.json')

// Mock the constants module to use temp path
vi.mock('../../electron/utils/constants', () => ({
  CACHE_FILE_PATH: path.join(os.tmpdir(), 'skillpilot-test-cache-' + Date.now(), '.skillpilot-cache.json'),
}))

describe('CommitHashCache', () => {
  beforeEach(async () => {
    fs.mkdirSync(TEST_DIR, { recursive: true })

    // Update the mock to point to current TEST_DIR
    const constants = await import('../../electron/utils/constants')
    ;(constants as any).CACHE_FILE_PATH = TEST_CACHE_PATH

    // Reset module cache so commit-hash-cache re-reads the constants
    vi.resetModules()
  })

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('returns undefined for missing skill hash', async () => {
    const mod = await import('../../electron/services/commit-hash-cache')
    mod.invalidateCache()
    expect(await mod.getCommitHash('nonexistent')).toBeUndefined()
  })

  it('sets and gets commit hash', async () => {
    const mod = await import('../../electron/services/commit-hash-cache')
    mod.invalidateCache()
    await mod.setCommitHash('test-skill', 'abc123')
    expect(await mod.getCommitHash('test-skill')).toBe('abc123')
  })

  it('removes commit hash', async () => {
    const mod = await import('../../electron/services/commit-hash-cache')
    mod.invalidateCache()
    await mod.setCommitHash('test-skill', 'abc123')
    await mod.removeCommitHash('test-skill')
    expect(await mod.getCommitHash('test-skill')).toBeUndefined()
  })

  it('sets and gets repo history', async () => {
    const mod = await import('../../electron/services/commit-hash-cache')
    mod.invalidateCache()
    await mod.setRepoHistory('https://github.com/user/repo.git', 'def456')
    expect(await mod.getRepoHistory('https://github.com/user/repo.git')).toBe('def456')
  })

  it('invalidateCache forces re-read from disk', async () => {
    const mod = await import('../../electron/services/commit-hash-cache')
    mod.invalidateCache()
    await mod.setCommitHash('skill-a', 'hash1')

    // Invalidate and ensure it still reads from file
    mod.invalidateCache()
    expect(await mod.getCommitHash('skill-a')).toBe('hash1')
  })
})
