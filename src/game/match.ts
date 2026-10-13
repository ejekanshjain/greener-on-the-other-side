import { ROUND_MS, STRETCH_LEFT_MS } from './tuning'

/** Rounds in a match. */
export const ROUNDS = 3
/** Wins that take the match. */
export const WINS_NEEDED = 2
/** The host schedules round 1's play this long after both players press Ready. */
export const START_LEAD_MS = 3500

/** How long each part of a match lasts. */
export interface MatchTimings {
  roundMs: number
  revealMs: number
  lastRevealMs: number
  countdownMs: number
}

/** Real timings, or the short `?fast` ones: 45s rounds and half-length reveals. */
export function matchTimings(fast: boolean): MatchTimings {
  return fast
    ? {
        roundMs: 45_000,
        revealMs: 10_000,
        lastRevealMs: 15_000,
        countdownMs: 3000
      }
    : {
        roundMs: ROUND_MS,
        revealMs: 20_000,
        lastRevealMs: 30_000,
        countdownMs: 3000
      }
}

/** A match's timeline: round 1's play start on the shared clock plus its timings. */
export interface MatchClock extends MatchTimings {
  at: number
}

/** Where a match is at one moment. Times are in ms. */
export type MatchPhase =
  | { kind: 'waiting'; round: 0; msLeft: number }
  | { kind: 'countdown'; round: number; msLeft: number }
  | { kind: 'play'; round: number; elapsed: number; msLeft: number }
  | {
      kind: 'reveal'
      round: number
      elapsed: number
      msLeft: number
      last: boolean
    }
  | { kind: 'done'; round: number }

/** Shared-clock time when `round` starts its play. */
export function playStart(m: MatchClock, round: number): number {
  return m.at + round * (m.roundMs + m.revealMs)
}

/**
 * The match phase at shared time `t`. `lastRound` is the round that ends the match: the
 * third, or an earlier one once someone has 2 wins. Its reveal runs the longer last
 * reveal. Before every later round, the last `countdownMs` of the reveal is that round's
 * countdown.
 */
export function matchPhaseAt(
  m: MatchClock,
  t: number,
  lastRound = ROUNDS - 1
): MatchPhase {
  const first = playStart(m, 0)
  if (t < first - m.countdownMs)
    return { kind: 'waiting', round: 0, msLeft: first - m.countdownMs - t }
  if (t < first) return { kind: 'countdown', round: 0, msLeft: first - t }
  for (let round = 0; round <= lastRound; round++) {
    const start = playStart(m, round)
    const end = start + m.roundMs
    if (t < end)
      return { kind: 'play', round, elapsed: t - start, msLeft: end - t }
    const last = round === lastRound
    const revealEnd = end + (last ? m.lastRevealMs : m.revealMs)
    if (t >= revealEnd) continue
    if (!last && t >= revealEnd - m.countdownMs)
      return { kind: 'countdown', round: round + 1, msLeft: revealEnd - t }
    return {
      kind: 'reveal',
      round,
      elapsed: t - end,
      msLeft: revealEnd - t,
      last
    }
  }
  return { kind: 'done', round: lastRound }
}

/**
 * Which stretch of a round applies with `msLeft` to go: 0 until 2:20 left, 1 until
 * 1:20, 2 until 0:40, then 3. Boundaries scale with the round length, so `?fast`
 * rounds escalate at the same shares.
 */
export function stretchAt(msLeft: number, roundMs: number): 0 | 1 | 2 | 3 {
  const share = msLeft / roundMs
  const [a, b, c] = STRETCH_LEFT_MS
  if (share > a / ROUND_MS) return 0
  if (share > b / ROUND_MS) return 1
  if (share > c / ROUND_MS) return 2
  return 3
}

/** The match clock that leaves `msLeft` in `round`'s play at shared time `now`, for dev jumps. */
export function jumpedClock(
  m: MatchClock,
  round: number,
  msLeft: number,
  now: number
): number {
  const elapsed = Math.min(m.roundMs, Math.max(0, m.roundMs - msLeft))
  return now - elapsed - round * (m.roundMs + m.revealMs)
}
