import { useState, useCallback } from 'react'
import { X, Upload, FileText, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInstallSkillFromLocal } from '@/hooks/useSkills'
import { useNotificationStore } from '@/stores/notificationStore'
import AgentSelector from './AgentSelector'

interface UploadSkillModalProps {
  onClose: () => void
}

export default function UploadSkillModal({ onClose }: UploadSkillModalProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const installFromLocal = useInstallSkillFromLocal()
  const addNotification = useNotificationStore((s) => s.addNotification)

  const canInstall = !!selectedPath && selectedAgents.length > 0 && !installFromLocal.isPending

  async function handleBrowse() {
    try {
      const result = await window.electronAPI.dialog.openFileOrFolder()
      if (result) {
        setSelectedPath(result)
        setSelectedName(result.split('/').pop() ?? result)
      }
    } catch {
      // user cancelled
    }
  }

  async function handleInstall() {
    if (!canInstall || !selectedPath) return
    try {
      await installFromLocal.mutateAsync({
        localPath: selectedPath,
        agentTypes: selectedAgents,
      })
      addNotification('success', `Installed skill from local path`)
      onClose()
    } catch (err) {
      addNotification('error', err instanceof Error ? err.message : 'Install failed')
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
        setSelectedPath(filePath)
        setSelectedName(file.name)
      }
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-bg-secondary border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Install from Local</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5">
          {/* Drop zone */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Skill File or Folder</label>
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
                  Drop file here or <span className="text-accent">browse</span>
                </p>
                <p className="text-xs text-text-muted">SKILL.md file or folder containing one</p>
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
            <label className="block text-sm font-medium text-text-secondary mb-2">Target Agents</label>
            <AgentSelector selected={selectedAgents} onChange={setSelectedAgents} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary rounded-lg"
          >
            Cancel
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
            Install
          </button>
        </div>
      </div>
    </div>
  )
}
