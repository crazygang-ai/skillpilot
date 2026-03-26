import { useState } from 'react'
import { Info, Globe, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import AboutPanel from '@/components/settings/AboutPanel'
import LanguageSettings from '@/components/settings/LanguageSettings'
import ProxySettingsPanel from '@/components/settings/ProxySettingsPanel'

type SettingsTab = 'about' | 'language' | 'proxy'

const tabs: { id: SettingsTab; label: string; icon: typeof Info }[] = [
  { id: 'about', label: 'About', icon: Info },
  { id: 'language', label: 'Language', icon: Globe },
  { id: 'proxy', label: 'Proxy', icon: Shield },
]

export default function SettingsModal() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('about')

  return (
    <div className="flex h-full">
      {/* Left sidebar nav */}
      <div className="w-48 shrink-0 border-r border-border bg-bg-secondary p-4">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
          Settings
        </h2>
        <nav className="space-y-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-2.5 w-full px-3 py-2 text-sm rounded-lg transition-colors',
                activeTab === id
                  ? 'bg-accent/15 text-accent font-medium'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Right content area */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-xl">
          {activeTab === 'about' && (
            <>
              <h3 className="text-lg font-semibold text-text-primary mb-6">About</h3>
              <AboutPanel />
            </>
          )}
          {activeTab === 'language' && (
            <>
              <h3 className="text-lg font-semibold text-text-primary mb-6">Language</h3>
              <LanguageSettings />
            </>
          )}
          {activeTab === 'proxy' && (
            <>
              <h3 className="text-lg font-semibold text-text-primary mb-6">Proxy</h3>
              <ProxySettingsPanel />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
