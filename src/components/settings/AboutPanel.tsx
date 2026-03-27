import { useTranslation } from 'react-i18next'
import { useUpdateStore } from '@/stores/updateStore'

export default function AboutPanel() {
  const { t } = useTranslation()
  const { currentVersion, appUpdatesSupported } = useUpdateStore()

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
        <p className="text-sm text-text-secondary">
          {appUpdatesSupported
            ? t('settings.appUpdatesSupported')
            : t('settings.appUpdatesUnsupported')}
        </p>
      </div>
    </div>
  )
}
