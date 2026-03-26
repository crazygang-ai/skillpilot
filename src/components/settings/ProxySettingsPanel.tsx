import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settingsStore'
import type { ProxyType } from '@/types'

export default function ProxySettingsPanel() {
  const { proxy, loadProxy, saveProxy } = useSettingsStore()

  const [isEnabled, setIsEnabled] = useState(proxy.isEnabled)
  const [type, setType] = useState<ProxyType>(proxy.type)
  const [host, setHost] = useState(proxy.host)
  const [port, setPort] = useState(proxy.port)
  const [username, setUsername] = useState(proxy.username ?? '')
  const [password, setPassword] = useState('')
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
    setBypassList(proxy.bypassList.join(', '))
  }, [proxy])

  async function handleSave() {
    setSaving(true)
    try {
      await saveProxy({
        isEnabled,
        type,
        host,
        port,
        username: username || undefined,
        bypassList: bypassList
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      })
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
        <span className="text-sm text-text-primary">Enable Proxy</span>
      </label>

      {/* Proxy type */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">Type</label>
        <div className="flex gap-2">
          {(['https', 'socks5'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn(
                'px-4 py-1.5 text-sm rounded-lg border',
                type === t
                  ? 'bg-accent text-white border-accent'
                  : 'bg-bg-tertiary text-text-secondary border-border hover:border-border-light',
              )}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Host & Port */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-text-secondary mb-1">Host</label>
          <input type="text" value={host} onChange={(e) => setHost(e.target.value)} placeholder="127.0.0.1" className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Port</label>
          <input type="number" value={port || ''} onChange={(e) => setPort(Number(e.target.value))} placeholder="7890" className={inputClass} />
        </div>
      </div>

      {/* Username */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Username <span className="text-text-muted">(optional)</span></label>
        <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} />
      </div>

      {/* Password */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Stored in Keychain" className={inputClass} />
        <p className="mt-1 text-xs text-text-muted">Password is stored securely in the system Keychain.</p>
      </div>

      {/* Bypass list */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Bypass List</label>
        <textarea
          value={bypassList}
          onChange={(e) => setBypassList(e.target.value)}
          placeholder="localhost, 127.0.0.1, *.local"
          rows={3}
          className={cn(inputClass, 'resize-none')}
        />
        <p className="mt-1 text-xs text-text-muted">Comma-separated list of hosts to bypass the proxy.</p>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="px-5 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  )
}
