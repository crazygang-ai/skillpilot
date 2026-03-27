import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAgents } from '@/hooks/useAgents'

interface AgentSelectorProps {
  selected: string[]
  onChange: (selected: string[]) => void
}

export default function AgentSelector({ selected, onChange }: AgentSelectorProps) {
  const { t } = useTranslation()
  const { data: agents } = useAgents()

  const installed = agents?.filter((a) => a.isInstalled) ?? []

  function toggle(agentType: string) {
    if (selected.includes(agentType)) {
      onChange(selected.filter((t) => t !== agentType))
    } else {
      onChange([...selected, agentType])
    }
  }

  if (installed.length === 0) {
    return (
      <p className="text-sm text-text-muted py-2">{t('install.noAgentsDetected')}</p>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {installed.map((agent) => {
        const active = selected.includes(agent.type)
        return (
          <button
            key={agent.type}
            onClick={() => toggle(agent.type)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors',
              active
                ? 'bg-accent/20 border-accent text-text-primary'
                : 'bg-bg-tertiary border-border text-text-secondary hover:border-border-light',
            )}
          >
            <span>{agent.displayName}</span>
            {active && <Check className="w-3.5 h-3.5 text-accent" />}
          </button>
        )
      })}
    </div>
  )
}
