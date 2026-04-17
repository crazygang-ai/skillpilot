import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotificationStore } from '../../src/stores/notificationStore'

describe('notificationStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // 重置 store 到初始状态(zustand 的 create 无内置 reset,手动清空)
    useNotificationStore.setState({ notifications: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('非持久通知在 delay 后被自动移除', () => {
    useNotificationStore.getState().addNotification('info', 'hello')
    expect(useNotificationStore.getState().notifications).toHaveLength(1)

    vi.advanceTimersByTime(4000)

    expect(useNotificationStore.getState().notifications).toHaveLength(0)
  })

  it('带 action 的非持久通知使用 12s delay', () => {
    useNotificationStore
      .getState()
      .addNotification('info', 'with action', { label: 'Undo', onClick: () => {} })

    vi.advanceTimersByTime(4000)
    expect(useNotificationStore.getState().notifications).toHaveLength(1)

    vi.advanceTimersByTime(8000)
    expect(useNotificationStore.getState().notifications).toHaveLength(0)
  })

  it('手动 removeNotification 清理对应 timer', () => {
    const clearSpy = vi.spyOn(global, 'clearTimeout')

    useNotificationStore.getState().addNotification('info', 'manual')
    const id = useNotificationStore.getState().notifications[0].id

    clearSpy.mockClear()
    useNotificationStore.getState().removeNotification(id)

    expect(useNotificationStore.getState().notifications).toHaveLength(0)
    expect(clearSpy).toHaveBeenCalledTimes(1)
    clearSpy.mockRestore()
  })

  it('persistent 通知不建 timer', () => {
    useNotificationStore
      .getState()
      .addNotification('info', 'persistent', undefined, { persistent: true })

    vi.advanceTimersByTime(30000)

    expect(useNotificationStore.getState().notifications).toHaveLength(1)
  })

  it('multiple 通知各自独立追踪 timer', () => {
    const store = useNotificationStore.getState()
    store.addNotification('info', 'a')
    store.addNotification('info', 'b')
    store.addNotification('info', 'c')

    expect(useNotificationStore.getState().notifications).toHaveLength(3)

    const idB = useNotificationStore.getState().notifications[1].id
    useNotificationStore.getState().removeNotification(idB)
    expect(useNotificationStore.getState().notifications).toHaveLength(2)

    vi.advanceTimersByTime(4000)

    expect(useNotificationStore.getState().notifications).toHaveLength(0)
  })
})
