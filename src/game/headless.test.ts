import { describe, expect, it } from 'vitest'

import { simulateMatch, simulateRound } from './headless'
import { PEMBERTON, PLAYERS } from './profiles'

describe('headless bot matches', () => {
  it('plays the same round every time from one seed', () => {
    const a = simulateRound(4242, 0, PLAYERS.regular, PEMBERTON[1])
    const b = simulateRound(4242, 0, PLAYERS.regular, PEMBERTON[1])
    expect(b).toEqual(a)
    expect(a.shares[0].throws).toBeGreaterThan(0)
    expect(a.shares[1].upkeep).toBeGreaterThan(0)
  })

  it('lets a learner beat polite Mr Pemberton in at least 60% of 40 round 1s', () => {
    let wins = 0
    for (let seed = 1; seed <= 40; seed++)
      if (
        simulateRound(seed * 7919, 0, PLAYERS.learner, PEMBERTON[0]).result
          .winner === 'h'
      )
        wins++
    expect(wins).toBeGreaterThanOrEqual(24)
  }, 30_000)

  it('plays a whole match against his three moods until someone has 2 wins', () => {
    const match = simulateMatch({
      seed: 99,
      a: PLAYERS.expert,
      b: round => PEMBERTON[round] ?? PEMBERTON[0],
      fast: true
    })
    const last = match.rounds[match.rounds.length - 1]?.result
    expect(last?.over).toBe(true)
    expect(match.winner).not.toBeNull()
    expect(match.rounds.length).toBeGreaterThanOrEqual(2)
  })
})
