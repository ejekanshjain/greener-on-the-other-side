import type { Blame } from './garden'
import {
  patchHealth,
  patchTop,
  reportStripes,
  Top,
  type Counts
} from './report'
import { COLS, HEALTH_MAX, PATCHES } from './tuning'

/** Brenda's four lines for one lawn, and their sum. */
export interface Score {
  green: number
  stripes: number
  tidy: number
  junk: number
  total: number
}

/** What Brenda needs to score a lawn: its patch bytes, counts and exact health sum. */
export interface Scorable {
  patches: Uint8Array
  counts: Counts
  healthSum: number
}

/** Who won a round or a match: the host, the guest, or a draw. */
export type Winner = 'h' | 'g' | 'd'

/** Points per line (PLAN.md 2.10). */
const GREEN_POINTS = 50
const STRIPE_POINTS = 2.5
const TIDY_START = 20
const TIDY_PER_ITEM = 0.5
const JUNK = { gnome: 1, bin: 4, mower: 4, trampoline: 6 } as const
/** Rounds in a match and wins that take it. */
const MATCH_ROUNDS = 3
const WINS_NEEDED = 2

/** Rounds half up, so 2.5 points show as 3 and -0.5 as 0. */
export function halfUp(x: number): number {
  return Math.floor(x + 0.5)
}

/**
 * Scores a lawn the way Brenda does. Green is the share of full health, Stripes 2.5 per
 * striped column, Tidy 20 less 0.5 per weed, snail, litter, heap patch or hole (never
 * below 0), and Junk 1 per gnome, 4 per bin or mower and 6 per trampoline, below 0.
 */
export function scoreLawn(lawn: Scorable): Score {
  const c = lawn.counts
  let holes = 0
  for (let i = 0; i < PATCHES; i++)
    if (patchTop(lawn.patches[i] as number) === Top.hole) holes++
  const stripes = reportStripes(lawn.patches)
  let striped = 0
  for (let col = 0; col < COLS; col++) if ((stripes >> col) & 1) striped++
  const clutter = c.weeds + c.snails + c.litter + c.heaps + holes
  const green = halfUp((GREEN_POINTS * lawn.healthSum) / (PATCHES * HEALTH_MAX))
  const stripePoints = halfUp(STRIPE_POINTS * striped)
  const tidy = Math.max(0, halfUp(TIDY_START - TIDY_PER_ITEM * clutter))
  // `0 -` keeps an empty lawn's Junk at 0 rather than -0.
  const junk =
    0 -
    (c.gnomes * JUNK.gnome +
      c.bins * JUNK.bin +
      c.mowers * JUNK.mower +
      c.trampolines * JUNK.trampoline)
  return {
    green,
    stripes: stripePoints,
    tidy,
    junk,
    total: green + stripePoints + tidy + junk
  }
}

/** The round's winner: the higher total, then the higher exact health sum, else a draw. */
export function roundWinner(
  host: Score,
  guest: Score,
  hostHealth: number,
  guestHealth: number
): Winner {
  if (host.total !== guest.total) return host.total > guest.total ? 'h' : 'g'
  if (hostHealth !== guestHealth) return hostHealth > guestHealth ? 'h' : 'g'
  return 'd'
}

/**
 * Whether the match is over after `rounds` rounds, and who won it. First to 2 round wins
 * takes it. After round 3: more wins, then more points in total, then a drawn match.
 */
export function matchResult(
  tally: readonly [number, number],
  totals: readonly [number, number],
  rounds: number
): { over: boolean; winner: Winner | null } {
  if (tally[0] >= WINS_NEEDED) return { over: true, winner: 'h' }
  if (tally[1] >= WINS_NEEDED) return { over: true, winner: 'g' }
  if (rounds < MATCH_ROUNDS) return { over: false, winner: null }
  if (tally[0] !== tally[1])
    return { over: true, winner: tally[0] > tally[1] ? 'h' : 'g' }
  if (totals[0] !== totals[1])
    return { over: true, winner: totals[0] > totals[1] ? 'h' : 'g' }
  return { over: true, winner: 'd' }
}

