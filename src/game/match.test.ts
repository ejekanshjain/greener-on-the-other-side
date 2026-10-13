import { describe, expect, it } from 'vitest'

import {
  jumpedClock,
  matchPhaseAt,
  matchTimings,
  playStart,
  stretchAt
} from './match'

const m = { at: 10_000, ...matchTimings(false) }

describe('matchPhaseAt', () => {
  it('runs the countdown, then 3 rounds of play and reveal', () => {
    expect(matchPhaseAt(m, 6000).kind).toBe('waiting')
    expect(matchPhaseAt(m, 7500)).toEqual({
      kind: 'countdown',
      round: 0,
      msLeft: 2500
    })
    expect(matchPhaseAt(m, 10_000)).toMatchObject({
      kind: 'play',
      round: 0,
      msLeft: 180_000
    })
    expect(matchPhaseAt(m, 190_000)).toMatchObject({
      kind: 'reveal',
      round: 0,
      elapsed: 0,
      last: false
    })
    // The last 3s of a reveal is the next round's countdown.
    expect(matchPhaseAt(m, 207_500)).toEqual({
      kind: 'countdown',
      round: 1,
      msLeft: 2500
    })
    expect(matchPhaseAt(m, playStart(m, 1))).toMatchObject({
      kind: 'play',
      round: 1
    })
    expect(matchPhaseAt(m, playStart(m, 2) + 180_000 + 29_000)).toMatchObject({
      kind: 'reveal',
      round: 2,
      last: true
    })
    expect(matchPhaseAt(m, playStart(m, 2) + 180_000 + 30_000).kind).toBe(
      'done'
    )
  })

  it('ends with the long reveal after an earlier deciding round', () => {
    const end = playStart(m, 1) + 180_000
    expect(matchPhaseAt(m, end + 25_000, 1)).toMatchObject({
      kind: 'reveal',
      last: true
    })
    expect(matchPhaseAt(m, end + 30_000, 1).kind).toBe('done')
  })

  it('scales rounds and reveals for ?fast', () => {
    const fast = { at: 0, ...matchTimings(true) }
    expect(matchPhaseAt(fast, 44_999)).toMatchObject({
      kind: 'play',
      msLeft: 1
    })
    expect(matchPhaseAt(fast, 45_000 + 7000)).toMatchObject({
      kind: 'countdown',
      round: 1
    })
    expect(playStart(fast, 2)).toBe(110_000)
  })
})

describe('stretchAt', () => {
  it('switches at 2:20, 1:20 and 0:40 left, scaled to the round', () => {
    expect(stretchAt(140_001, 180_000)).toBe(0)
    expect(stretchAt(140_000, 180_000)).toBe(1)
    expect(stretchAt(80_000, 180_000)).toBe(2)
    expect(stretchAt(40_000, 180_000)).toBe(3)
    expect(stretchAt(35_000, 45_000)).toBe(1)
    expect(stretchAt(10_000, 45_000)).toBe(3)
  })
})

describe('jumpedClock', () => {
  it('moves the match so the round has the asked time left', () => {
    const at = jumpedClock(m, 1, 40_000, 500_000)
    expect(matchPhaseAt({ ...m, at }, 500_000)).toMatchObject({
      kind: 'play',
      round: 1,
      msLeft: 40_000
    })
  })
})
