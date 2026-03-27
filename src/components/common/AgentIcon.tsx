import { cn } from '@/lib/utils'
import { AGENT_BRAND_COLORS } from '@/lib/agent-constants'

interface AgentIconProps {
  agentType: string
  size?: number
  className?: string
}

export default function AgentIcon({ agentType, size = 16, className }: AgentIconProps) {
  const color = AGENT_BRAND_COLORS[agentType] ?? '#71717a'
  const letter = agentType.charAt(0).toUpperCase()

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full flex-shrink-0 text-white font-semibold select-none',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        backgroundColor: color,
      }}
    >
      {letter}
    </span>
  )
}

export { AgentIcon }
