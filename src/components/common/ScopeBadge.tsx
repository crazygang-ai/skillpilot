import { cn } from '@/lib/utils'
import type { SkillScope } from '@/types'

interface ScopeBadgeProps {
  scope: SkillScope
}

export default function ScopeBadge({ scope }: ScopeBadgeProps) {
  const config = {
    sharedGlobal: { label: 'Global', classes: 'bg-success/10 text-success' },
    agentLocal: { label: scope.kind === 'agentLocal' ? scope.agentType : '', classes: 'bg-blue-600/10 text-blue-600' },
    project: { label: 'Project', classes: 'bg-purple-600/10 text-purple-600' },
  }

  const { label, classes } = config[scope.kind]

  return (
    <span
      className={cn(
        'inline-block rounded-full px-2 py-0.5 text-[10px] font-medium leading-tight',
        classes,
      )}
    >
      {label}
    </span>
  )
}
