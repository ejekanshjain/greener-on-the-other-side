'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import { LAST_TICKS_MS } from '../game/tuning'
import { shortName } from '../net/names'
import { GONE_MS } from '../net/room'
import type { RoomSession, RoomView } from '../net/session'
import { formatClock } from '../shared/clock'
import { useStore } from '../shared/store'
import { cn } from '../shared/ui/cn'
import { AwayTag } from './AwayTag'
import { COPY } from './copy'
import { shownTally } from './reveal'
import { Rosettes } from './Rosettes'
import type { DesignBox } from './RoomScreen'

/** What a row of rosettes says to a screen reader, such as "You won 1 round". */
export function winsLabel(name: string, wins: number): string {
  return `${name} won ${wins} ${wins === 1 ? 'round' : 'rounds'}`
}

/**
 * The match's top bar over the design's top band, at least 48 px tall and never lower
 * than the band: the menu button and your name tag, the round clock in the middle, then
 * their name tag and Shake Fist. Each name tag shows the name cut to 10 characters with
 * its rosettes underneath; Away joins their rosettes, and Gone with its 60s countdown
 * replaces them. The clocks update every frame without re-rendering React.
 */
export function TopBar({
  session,
  view,
  box,
  onMenu
}: {
  session: RoomSession
  view: RoomView
  box: DesignBox
  onMenu: () => void
}) {
  const tally = useShownTally(session, view.tally)
  if (box.scale === 0) return null
  const band = 96 * box.scale
  const height = Math.max(48, band)
  const mine = view.host ? tally[0] : tally[1]
  const theirs = view.host ? tally[1] : tally[0]
  const them = shortName(view.peer?.name ?? 'Neighbour')
  const peer = view.peer
  const gone = !!peer && !peer.listed
  const decided = view.results.some(r => r.over)
  return (
    <header
      data-testid="top-bar"
      className="fixed z-10 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 px-1 font-hand text-ink sm:gap-2 sm:px-3"
      style={{
        left: box.left,
        // A bar taller than the band grows upward into the sky, off the peek strip.
        top: Math.max(0, box.top + band - height),
        width: 680 * box.scale,
        height
      }}
    >
      <span className="flex min-w-0 items-center gap-0.5 sm:gap-2">
        <button
          type="button"
          aria-label="Menu"
          data-testid="menu-button"
          onClick={onMenu}
          className="pointer-events-auto grid size-11 shrink-0 place-items-center rounded-sketch border-[3px] border-ink bg-paper shadow-[2px_3px_0_var(--color-ink)] focus-visible:outline-4 focus-visible:outline-marker-blue active:translate-y-0.5 active:shadow-none"
        >
          <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
            <path
              d="M4 6.5 L20 6 M4 12.3 L20 11.7 M4 18 L20 17.6"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
        {/* Your own tag reads You, as your lobby gate does: a funny name is easy to miss. */}
        <NameTag name="You" testId="my-name">
          <Rosettes
            wins={mine}
            label={winsLabel('You', mine)}
            className={ROSETTE}
          />
        </NameTag>
      </span>
      <RoundClock session={session} roundMs={view.match?.roundMs ?? 0} />
      <span className="flex min-w-0 items-center justify-end gap-0.5 sm:gap-2">
        <NameTag name={them} testId="their-name" end>
          {gone ? (
            <GoneClock
              session={session}
              since={peer.unlistedSince}
              countdown={!decided}
            />
          ) : (
            <Rosettes
              wins={theirs}
              label={winsLabel(them, theirs)}
              className={ROSETTE}
            />
          )}
          {peer?.away && !gone && <AwayTag />}
        </NameTag>
        <FistButton session={session} />
      </span>
    </header>
  )
}

/** Rosettes in the bar: smaller on phones, so a name and its rosettes stack in the band. */
const ROSETTE = 'h-5 w-4 sm:h-6 sm:w-5'

/**
 * A name with its status line underneath: rosettes, Away or Gone. `end` lines it up on
 * the right, for your neighbour. The status line takes no room while it's empty.
 */
function NameTag({
  name,
  testId,
  end = false,
  children
}: {
  name: string
  testId: string
  end?: boolean
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'flex min-w-0 flex-col gap-px',
        end ? 'items-end' : 'items-start'
      )}
    >
      <span
        data-testid={testId}
        className="max-w-full truncate rounded-sketch bg-paper/85 px-1 text-[15px] leading-tight sm:px-2 sm:text-lg"
      >
        {name}
      </span>
      <span className="flex items-center gap-0.5 empty:hidden">{children}</span>
    </span>
  )
}

/**
 * The tally the top bar shows: it follows the verdicts, but holds back the round being
 * revealed until Brenda pins its rosette. It re-renders only when the shown tally changes.
 */
