import { useState, useMemo, useCallback } from 'react'
import {
  ClipboardCopy,
  FolderOpen,
  Pencil,
  Trash2,
  RefreshCw,
  ArrowUpCircle,
  Loader2,
  FileText,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { useSkills, useAssignSkill, useUnassignSkill, useRemoveLocalSkill, useCheckUpdate, useUpdateSkill } from '@/hooks/useSkills'
import { useAgents } from '@/hooks/useAgents'
import { useAppStore } from '@/stores/appStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { getAgentStatePresentation } from './agent-state-presentation'
import type { Skill, Agent, AgentType, SkillAgentStatus } from '@/types'

const AGENT_COLORS: Record<string, string> = {
  claude: 'text-agent-claude',
  codex: 'text-agent-codex',
  gemini: 'text-agent-gemini',
  copilot: 'text-agent-copilot',
  opencode: 'text-agent-opencode',
  antigravity: 'text-agent-antigravity',
  cursor: 'text-agent-cursor',
  kiro: 'text-agent-kiro',
  codebuddy: 'text-agent-codebuddy',
  openclaw: 'text-agent-openclaw',
  trae: 'text-agent-trae',
}

function getAgentStatusForSkill(
  skill: Skill,
  agentType: AgentType,
): { status: SkillAgentStatus | null; isInherited: boolean } {
  const installation = skill.installations.find((i) => i.agentType === agentType)
  if (!installation) return { status: null, isInherited: false }
  if (installation.isInherited) return { status: 'builtin', isInherited: true }
  if (installation.isSymlink) return { status: 'linked', isInherited: false }
  return { status: 'installed', isInherited: false }
}

function ScopeBadge({ scope }: { scope: Skill['scope'] }) {
  const text =
    scope.kind === 'sharedGlobal'
      ? 'Global'
      : scope.kind === 'agentLocal'
        ? scope.agentType
        : 'Project'
  return (
    <span className="inline-flex items-center rounded-md bg-bg-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary">
      {text}
    </span>
  )
}

interface ActionButtonProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
  variant?: 'default' | 'danger'
  disabled?: boolean
}

