'use client'

import { COPY } from './copy'
import type { DesignBox } from './RoomScreen'

/**
 * The "Reconnecting…" banner while your own connection is down. It takes the tip line's
 * place along the patio's bottom edge, under the patio's props, so the mower, the bag and
 * the compost stay in sight. Presses pass through it and the garden keeps running.
 */
export function Reconnecting({ box }: { box: DesignBox }) {
  if (box.scale === 0) return null
  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-[max(4px,env(safe-area-inset-bottom))] z-20 flex justify-center px-3"
      style={{ left: box.left, width: 680 * box.scale }}
    >
      <p
        data-testid="reconnecting"
        className="animate-pop-in rounded-sketch border-[3px] border-ink bg-marker-yellow px-3 font-marker text-base leading-tight text-ink shadow-[3px_4px_0_rgb(34_34_34/0.3)] sm:py-0.5 sm:text-xl"
      >
        {COPY.reconnecting}
      </p>
    </div>
  )
}
