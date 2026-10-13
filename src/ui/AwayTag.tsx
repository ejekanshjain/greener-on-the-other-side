import { cn } from '../shared/ui/cn'
import { COPY } from './copy'

/**
 * The yellow Away tag beside your neighbour's name once they go quiet: in the top bar,
 * on their lobby gate and on the match end.
 */
export function AwayTag({ className }: { className?: string }) {
  return (
    <span
      data-testid="away"
      className={cn(
        'shrink-0 rounded-sketch border-2 border-ink bg-marker-yellow px-1 font-hand text-sm leading-tight sm:text-base',
        className
      )}
    >
      {COPY.away}
    </span>
  )
}
