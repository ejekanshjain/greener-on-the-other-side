import { describe, expect, it } from 'vitest'

import { matchTimings } from './match'
import { revealMoment, rosetteShown } from './reveal'

const full = matchTimings(false)
const fast = matchTimings(true)

describe('revealMoment', () => {
  it('runs a full reveal in its steps: 2s, 8s, 14s and 17s', () => {
    const at = (ms: number) => revealMoment(ms, full, false)
    expect(at(1999).step).toBe('timesUp')
    expect(at(2000).step).toBe('peel')
    expect(at(3500)).toMatchObject({ peelMine: 0.5, peelTheirs: 0 })
    expect(at(6500)).toMatchObject({ peelMine: 1, peelTheirs: 0.5 })
    expect(at(11_000)).toMatchObject({ step: 'count', count: 0.5 })
    expect(at(14_000).step).toBe('rosette')
    expect(at(17_000).step).toBe('countdown')
  })

  it('squeezes a fast reveal into the time before its countdown', () => {
    const before = fast.revealMs - fast.countdownMs
    expect(revealMoment(before - 1, fast, false).step).toBe('rosette')
    expect(revealMoment(before, fast, false).step).toBe('countdown')
  })

  it('ends the last reveal with the walk home', () => {
    const end = revealMoment(17_000 + 6500, full, true)
    expect(end.step).toBe('ending')
    expect(end.ending).toBeCloseTo(0.5)
    expect(revealMoment(30_000, full, true).ending).toBe(1)
  })

  it('holds the round out of the tally until the rosette', () => {
    expect(rosetteShown(13_999, full)).toBe(false)
    expect(rosetteShown(14_000, full)).toBe(true)
  })
})
