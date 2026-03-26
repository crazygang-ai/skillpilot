import { useQuery } from '@tanstack/react-query'
import type { RegistrySkill, LeaderboardCategory, LeaderboardResult, ClawHubSkill, ClawHubSkillDetail } from '@/types'

export function useRegistryLeaderboard(category: LeaderboardCategory) {
  return useQuery<LeaderboardResult>({
    queryKey: ['registry', 'leaderboard', category],
    queryFn: () => window.electronAPI.registry.leaderboard(category),
    staleTime: 5 * 60_000,
  })
}

export function useRegistrySearch(query: string) {
  return useQuery<RegistrySkill[]>({
    queryKey: ['registry', 'search', query],
    queryFn: () => window.electronAPI.registry.search(query),
    enabled: query.length > 0,
    staleTime: 60_000,
  })
}

export function useClawHubSkills(query: string, sort = 'downloads') {
  return useQuery<ClawHubSkill[]>({
    queryKey: ['clawhub', 'search', query, sort],
    queryFn: () => window.electronAPI.clawhub.search(query, sort),
    staleTime: 60_000,
  })
}

export function useClawHubDetail(slug: string | null) {
  return useQuery<ClawHubSkillDetail>({
    queryKey: ['clawhub', 'detail', slug],
    queryFn: () => window.electronAPI.clawhub.detail(slug!),
    enabled: !!slug,
    staleTime: 10 * 60_000,
  })
}

export function useClawHubContent(slug: string | null) {
  return useQuery<string>({
    queryKey: ['clawhub', 'content', slug],
    queryFn: () => window.electronAPI.clawhub.content(slug!),
    enabled: !!slug,
    staleTime: 10 * 60_000,
  })
}

export function useContentFetch(source: string | undefined, skillId: string | undefined) {
  return useQuery<string>({
    queryKey: ['content', 'fetch', source, skillId],
    queryFn: () => window.electronAPI.content.fetch(source!, skillId!),
    enabled: !!source && !!skillId,
    staleTime: 10 * 60_000,
  })
}
