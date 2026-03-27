import { useState, useCallback } from 'react'
import { X, Upload, FileText, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useInstallSkillFromLocal } from '@/hooks/useSkills'
import { useNotificationStore } from '@/stores/notificationStore'
import AgentSelector from './AgentSelector'

interface UploadSkillModalProps {
  onClose: () => void
}

export default function UploadSkillModal({ onClose }: UploadSkillModalProps) {
  const { t } = useTranslation()
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const installFromLocal = useInstallSkillFromLocal()
  const addNotification = useNotificationStore((s) => s.addNotification)

  const canInstall = !!selectedPath && selectedAgents.length > 0 && !installFromLocal.isPending

  function setSelectedDirectory(dirPath: string) {
    setSelectedPath(dirPath)
    setSelectedName(getPathName(dirPath))
  }

  async function handleBrowse() {
    try {
      const result = await window.electronAPI.dialog.openDirectory()
      if (result) {
        setSelectedDirectory(result)
      }
    } catch {
      // user cancelled
    }
  }

  async function handleInstall() {
    if (!canInstall || !selectedPath) return
    try {
      const result = await installFromLocal.mutateAsync({
        localPath: selectedPath,
        agentTypes: selectedAgents,
      })
      if (!result?.success) {
        addNotification(
          'error',
          result?.error ?? t('install.local.directoryOnlyError'),
        )
        return
      }
      addNotification('success', t('install.local.success'))
      onClose()
    } catch (err) {
      addNotification(
        'error',
        err instanceof Error ? err.message : t('install.local.directoryOnlyError'),
      )
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      // Electron provides the path property on File objects
      const filePath = (file as File & { path?: string }).path
      if (filePath) {
        const lowerName = file.name.toLowerCase()
        const normalizedPath = filePath.toLowerCase()

        if (lowerName.endsWith('.zip') || normalizedPath.endsWith('.zip')) {
          addNotification('error', t('install.local.zipNotSupported'))
          return
        }

        if (lowerName === 'skill.md' || normalizedPath.endsWith('/skill.md')) {
          addNotification('error', t('install.local.fileNotSupported'))
          return
        }

        setSelectedDirectory(filePath)
      }
    }
  }, [addNotification, t])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-bg-secondary border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">{t('install.local.title')}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5">
          {/* Drop zone */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {t('install.local.directoryLabel')}
            </label>
            {!selectedPath ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleBrowse}
                className={cn(
                  'flex flex-col items-center justify-center gap-2 py-10 border-2 border-dashed rounded-xl cursor-pointer transition-colors',
                  isDragOver
                    ? 'border-accent bg-accent/10'
                    : 'border-border-light hover:border-text-muted',
                )}
              >
                <Upload className="w-8 h-8 text-text-muted" />
                <p className="text-sm text-text-secondary">
                  {t('install.local.dropPromptPrefix')}{' '}
                  <span className="text-accent">{t('install.local.browse')}</span>
                </p>
                <p className="text-xs text-text-muted">{t('install.local.directoryHint')}</p>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 bg-bg-tertiary rounded-lg">
                <FileText className="w-5 h-5 text-accent shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary font-medium truncate">{selectedName}</p>
                  <p className="text-xs text-text-muted truncate">{selectedPath}</p>
                </div>
                <button
                  onClick={() => { setSelectedPath(null); setSelectedName(null) }}
                  className="text-text-muted hover:text-text-primary shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Agent selector */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {t('install.installTo')}
            </label>
            <AgentSelector selected={selectedAgents} onChange={setSelectedAgents} />
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
            onClick={handleInstall}
            disabled={!canInstall}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg',
              canInstall
                ? 'bg-accent hover:bg-accent-hover text-white'
                : 'bg-accent/30 text-white/50 cursor-not-allowed',
            )}
          >
            {installFromLocal.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('common.install')}
          </button>
        </div>
      </div>
    </div>
  )
}

function getPathName(value: string): string {
  const normalized = value.replace(/[\\/]+$/, '')
  const segments = normalized.split(/[\\/]/)
  return segments[segments.length - 1] || value
}
