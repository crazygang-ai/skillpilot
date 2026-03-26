import { X, CheckCircle, XCircle, Info, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNotificationStore } from '@/stores/notificationStore'
import { cn } from '@/lib/utils'

const icons = {
  success: <CheckCircle size={16} className="text-success" />,
  error: <XCircle size={16} className="text-error" />,
  info: <Info size={16} className="text-accent" />,
}

export default function Notifications() {
  const { t } = useTranslation()
  const { notifications, removeNotification } = useNotificationStore()

  if (notifications.length === 0) return null

  const modalNotifications = notifications.filter((n) => n.presentation === 'modal')
  const toastNotifications = notifications.filter((n) => n.presentation !== 'modal')

  const handleActionClick = async (
    id: string,
    action: NonNullable<(typeof notifications)[number]['action']>,
    isModal: boolean,
  ) => {
    await action.onClick()
    if (isModal) {
      removeNotification(id)
    }
  }

  return (
    <>
      {/* Toast notifications */}
      {toastNotifications.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
          {toastNotifications.map((n) => (
            <div
              key={n.id}
              className={cn(
                'flex items-start gap-2 px-4 py-3 rounded-xl shadow-lg border text-sm animate-in slide-in-from-top-2',
                'bg-bg-secondary border-border',
              )}
            >
              {icons[n.type]}
              <div className="flex-1 space-y-1">
                <span className="block whitespace-pre-line text-text-primary">{n.message}</span>
                {n.action && (
                  <button
                    onClick={() => {
                      if (!n.action) return
                      void handleActionClick(n.id, n.action, false)
                    }}
                    className="inline-flex items-center rounded-md border border-accent/25 bg-accent/8 px-2 py-1 text-xs font-medium text-accent hover:bg-accent/14"
                  >
                    {n.action.label}
                  </button>
                )}
              </div>
              <button
                onClick={() => removeNotification(n.id)}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal notifications */}
      {modalNotifications.length > 0 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative z-10 flex max-w-2xl flex-col gap-3 px-4">
            {modalNotifications.map((n) => {
              const lines = n.message.split('\n').filter(Boolean)
              const title = lines[0] ?? ''
              const command = lines.length >= 2 ? lines[lines.length - 1] : ''
              const description = lines.slice(1, Math.max(1, lines.length - 1)).join('\n')

              return (
                <div
                  key={n.id}
                  className="pointer-events-auto w-[32rem] rounded-xl border border-border bg-bg-secondary p-3 shadow-lg"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                      <ChevronRight size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-text-primary">{title}</p>
                      {description && (
                        <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-text-muted">
                          {description}
                        </p>
                      )}
                      {command && (
                        <p className="mt-1 rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-xs text-text-primary">
                          {command}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => removeNotification(n.id)}
                      className="rounded-md p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => removeNotification(n.id)}
                      className="rounded-lg border border-border bg-bg-secondary px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:bg-bg-hover transition-colors"
                    >
                      {t('common.cancel')}
                    </button>
                    {n.action && (
                      <button
                        onClick={() => {
                          if (!n.action) return
                          void handleActionClick(n.id, n.action, true)
                        }}
                        className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover transition-colors"
                      >
                        {n.action.label}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
