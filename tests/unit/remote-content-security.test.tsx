/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RegistryBrowser from '../../src/views/RegistryBrowser'
import type { RegistrySkill } from '../../shared/types'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockUseRegistryLeaderboard = vi.fn()
const mockUseRegistrySearch = vi.fn()
const mockUseContentFetch = vi.fn()
const mockUseInstallSkill = vi.fn()
const mockUseAgents = vi.fn()
const mockAddNotification = vi.fn()

vi.mock('@/hooks/useRegistry', () => ({
  useRegistryLeaderboard: (...args: unknown[]) => mockUseRegistryLeaderboard(...args),
  useRegistrySearch: (...args: unknown[]) => mockUseRegistrySearch(...args),
  useContentFetch: (...args: unknown[]) => mockUseContentFetch(...args),
}))

vi.mock('@/hooks/useSkills', () => ({
  useInstallSkill: (...args: unknown[]) => mockUseInstallSkill(...args),
}))

vi.mock('@/hooks/useAgents', () => ({
  useAgents: (...args: unknown[]) => mockUseAgents(...args),
}))

vi.mock('@/stores/notificationStore', () => ({
  useNotificationStore: (selector: (state: { addNotification: typeof mockAddNotification }) => unknown) =>
    selector({ addNotification: mockAddNotification }),
}))

describe('remote content security', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    const skills: RegistrySkill[] = [
      {
        id: 'owner/repo/unsafe-skill',
        skillId: 'unsafe-skill',
        name: 'Unsafe Skill',
        installs: 42,
        source: 'owner/repo',
      },
    ]

    mockUseRegistryLeaderboard.mockReturnValue({
      data: { skills, totalCount: skills.length },
      isLoading: false,
    })
    mockUseRegistrySearch.mockReturnValue({
      data: [],
      isLoading: false,
    })
    mockUseContentFetch.mockReturnValue({
      data: '<!-- HTML --><p>Safe text</p><a href="javascript:alert(1)" onclick="alert(1)">bad link</a><script>window.__xss = true</script>',
      isLoading: false,
    })
    mockUseInstallSkill.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    })
    mockUseAgents.mockReturnValue({
      data: [],
    })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root.render(<RegistryBrowser />)
    })
  })

  afterEach(async () => {
    mockUseRegistryLeaderboard.mockReset()
    mockUseRegistrySearch.mockReset()
    mockUseContentFetch.mockReset()
    mockUseInstallSkill.mockReset()
    mockUseAgents.mockReset()
    mockAddNotification.mockReset()

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('strips unsafe HTML from remote registry content before rendering', async () => {
    const skillButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Unsafe Skill'),
    )

    expect(skillButton).toBeTruthy()

    await act(async () => {
      skillButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Safe text')
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('[onclick]')).toBeNull()
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull()
  })
})
