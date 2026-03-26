import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Search,
  Loader2,
  Download,
  Star,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useClawHubSkills,
  useClawHubDetail,
  useClawHubContent,
} from '@/hooks/useRegistry'
import { useInstallSkill } from '@/hooks/useSkills'
import { useAgents } from '@/hooks/useAgents'
import { useNotificationStore } from '@/stores/notificationStore'
import type { AgentType } from '@/types'

type SortMode = 'downloads' | 'stars' | 'newest'

const SORT_TABS: { label: string; value: SortMode }[] = [
  { label: 'Downloads', value: 'downloads' },
  { label: 'Stars', value: 'stars' },
  { label: 'Newest', value: 'newest' },
]

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export default function ClawHubBrowser() {
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('downloads')
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [selectedAgents, setSelectedAgents] = useState<AgentType[]>([])

  const { data: agents } = useAgents()
  const installSkill = useInstallSkill()
  const addNotification = useNotificationStore((s) => s.addNotification)

  // 350ms debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 350)
    return () => clearTimeout(timer)
  }, [searchInput])

  const { data: skills = [], isLoading } = useClawHubSkills(debouncedQuery, sortMode)
  const { data: detail } = useClawHubDetail(selectedSlug)
  const { data: skillContent } = useClawHubContent(selectedSlug)

  const selected = useMemo(
    () => skills.find((s) => s.slug === selectedSlug) ?? null,
    [skills, selectedSlug],
  )

  const handleInstall = useCallback(() => {
    if (!selected || selectedAgents.length === 0) return
    installSkill.mutate(
      {
        repoUrl: selected.slug,
        agentTypes: selectedAgents,
        source: 'clawhub',
        slug: selected.slug,
        version: selected.latestVersion,
      },
      {
        onSuccess: (result) => {
          if (result.success) {
            addNotification('success', `Installed "${selected.displayName}"`)
          } else {
            addNotification('error', result.error ?? 'Installation failed')
          }
        },
        onError: (err) => addNotification('error', err.message),
      },
    )
  }, [selected, selectedAgents, installSkill, addNotification])

  const toggleAgent = useCallback((agentType: AgentType) => {
    setSelectedAgents((prev) =>
      prev.includes(agentType) ? prev.filter((a) => a !== agentType) : [...prev, agentType],
    )
  }, [])

  return (
    <div className="flex h-full">
      {/* Left: List */}
      <div className="flex w-96 flex-col border-r border-border">
        {/* Search */}
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search ClawHub..."
              className="w-full rounded-lg bg-bg-tertiary border border-border pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>

        {/* Sort Tabs */}
        <div className="flex gap-1 px-3 pb-2">
          {SORT_TABS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setSortMode(value)}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition-colors',
                sortMode === value
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:bg-bg-hover',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Skill List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
            </div>
          ) : skills.length === 0 ? (
            <p className="py-12 text-center text-sm text-text-muted">
              {debouncedQuery ? 'No results found' : 'No skills available'}
            </p>
          ) : (
            skills.map((skill) => (
              <button
                key={skill.slug}
                onClick={() => setSelectedSlug(skill.slug)}
                className={cn(
                  'w-full text-left px-3 py-2.5 border-l-[3px] border-transparent transition-colors hover:bg-bg-hover',
                  selectedSlug === skill.slug && 'border-accent bg-bg-hover',
                )}
              >
                <span className="text-sm font-medium text-text-primary truncate block">
                  {skill.displayName}
                </span>
                <p className="mt-0.5 text-xs text-text-muted truncate">{skill.summary}</p>
                <div className="mt-1 flex items-center gap-3 text-xs text-text-muted">
                  <span className="flex items-center gap-0.5">
                    <Download className="h-3 w-3" />
                    {formatCount(skill.downloads)}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Star className="h-3 w-3" />
                    {formatCount(skill.stars)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: Detail */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!selected ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-text-muted">Select a skill to view details</p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 border-b border-border p-6">
              <h2 className="text-xl font-semibold text-text-primary">{selected.displayName}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-text-secondary">
                <span className="flex items-center gap-1">
                  <Download className="h-4 w-4" />
                  {formatCount(selected.downloads)} downloads
                </span>
                <span className="flex items-center gap-1">
                  <Star className="h-4 w-4" />
                  {formatCount(selected.stars)} stars
                </span>
                <a
                  href={`https://clawhub.ai/${selected.ownerHandle ?? ''}/${selected.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-accent hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  ClawHub
                </a>
              </div>

              {/* Moderation Badges */}
              {detail?.moderationVerdict && (
                <div className="mt-3 flex items-center gap-2">
                  {detail.moderationVerdict === 'approved' ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Approved
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      {detail.moderationVerdict}
                    </span>
                  )}
                  {detail.moderationSummary && (
                    <span className="text-xs text-text-muted">{detail.moderationSummary}</span>
                  )}
                </div>
              )}
            </div>

            {/* SKILL.md Documentation */}
            <div className="min-h-0 flex-1 overflow-y-auto border-b border-border">
              {skillContent ? (
                skillContent.startsWith('<!-- HTML -->') ? (
                  <div
                    className="markdown-body p-6"
                    dangerouslySetInnerHTML={{ __html: skillContent.slice(13) }}
                  />
                ) : (
                  <div className="markdown-body p-6 whitespace-pre-wrap text-sm">
                    {skillContent}
                  </div>
                )
              ) : (
                <p className="px-6 py-12 text-center text-sm text-text-muted">
                  No documentation available
                </p>
              )}
            </div>

            {/* Agent Selector + Install */}
            <div className="flex-shrink-0 border-t border-border px-6 py-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
                Install to Agents
              </h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {agents
                  ?.filter((a) => a.isInstalled)
                  .map((agent) => (
                    <button
                      key={agent.type}
                      onClick={() => toggleAgent(agent.type)}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-xs font-medium border transition-colors',
                        selectedAgents.includes(agent.type)
                          ? 'border-accent bg-accent/15 text-accent'
                          : 'border-border text-text-secondary hover:bg-bg-hover',
                      )}
                    >
                      {agent.displayName}
                    </button>
                  ))}
              </div>
              <button
                onClick={handleInstall}
                disabled={installSkill.isPending || selectedAgents.length === 0}
                className="w-full rounded-lg bg-accent py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {installSkill.isPending ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  'Install'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
