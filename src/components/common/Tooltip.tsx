import { cn } from '@/lib/utils'

interface TooltipProps {
  label: string
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export default function Tooltip({ label, children, position = 'bottom' }: TooltipProps) {
  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  }

  return (
    <div className="relative group/tooltip">
      {children}
      <div
        className={cn(
          'absolute z-50 pointer-events-none',
          'px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap',
          'bg-text-primary text-bg opacity-0 scale-95',
          'transition-all duration-150 ease-out',
          'group-hover/tooltip:opacity-100 group-hover/tooltip:scale-100',
          positionClasses[position],
        )}
        role="tooltip"
      >
        {label}
      </div>
    </div>
  )
}
