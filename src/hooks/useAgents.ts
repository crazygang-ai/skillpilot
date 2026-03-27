import { useQuery } from '@tanstack/react-query'
import type { Agent } from '@/types'
import api from '@/services/ipcClient'

export function useAgents() {
  return useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: () => api.agents.detect(),
    staleTime: 30_000,
  })
}
