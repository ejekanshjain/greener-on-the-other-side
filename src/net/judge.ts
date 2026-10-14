import {
  countedFromWire,
  countedToWire,
  countLawn,
  zeroCounts,
  type Counted
} from '../game/counts'
import type { Blame } from '../game/garden'
import { noBlame, noCounts, packPatch, Top, type Counts } from '../game/report'
import {
  blameLine,
  matchResult,
  roundWinner,
  scoreLawn,
  type Score,
  type Scorable,
  type Winner
} from '../game/score'
import {
  HEALTH_START,
  LENGTH_START,
  PATCHES,
  START_GNOMES
} from '../game/tuning'
import { decodeFinal } from './finalCodec'
import type { Msg, ScoreLines } from './protocol'

/** The host's verdict on one round, the same on both screens. */
export interface RoundResult {
  round: number
  /** The host's score, then the guest's. */
  scores: [Score, Score]
  winner: Winner
  /** Round wins and points so far, host first. */
  tally: [number, number]
  totals: [number, number]
  /** What Brenda counted on each lawn, host first, for the reveal and the coach tip. */
  counts: [Counted, Counted]
  /** The own fault Brenda names under the loser's score, if any. */
  blame: keyof Blame | null
  /** True when this round decided the match. */
  over: boolean
  /** The host's final pack, so the guest can draw the host's true lawn. */
  hostFinal: string
  /**
   * The guest's lawn as the host rebuilt it when the guest's final never came, so the
   * guest draws the lawn Brenda judged; null when she judged the guest's own final.
   */
  guestFinal: string | null
}

/** A lawn Brenda can score, with the own-fault counts she can blame. */
type Judged = Scorable & { blame: Blame }

/** A lawn nobody touched: health 5 and length 2 everywhere, with the 3 starting gnomes. */
function freshLawn(): Judged {
  const counts: Counts = { ...noCounts(), gnomes: START_GNOMES }
  return {
    patches: new Uint8Array(PATCHES).fill(
      packPatch(HEALTH_START, LENGTH_START, Top.clean)
    ),
    counts,
    healthSum: HEALTH_START * PATCHES,
    blame: noBlame()
  }
}

/**
 * Scores a round from the host's final and the guest's final, which the host may have
 * rebuilt when the guest's own never came. Live state is never scored. A guest final that
 * doesn't decode scores as a fresh lawn. Returns null when the host's own final doesn't
 * decode.
 */
export function judgeRound(
  round: number,
  hostFinal: string,
  guestFinal: string | null,
  previous: Pick<RoundResult, 'tally' | 'totals'> | undefined
): RoundResult | null {
  const host = decodeFinal(hostFinal)
  if (!host || host.round !== round) return null
  const decoded = guestFinal ? decodeFinal(guestFinal) : null
  const guest = decoded?.round === round ? decoded : freshLawn()
  const scores: [Score, Score] = [scoreLawn(host), scoreLawn(guest)]
  const counts: [Counted, Counted] = [countLawn(host), countLawn(guest)]
  const winner = roundWinner(
    scores[0],
    scores[1],
    host.healthSum,
    guest.healthSum
  )
  const tally: [number, number] = previous ? [...previous.tally] : [0, 0]
  if (winner === 'h') tally[0]++
  if (winner === 'g') tally[1]++
  const totals: [number, number] = [
    (previous?.totals[0] ?? 0) + scores[0].total,
    (previous?.totals[1] ?? 0) + scores[1].total
  ]
  const margin = Math.abs(scores[0].total - scores[1].total)
  const blame =
    winner === 'd'
      ? null
      : blameLine(winner === 'h' ? guest.blame : host.blame, margin)
  return {
    round,
    scores,
    winner,
    tally,
    totals,
    counts,
    blame,
    over: matchResult(tally, totals, round + 1).over,
    hostFinal,
    guestFinal: null
  }
}

function lines(score: Score): ScoreLines {
  return [score.green, score.stripes, score.tidy, score.junk]
}

function fromLines([green, stripes, tidy, junk]: ScoreLines): Score {
  return { green, stripes, tidy, junk, total: green + stripes + tidy + junk }
}

/** The `result` message for a round's verdict. */
export function resultMsg(r: RoundResult): Extract<Msg, { k: 'result' }> {
  return {
    k: 'result',
    round: r.round,
    sc: [lines(r.scores[0]), lines(r.scores[1])],
    w: r.winner,
    tally: r.tally,
    totals: r.totals,
    ct: [countedToWire(r.counts[0]), countedToWire(r.counts[1])],
    bl: r.blame ?? '',
    over: r.over,
    hf: r.hostFinal,
    ...(r.guestFinal ? { gf: r.guestFinal } : {})
  }
}

/**
 * A round's verdict from the host's `result` message. The validator has checked its
 * counts, so they always read.
 */
export function resultFrom(msg: Extract<Msg, { k: 'result' }>): RoundResult {
  const counts = (i: 0 | 1) => countedFromWire(msg.ct[i]) ?? zeroCounts()
  return {
    round: msg.round,
    scores: [fromLines(msg.sc[0]), fromLines(msg.sc[1])],
    winner: msg.w,
    tally: [msg.tally[0], msg.tally[1]],
    totals: [msg.totals[0], msg.totals[1]],
    counts: [counts(0), counts(1)],
    blame: msg.bl === '' ? null : msg.bl,
    over: msg.over,
    hostFinal: msg.hf,
    guestFinal: msg.gf ?? null
  }
}

/** Who a verdict names: you, your neighbour by name, or nobody in a draw. */
function winnerName(
  winner: Winner,
  iHost: boolean,
  them: string
): string | null {
  if (winner === 'd') return null
  return (winner === 'h') === iHost ? 'You' : them
}

/** The line under a round's scores, such as "You win round 2." */
export function roundLine(
  winner: Winner,
  round: number,
  iHost: boolean,
  them: string
): string {
  const name = winnerName(winner, iHost, them)
  if (!name) return `Round ${round + 1} is a draw.`
  return `${name} ${name === 'You' ? 'win' : 'wins'} round ${round + 1}.`
}

/** The line for a finished match, such as "Turf Lord wins the match." */
export function matchLine(
  winner: Winner,
  iHost: boolean,
  them: string
): string {
  const name = winnerName(winner, iHost, them)
  if (!name) return "Brenda can't choose. She's calling the council."
  return `${name} ${name === 'You' ? 'win' : 'wins'} the match.`
}

/**
 * The match end's line under the result: the rounds score, the points when rounds are
 * level, or Brenda's council line for a drawn match.
 */
export function matchSummary(
  tally: readonly [number, number],
  totals: readonly [number, number],
  iHost: boolean,
  them: string
): string {
  const [mine, theirs] = iHost ? tally : [tally[1], tally[0]]
  const [myPoints, theirPoints] = iHost ? totals : [totals[1], totals[0]]
  const rounds = (n: number) => `${n} ${n === 1 ? 'round' : 'rounds'}`
  if (mine > theirs) return `You won ${rounds(mine)} to ${theirs}.`
  if (theirs > mine) return `${them} won ${rounds(theirs)} to ${mine}.`
  if (myPoints !== theirPoints)
    return `Level on rounds, so points decide it: ${Math.max(myPoints, theirPoints)} to ${Math.min(myPoints, theirPoints)}.`
  return "Brenda can't choose. She's calling the council."
}
