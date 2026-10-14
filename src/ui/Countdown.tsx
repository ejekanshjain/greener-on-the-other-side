'use client'

import { useEffect, useRef } from 'react'

import { revealMoment, type RevealTimings } from '../game/reveal'
import { ROUND_BANNERS } from '../game/tips'
import type { RoomSession } from '../net/session'

/** "Mow!" stays up this long after play starts. */
const MOW_MS = 800
/** A round's banner stays up this long into play, after its countdown. */
const BANNER_MS = 2500

/** True once a reveal is past "Time's up." and Brenda's board is due. */
export function pastTimesUp(
  phase: ReturnType<RoomSession['phase']>,
  timings: RevealTimings | null
): boolean {
  return (
    phase?.kind === 'reveal' &&
    !!timings &&
    revealMoment(phase.elapsed, timings, phase.last).step !== 'timesUp'
  )
}

/**
 * The big centre caption for a match phase: "3, 2, 1, Mow!", then "Time's up." and
 * "Brenda is judging." until her verdict (`judged`) is in.
 */
export function countdownText(
  phase: ReturnType<RoomSession['phase']>,
  timings: RevealTimings | null,
  judged = false
): string {
  if (!phase) return ''
  if (phase.kind === 'countdown') return String(Math.ceil(phase.msLeft / 1000))
  if (phase.kind === 'play' && phase.elapsed < MOW_MS) return 'Mow!'
  if (phase.kind === 'reveal') {
    if (!pastTimesUp(phase, timings)) return "Time's up."
    return judged ? '' : 'Brenda is judging.'
  }
  return ''
}

/** The banner announcing what's new in a round, over its countdown and first 2.5s of play. */
export function roundBanner(
  phase: ReturnType<RoomSession['phase']>
): (typeof ROUND_BANNERS)[number] {
  if (!phase) return null
  if (
    phase.kind === 'countdown' ||
    (phase.kind === 'play' && phase.elapsed < BANNER_MS)
  )
    return ROUND_BANNERS[phase.round] ?? null
  return null
}

/** What screen readers hear for a round banner: its title and line as one sentence. */
export function bannerSentence(
  banner: NonNullable<(typeof ROUND_BANNERS)[number]>
): string {
  return `${banner.title}. ${banner.line}`
}

/** Shows the countdown and round banners over the garden, updated every frame without re-rendering React. */
export function Countdown({ session }: { session: RoomSession }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const bannerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    const banner = bannerRef.current
    if (!el || !banner) return
    let shown = '\u0000'
    let shownBanner: (typeof ROUND_BANNERS)[number] | undefined
    let frame = requestAnimationFrame(function tick() {
      frame = requestAnimationFrame(tick)
      const phase = session.phase()
      const next = roundBanner(phase)
      if (next !== shownBanner) {
        shownBanner = next
        banner.hidden = next === null
        const [title, line, spoken] = banner.children
        if (title) title.textContent = next?.title ?? ''
        if (line) line.textContent = next?.line ?? ''
        if (spoken) spoken.textContent = next ? bannerSentence(next) : ''
      }
      const judged =
        phase?.kind === 'reveal' &&
        session.room.results.some(r => r.round === phase.round)
      const text = countdownText(phase, session.room.match, judged)
      if (text === shown) return
      shown = text
      el.textContent = text
      el.hidden = text === ''
      el.dataset.long = String(text.length > 4)
    })
    return () => cancelAnimationFrame(frame)
  }, [session])
  return (
    <>
      <p
        ref={ref}
        hidden
        data-testid="countdown"
        className="pointer-events-none absolute inset-x-4 top-1/2 -translate-y-1/2 text-center font-marker text-7xl text-white [text-shadow:0_4px_0_var(--color-ink),0_0_12px_var(--color-ink)] data-[long=true]:text-4xl"
      />
      <div
        ref={bannerRef}
        hidden
        data-testid="round-banner"
        role="status"
        className="pointer-events-none absolute inset-x-4 top-[calc(50%+3.5rem)] mx-auto max-w-sm animate-pop-in rounded-sketch border-[3px] border-ink bg-paper px-4 py-2 text-center text-ink shadow-[3px_4px_0_rgb(34_34_34/0.3)]"
      >
        {/* Screen readers hear the title and line as one sentence, from the span. */}
        <h2 aria-hidden className="font-marker text-2xl">
          {''}
        </h2>
        <p aria-hidden className="font-hand text-lg leading-snug">
          {''}
        </p>
        <span className="sr-only">{''}</span>
      </div>
    </>
  )
}
