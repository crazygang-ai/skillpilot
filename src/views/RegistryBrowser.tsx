import { useState, useMemo, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Search,
  Loader2,
  Download,
  ExternalLink,
  Globe,
  Flame,
  TrendingUp,
  Trophy,
  Copy,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useRegistryLeaderboard,
  useRegistrySearch,
  useContentFetch,
} from '@/hooks/useRegistry'
import { useInstallSkill } from '@/hooks/useSkills'
import { useAgents } from '@/hooks/useAgents'
import { useNotificationStore } from '@/stores/notificationStore'
import SafeRemoteContent from '@/components/registry/SafeRemoteContent'
import type { RegistrySkill, LeaderboardCategory, AgentType } from '@/types'

function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.floor(n / 1_000).toLocaleString()}K`
  return n.toLocaleString()
}

export default function RegistryBrowser() {
  const { t } = useTranslation()
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [category, setCategory] = useState<LeaderboardCategory>('allTime')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedAgents, setSelectedAgents] = useState<AgentType[]>([])

  const { data: agents } = useAgents()
  const installSkill = useInstallSkill()
  const addNotification = useNotificationStore((s) => s.addNotification)
  const categoryTabs: { label: string; value: LeaderboardCategory; icon: React.ReactNode }[] = [
    { label: t('registry.allTime'), value: 'allTime', icon: <Trophy className="h-3.5 w-3.5" /> },
    { label: t('registry.trending24h'), value: 'trending', icon: <TrendingUp className="h-3.5 w-3.5" /> },
    { label: t('registry.hot'), value: 'hot', icon: <Flame className="h-3.5 w-3.5" /> },
  ]

  // 300ms debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const leaderboard = useRegistryLeaderboard(category)
  const searchResults = useRegistrySearch(debouncedQuery)

  const isSearching = debouncedQuery.length > 0
  const skills: RegistrySkill[] = isSearching
    ? (searchResults.data ?? [])
    : (leaderboard.data?.skills ?? [])
  const totalCount = leaderboard.data?.totalCount ?? 0
  const isLoading = isSearching ? searchResults.isLoading : leaderboard.isLoading

  const selected = useMemo(
    () => skills.find((s) => s.id === selectedId) ?? null,
    [skills, selectedId],
  )

  const { data: skillContent, isLoading: isContentLoading } = useContentFetch(
    selected?.source,
    selected?.skillId,
  )

  const installCommand = selected
    ? `npx skills add https://github.com/${selected.source} --skill ${selected.skillId}`
    : ''

  const handleCopyCommand = useCallback(() => {
    if (!installCommand) return
    navigator.clipboard.writeText(installCommand)
    addNotification('success', t('registry.commandCopied'))
  }, [installCommand, addNotification, t])

  const handleInstall = useCallback(() => {
    if (!selected || selectedAgents.length === 0) return
    installSkill.mutate(
      {
        repoUrl: `https://github.com/${selected.source}`,
        agentTypes: selectedAgents,
        source: 'github',
        skillId: selected.skillId,
      },
      {
        onSuccess: (result) => {
          if (result.success) {
            addNotification(
              'success',
              t('registry.installSuccess', {
                name: selected.name,
                count: result.skillCount ?? 0,
              }),
            )
          } else {
            addNotification('error', result.error ?? t('registry.installFailed'))
          }
        },
        onError: (err) => addNotification('error', err.message),
      },
    )
  }, [selected, selectedAgents, installSkill, addNotification, t])

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
              placeholder={t('registry.searchPlaceholder')}
              className="w-full rounded-lg bg-bg-tertiary border border-border pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>

        {/* Category Tabs */}
        {!isSearching && (
          <div className="flex gap-1 px-3 pb-2">
            {categoryTabs.map(({ label, value, icon }) => (
              <button
                key={value}
                onClick={() => setCategory(value)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  category === value
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:bg-bg-hover',
                )}
              >
                {icon}
                {label}
                {category === value && totalCount > 0 && (
                  <span className="ml-0.5 opacity-75">({formatCount(totalCount)})</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Skill List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
            </div>
          ) : skills.length === 0 ? (
            <p className="py-12 text-center text-sm text-text-muted">
              {isSearching ? t('registry.noSkillsFound') : t('registry.noSkillsAvailable')}
            </p>
          ) : (
            skills.map((skill) => (
              <button
                key={skill.id}
                onClick={() => setSelectedId(skill.id)}
                className={cn(
                  'w-full text-left px-3 py-2.5 border-l-[3px] border-transparent transition-colors hover:bg-bg-hover',
                  selectedId === skill.id && 'border-accent bg-bg-hover',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-primary truncate">
                    {skill.name}
                  </span>
                  <span className="ml-2 flex-shrink-0 text-xs text-text-muted">
                    <Download className="inline h-3 w-3 mr-0.5" />
                    {formatInstalls(skill.installs)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-text-muted truncate">{skill.source}</p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: Detail */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!selected ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-text-muted">{t('registry.selectSkill')}</p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Header */}
            <div className="border-b border-border p-6">
              <h2 className="text-xl font-semibold text-text-primary">{selected.name}</h2>
              <div className="mt-2 flex items-center gap-4 text-sm text-text-secondary">
                <span className="flex items-center gap-1">
                  <Download className="h-4 w-4" />
                  {formatInstalls(selected.installs)} {t('registry.installs')}
                </span>
                <a
                  href={`https://skills.sh/${selected.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-accent hover:underline"
                >
                  <Globe className="h-4 w-4" />
                  skills.sh
                </a>
                <a
                  href={`https://github.com/${selected.source}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-accent hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  {selected.source}
                </a>
              </div>
            </div>

            {/* Install Command */}
            <div className="border-b border-border px-6 py-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
                {t('registry.installViaCli')}
              </h3>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-bg-tertiary border border-border px-3 py-2 text-sm font-mono text-text-primary">
                  {installCommand}
                </code>
                <button
                  onClick={handleCopyCommand}
                  className="rounded-lg p-2 text-text-secondary hover:bg-bg-hover transition-colors"
                  title={t('common.copy')}
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* SKILL.md Documentation */}
            <div className="min-h-0 flex-1 overflow-y-auto border-b border-border">
              {isContentLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
                </div>
              ) : (
                <SafeRemoteContent content={skillContent} />
              )}
            </div>

            {/* Agent Selector + Install */}
            <div className="flex-shrink-0 border-t border-border px-6 py-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
                {t('registry.installToAgents')}
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
                  t('common.install')
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
