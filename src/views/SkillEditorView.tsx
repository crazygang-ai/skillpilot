import { useState, useEffect, useCallback, useMemo } from 'react'
import { Save, X, Loader2 } from 'lucide-react'
import MetadataForm from '@/components/editor/MetadataForm'
import MarkdownPreview from '@/components/editor/MarkdownPreview'
import { useSkills, useSaveSkillMD } from '@/hooks/useSkills'
import { useNotificationStore } from '@/stores/notificationStore'
import type { SkillMetadata } from '@/types'

interface SkillEditorViewProps {
  skillId: string
  onClose: () => void
}

export default function SkillEditorView({ skillId, onClose }: SkillEditorViewProps) {
  const { data: skills } = useSkills()
  const saveMutation = useSaveSkillMD()
  const addNotification = useNotificationStore((s) => s.addNotification)

  const skill = useMemo(() => skills?.find((s) => s.id === skillId), [skills, skillId])

  const [metadata, setMetadata] = useState<SkillMetadata>(
    skill?.metadata ?? { name: '', description: '' },
  )
  const [body, setBody] = useState(skill?.markdownBody ?? '')

  useEffect(() => {
    if (skill) {
      setMetadata(skill.metadata)
      setBody(skill.markdownBody)
    }
  }, [skill])

  const handleSave = useCallback(() => {
    saveMutation.mutate(
      { skillId, metadata, body },
      {
        onSuccess: () => {
          addNotification('success', 'Skill saved')
          onClose()
        },
        onError: (err) => addNotification('error', err.message),
      },
    )
  }, [skillId, metadata, body, saveMutation, addNotification, onClose])

  // Cmd+S shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSave])

  if (!skill) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-muted">Skill not found</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <h2 className="text-sm font-semibold text-text-primary">Edit Skill</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </button>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium text-text-secondary hover:bg-bg-hover transition-colors"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
        </div>
      </div>

      {/* Split Pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Editor */}
        <div className="w-1/2 overflow-y-auto border-r border-border p-6 space-y-6">
          <MetadataForm metadata={metadata} onChange={setMetadata} />
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide">
              Content (Markdown)
            </label>
            <textarea
              className="w-full min-h-[300px] resize-y rounded-lg bg-bg-tertiary border border-border px-3 py-2 text-sm text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your skill documentation in Markdown..."
            />
          </div>
        </div>

        {/* Right: Preview */}
        <div className="w-1/2 overflow-y-auto">
          <MarkdownPreview content={body} />
        </div>
      </div>
    </div>
  )
}
