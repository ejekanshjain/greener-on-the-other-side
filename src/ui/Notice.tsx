'use client'

import { FENCE, PATIO, PEEK } from '../scenes/layout'
import type { Line, RoomSession } from '../net/session'
import { useStore } from '../shared/store'
import type { DesignBox } from './RoomScreen'

/**
 * The game's lines of text. A new player's tip sits on the fence, its bottom edge on the
 * lawn's top edge, so it never covers the lawn. Toasts, and a tip whose object sits
 * behind the fence line, use the strip under the patio's props. Round 1's shed banner
 * covers the peek strip. Presses pass through all three, and screen readers hear each
 * from its polite status region, the banner as its full sentence. `raised` moves the
 * patio strip up onto the patio's top edge, over the yard's panel.
 */
export function Notice({
  session,
  box,
  raised = false
}: {
  session: RoomSession
  box: DesignBox
  raised?: boolean
}) {
  const tip = useStore(session.hud, s => s.tip)
  const toast = useStore(session.hud, s => s.toast)
  const banner = useStore(session.hud, s => s.banner)
  if (box.scale === 0) return null
  const width = 680 * box.scale
  // The patio strip shows the toast, or a tip moved there while no toast shows.
  const patio = toast ?? (tip?.spot === 'patio' ? tip : null)
  const fence = tip?.spot === 'fence' ? tip : null
  return (
    <>
      <div
        role="status"
        className="pointer-events-none fixed z-10 flex items-center justify-center px-3"
        style={{
          left: box.left,
          width,
          top: box.top + PEEK.y * box.scale,
          height: PEEK.h * box.scale
        }}
      >
        {banner && (
          <>
            <p
              key={banner.key}
              data-testid="shed-banner"
              aria-hidden
              className="max-w-full animate-pop-in rounded-sketch border-[3px] border-ink bg-marker-yellow px-3 text-center font-hand text-lg leading-tight whitespace-nowrap text-ink shadow-[3px_4px_0_rgb(34_34_34/0.3)] sm:text-xl"
            >
              {banner.text}
            </p>
            <span className="sr-only">{banner.spoken}</span>
          </>
        )}
      </div>
      <div
        role="status"
        className="pointer-events-none fixed z-10 flex -translate-y-full justify-center px-3"
        style={{
          left: box.left,
          width,
          top: box.top + (FENCE.y + FENCE.h) * box.scale
        }}
      >
        {fence && <TipLine line={fence} testId="tip" kind="tip" />}
      </div>
      <div
        role="status"
        className={`pointer-events-none fixed z-10 flex justify-center px-3 ${raised ? '-translate-y-full pb-1' : 'bottom-[max(2px,env(safe-area-inset-bottom))]'}`}
        style={{
          left: box.left,
          width,
          top: raised ? box.top + PATIO.y * box.scale : undefined
        }}
      >
        {patio && (
          <TipLine
            line={patio}
            testId={patio === toast ? 'toast' : 'tip'}
            kind={patio === toast ? 'toast' : 'tip'}
          />
        )}
      </div>
    </>
  )
}

/** One line of text in the hand font: paper for a tip, yellow for a toast. */
function TipLine({
  line,
  testId,
  kind
}: {
  line: Line
  testId: string
  kind: 'tip' | 'toast'
}) {
  return (
    <p
      key={line.key}
      data-testid={testId}
      data-notice
      className={`max-w-full animate-pop-in rounded-sketch border-[3px] border-ink px-3 text-center font-hand text-lg leading-tight whitespace-nowrap text-ink shadow-[3px_4px_0_rgb(34_34_34/0.3)] sm:text-xl ${kind === 'toast' ? 'bg-marker-yellow' : 'bg-paper'}`}
    >
      {line.text}
    </p>
  )
}
