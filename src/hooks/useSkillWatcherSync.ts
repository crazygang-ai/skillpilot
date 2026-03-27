import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import api from '@/services/ipcClient'

const WATCHER_DEBOUNCE_MS = 150

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['skills'] })
  queryClient.invalidateQueries({ queryKey: ['agents'] })
}

export function useSkillWatcherSync() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const unsubWatcher = api.watcher.onChange(() => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => invalidateAll(queryClient), WATCHER_DEBOUNCE_MS)
    })

    const unsubState = api.skills.onStateChanged(() => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
    })

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      unsubWatcher()
      unsubState()
    }
  }, [queryClient])
}
