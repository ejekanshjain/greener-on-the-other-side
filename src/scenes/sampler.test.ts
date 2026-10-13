import { describe, expect, it } from 'vitest'

import { ReleaseSampler } from './sampler'

describe('ReleaseSampler', () => {
  it('reports the peak speed in the last 100 ms', () => {
    const s = new ReleaseSampler()
    // Slow drag, then a fast flick upward at 1,200 px/s for the last 80 ms.
    for (let t = 0; t <= 400; t += 16) s.add(100, 500 - t * 0.2, t)
    let y = 500 - 400 * 0.2
    for (let t = 416; t <= 496; t += 16) {
      y -= 1.2 * 16
      s.add(100, y, t)
    }
    const peak = s.peak(496)
    expect(peak.speedPx).toBeCloseTo(1200, -1)
    expect(peak.dirY).toBeLessThan(0)
    expect(Math.abs(peak.dirX)).toBeLessThan(1e-9)
  })

  it('gives 0 after a mouse pause longer than 100 ms', () => {
    const s = new ReleaseSampler()
    for (let t = 0; t <= 100; t += 10) s.add(t * 10, 0, t)
    expect(s.peak(220).speedPx).toBe(0)
  })

  it('keeps the speed when a finger lifts mid-motion', () => {
    const s = new ReleaseSampler()
    for (let t = 0; t <= 60; t += 12) s.add(0, -t, t)
    expect(s.peak(64).speedPx).toBeCloseTo(1000, -1)
  })

  it('ignores pairs closer than 8 ms', () => {
    const s = new ReleaseSampler()
    s.add(0, 0, 0)
    s.add(0, -50, 2)
    expect(s.peak(2).speedPx).toBe(0)
  })

  it('measures rubbing back and forth by the path, not the displacement', () => {
    const sampler = new ReleaseSampler()
    // 10 px every 10 ms, reversing every 30 ms: 1,000 px/s of rubbing, little net motion.
    for (let t = 0, x = 0, dir = 1; t <= 200; t += 10) {
      sampler.add(x, 0, t)
      if (t % 30 === 20) dir = -dir
      x += 10 * dir
    }
    expect(sampler.pathSpeed(200)).toBeCloseTo(1000, -1)
    expect(sampler.pathSpeed(400)).toBe(0)
  })
})
