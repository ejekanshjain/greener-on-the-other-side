import { describe, expect, it } from 'vitest'

import {
  angleDiff,
  clamp,
  damp,
  hash01,
  invLerp,
  lerp,
  pick,
  rng,
  shuffle,
  wrapAngle
} from './math'

describe('math', () => {
  it('clamps, lerps and inverts lerp', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-1, 0, 3)).toBe(0)
    expect(lerp(10, 20, 0.25)).toBe(12.5)
    expect(invLerp(10, 20, 12.5)).toBe(0.25)
    expect(invLerp(4, 4, 9)).toBe(0)
  })

  it('damps the same amount for one big step or many small ones', () => {
    const once = damp(0, 100, 5, 0.1)
    let stepped = 0
    for (let i = 0; i < 10; i++) stepped = damp(stepped, 100, 5, 0.01)
    expect(stepped).toBeCloseTo(once, 9)
  })

  it('wraps angles into (-PI, PI] and finds the shortest turn', () => {
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI)
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI)
    expect(wrapAngle(3 * Math.PI + 0.5)).toBeCloseTo(-Math.PI + 0.5)
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2)
    expect(angleDiff(0.1, -0.1)).toBeCloseTo(-0.2)
  })

  it('repeats seeded sequences and stays in [0, 1)', () => {
    const a = rng(7)
    const b = rng(7)
    for (let i = 0; i < 100; i++) {
      const value = a()
      expect(value).toBe(b())
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
    expect(hash01(3, 4)).toBe(hash01(3, 4))
    expect(hash01(3, 4)).not.toBe(hash01(3, 5))
  })

  it('shuffles in place without losing items and refuses empty picks', () => {
    const items = [1, 2, 3, 4, 5, 6]
    const result = shuffle(items, rng(1))
    expect(result).toBe(items)
    expect([...result].sort()).toEqual([1, 2, 3, 4, 5, 6])
    expect(() => pick([], rng(1))).toThrow()
  })
})
