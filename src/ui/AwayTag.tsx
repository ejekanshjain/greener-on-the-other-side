import { cn } from '../shared/ui/cn'
import { COPY } from './copy'

/** A small yellow tag beside a name. */
function Tag({
  text,
  testId,
  className
}: {
  text: string
  testId: string
  className?: string
}) {
  return (
    <span
      data-testid={testId}
      className={cn(
        'shrink-0 rounded-sketch border-2 border-ink bg-marker-yellow px-1 font-hand text-sm leading-tight sm:text-base',
        className
      )}
    >
      {text}
    </span>
  )
}

/**
 * The yellow Away tag beside your neighbour's name once they go quiet: in the top bar,
 * on their lobby gate and on the match end.
 */
export function AwayTag({ className }: { className?: string }) {
  return <Tag text={COPY.away} testId="away" className={className} />
}

/** First Match on a new neighbour's lobby gate, so you know a beginner is coming. */
export function FirstMatchTag() {
  return <Tag text={COPY.firstMatch} testId="first-match" />
}
