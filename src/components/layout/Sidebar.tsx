import { Monitor, Globe, Package, Settings, RefreshCw, ArrowUpCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/stores/appStore'
import { useAgents } from '@/hooks/useAgents'
import { useCheckAllUpdates } from '@/hooks/useSkills'
import { cn } from '@/lib/utils'
import { AgentIcon } from '@/components/common/AgentIcon'
import Tooltip from '@/components/common/Tooltip'
import AddSkillButton from '@/components/install/AddSkillButton'
import UpdateNotifier from '@/components/updater/UpdateNotifier'
import type { AgentType, ViewType } from '@/types'

export default function Sidebar() {
  const { t } = useTranslation()
  const { currentView, setCurrentView, selectedAgent, setSelectedAgent } = useAppStore()
  const { data: agents, isFetching, refetch } = useAgents()
  const checkAllUpdates = useCheckAllUpdates()

  const navItems: { view: ViewType; label: string; icon: React.ReactNode }[] = [
    { view: 'dashboard', label: t('sidebar.dashboard'), icon: <Monitor size={18} /> },
    { view: 'registry', label: t('sidebar.skillsSh'), icon: <Globe size={18} /> },
    { view: 'clawhub', label: t('sidebar.clawHub'), icon: <Package size={18} /> },
    { view: 'settings', label: t('sidebar.settings'), icon: <Settings size={18} /> },
  ]

  return (
    <div className="w-56 h-full bg-bg-secondary border-r border-border flex flex-col" data-testid="sidebar">
      {/* Title Bar: drag region for macOS traffic lights */}
      <div className="drag-region flex-shrink-0 pt-12 pb-3 px-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-base text-text-primary tracking-tight no-drag select-none">
            SkillPilot
          </span>
          <div className="flex items-center gap-1">
            <Tooltip label={t('sidebar.checkAllUpdates')}>
              <button
                onClick={() => checkAllUpdates.mutate()}
                disabled={checkAllUpdates.isPending}
                className={cn(
                  'no-drag rounded-md p-1.5 text-text-muted transition-colors',
                  checkAllUpdates.isPending
                    ? 'cursor-wait bg-bg-tertiary text-accent'
                    : 'hover:bg-bg-hover hover:text-text-primary',
                )}
                aria-label={t('sidebar.checkAllUpdates')}
              >
                <ArrowUpCircle size={15} className={cn(checkAllUpdates.isPending && 'animate-pulse')} />
              </button>
            </Tooltip>
            <Tooltip label={t('sidebar.refresh')}>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className={cn(
                  'no-drag rounded-md p-1.5 text-text-muted transition-colors',
                  isFetching
                    ? 'cursor-wait bg-bg-tertiary text-text-primary'
                    : 'hover:bg-bg-hover hover:text-text-primary',
                )}
                aria-label={t('sidebar.refresh')}
              >
                <RefreshCw size={14} className={cn(isFetching && 'animate-spin')} />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Navigation */}
        <nav className="flex-shrink-0 py-4 px-3 space-y-1 border-b border-border">
          {navItems.map(({ view, label, icon }) => (
            <button
              key={view}
              data-testid={`nav-${view}`}
              onClick={() => {
                setCurrentView(view)
                if (view !== 'dashboard') setSelectedAgent(null)
              }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium no-drag transition-colors',
                currentView === view && selectedAgent === null && view !== 'dashboard'
                  ? 'bg-accent text-white shadow-sm'
                  : currentView === view && view === 'dashboard' && selectedAgent === null
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-text-secondary hover:bg-bg-hover',
              )}
            >
              {icon}
              <span className="flex-1 text-left">{label}</span>
            </button>
          ))}
        </nav>

        {/* Agents List */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex-shrink-0 px-4 pt-4 pb-2">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              {t('sidebar.allAgents')}
            </span>
          </div>

          {/* Individual agent buttons — installed first */}
          <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
            {[...(agents ?? [])].sort((a, b) => {
              if (a.isInstalled === b.isInstalled) return 0
              return a.isInstalled ? -1 : 1
            }).map((agent) => (
              <button
                key={agent.type}
                onClick={() => {
                  setSelectedAgent(agent.type as AgentType)
                  setCurrentView('dashboard')
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors no-drag',
                  selectedAgent === agent.type
                    ? 'bg-bg-hover text-text-primary'
                    : 'text-text-secondary hover:bg-bg-hover',
                  !agent.isInstalled && 'opacity-50 cursor-not-allowed',
                )}
                disabled={!agent.isInstalled}
              >
                <AgentIcon agentType={agent.type} size={16} />
                <span className="flex-1 text-left truncate">{agent.displayName}</span>
                <span className="text-xs font-semibold text-text-muted flex-shrink-0 ml-2">
                  {agent.skillCount}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom: Update Notifier + Add Skill */}
      <div className="flex-shrink-0 border-t border-border">
        <UpdateNotifier />
        <div className="px-3 py-2.5 flex justify-end">
          <AddSkillButton />
        </div>
      </div>
    </div>
  )
}
