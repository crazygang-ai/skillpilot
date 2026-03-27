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
        label: 'skillDetail.linked',
        color: 'text-success',
        bgColor: 'bg-success/15',
        actionLabel: 'skillDetail.unassign',
        actionVariant: 'ghost',
        canAct: true,
      }
    case 'installed':
      return {
        label: 'skillDetail.installed',
        color: 'text-accent',
        bgColor: 'bg-accent/15',
        actionLabel: 'skillDetail.removeLocal',
        actionVariant: 'danger',
        canAct: true,
      }
    case 'builtin':
      return {
        label: 'skillDetail.builtin',
        color: 'text-text-muted',
        bgColor: 'bg-text-muted/15',
        canAct: false,
      }
    default:
      return {
        label: 'skillDetail.notAssigned',
        color: 'text-text-secondary',
        bgColor: 'bg-transparent',
        actionLabel: 'skillDetail.assign',
        actionVariant: 'primary',
        canAct: true,
      }
  }
}
