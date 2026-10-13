'use client'

import { useEffect, useRef, type ReactNode } from 'react'

import { LAWN_D, LAWN_W } from '../game/tuning'
import { decodeFinal } from '../net/finalCodec'
import { matchSummary, type RoundResult } from '../net/judge'
import type { RoomSession, RoomView } from '../net/session'
import { lawnsPicture } from '../scenes/shareCard'
import { paintTrueLawn, readPack } from '../scenes/trueLawn'
import { palette } from '../shared/palette'
import { ReplayPlayer } from '../shared/replay'
import type { ShareCardInput } from '../shared/share'
import { setSketchScale, sketchText } from '../shared/sketch'
import { Button } from '../shared/ui/Button'
import { ShareCardButton } from '../shared/ui/ShareModal'
import { cn } from '../shared/ui/cn'
import { AwayTag } from './AwayTag'
import { Card } from './Card'
import { COPY } from './copy'
import { leaveRoom } from './leaving'
import { Rosettes } from './Rosettes'
import { winsLabel } from './TopBar'

/** Lawn units of paper round each lawn on the match end, so its frame never clips. */
const PAD = 12

/**
 * One true lawn, painted once and again on resize, never per frame. Strokes draw half
 * their width in CSS pixels, like the reveal's half-size lawns.
 */
function LawnPicture({ pack, label }: { pack: string | null; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const lawn = pack ? readPack(pack) : null
    const paint = () => {
      const width = canvas.clientWidth
      if (width === 0) return
      const k = width / (LAWN_W + PAD * 2)
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round((LAWN_D + PAD * 2) * k * dpr)
      ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0)
      setSketchScale(ctx, 2 * k)
      if (lawn) paintTrueLawn(ctx, PAD, PAD, 1, lawn)
      // A lawn Brenda never received (a final lost on the way) shows as a blank board.
      else
        sketchText(ctx, '?', LAWN_W / 2 + PAD, LAWN_D / 2 + PAD, {
          font: 'marker',
          size: 160,
          color: palette.inkSoft
        })
    }
    paint()
    const observer = new ResizeObserver(paint)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [pack])
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      className="aspect-[624/664] w-full"
    />
  )
}

/**
 * The share card for a match Brenda decided: both true lawns and names, "It was never
 * greener." and 4 stats. The lawns paint only when the card is drawn.
 */
function matchCard(
  session: RoomSession,
  results: readonly RoundResult[],
  last: RoundResult,
  host: boolean,
  them: string
): ShareCardInput {
  const side = host ? 0 : 1
  const finals = results.map(r => {
    const pack = session.revealPacks(r.round)?.mine
    return pack ? decodeFinal(pack) : null
  })
  const clips = finals.reduce((n, f) => n + (f?.blame.clips ?? 0), 0)
  const lastFinal = finals[results.indexOf(last)]
  const packs = session.revealPacks(last.round)
  return {
    game: 'Greener on the Other Side',
    title: 'It was never greener.',
    stats: [
      {
        label: 'Match',
        value: `${last.tally[side]} to ${last.tally[1 - side]}`
      },
      { label: 'Your Last Lawn', value: last.scores[side]?.total ?? 0 },
      { label: 'Gnomes on Your Lawn', value: lastFinal?.counts.gnomes ?? 0 },
      { label: 'Fence Clips', value: clips }
    ],
    get image() {
      return lawnsPicture(packs?.mine ?? null, packs?.theirs ?? null, [
        'You',
        them
      ])
    },
    footer: 'Brenda judged both lawns. No appeals.'
  }
}

/** Your worst moment of the match in slow motion, with its caption under it. */
function WorstReplay({ session }: { session: RoomSession }) {
  const worst = session.worst.best
  if (!worst) return null
  return (
    <figure
      data-testid="worst-replay"
      className="flex w-32 shrink-0 flex-col items-center gap-1 sm:w-40"
    >
      <ReplayPlayer clip={worst.clip} loop badge={false} className="w-full" />
      <figcaption className="font-marker text-base leading-tight">
        {worst.label}
      </figcaption>
    </figure>
  )
}

