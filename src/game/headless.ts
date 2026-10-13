import { encodeFinal } from '../net/finalCodec'
import { judgeRound, type RoundResult } from '../net/judge'
import { decodeThrowItem, encodeCrossing } from '../net/throwCodec'
import { Brain, type Shares } from './brain'
import { Garden, type Blame } from './garden'
import { matchTimings, ROUNDS } from './match'
import type { Profile } from './profiles'
import { finalReport, type FinalReport } from './report'
import { ARRIVAL_FAST_FORWARD_MS, HEATWAVE_ROUND } from './tuning'
import { roundSeed } from './seed'
import { matchResult, type Winner } from './score'

/** A profile for every round, or one for the whole match. */
export type Lineup = Profile | ((round: number) => Profile)

/** Options for a headless match between two bots. `a` hosts. */
export interface SimOptions {
  seed: number
  a: Lineup
  b: Lineup
  /** `?fast` timings: 45s rounds. */
  fast?: boolean
  /** Play only this many rounds, even if the match goes on. */
  rounds?: number
  /** Garden time between brain steps, in ms. */
  stepMs?: number
}

/** One round of a headless match: the host's verdict, both finals and what each side spent time on. */
export interface SimRound {
  result: RoundResult
  /** The host's and the guest's true lawns at 0:00, as Brenda scored them. */
  finals: [FinalReport, FinalReport]
  blame: [Blame, Blame]
  shares: [Shares, Shares]
}

/** A finished headless match. */
export interface SimMatch {
  rounds: SimRound[]
  winner: Winner | null
}

const pick = (lineup: Lineup, round: number) =>
  typeof lineup === 'function' ? lineup(round) : lineup

/**
 * Plays one round between two bots with no screen and no network: two gardens on the same
 * round seed, joined by an in-process fence that hands each crossing to the other garden
 * through the real wire codec. Returns the verdict the host would send.
 */
export function simulateRound(
  seed: number,
  round: number,
  a: Profile,
  b: Profile,
  { fast = false, stepMs = 50 }: { fast?: boolean; stepMs?: number } = {},
  previous?: RoundResult
): SimRound {
  const { roundMs } = matchTimings(fast)
  const rs = roundSeed(seed, round)
  const heatwave = round === HEATWAVE_ROUND
  const gardens = [true, false].map(
    host => new Garden({ seed: rs, round, roundMs, heatwave, host })
  ) as [Garden, Garden]
  const brains = [new Brain(a, rs ^ 0x5a5a), new Brain(b, rs ^ 0xa5a5)] as const
  let ids = 0
  for (let t = 0; t < roundMs;) {
    for (let side = 0; side < 2; side++)
      brains[side]?.step(gardens[side] as Garden)
    t = Math.min(roundMs, t + stepMs)
    for (let side = 0; side < 2; side++) {
      const garden = gardens[side] as Garden
      const other = gardens[1 - side] as Garden
      garden.advanceTo(t)
      const events = garden.drainEvents()
      brains[side]?.observe(events)
      for (const event of events) {
        if (event.type !== 'cross') continue
        const arrival = decodeThrowItem(
          encodeCrossing(event.crossing, `sim.${ids++}`, event.crossing.at)
        )
        if (!arrival) continue
        const ffMs = Math.min(ARRIVAL_FAST_FORWARD_MS, t - event.crossing.at)
        other.command({ type: 'arrive', arrival, ffMs })
      }
    }
  }
  const [host, guest] = gardens
  const finals: [FinalReport, FinalReport] = [
    finalReport(host),
    finalReport(guest)
  ]
  const result = judgeRound(
    round,
    encodeFinal(finals[0]),
    encodeFinal(finals[1]),
    previous
  )
  if (!result) throw new Error('the host final failed to decode')
  return {
    result,
    finals,
    blame: [{ ...host.blame }, { ...guest.blame }],
    shares: [{ ...brains[0].shares }, { ...brains[1].shares }]
  }
}

/** Plays a whole match between two bots, round after round until it's decided. */
export function simulateMatch(options: SimOptions): SimMatch {
  const rounds: SimRound[] = []
  const limit = Math.min(ROUNDS, options.rounds ?? ROUNDS)
  for (let round = 0; round < limit; round++) {
    const sim = simulateRound(
      options.seed,
      round,
      pick(options.a, round),
      pick(options.b, round),
      options,
      rounds[rounds.length - 1]?.result
    )
    rounds.push(sim)
    if (sim.result.over) break
  }
  const last = rounds[rounds.length - 1]?.result
  return {
    rounds,
    winner: last?.over
      ? matchResult(last.tally, last.totals, last.round + 1).winner
      : null
  }
}
