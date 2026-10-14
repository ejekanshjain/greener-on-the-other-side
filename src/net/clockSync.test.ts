import { describe, expect, it } from 'vitest'

import { matchPhaseAt, matchTimings, playStart } from '../game/match'
import { ClockSync, sampleOf } from './clockSync'

/** One ping from `guest` at host time `t`, with one-way delays `up` and `down`. */
function ping(guest: ClockSync, t: number, up: number, down: number) {
  const t0 = guest.local()
  const th = t + up // host clock when it answers
  return sampleOf(t0, th, t0 + up + down)
}

describe('ClockSync', () => {
  it('finds the right sign with a host 3,000 ms ahead or behind', () => {
    for (const hostAhead of [3000, -3000]) {
      let t = 100_000
      const guest = new ClockSync(() => t - hostAhead)
      guest.addJoinSample(ping(guest, t, 40, 40))
      expect(guest.now() - t).toBeCloseTo(0)
      t += 500
      expect(guest.now()).toBeCloseTo(t)
    }
  })

  it('keeps the shortest round trip and rejects any over 400 ms', () => {
    const t = 50_000
    const guest = new ClockSync(() => t)
    guest.addJoinSample(sampleOf(t, t + 900, t + 500)) // 500 ms: refused
    expect(guest.synced).toBe(false)
    guest.addJoinSample(sampleOf(t, t + 60, t + 100)) // rtt 100, offset 10
    guest.addJoinSample(sampleOf(t, t + 300, t + 300)) // rtt 300: slower, ignored
    expect(guest.bestRtt).toBe(100)
    expect(guest.offset).toBeCloseTo(10)
    expect(guest.endJoinBatch(false)).toBe(true)
  })

  it('keeps a slow batch only on the retry, and flags it', () => {
    const guest = new ClockSync(() => 0)
    guest.addJoinSample(sampleOf(0, 400, 600))
    expect(guest.endJoinBatch(false)).toBe(false)
    guest.addJoinSample(sampleOf(0, 300, 500))
    guest.addJoinSample(sampleOf(0, 400, 700))
    expect(guest.endJoinBatch(true)).toBe(true)
    expect(guest.rough).toBe(true)
    expect(guest.bestRtt).toBe(500)
  })

  it('accepts a resample only within 1.5 times the best round trip', () => {
    const guest = new ClockSync(() => 0)
    guest.addJoinSample(sampleOf(0, 50, 100))
    expect(guest.addResample(sampleOf(0, 100, 200))).toBe(false)
    expect(guest.addResample(sampleOf(0, 80, 140))).toBe(true)
    expect(guest.offset).toBeCloseTo(10)
  })

  it('stands still through a pause and runs on behind by the paused span', () => {
    let t = 1_000_000
    const clock = new ClockSync(() => t)
    const match = { ...matchTimings(false), at: 1_010_000 }
    clock.pause(1_050_000)
    expect(clock.paused).toBe(false)
    t = 1_050_000
    expect(clock.paused).toBe(true)
    const stopped = matchPhaseAt(match, clock.now())
    for (const later of [1_060_000, 1_080_000, 1_110_000]) {
      t = later
      expect(clock.now()).toBe(1_050_000)
      expect(matchPhaseAt(match, clock.now())).toEqual(stopped)
    }
    clock.resume(1_110_000)
    expect(clock.paused).toBe(false)
    // Every later phase and round time matches an unpaused run 60s earlier.
    for (const later of [1_110_000, 1_200_000, 1_300_000, 1_500_000]) {
      t = later
      expect(clock.now()).toBe(later - 60_000)
      expect(matchPhaseAt(match, clock.now())).toEqual(
        matchPhaseAt(match, later - 60_000)
      )
      expect(clock.now() - playStart(match, 1)).toBe(
        later - 60_000 - playStart(match, 1)
      )
    }
    // Pongs carry the shared clock as it really runs, so a guest's offset ignores pauses.
    expect(clock.shared()).toBe(1_500_000)
  })

  it('adds up spans across pauses and ignores a resume before the pause begins', () => {
    let t = 0
    const clock = new ClockSync(() => t)
    clock.pause(1000)
    clock.resume(500)
    t = 2000
    expect(clock.now()).toBe(2000)
    clock.pause(3000)
    t = 4000
    // A resume set for later keeps the clock still until then.
    clock.resume(5000)
    expect(clock.now()).toBe(3000)
    t = 5500
    expect(clock.now()).toBe(3500)
    clock.pause(6000)
    t = 7000
    expect(clock.now()).toBe(4000)
    clock.resume(8000)
    t = 9000
    expect(clock.now()).toBe(5000)
    expect(clock.heldMs).toBe(4000)
  })
})
