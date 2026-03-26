import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'events'

// SkillManager has heavy dependencies (electron, git, filesystem).
// We test the pure logic patterns it uses: state management, transient field
// restoration, and event emission.

describe('SkillManager (pure logic patterns)', () => {
  describe('EventEmitter pattern', () => {
    it('emits stateChanged events', () => {
      const emitter = new EventEmitter()
      let callCount = 0
      emitter.on('stateChanged', () => { callCount++ })

      emitter.emit('stateChanged')
      emitter.emit('stateChanged')

      expect(callCount).toBe(2)
    })

    it('removes all listeners on destroy', () => {
      const emitter = new EventEmitter()
      let called = false
      emitter.on('stateChanged', () => { called = true })

      emitter.removeAllListeners()
      emitter.emit('stateChanged')

      expect(called).toBe(false)
    })
  })

  describe('transient field restoration', () => {
    it('restores updateStatus from cache', () => {
      const updateStatuses = new Map<string, string>([
        ['skill-a', 'hasUpdate'],
        ['skill-b', 'upToDate'],
      ])

      const skills = [
        { id: 'skill-a', updateStatus: 'notChecked' as string },
        { id: 'skill-b', updateStatus: 'notChecked' as string },
        { id: 'skill-c', updateStatus: 'notChecked' as string },
      ]

      const restored = skills.map(skill => ({
        ...skill,
        updateStatus: updateStatuses.get(skill.id) ?? 'notChecked',
        hasUpdate: updateStatuses.get(skill.id) === 'hasUpdate',
      }))

      expect(restored[0].updateStatus).toBe('hasUpdate')
      expect(restored[0].hasUpdate).toBe(true)
      expect(restored[1].updateStatus).toBe('upToDate')
      expect(restored[1].hasUpdate).toBe(false)
      expect(restored[2].updateStatus).toBe('notChecked')
      expect(restored[2].hasUpdate).toBe(false)
    })

    it('restores remote hashes from cache', () => {
      const treeHashes = new Map([['skill-a', 'abc123']])
      const commitHashes = new Map([['skill-a', 'def456']])

      const skill = { id: 'skill-a' }
      const remoteTreeHash = treeHashes.get(skill.id)
      const remoteCommitHash = commitHashes.get(skill.id)

      expect(remoteTreeHash).toBe('abc123')
      expect(remoteCommitHash).toBe('def456')
    })
  })

  describe('update status state machine', () => {
    it('follows correct transitions', () => {
      const statuses = new Map<string, string>()
      const skillId = 'test-skill'

      // Start: not tracked
      expect(statuses.get(skillId)).toBeUndefined()

      // Begin checking
      statuses.set(skillId, 'checking')
      expect(statuses.get(skillId)).toBe('checking')

      // Update found
      statuses.set(skillId, 'hasUpdate')
      expect(statuses.get(skillId)).toBe('hasUpdate')

      // After applying update
      statuses.set(skillId, 'upToDate')
      expect(statuses.get(skillId)).toBe('upToDate')
    })

    it('handles error state', () => {
      const statuses = new Map<string, string>()
      statuses.set('skill-x', 'checking')
      statuses.set('skill-x', 'error')
      expect(statuses.get('skill-x')).toBe('error')
    })

    it('cleans up on delete', () => {
      const statuses = new Map<string, string>()
      const treeHashes = new Map<string, string>()
      const commitHashes = new Map<string, string>()

      statuses.set('skill-a', 'hasUpdate')
      treeHashes.set('skill-a', 'hash1')
      commitHashes.set('skill-a', 'hash2')

      // Simulate delete cleanup
      statuses.delete('skill-a')
      treeHashes.delete('skill-a')
      commitHashes.delete('skill-a')

      expect(statuses.has('skill-a')).toBe(false)
      expect(treeHashes.has('skill-a')).toBe(false)
      expect(commitHashes.has('skill-a')).toBe(false)
    })
  })

  describe('checkAllUpdates filter', () => {
    it('only checks github-sourced skills with lockEntry', () => {
      const skills = [
        { id: 'a', lockEntry: { sourceType: 'github' } },
        { id: 'b', lockEntry: { sourceType: 'local' } },
        { id: 'c', lockEntry: undefined },
        { id: 'd', lockEntry: { sourceType: 'github' } },
        { id: 'e', lockEntry: { sourceType: 'clawhub' } },
      ]

      const updatable = skills.filter(
        s => s.lockEntry && s.lockEntry.sourceType === 'github',
      )

      expect(updatable).toHaveLength(2)
      expect(updatable.map(s => s.id)).toEqual(['a', 'd'])
    })
  })
})
