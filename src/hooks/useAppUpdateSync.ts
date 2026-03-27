import { useEffect } from 'react'
import type { AppUpdateState } from '../../shared/types'
import { useUpdateStore } from '@/stores/updateStore'
import api from '@/services/ipcClient'

export function useAppUpdateSync() {
  const init = useUpdateStore((state) => state.init)
  const hydrate = useUpdateStore((state) => state.hydrate)

  useEffect(() => {
    void init()

    const unsubscribe = api.updater.onStateChanged((state) => {
      hydrate(state as AppUpdateState)
    })

    return () => {
      unsubscribe()
    }
  }, [hydrate, init])
}
