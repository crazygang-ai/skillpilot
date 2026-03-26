import { describe, it, expect } from 'vitest'
import { normalizeRepoURL, extractOwnerRepo, githubWebURL, scanSkillsInRepo } from '../../electron/services/git-service'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('GitService', () => {
  describe('normalizeRepoURL', () => {
    it('converts owner/repo to full URL', () => {
      expect(normalizeRepoURL('user/repo')).toBe('https://github.com/user/repo.git')
    })

    it('adds .git suffix to HTTPS URL', () => {
      expect(normalizeRepoURL('https://github.com/user/repo')).toBe('https://github.com/user/repo.git')
    })

    it('keeps existing .git suffix', () => {
      expect(normalizeRepoURL('https://github.com/user/repo.git')).toBe('https://github.com/user/repo.git')
    })

    it('trims whitespace', () => {
      expect(normalizeRepoURL('  user/repo  ')).toBe('https://github.com/user/repo.git')
    })

    it('handles trailing slash', () => {
      expect(normalizeRepoURL('https://github.com/user/repo/')).toBe('https://github.com/user/repo.git')
    })
  })

  describe('extractOwnerRepo', () => {
    it('extracts from HTTPS URL', () => {
      expect(extractOwnerRepo('https://github.com/user/repo.git')).toBe('user/repo')
    })

    it('extracts from SSH URL', () => {
      expect(extractOwnerRepo('git@github.com:user/repo.git')).toBe('user/repo')
    })

    it('handles URL without .git', () => {
      expect(extractOwnerRepo('https://github.com/user/repo')).toBe('user/repo')
    })
  })

  describe('githubWebURL', () => {
    it('converts git URL to web URL', () => {
      expect(githubWebURL('https://github.com/user/repo.git')).toBe('https://github.com/user/repo')
    })

    it('converts SSH to HTTPS', () => {
      expect(githubWebURL('git@github.com:user/repo.git')).toBe('https://github.com/user/repo')
    })
  })

  describe('scanSkillsInRepo', () => {
    it('finds SKILL.md files in directory structure', () => {
      const tmpDir = path.join(os.tmpdir(), 'skillpilot-test-scan-' + Date.now())
      try {
        // Create test structure
        const skill1Dir = path.join(tmpDir, 'skill-a')
        const skill2Dir = path.join(tmpDir, 'skills', 'skill-b')
        fs.mkdirSync(skill1Dir, { recursive: true })
        fs.mkdirSync(skill2Dir, { recursive: true })
        fs.writeFileSync(path.join(skill1Dir, 'SKILL.md'), '# A')
        fs.writeFileSync(path.join(skill2Dir, 'SKILL.md'), '# B')

        const results = scanSkillsInRepo(tmpDir)
        expect(results).toHaveLength(2)
        expect(results.some(r => r.includes('skill-a'))).toBe(true)
        expect(results.some(r => r.includes('skill-b'))).toBe(true)
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      }
    })

    it('skips hidden directories and node_modules', () => {
      const tmpDir = path.join(os.tmpdir(), 'skillpilot-test-skip-' + Date.now())
      try {
        const hiddenDir = path.join(tmpDir, '.hidden', 'skill')
        const nmDir = path.join(tmpDir, 'node_modules', 'skill')
        fs.mkdirSync(hiddenDir, { recursive: true })
        fs.mkdirSync(nmDir, { recursive: true })
        fs.writeFileSync(path.join(hiddenDir, 'SKILL.md'), '# Hidden')
        fs.writeFileSync(path.join(nmDir, 'SKILL.md'), '# NM')

        const results = scanSkillsInRepo(tmpDir)
        expect(results).toHaveLength(0)
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      }
    })

    it('does not recurse into skill directories', () => {
      const tmpDir = path.join(os.tmpdir(), 'skillpilot-test-norecurse-' + Date.now())
      try {
        const skillDir = path.join(tmpDir, 'my-skill')
        const nestedDir = path.join(skillDir, 'sub', 'nested')
        fs.mkdirSync(nestedDir, { recursive: true })
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Top')
        fs.writeFileSync(path.join(nestedDir, 'SKILL.md'), '# Nested')

        const results = scanSkillsInRepo(tmpDir)
        expect(results).toHaveLength(1) // Only top-level skill
        expect(results[0]).toBe(skillDir)
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      }
    })
  })
})
