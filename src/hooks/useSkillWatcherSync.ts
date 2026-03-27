import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const WATCHER_DEBOUNCE_MS = 150

export function useSkillWatcherSync() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const unsubscribe = window.electronAPI.watcher.onChange(() => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      timeoutId = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['skills'] })
        queryClient.invalidateQueries({ queryKey: ['agents'] })
      }, WATCHER_DEBOUNCE_MS)
    })

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      unsubscribe()
    }
  }, [queryClient])
}