/**
 * The rematch line on a match end without lawns. When your neighbour is Away, the tag
 * joins the line, or their name when there is no line yet.
 */
function StatusLine({
  line,
  name,
  away
}: {
  line: string
  name: string
  away: ReactNode
}) {
  if (!line && !away) return null
  return (
    <p data-testid="match-status" className="flex items-center gap-2">
      {line || name}
      {away}
    </p>
  )
}

/**
 * The match end: who won, both true lawns from the deciding round, every round's points,
 * your worst moment in slow motion, and Rematch, Share Card and Leave. When your
 * neighbour storms off mid-match it says so instead, with Back to Lobby; a walkover and a
 * no contest get their own lines. A page that reloaded after the end has no lawns, so it
 * shows the result and the rounds score only.
 */
export function MatchEnd({
  session,
  view
}: {
  session: RoomSession
  view: RoomView
}) {
  const over = view.over
  if (view.phase !== 'over' || !over) return null
  const toLobby = (
    <Button onClick={() => session.dispatch({ type: 'ui', action: 'lobby' })}>
      Back to Lobby
    </Button>
  )
  const leave = (
    <Button variant="ghost" onClick={() => leaveRoom(session)}>
      Leave
    </Button>
  )
  const peer = view.peer
  const here = !!peer && peer.id === over.peerId && peer.listed
  const them = here ? peer.name : over.peerName
  // A neighbour who went quiet shows Away, so you know why Rematch is taking a while.
  const away = here && peer.away ? <AwayTag /> : null
  if (over.reason === 'stormedOff')
    return (
      <Card title="Stormed Off">
        <p data-testid="match-status">{COPY.stormedOff(them)}</p>
        <div className="flex flex-wrap justify-center gap-3">{toLobby}</div>
      </Card>
    )
  if (over.reason === 'walkover')
    return (
      <Card title="Walkover">
        <p data-testid="match-status">
          {over.winner === over.peerId
            ? COPY.walkedOver(them)
            : COPY.walkover(them)}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {toLobby}
          {leave}
        </div>
      </Card>
    )
  // Rematch lines: who is waiting for whom, or that they left.
  const rematchLine = !here
    ? COPY.left(them)
    : view.myRematch
      ? COPY.waitingRematch(them)
      : peer.rematch || peer.ready
        ? COPY.wantsRematch(them)
        : ''
  const buttons = (
    <div className="flex flex-wrap justify-center gap-3">
      {!here ? (
        toLobby
      ) : view.myRematch ? null : (
        <Button
          className={cn((peer.rematch || peer.ready) && 'ready-pulse')}
          onClick={() => session.dispatch({ type: 'ui', action: 'rematch' })}
        >
          Rematch
        </Button>
      )}
      {leave}
    </div>
  )
  if (over.reason === 'noContest')
    return (
      <Card title="No Contest">
        <p data-testid="match-summary">{COPY.noContest}</p>
        <StatusLine line={rematchLine} name={them} away={away} />
        {buttons}
      </Card>
    )

  const results = view.results
  const last = results.find(r => r.over) ?? results[results.length - 1]
  const round = last?.round ?? 0
  const packs = last ? session.revealPacks(round) : null
  const mine = (pair: readonly [number, number]) =>
    view.host ? pair[0] : pair[1]
  const theirs = (pair: readonly [number, number]) =>
    view.host ? pair[1] : pair[0]
  const tally = last?.tally ?? [0, 0]
  const title =
    over.winner === null
      ? 'Nobody Wins'
      : over.winner === over.peerId
        ? `${them} Wins the Match`
        : 'You Win the Match'
  // A page that reloaded after the end knows the result from its neighbour's sync only.
  if (!last)
    return (
      <Card title={title} className="gap-3">
        <p data-testid="match-summary">
          {over.summary
            ? matchSummary(
                over.summary.tally,
                over.summary.totals,
                view.host,
                them
              )
            : ''}
        </p>
        <StatusLine line={rematchLine} name={them} away={away} />
        {buttons}
      </Card>
    )
  return (
    <Card title={title} className="gap-3">
      <p data-testid="match-summary">
        {matchSummary(last.tally, last.totals, view.host, them)}
      </p>
      <div className="grid w-full grid-cols-2 gap-3">
        {(
          [
            ['You', packs?.mine ?? session.myFinal(round), mine(tally)],
            [them, packs?.theirs ?? null, theirs(tally)]
          ] as const
        ).map(([name, pack, wins], side) => (
          <figure key={side} className="flex min-w-0 flex-col items-center">
            <LawnPicture
              pack={pack}
              label={`${side === 0 ? 'Your' : `${name}'s`} lawn after round ${round + 1}`}
            />
            <figcaption className="flex max-w-full items-center gap-1 font-marker text-lg">
              <span className="truncate">{name}</span>
              <Rosettes wins={wins} label={winsLabel(name, wins)} />
              {side === 1 && away}
            </figcaption>
          </figure>
        ))}
      </div>
      {/* Each lawn's points sit under it, with the round between them, and the worst
          moment's replay beside them. */}
      <div className="flex w-full items-center gap-3">
        <table
          data-testid="match-points"
          className="w-full min-w-0 flex-1 table-fixed text-center font-hand text-lg leading-snug tabular-nums"
        >
          <thead className="text-base text-ink-soft">
            <tr>
              <th className="truncate font-normal">You</th>
              <th className="w-20 font-normal sm:w-28">
                <span className="sr-only">Round</span>
              </th>
              <th className="truncate font-normal">{them}</th>
            </tr>
          </thead>
          <tbody>
            {results.map(r => {
              // The round's winner shows in bold.
              const iWon = r.winner === (view.host ? 'h' : 'g')
              const theyWon = r.winner === (view.host ? 'g' : 'h')
              const totals = [r.scores[0].total, r.scores[1].total] as const
              return (
                <tr key={r.round}>
                  <td className={cn(iWon && 'font-bold')}>{mine(totals)}</td>
                  <th className="w-20 text-base font-normal text-ink-soft sm:w-28">
                    Round {r.round + 1}
                  </th>
                  <td className={cn(theyWon && 'font-bold')}>
                    {theirs(totals)}
                  </td>
                </tr>
              )
            })}
            <tr className="border-t-2 border-ink font-marker">
              <td>{mine(last.totals)}</td>
              <th className="font-normal">Points</th>
              <td>{theirs(last.totals)}</td>
            </tr>
          </tbody>
        </table>
        <WorstReplay session={session} />
      </div>
      {/* The rematch line and buttons stay on screen while the card scrolls on short screens. */}
      <div className="sticky -bottom-5 -mx-5 -mb-5 flex w-[calc(100%+2.5rem)] flex-col items-center gap-2 bg-paper px-5 pt-2 pb-5">
        {rematchLine && <p data-testid="match-status">{rematchLine}</p>}
        <div className="flex flex-wrap justify-center gap-3">
          {!here ? (
            toLobby
          ) : view.myRematch ? null : (
            <Button
              className={cn((peer.rematch || peer.ready) && 'ready-pulse')}
              onClick={() =>
                session.dispatch({ type: 'ui', action: 'rematch' })
              }
            >
              Rematch
            </Button>
          )}
          <ShareCardButton
            card={matchCard(session, results, last, view.host, them)}
            text="Brenda judged our lawns. It was never greener."
            label="Share Card"
            title="Share the Verdict"
            variant="ghost"
          />
          {leave}
        </div>
      </div>
    </Card>
  )
}
