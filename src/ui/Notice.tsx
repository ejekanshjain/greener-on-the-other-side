'use client'

import type { RoomSession } from '../net/session'
import { useStore } from '../shared/store'
import type { DesignBox } from './RoomScreen'

/**
 * The one line along the bottom of the patio: a first-time tip or a toast such as the
 * empty can. It fits the strip under the patio's props in one line at every size, so it
 * never covers the lawn, the peek strip, the fence or the patio's tools.
 */
export function Notice({
  session,
  box
}: {
  session: RoomSession
  box: DesignBox
}) {
  const shown = useStore(session.hud, s => s.note)
  if (box.scale === 0) return null
  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-[max(4px,env(safe-area-inset-bottom))] z-10 flex justify-center px-3"
      style={{ left: box.left, width: 680 * box.scale }}
    >
      {shown && (
        <p
          key={shown.id}
          data-testid="notice"
          className={`max-w-full animate-pop-in rounded-sketch border-[3px] border-ink px-3 text-center font-hand text-[15px] leading-tight text-ink shadow-[3px_4px_0_rgb(34_34_34/0.3)] sm:py-0.5 sm:text-lg ${shown.kind === 'toast' ? 'bg-marker-yellow' : 'bg-paper'}`}
        >
          {shown.text}
        </p>
      )}
    </div>
  )
}
