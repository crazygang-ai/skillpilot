import { cn } from '@/lib/utils'

const BRAND_COLORS: Record<string, string> = {
  claude: '#d97706',
  codex: '#16a34a',
  gemini: '#2563eb',
  copilot: '#4f46e5',
  opencode: '#dc2626',
  antigravity: '#9333ea',
  cursor: '#0891b2',
  kiro: '#db2777',
  codebuddy: '#ea580c',
  openclaw: '#0d9488',
  trae: '#7c3aed',
}

interface AgentIconProps {
  agentType: string
  size?: number
  className?: string
}

export default function AgentIcon({ agentType, size = 16, className }: AgentIconProps) {
  const color = BRAND_COLORS[agentType] ?? '#71717a'
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