/** What each own-fault count costs, roughly in points (PLAN.md 2.10). */
export const BLAME_WEIGHTS: Readonly<Record<keyof Blame, number>> = {
  drowned: 0.7,
  scalped: 0.5,
  clips: 1.0,
  flattened: 0.1,
  bounces: 1.5,
  digs: 1.0
}

/**
 * The fault Brenda names under the loser's score, or null. She names one only when the
 * margin is at least 1 and the loser's weighted own faults come to at least half of it;
 * then she names the category with the largest weighted share.
 */
export function blameLine(loser: Blame, margin: number): keyof Blame | null {
  if (margin < 1) return null
  let sum = 0
  let worst: keyof Blame | null = null
  let worstCost = 0
  for (const key of Object.keys(BLAME_WEIGHTS) as (keyof Blame)[]) {
    const cost = loser[key] * BLAME_WEIGHTS[key]
    sum += cost
    if (cost > worstCost) {
      worst = key
      worstCost = cost
    }
  }
  return sum >= margin / 2 ? worst : null
}

/** What Brenda notices about one lawn. */
export interface Findings {
  gnomes: number
  trampolines: number
  /** Patches at health 1 or less, or under a puddle. */
  mud: number
  holes: number
  /** Striped columns, 0 to 12. */
  stripes: number
}

/** What Brenda notices about a scored lawn, from its patch bytes and counts. */
export function findings(lawn: Scorable): Findings {
  let mud = 0
  let holes = 0
  for (let i = 0; i < PATCHES; i++) {
    const byte = lawn.patches[i] as number
    const top = patchTop(byte)
    if (top === Top.hole) holes++
    if (patchHealth(byte) <= 1 || top === Top.puddle) mud++
  }
  const mask = reportStripes(lawn.patches)
  let stripes = 0
  for (let col = 0; col < COLS; col++) if ((mask >> col) & 1) stripes++
  return {
    gnomes: lawn.counts.gnomes,
    trampolines: lawn.counts.trampolines,
    mud,
    holes,
    stripes
  }
}

/**
 * Brenda's one line about a lawn: the first thing on her list she finds, then "too close"
 * when the round is within 3 points, else a plain verdict for the winner or the loser.
 */
export function brendaLine(f: Findings, margin: number, won: boolean): string {
  if (f.gnomes >= 10) return `I count ${f.gnomes} gnomes. Are they breeding?`
  if (f.trampolines > 0) return 'Is that a trampoline?'
  if (f.mud >= 20) return 'Lovely mud.'
  if (f.holes >= 3) return "Something's been digging."
  if (f.stripes === COLS) return 'Proper stripes. Suspicious.'
  if (margin < 3) return "Too close. I'm going with my gut."
  return won ? 'Neat edges. I approve.' : 'Could be greener.'
}

/** `n` with its noun, singular for 1. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * The line under the loser's score that names their biggest own fault, such as "You
 * lost by 4. You drowned 9 patches yourself." `name` is null for you.
 */
export function blameText(
  key: keyof Blame,
  n: number,
  margin: number,
  name: string | null
): string {
  const who = name ?? 'You'
  const self = name ? 'themselves' : 'yourself'
  const they = name ? 'They' : 'You'
  const their = name ? 'their' : 'your'
  const fault =
    key === 'drowned'
      ? `${they} drowned ${count(n, 'patch', 'patches')} ${self}.`
      : key === 'scalped'
        ? `${they} scalped ${count(n, 'patch', 'patches')} ${self}.`
        : key === 'clips'
          ? `${they} clipped the fence ${n === 1 ? 'once' : `${n} times`}.`
          : key === 'flattened'
            ? `${they} flattened ${count(n, 'patch', 'patches')} dragging junk.`
            : key === 'bounces'
              ? `${count(n, `of ${their} throws`, `of ${their} throws`)} bounced back.`
              : `Biscuit dug ${count(n, 'hole', 'holes')} ${name ? 'they' : 'you'} missed.`
  return `${who} lost by ${margin}. ${fault}`
}
