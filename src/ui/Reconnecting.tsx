'use client'

import { PATIO } from '../scenes/layout'
import { COPY } from './copy'
import type { DesignBox } from './RoomScreen'

/**
 * The "Reconnecting…" banner while your own connection is down. It takes the tip line's
 * place along the patio's bottom edge, under the patio's props, so the mower, the bag and
 * the compost stay in sight. Presses pass through it and the garden keeps running.
 * `raised` sits it on the patio's top edge instead, over the yard's panel.
 */
export function Reconnecting({
  box,
  raised = false
}: {
  box: DesignBox
  raised?: boolean
}) {
  if (box.scale === 0) return null
  return (
    <div
      role="status"
      className={`pointer-events-none fixed z-20 flex justify-center px-3 ${raised ? '-translate-y-full pb-1' : 'bottom-[max(4px,env(safe-area-inset-bottom))]'}`}
      style={{
        left: box.left,
        width: 680 * box.scale,
        top: raised ? box.top + PATIO.y * box.scale : undefined
      }}
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
