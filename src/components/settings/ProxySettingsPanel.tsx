import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settingsStore'
import { useNotificationStore } from '@/stores/notificationStore'
import type { ProxyType } from '@/types'

export default function ProxySettingsPanel() {
  const { t } = useTranslation()
  const { proxy, loadProxy, saveProxy } = useSettingsStore()
  const addNotification = useNotificationStore((s) => s.addNotification)

  const [isEnabled, setIsEnabled] = useState(proxy.isEnabled)
  const [type, setType] = useState<ProxyType>(proxy.type)
  const [host, setHost] = useState(proxy.host)
  const [port, setPort] = useState(proxy.port)
  const [username, setUsername] = useState(proxy.username ?? '')
  const [password, setPassword] = useState('')
  const [passwordDirty, setPasswordDirty] = useState(false)
  const [bypassList, setBypassList] = useState(proxy.bypassList.join(', '))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadProxy()
  }, [loadProxy])

  useEffect(() => {
    setIsEnabled(proxy.isEnabled)
    setType(proxy.type)
    setHost(proxy.host)
    setPort(proxy.port)
    setUsername(proxy.username ?? '')
    setPassword('')
    setPasswordDirty(false)
    setBypassList(proxy.bypassList.join(', '))
  }, [proxy])

  async function handleSave() {
    setSaving(true)
    try {
      const nextProxy = {
        isEnabled,
        type,
        host,
        port,
        username: username || undefined,
        bypassList: bypassList
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }

      await saveProxy({
        proxy: nextProxy,
        ...((!isEnabled || passwordDirty) ? { password } : {}),
      })
      addNotification('success', t('settings.proxySaved'))
      setPassword('')
      setPasswordDirty(false)
    } catch (err) {
      addNotification(
        'error',
        err instanceof Error ? err.message : t('settings.proxySaveFailed'),
      )
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-text-primary text-sm outline-none focus:border-accent w-full'

  return (
    <div className="space-y-5">
      {/* Enable toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={(e) => setIsEnabled(e.target.checked)}
          className="w-4 h-4 rounded accent-accent"
        />
        <span className="text-sm text-text-primary">{t('settings.proxyEnabled')}</span>
      </label>

      {/* Proxy type */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">{t('settings.proxyType')}</label>
        <div className="flex gap-2">
          {(['https', 'socks5'] as const).map((proxyKind) => (
            <button
              key={proxyKind}
              onClick={() => setType(proxyKind)}
              className={cn(
                'px-4 py-1.5 text-sm rounded-lg border',
                type === proxyKind
                  ? 'bg-accent text-white border-accent'
                  : 'bg-bg-tertiary text-text-secondary border-border hover:border-border-light',
              )}
            >
              {proxyKind === 'https' ? t('settings.proxyTypeHttps') : t('settings.proxyTypeSocks5')}
            </button>
          ))}
        </div>
      </div>

      {/* Host & Port */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-text-secondary mb-1">{t('settings.proxyHost')}</label>
          <input type="text" value={host} onChange={(e) => setHost(e.target.value)} placeholder="127.0.0.1" className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">{t('settings.proxyPort')}</label>
          <input type="number" value={port || ''} onChange={(e) => setPort(Number(e.target.value))} placeholder="7890" className={inputClass} />
        </div>
      </div>

      {/* Username */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          {t('settings.proxyUsername')} <span className="text-text-muted">({t('settings.optional')})</span>
        </label>
        <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} />
      </div>

      {/* Password */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">{t('settings.proxyPassword')}</label>
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setPasswordDirty(true)
          }}
          placeholder={t('settings.proxyPasswordPlaceholder')}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-text-muted">{t('settings.proxyPasswordHint')}</p>
      </div>

      {/* Bypass list */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">{t('settings.proxyBypass')}</label>
        <textarea
          value={bypassList}
          onChange={(e) => setBypassList(e.target.value)}
          placeholder="localhost, 127.0.0.1, *.local"
          rows={3}
          className={cn(inputClass, 'resize-none')}
        />
        <p className="mt-1 text-xs text-text-muted">{t('settings.proxyBypassHint')}</p>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="px-5 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50"
      >
        {saving ? t('common.saving') : t('common.save')}
      </button>
    </div>
  )
}
