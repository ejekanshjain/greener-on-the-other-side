import { useChores, type Chore, type ChoreBoard } from '../chores'
import { cn } from './cn'
import { releaseFocusAfterPointer } from './focus'
import { Panel } from './Panel'

export interface ChoreListProps {
  board: ChoreBoard
  title?: string
  /** Shown when there are no open chores. */
  emptyText?: string
  /** Makes each chore a button, for example to walk to the chore. */
  onSelect?: (chore: Chore) => void
  className?: string
}

/**
 * Lists open chores from a chore board, oldest first.
 *
 * @example <ChoreList board={chores} onSelect={c => goTo(c.id)} />
 */
export function ChoreList({
  board,
  title = 'Chores',
  emptyText = 'No chores. Suspicious.',
  onSelect,
  className
}: ChoreListProps) {
  const chores = useChores(board)
  return (
    <Panel title={title} className={className}>
      {chores.length === 0 ? (
        <p className="font-hand text-lg text-ink-soft">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {chores.map((chore, i) => {
            const body = (
              <>
                <span
                  aria-hidden
                  className={cn(
                    'mt-1 size-5 shrink-0 rounded-sketch-alt border-[3px] border-ink bg-white',
                    i % 2 === 0 ? 'rotate-3' : '-rotate-2'
                  )}
                />
                <span className="flex flex-col text-left">
                  <span className="font-hand text-xl leading-tight">
                    {chore.label}
                  </span>
                  {chore.detail && (
                    <span className="font-hand text-base text-ink-soft">
                      {chore.detail}
                    </span>
                  )}
                </span>
              </>
            )
            return (
              <li key={chore.id}>
                {onSelect ? (
                  <button
                    type="button"
                    onClick={event => {
                      onSelect(chore)
                      releaseFocusAfterPointer(event)
                    }}
                    className="flex min-h-12 w-full items-start gap-3 rounded-sketch px-1 py-1 hover:bg-marker-yellow/30 focus-visible:outline-4 focus-visible:outline-marker-blue"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex items-start gap-3 px-1 py-1">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