function ActionButton({ icon, label, onClick, variant = 'default', disabled }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
        variant === 'danger'
          ? 'text-error hover:bg-error/15'
          : 'text-text-secondary hover:bg-bg-hover',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

export default function SkillDetail() {
  const { data: skills } = useSkills()
  const { data: agents } = useAgents()
  const { selectedSkillId, setSelectedSkillId, setEditingSkillId } = useAppStore()
  const addNotification = useNotificationStore((s) => s.addNotification)

  const assignSkill = useAssignSkill()
  const unassignSkill = useUnassignSkill()
  const removeLocal = useRemoveLocalSkill()
  const checkUpdate = useCheckUpdate()
  const updateSkill = useUpdateSkill()

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const skill = useMemo(
    () => skills?.find((s) => s.id === selectedSkillId) ?? null,
    [skills, selectedSkillId],
  )

  const handleCopyPath = useCallback(() => {
    if (!skill) return
    navigator.clipboard.writeText(skill.canonicalPath)
    addNotification('success', 'Path copied to clipboard')
  }, [skill, addNotification])

  const handleRevealInFinder = useCallback(() => {
    if (!skill) return
    window.electronAPI?.fs?.revealInFinder?.(skill.canonicalPath)
  }, [skill])

  const handleDelete = useCallback(() => {
    if (!skill) return
    removeLocal.mutate(
      { skillId: skill.id },
      {
        onSuccess: () => {
          addNotification('success', `Deleted "${skill.metadata.name}"`)
          setSelectedSkillId(null)
          setShowDeleteConfirm(false)
        },
        onError: (err) => addNotification('error', err.message),
      },
    )
  }, [skill, removeLocal, addNotification, setSelectedSkillId])

  const handleCheckUpdate = useCallback(() => {
    if (!skill) return
    checkUpdate.mutate(skill.id, {
      onSuccess: (result) => {
        if (result) {
          addNotification('info', 'Update available')
        } else {
          addNotification('info', 'Already up to date')
        }
      },
      onError: (err) => addNotification('error', err.message),
    })
  }, [skill, checkUpdate, addNotification])

  const handleUpdate = useCallback(() => {
    if (!skill) return
    updateSkill.mutate(skill.id, {
      onSuccess: () => addNotification('success', `Updated "${skill.metadata.name}"`),
      onError: (err) => addNotification('error', err.message),
    })
  }, [skill, updateSkill, addNotification])

  const handleAssign = useCallback(
    (agentType: AgentType) => {
      if (!skill) return
      assignSkill.mutate(
        { skillPath: skill.canonicalPath, agentType },
        {
          onSuccess: () => addNotification('success', `Assigned to ${agentType}`),
          onError: (err) => addNotification('error', err.message),
        },
      )
    },
    [skill, assignSkill, addNotification],
  )

  const handleUnassign = useCallback(
    (agentType: AgentType) => {
      if (!skill) return
      unassignSkill.mutate(
        { skillPath: skill.canonicalPath, agentType },
        {
          onSuccess: () => addNotification('success', `Unassigned from ${agentType}`),
          onError: (err) => addNotification('error', err.message),
        },
      )
    },
    [skill, unassignSkill, addNotification],
  )

  const handleRemoveLocal = useCallback(
    (agentType: AgentType) => {
      if (!confirm(`Remove local copy from ${agentType}?`)) return
      if (!skill) return
      removeLocal.mutate(
        { skillId: skill.id },
        {
          onSuccess: () => addNotification('success', `Removed local copy from ${agentType}`),
          onError: (err) => addNotification('error', err.message),
        },
      )
    },
    [skill, removeLocal, addNotification],
  )

  if (!skill) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <FileText className="mx-auto h-12 w-12 text-text-muted/50" />
          <p className="mt-3 text-sm text-text-muted">Select a skill to view details</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-b border-border p-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-text-primary">{skill.metadata.name}</h2>
          <ScopeBadge scope={skill.scope} />
        </div>
        <p className="mt-1 text-xs font-mono text-text-muted truncate">{skill.canonicalPath}</p>
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-1 border-b border-border px-6 py-2">
        <ActionButton icon={<ClipboardCopy className="h-3.5 w-3.5" />} label="Copy Path" onClick={handleCopyPath} />
        <ActionButton icon={<FolderOpen className="h-3.5 w-3.5" />} label="Reveal in Finder" onClick={handleRevealInFinder} />
        <ActionButton icon={<Pencil className="h-3.5 w-3.5" />} label="Edit" onClick={() => setEditingSkillId(skill.id)} />
        <ActionButton
          icon={<Trash2 className="h-3.5 w-3.5" />}
          label="Delete"
          variant="danger"
          onClick={() => setShowDeleteConfirm(true)}
        />
      </div>

      {/* Update Section */}
      {skill.lockEntry && (
        <div className="flex items-center gap-3 border-b border-border px-6 py-3">
          {skill.hasUpdate && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning">
              <ArrowUpCircle className="h-3.5 w-3.5" />
              Update Available
            </span>
          )}
          {skill.hasUpdate && (
            <button
              onClick={handleUpdate}
              disabled={updateSkill.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {updateSkill.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowUpCircle className="h-3.5 w-3.5" />
              )}
              Update
            </button>
          )}
          <button
            onClick={handleCheckUpdate}
            disabled={checkUpdate.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-hover disabled:opacity-50 transition-colors"
          >
            {checkUpdate.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Check for Update
          </button>
        </div>
      )}

      {/* Agent Assignment */}
      <div className="border-b border-border px-6 py-4">
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-text-secondary">
          Agent Assignment
        </h3>
        <div className="space-y-2">
          {agents?.map((agent: Agent) => {
            const { status, isInherited } = getAgentStatusForSkill(skill, agent.type)
            const presentation = getAgentStatePresentation(status)

            return (
              <div key={agent.type} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-bg-hover transition-colors">
                <div className="flex items-center gap-2.5">
                  <span className={cn('text-sm font-medium', AGENT_COLORS[agent.type] ?? 'text-text-primary')}>
                    {agent.displayName}
                  </span>
                  <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium', presentation.color, presentation.bgColor)}>
                    {presentation.label}
                  </span>
                  {isInherited && (
                    <span className="text-[10px] text-text-muted">(inherited)</span>
                  )}
                </div>
                <div className="flex gap-1.5">
                  {!isInherited && status === null && (
                    <button
                      onClick={() => handleAssign(agent.type)}
                      disabled={assignSkill.isPending}
                      className="rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
                    >
                      Assign
                    </button>
                  )}
                  {!isInherited && status === 'linked' && (
                    <button
                      onClick={() => handleUnassign(agent.type)}
                      disabled={unassignSkill.isPending}
                      className="rounded-md px-2.5 py-1 text-[11px] font-medium text-text-secondary hover:bg-bg-hover disabled:opacity-50 transition-colors"
                    >
                      Unassign
                    </button>
                  )}
                  {!isInherited && status === 'installed' && (
                    <button
                      onClick={() => handleRemoveLocal(agent.type)}
                      disabled={removeLocal.isPending}
                      className="rounded-md px-2.5 py-1 text-[11px] font-medium text-error hover:bg-error/15 disabled:opacity-50 transition-colors"
                    >
                      Remove Local
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Documentation */}
      {skill.markdownBody && (
        <div className="flex-1 px-6 py-4">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-text-secondary">
            Documentation
          </h3>
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{skill.markdownBody}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-96 rounded-xl bg-bg-secondary border border-border p-6 shadow-xl">
            <h3 className="text-base font-semibold text-text-primary">Delete Skill</h3>
            <p className="mt-2 text-sm text-text-secondary">
              Are you sure you want to delete "{skill.metadata.name}"? This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={removeLocal.isPending}
                className="rounded-lg bg-error px-4 py-2 text-sm font-medium text-white hover:bg-error/80 disabled:opacity-50 transition-colors"
              >
                {removeLocal.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
