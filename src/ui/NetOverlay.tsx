'use client'

import type { RoomSession } from '../net/session'
import { LiveText } from '../shared/ui/Meter'
import type { DevMeters } from './RoomScreen'

/** The frame line refreshes this often, since reading the meter sorts its samples. */
const FRAME_LINE_MS = 500

/**
 * The `?debug` readout: transport, clock, send rate and peak, sizes, drops, and each
 * frame's work over the last 10s with React commits, for checking a real phone.
 */
export function NetOverlay({
  session,
  meters
}: {
  session: RoomSession
  meters: DevMeters
}) {
  let frameLine = ''
  let frameAt = -Infinity
  const read = () => {
    const now = session.clock.now()
    if (now - frameAt >= FRAME_LINE_MS) {
      frameAt = now
      const frame = meters.frame.read()
      frameLine = `frame p95 ${frame.p95.toFixed(1)} ms | worst ${frame.max.toFixed(1)} ms | commits ${meters.commits}`
    }
    const stats = session.outbox.stats
    const perSecond = stats.recent.filter(t => t > now - 1000).length
    const drops = Object.entries(session.filter.drops)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k} ${n}`)
      .join(', ')
    return [
      `${session.net?.kind ?? 'none'} ${session.net?.status() ?? ''} | ${session.room.admission}`,
      `offset ${Math.round(session.clock.offset)} ms | rtt ${Number.isFinite(session.clock.bestRtt) ? Math.round(session.clock.bestRtt) : '-'} ms${session.clock.rough ? ' rough' : ''}`,
      `sent ${stats.bundles} | ${perSecond}/s, peak ${stats.peakPerSecond} | largest ${stats.largest} B | expired ${stats.expired}`,
      `got ${session.received.bundles} | bad ${session.received.bad} | ignored ${session.received.ignored}`,
      `drops ${drops || 'none'}`,
      frameLine
    ].join('\n')
  }
  return (
    <LiveText
      read={read}
      className="pointer-events-none fixed right-2 bottom-2 z-50 rounded bg-black/70 p-2 font-mono text-[11px] leading-tight whitespace-pre text-white"
    />
  )
}
