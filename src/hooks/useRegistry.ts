import { useQuery } from '@tanstack/react-query'
import type { RegistrySkill, LeaderboardCategory, LeaderboardResult } from '@/types'
import api from '@/services/ipcClient'

export function useRegistryLeaderboard(category: LeaderboardCategory) {
  return useQuery<LeaderboardResult>({
    queryKey: ['registry', 'leaderboard', category],
    queryFn: () => api.registry.leaderboard(category),
    staleTime: 5 * 60_000,
  })
}

export function useRegistrySearch(query: string) {
  return useQuery<RegistrySkill[]>({
    queryKey: ['registry', 'search', query],
    queryFn: () => api.registry.search(query),
    enabled: query.length > 0,
    staleTime: 60_000,
  })
}

export function useContentFetch(source: string | undefined, skillId: string | undefined) {
  return useQuery<string>({
    queryKey: ['content', 'fetch', source, skillId],
    queryFn: () => api.content.fetch(source!, skillId!),
    enabled: !!source && !!skillId,
    staleTime: 10 * 60_000,
  })
}
