import { useState, useMemo } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useSkills } from '@/hooks/useSkills'
import { useAppStore } from '@/stores/appStore'
import { type OwnershipFilter, matchesOwnershipFilter } from './skill-ownership'
import ScopeBadge from '@/components/common/ScopeBadge'
import { AGENT_BG_COLORS } from '@/lib/agent-constants'
import type { AgentType } from '@/types'

export default function SkillList() {
  const { t } = useTranslation()
  const { data: skills, isLoading } = useSkills()
  const { selectedSkillId, setSelectedSkillId, selectedAgent, searchQuery, setSearchQuery } =
    useAppStore()
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>('all')

  const filteredSkills = useMemo(() => {
    if (!skills) return []
    return skills.filter((skill) => {
      if (selectedAgent && !skill.installations.some((i) => i.agentType === (selectedAgent as AgentType))) {
        return false
      }
      if (searchQuery && !skill.metadata.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }
      if (!matchesOwnershipFilter(skill, ownershipFilter)) {
        return false
      }
      return true
    })
  }, [skills, selectedAgent, searchQuery, ownershipFilter])

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder={t('skillList.searchPlaceholder')}
            className="w-full rounded-lg bg-bg-tertiary border border-border pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 px-3 pb-2">
        {([
          { label: t('skillList.filterAll'), value: 'all' as OwnershipFilter },
          { label: t('skillList.filterUser'), value: 'user' as OwnershipFilter },
          { label: t('skillList.filterBuiltin'), value: 'builtin' as OwnershipFilter },
        ]).map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setOwnershipFilter(value)}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-colors',
              ownershipFilter === value
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
        ) : !skills?.length ? (
          <p className="py-12 text-center text-sm text-text-muted">{t('skillList.noSkills')}</p>
        ) : filteredSkills.length === 0 ? (
          <p className="py-12 text-center text-sm text-text-muted">{t('skillList.noMatch')}</p>
        ) : (
          filteredSkills.map((skill) => (
            <button
              key={skill.id}
              onClick={() => setSelectedSkillId(skill.id)}
              className={cn(
                'w-full text-left px-3 py-2.5 border-l-[3px] border-transparent transition-colors hover:bg-bg-hover',
                selectedSkillId === skill.id && 'border-l-[3px] border-accent bg-bg-hover',
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary truncate">
                  {skill.metadata.name}
                </span>
                {skill.hasUpdate && (
                  <span className="h-2 w-2 rounded-full bg-warning flex-shrink-0" />
                )}
                <ScopeBadge scope={skill.scope} variant="subtle" />
              </div>
              <p className="mt-0.5 text-xs text-text-muted truncate">
                {skill.metadata.description || t('skillList.noDescription')}
              </p>
              <div className="mt-1 flex gap-1">
                {skill.installations.map((inst) => (
                  <span
                    key={inst.agentType}
                    className={cn('h-2 w-2 rounded-full', AGENT_BG_COLORS[inst.agentType] ?? 'bg-text-muted')}
                    title={inst.agentType}
                  />
                ))}
              </div>
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-3 py-2">
        <p className="text-xs text-text-muted">
          {t('skillList.skillCount', { count: filteredSkills.length })}
        </p>
      </div>
    </div>
  )
}