function useShownTally(
  session: RoomSession,
  tally: [number, number]
): [number, number] {
  const [shown, setShown] = useState(tally)
  const last = useRef(shown)
  useEffect(() => {
    let frame = requestAnimationFrame(function tick() {
      frame = requestAnimationFrame(tick)
      const next = shownTally(session)
      if (next[0] === last.current[0] && next[1] === last.current[1]) return
      last.current = next
      setShown(next)
    })
    return () => cancelAnimationFrame(frame)
  }, [session])
  return shown
}

/**
 * The round clock. It updates every frame without re-rendering React, shows the round's
 * full time through every countdown, and turns red for the last 10s of play.
 */
function RoundClock({
  session,
  roundMs
}: {
  session: RoomSession
  roundMs: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let shown = ''
    let frame = requestAnimationFrame(function tick() {
      frame = requestAnimationFrame(tick)
      const phase = session.phase()
      const late = phase?.kind === 'play' && phase.msLeft <= LAST_TICKS_MS
      // Every countdown shows the coming round's full time; the reveal shows 0:00.
      const text = !phase
        ? ''
        : session.paused
          ? COPY.paused
          : phase.kind === 'play'
            ? formatClock(phase.msLeft)
            : phase.kind === 'countdown'
              ? formatClock(roundMs)
              : '0:00'
      if (text === shown) return
      shown = text
      el.textContent = text
      el.classList.toggle('text-marker-red', late)
    })
    return () => cancelAnimationFrame(frame)
  }, [session, roundMs])
  return (
    <span
      ref={ref}
      data-testid="clock"
      className="rounded-sketch border-[3px] border-ink bg-paper px-1.5 font-marker text-[22px] tabular-nums sm:px-3 sm:text-3xl"
    />
  )
}

/**
 * "Gone 0:42": how long your neighbour has left to come back before the walkover, on the
 * shared clock. Once Brenda has decided the match it reads just "Gone".
 */
function GoneClock({
  session,
  since,
  countdown
}: {
  session: RoomSession
  since: number
  countdown: boolean
}) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let shown = ''
    let frame = requestAnimationFrame(function tick() {
      frame = requestAnimationFrame(tick)
      const left = Math.max(0, GONE_MS - (session.clock.now() - since))
      const text = countdown ? `${COPY.gone} ${formatClock(left)}` : COPY.gone
      if (text === shown) return
      shown = text
      el.textContent = text
    })
    return () => cancelAnimationFrame(frame)
  }, [session, since, countdown])
  return (
    <span
      ref={ref}
      data-testid="gone"
      className="shrink-0 rounded-sketch border-2 border-ink bg-marker-red px-1 text-sm leading-tight whitespace-nowrap text-white tabular-nums sm:text-base"
    />
  )
}

/**
 * Shake Fist: pops your fist up over their fence during play. It rests for 3s after
 * each shake, shown greyed out; F does the same from the keyboard.
 */
function FistButton({ session }: { session: RoomSession }) {
  const until = useStore(session.hud, s => s.fistUntil)
  const [now, setNow] = useState(0)
  useEffect(() => {
    const left = until - Date.now()
    if (left <= 0) return
    const timer = setTimeout(() => setNow(Date.now()), left + 20)
    return () => clearTimeout(timer)
  }, [until])
  const resting = until > now
  return (
    <button
      type="button"
      aria-label="Shake Fist"
      data-testid="fist-button"
      aria-disabled={resting}
      onClick={() => session.shakeFist()}
      className={cn(
        'pointer-events-auto grid size-11 shrink-0 place-items-center rounded-sketch border-[3px] border-ink bg-marker-yellow shadow-[2px_3px_0_var(--color-ink)] focus-visible:outline-4 focus-visible:outline-marker-blue active:translate-y-0.5 active:shadow-none',
        resting && 'bg-paper opacity-60 shadow-none'
      )}
    >
      <svg viewBox="0 0 24 24" className="size-7" aria-hidden>
        <path
          d="M6 10.5 C6 7.8 7.4 7 8.6 7.3 C9 6 10.4 5.6 11.4 6.4 C12 5.3 13.6 5.2 14.4 6.2 C15.3 5.4 17 5.8 17.2 7.4 L17.6 13.5 C17.8 17 15.6 19.4 12.2 19.4 C8.8 19.4 6.4 17.4 6.2 14.6 Z"
          fill="#f1c9a5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M8.8 7.6 L9 10.6 M11.6 6.8 L11.8 10.4 M14.4 6.6 L14.6 10.4 M6.2 12 C8 11.4 9.4 12 10.2 13.4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M9 19.2 L8.6 22.4 M15.2 19 L15.8 22.4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  )
}
