import { useTranslation } from 'react-i18next'
import { useUpdateStore } from '@/stores/updateStore'

export default function AboutPanel() {
  const { t } = useTranslation()
  const {
    appUpdatesSupported,
    checkForUpdates,
    currentVersion,
    downloadUpdate,
    errorMessage,
    info,
    lastCheckedAt,
    progress,
    quitAndInstall,
    status,
  } = useUpdateStore()

  const isBusy = status === 'checking' || status === 'downloading'

  const statusMessage = (() => {
    if (!appUpdatesSupported) {
      return t('settings.appUpdatesUnsupported')
    }

    switch (status) {
      case 'available':
        return info?.version
          ? t('settings.updateAvailableVersion', { version: info.version })
          : t('settings.appUpdatesSupported')
      case 'not-available':
        return t('settings.updateNotAvailable')
      case 'downloading':
        return `${t('settings.downloadingUpdate')} ${Math.round(progress?.percent ?? 0)}%`
      case 'downloaded':
        return t('settings.restartToInstall')
      case 'error':
        return t('settings.updateError')
      case 'checking':
        return t('settings.checkingForUpdates')
      default:
        return t('settings.appUpdatesSupported')
    }
  })()

  const actionButton = (() => {
    if (!appUpdatesSupported) {
      return null
    }

    if (status === 'available') {
      return (
        <button
          type="button"
          onClick={() => void downloadUpdate()}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          {t('settings.downloadUpdate')}
        </button>
      )
    }

    if (status === 'downloaded') {
      return (
        <button
          type="button"
          onClick={() => void quitAndInstall()}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          {t('settings.restartToInstall')}
        </button>
      )
    }

    return (
      <button
        type="button"
        onClick={() => void checkForUpdates()}
        disabled={isBusy}
        className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === 'checking'
          ? t('settings.checkingForUpdates')
          : t('settings.checkForUpdates')}
      </button>
    )
  })()

  return (
    <div className="space-y-6">
      {/* App info */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center text-accent text-2xl font-bold">
          SP
        </div>
        <div>
          <h3 className="text-lg font-semibold text-text-primary">SkillPilot</h3>
          <p className="text-sm text-text-muted">
            {t('settings.appVersion')}: v{currentVersion}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm text-text-secondary">{statusMessage}</p>
        {errorMessage && (
          <p className="text-sm text-danger">
            {errorMessage}
          </p>
        )}
        {info?.releaseNotes && status === 'available' && (
          <p className="rounded-lg bg-bg-secondary px-3 py-2 text-sm text-text-secondary">
            {info.releaseNotes}
          </p>
        )}
        {lastCheckedAt && (
          <p className="text-xs text-text-muted">
            {t('settings.lastCheckedAt')}: {new Date(lastCheckedAt).toLocaleString()}
          </p>
        )}
        {actionButton}
      </div>
    </div>
  )
}
