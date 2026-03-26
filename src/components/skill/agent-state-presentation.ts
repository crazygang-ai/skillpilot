import type { SkillAgentStatus } from '@/types'

export interface AgentStatePresentation {
  label: string
  color: string
  bgColor: string
  actionLabel?: string
  actionVariant?: 'primary' | 'danger' | 'ghost'
  secondaryActionLabel?: string
  secondaryActionVariant?: 'primary' | 'danger' | 'ghost'
  canAct: boolean
}

export function getAgentStatePresentation(
  agentState?: SkillAgentStatus | null,
): AgentStatePresentation {
  switch (agentState) {
    case 'linked':
      return {
        label: 'Linked',
        color: 'text-success',
        bgColor: 'bg-success/15',
        actionLabel: 'Unassign',
        actionVariant: 'ghost',
        canAct: true,
      }
    case 'installed':
      return {
        label: 'Installed',
        color: 'text-accent',
        bgColor: 'bg-accent/15',
        actionLabel: 'Remove Local',
        actionVariant: 'danger',
        canAct: true,
      }
    case 'builtin':
      return {
        label: 'Builtin',
        color: 'text-text-muted',
        bgColor: 'bg-text-muted/15',
        canAct: false,
      }
    default:
      return {
        label: 'Not Assigned',
        color: 'text-text-secondary',
        bgColor: 'bg-transparent',
        actionLabel: 'Assign',
        actionVariant: 'primary',
        canAct: true,
      }
  }
}
