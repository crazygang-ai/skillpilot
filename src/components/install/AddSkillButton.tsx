import { useState, useRef, useEffect } from 'react'
import { Plus, GitBranch, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import GitHubImportModal from './GitHubImportModal'
import UploadSkillModal from './UploadSkillModal'

export default function AddSkillButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [showGitModal, setShowGitModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          'flex items-center justify-center w-full gap-2 px-3 py-2',
          'bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium',
        )}
      >
        <Plus className="w-4 h-4" />
        Add Skill
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-full z-10 bg-bg-secondary border border-border rounded-xl shadow-xl overflow-hidden">
          <button
            className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-text-primary hover:bg-bg-hover"
            onClick={() => { setIsOpen(false); setShowGitModal(true) }}
          >
            <GitBranch className="w-4 h-4 text-text-secondary" />
            From Git
          </button>
          <button
            className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-text-primary hover:bg-bg-hover"
            onClick={() => { setIsOpen(false); setShowUploadModal(true) }}
          >
            <Upload className="w-4 h-4 text-text-secondary" />
            From Local File
          </button>
        </div>
      )}

      {showGitModal && <GitHubImportModal onClose={() => setShowGitModal(false)} />}
      {showUploadModal && <UploadSkillModal onClose={() => setShowUploadModal(false)} />}
    </div>
  )
}
