'use client'

import { useEffect, useRef } from 'react'

import { countParts, type Counted } from '../game/counts'
import { matchResult, type Score } from '../game/score'
import { matchLine, roundLine, type RoundResult } from '../net/judge'
import { shortName } from '../net/names'
import type { RoomSession, RoomView } from '../net/session'
import { pastTimesUp } from './Countdown'

const LINES: readonly [keyof Score, string][] = [
  ['green', 'Green'],
  ['stripes', 'Stripes'],
  ['tidy', 'Tidy'],
  ['junk', 'Junk'],
  ['total', 'Total']
]

/**
 * Brenda's verdict on the round being revealed, for screen readers: both scores line by
 * line, who won the round and, after the deciding round, the match. The canvas draws the
 * reveal; this text is there once "Time's up." has had its moment and the verdict is in.
 */
export function Verdict({
  session,
  view
}: {
  session: RoomSession
  view: RoomView
}) {
  const ref = useRef<HTMLElement>(null)
  const result: RoundResult | undefined = view.results[view.results.length - 1]
  const round = result?.round ?? -1
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = requestAnimationFrame(function tick() {
      frame = requestAnimationFrame(tick)
      const phase = session.phase()
      const show =
        phase?.kind === 'reveal' &&
        phase.round === round &&
        pastTimesUp(phase, session.room.match)
      if (el.hidden === show) el.hidden = !show
    })
    return () => cancelAnimationFrame(frame)
  }, [session, round])
  if (!result) return null
  const name = view.peer?.name ?? 'Your neighbour'
  const them = shortName(name)
  const [mine, theirs] = view.host
    ? result.scores
    : [result.scores[1], result.scores[0]]
  const [myCounts, theirCounts] = view.host
    ? result.counts
    : [result.counts[1], result.counts[0]]
  /** A score with what Brenda counted, such as "8, 3 columns". */
  const cell = (score: Score, counted: Counted, key: keyof Score) => {
    const parts = key === 'total' ? [] : countParts(key, score, counted)
    return parts.length ? `, ${parts.join(', ')}` : ''
  }
  const match = result.over
    ? matchResult(result.tally, result.totals, result.round + 1)
    : null
  return (
    <section
      ref={ref}
      hidden
      aria-labelledby="verdict-title"
      data-testid="verdict"
      className="sr-only"
    >
      <h2 id="verdict-title" className="text-center font-marker text-2xl">
        Round {result.round + 1}
      </h2>
      <table className="mt-1 w-full font-hand text-lg tabular-nums">
        <thead>
          <tr>
            <th />
            <th className="text-right font-normal">You</th>
            <th className="truncate text-right font-normal">{them}</th>
          </tr>
        </thead>
        <tbody>
          {LINES.map(([key, label]) => (
            <tr
              key={key}
              className={
                key === 'total' ? 'border-t-2 border-ink font-bold' : ''
              }
            >
              <th className="text-left font-normal">{label}</th>
              <td className="text-right">
                <span data-testid={`mine-${key}`}>{mine[key]}</span>
                {cell(mine, myCounts, key)}
              </td>
              <td className="text-right">
                <span data-testid={`theirs-${key}`}>{theirs[key]}</span>
                {cell(theirs, theirCounts, key)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p
        className="mt-2 text-center font-hand text-lg"
        data-testid="round-line"
      >
        {roundLine(result.winner, result.round, view.host, name)}
      </p>
      {match?.winner && (
        <p className="text-center font-marker text-xl" data-testid="match-line">
          {matchLine(match.winner, view.host, name)}
        </p>
      )}
    </section>
  )
}
