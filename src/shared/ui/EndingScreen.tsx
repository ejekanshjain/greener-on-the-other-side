import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { endSession, restartGame } from '../lifecycle'
import type { ShareCardInput, ShareStat } from '../share'
import { Button } from './Button'
import { cn } from './cn'
import { useDialog } from './dialog'
import { Panel } from './Panel'
import { ShareCardButton } from './ShareModal'

export interface EndingScreenProps {
  title: string
  /** The ending story. */
  children?: ReactNode
  stats?: readonly ShareStat[]
  /**
   * Adds a Share button with this card and message. `title` heads its share dialog,
   * which otherwise reads "Share Your Shame".
   */
  share?: { card: ShareCardInput; text: string; title?: string }
  /** Defaults to `restartGame`, which reloads the page without the leave prompt. */
  onRestart?: () => void
  restartLabel?: string
  className?: string
}

/**
 * The final screen: title, story, stats, Share and Play Again, as a dialog over the game.
 * Opening it ends the session: the screen may sleep again and leave warnings go quiet.
 *
 * @example <EndingScreen title="It Holds." stats={[{ label: 'Time', value: '1:12:40' }]} share={...}>Your uncle...</EndingScreen>
 */
export function EndingScreen({
  title,
  children,
  stats,
  share,
  onRestart = restartGame,
  restartLabel = 'Play Again',
  className
}: EndingScreenProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const trapTab = useDialog(true, dialogRef)

  useEffect(() => endSession(), [])

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-paper/80 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-ink',
        className
      )}
    >
      <Panel
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapTab}
        className="m-auto flex w-full max-w-lg animate-pop-in flex-col gap-4 text-center outline-none"
      >
        <h1
          id={titleId}
          className="-rotate-2 font-marker text-5xl leading-none"
        >
          {title}
        </h1>
        {children && (
          <div className="font-hand text-xl leading-snug">{children}</div>
        )}
        {stats && stats.length > 0 && (
          <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-left font-hand text-xl">
            {stats.map(stat => (
              <div key={stat.label} className="contents">
                <dt>{stat.label}</dt>
                <dd className="text-right font-marker text-marker-blue">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          {share && (
            <ShareCardButton
              card={share.card}
              text={share.text}
              title={share.title}
            />
          )}
          <Button variant="ghost" onClick={() => onRestart()}>
            {restartLabel}
          </Button>
        </div>
      </Panel>
    </div>,
    document.body
  )
}
