import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settingsStore'
import i18next from 'i18next'

export default function LanguageSettings() {
  const { t } = useTranslation()
  const { language, setLanguage } = useSettingsStore()

  function handleChange(lang: string) {
    setLanguage(lang)
    i18next.changeLanguage(lang)
  }

  const languages = [
    { code: 'en', label: 'English' },
    { code: 'zh', label: '中文' },
  ]

  return (
    <div>
      <p className="text-sm text-text-secondary mb-3">{t('settings.displayLanguage')}</p>
      <div className="flex gap-2">
        {languages.map(({ code, label }) => (
          <button
            key={code}
            onClick={() => handleChange(code)}
            className={cn(
              'px-5 py-2 text-sm rounded-lg border font-medium',
              language === code
                ? 'bg-accent text-white border-accent'
                : 'bg-bg-tertiary text-text-secondary border-border hover:border-border-light',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
