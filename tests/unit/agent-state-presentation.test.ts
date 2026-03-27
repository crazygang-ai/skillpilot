import { describe, it, expect } from 'vitest'
import { getAgentStatePresentation } from '../../src/components/skill/agent-state-presentation'

describe('getAgentStatePresentation', () => {
  it('returns assign action for no state', () => {
    const result = getAgentStatePresentation(undefined)
    expect(result.actionLabel).toBe('skillDetail.assign')
    expect(result.canAct).toBe(true)
  })

  it('returns unassign for linked state', () => {
    const result = getAgentStatePresentation('linked')
    expect(result.label).toBe('skillDetail.linked')
    expect(result.actionLabel).toBe('skillDetail.unassign')
    expect(result.canAct).toBe(true)
  })

  it('returns remove for installed state', () => {
    const result = getAgentStatePresentation('installed')
    expect(result.label).toBe('skillDetail.installed')
    expect(result.actionLabel).toBe('skillDetail.removeLocal')
    expect(result.canAct).toBe(true)
  })

  it('returns no action for builtin state', () => {
    const result = getAgentStatePresentation('builtin')
    expect(result.label).toBe('skillDetail.builtin')
    expect(result.canAct).toBe(false)
  })
})
