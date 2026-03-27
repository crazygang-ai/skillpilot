import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const WATCHER_DEBOUNCE_MS = 150

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['skills'] })
  queryClient.invalidateQueries({ queryKey: ['agents'] })
}

export function useSkillWatcherSync() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const unsubWatcher = window.electronAPI.watcher.onChange(() => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => invalidateAll(queryClient), WATCHER_DEBOUNCE_MS)
    })

    const unsubState = window.electronAPI.skills.onStateChanged(() => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
    })

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      unsubWatcher()
      unsubState()
    }
  }, [queryClient])
}
