import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNotificationStore } from '@/stores/notificationStore'
import api from '@/services/ipcClient'

const WATCHER_DEBOUNCE_MS = 150

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['skills'] })
  queryClient.invalidateQueries({ queryKey: ['agents'] })
}

export function useSkillWatcherSync() {
  const queryClient = useQueryClient()
  const addNotification = useNotificationStore((s) => s.addNotification)

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const unsubWatcher = api.watcher.onChange(() => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => invalidateAll(queryClient), WATCHER_DEBOUNCE_MS)
    })

    const unsubState = api.skills.onStateChanged(() => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
    })

    const unsubRefreshFailed = api.skills.onRefreshFailed((message: string) => {
      addNotification('error', `Skill refresh failed: ${message}`)
    })

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      unsubWatcher()
      unsubState()
      unsubRefreshFailed()
    }
  }, [queryClient, addNotification])
}
