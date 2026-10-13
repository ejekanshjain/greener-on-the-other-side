/**
 * Brenda's reveal on the shared clock (DESIGN.md "Brenda's Reveal"). A full reveal runs:
 * "Time's up." to 2s, your lawn's peel to 5s and theirs to 8s, the count-up to 14s, the
 * rosette to 17s, then the next round's countdown. `?fast` reveals squeeze the first 17s
 * into whatever comes before their countdown. The last reveal's ending fills the rest.
 */

/** Full-length step boundaries in ms from the reveal's start. */
const AT = {
  peel: 2000,
  theirPeel: 5000,
  count: 8000,
  rosette: 14_000,
  end: 17_000
} as const

/** The steps of the reveal. `countdown` is the next round's, which the match clock runs. */
export type RevealStep =
  'timesUp' | 'peel' | 'count' | 'rosette' | 'ending' | 'countdown'

/** Where the reveal is at one moment. Every progress runs 0 to 1. */
export interface RevealMoment {
  step: RevealStep
  /** How far the tint has peeled off your lawn and theirs. */
  peelMine: number
  peelTheirs: number
  /** How far the count-up has gone. */
  count: number
  /** How far through the last reveal's ending, or 0. */
  ending: number
  /** The moment's ms scale against a full reveal: 1 normally, under 1 in `?fast`. */
  scale: number
}

/** The reveal's timings, from the match. */
export interface RevealTimings {
  revealMs: number
  lastRevealMs: number
  countdownMs: number
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** Where Brenda's reveal is at `elapsed` ms into it. `last` is the match's last reveal. */
export function revealMoment(
  elapsed: number,
  timings: RevealTimings,
  last: boolean
): RevealMoment {
  const scale = (timings.revealMs - timings.countdownMs) / AT.end
  const at = (ms: number) => ms * scale
  const span = (from: number, to: number) =>
    clamp01((elapsed - at(from)) / (at(to) - at(from)))
  const end = at(AT.end)
  const step: RevealStep =
    elapsed < at(AT.peel)
      ? 'timesUp'
      : elapsed < at(AT.count)
        ? 'peel'
        : elapsed < at(AT.rosette)
          ? 'count'
          : elapsed < end
            ? 'rosette'
            : last
              ? 'ending'
              : 'countdown'
  return {
    step,
    peelMine: span(AT.peel, AT.theirPeel),
    peelTheirs: span(AT.theirPeel, AT.count),
    count: span(AT.count, AT.rosette),
    ending: last
      ? clamp01((elapsed - end) / Math.max(1, timings.lastRevealMs - end))
      : 0,
    scale
  }
}

/** True once the reveal of a round has reached its rosette, so the tally may show the round. */
export function rosetteShown(elapsed: number, timings: RevealTimings): boolean {
  return elapsed >= AT.rosette * revealMoment(0, timings, false).scale
}
