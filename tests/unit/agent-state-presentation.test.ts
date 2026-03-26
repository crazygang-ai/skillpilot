import { describe, it, expect } from 'vitest'
import { getAgentStatePresentation } from '../../src/components/skill/agent-state-presentation'

describe('getAgentStatePresentation', () => {
  it('returns assign action for no state', () => {
    const result = getAgentStatePresentation(undefined)
    expect(result.actionLabel).toBe('Assign')
    expect(result.canAct).toBe(true)
  })

  it('returns unassign for linked state', () => {
    const result = getAgentStatePresentation('linked')
    expect(result.label).toBe('Linked')
    expect(result.actionLabel).toBe('Unassign')
    expect(result.canAct).toBe(true)
  })

  it('returns remove for installed state', () => {
    const result = getAgentStatePresentation('installed')
    expect(result.label).toBe('Installed')
    expect(result.actionLabel).toBe('Remove Local')
    expect(result.canAct).toBe(true)
  })

  it('returns no action for builtin state', () => {
    const result = getAgentStatePresentation('builtin')
    expect(result.label).toBe('Builtin')
    expect(result.canAct).toBe(false)
  })
})
