import { useState, useMemo } from 'react'
import { X, GitBranch, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useInstallSkill } from '@/hooks/useSkills'
import { useNotificationStore } from '@/stores/notificationStore'
import type { AgentType } from '@/types'
import AgentSelector from './AgentSelector'

interface GitHubImportModalProps {
  onClose: () => void
}

function isValidGitHubUrl(url: string): boolean {
  if (!url.trim()) return false
  if (url.includes('github.com')) return true
  return /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/.test(url.trim())
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (trimmed.includes('github.com')) return trimmed
  return `https://github.com/${trimmed}`
}

export default function GitHubImportModal({ onClose }: GitHubImportModalProps) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const installSkill = useInstallSkill()
  const addNotification = useNotificationStore((s) => s.addNotification)

  const isValid = useMemo(() => isValidGitHubUrl(url), [url])
  const canImport = isValid && selectedAgents.length > 0 && !installSkill.isPending

  async function handleImport() {
    if (!canImport) return
    try {
      const result = await installSkill.mutateAsync({
        repoUrl: normalizeUrl(url),
        agentTypes: selectedAgents as AgentType[],
        source: 'github',
      })
      if (result.success) {
        addNotification('success', t('install.importSuccess', { count: result.skillCount ?? 1 }))
        onClose()
      } else {
        addNotification('error', t('install.importFailed', { error: result.error ?? 'Unknown' }))
      }
    } catch (err) {
      addNotification('error', t('install.importFailed', { error: err instanceof Error ? err.message : 'Unknown' }))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-bg-secondary border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">{t('install.github.title')}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5">
          {/* Agent selector */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">{t('install.targetAgents')}</label>
            <AgentSelector selected={selectedAgents} onChange={setSelectedAgents} />
          </div>

          {/* URL input */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">{t('install.github.repoLabel')}</label>
            <div className="flex items-center gap-2 bg-bg-tertiary border border-border rounded-lg px-3 py-2">
              <GitBranch className="w-4 h-4 text-text-muted shrink-0" />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t('install.github.placeholder')}
                className="flex-1 bg-transparent text-text-primary text-sm outline-none placeholder:text-text-muted"
              />
            </div>
            <p className="mt-1.5 text-xs text-text-muted">
              {t('install.github.hint')}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary rounded-lg"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleImport}
            disabled={!canImport}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg',
              canImport
                ? 'bg-accent hover:bg-accent-hover text-white'
                : 'bg-accent/30 text-white/50 cursor-not-allowed',
            )}
          >
            {installSkill.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('install.github.importBtn')}
          </button>
        </div>
      </div>
    </div>
  )
}
