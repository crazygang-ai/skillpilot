import { create } from 'zustand'

interface Notification {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
  presentation?: 'toast' | 'modal'
  persistent?: boolean
  action?: { label: string; onClick: () => void }
}

interface NotificationState {
  notifications: Notification[]
  addNotification: (
    type: Notification['type'],
    message: string,
    action?: Notification['action'],
    options?: { presentation?: 'toast' | 'modal'; persistent?: boolean },
  ) => void
  removeNotification: (id: string) => void
}

let nextId = 0
const timers = new Map<string, ReturnType<typeof setTimeout>>()

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  addNotification: (type, message, action, options) => {
    const id = String(++nextId)
    const notification: Notification = {
      id,
      type,
      message,
      action,
      presentation: options?.presentation ?? 'toast',
      persistent: options?.persistent ?? false,
    }
    set((state) => ({ notifications: [...state.notifications, notification] }))

    if (!notification.persistent) {
      const delay = action ? 12000 : 4000
      const handle = setTimeout(() => {
        timers.delete(id)
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }))
      }, delay)
      timers.set(id, handle)
    }
  },
  removeNotification: (id) => {
    const handle = timers.get(id)
    if (handle) {
      clearTimeout(handle)
      timers.delete(id)
    }
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }))
  },
}))
