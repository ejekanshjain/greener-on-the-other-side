import { describe, expect, it } from 'vitest'

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
})
