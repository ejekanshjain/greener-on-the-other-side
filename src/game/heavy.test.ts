import { describe, expect, it } from 'vitest'

import {
  footprintPatches,
  footprintRect,
  HeavyGrip,
  litterSpill,
  mowerRun,
  rollSpeed
} from './heavy'
import { COLS, LIFT_MS, ROWS, SLIDE_DECAY, SLIDE_STOP, TICK_MS } from './tuning'

describe('footprints', () => {
  it('covers exactly 2 by 2 or 3 by 3 patches wherever the junk lands', () => {
    for (const [lx, ly] of [
      [137, 263],
      [25, 20],
      [598, 639],
      [300, 320]
    ] as const) {
      const bin = footprintPatches(footprintRect('bin', lx, ly, true))
      const trampoline = footprintPatches(
        footprintRect('trampoline', lx, ly, true)
      )
      expect(bin).toHaveLength(4)
      expect(trampoline).toHaveLength(9)
      expect(new Set(trampoline).size).toBe(9)
    }
  })

  it('counts no patches for the part of a drag over the patio', () => {
    expect(footprintPatches(footprintRect('bin', 130, 716, false))).toEqual([])
    // Half over the back row: only the back-row patches count.
    const half = footprintPatches(footprintRect('bin', 125, 650, false))
    expect(half.every(p => Math.floor(p / COLS) === ROWS - 1)).toBe(true)
    expect(half).toHaveLength(2)
  })
})

describe('HeavyGrip', () => {
  it('lifts after 0.6s held still, with up to 12 px of wobble', () => {
    const grip = new HeavyGrip()
    grip.start(100, 100, 0)
    expect(grip.move(108, 104, 300, 50)).toBe('wait')
    expect(grip.tick(LIFT_MS - 1)).toBe('wait')
    expect(grip.tick(LIFT_MS)).toBe('lifted')
  })

  it('drags when the finger slides more than 12 px before the lift', () => {
    const grip = new HeavyGrip()
    grip.start(100, 100, 0)
    expect(grip.move(100, 113, 50, 300)).toBe('drag')
    // A drag stays a drag, even held still long after.
    expect(grip.tick(5000)).toBe('drag')
  })

  it('sets a lifted heavy back down on a slow drift, but not on a swipe', () => {
    const slow = new HeavyGrip()
    slow.start(100, 100, 0)
    slow.tick(LIFT_MS)
    expect(slow.move(100, 115, 900, 150)).toBe('lifted')
    expect(slow.move(100, 130, 1000, 150)).toBe('down')
    // A swipe after a long still hold: its first sample has no speed to show yet.
    const swipe = new HeavyGrip()
    swipe.start(100, 100, 0)
    swipe.tick(LIFT_MS)
    expect(swipe.move(100, 85, 1500, 0)).toBe('lifted')
    expect(swipe.move(100, -90, 1600, 1800)).toBe('lifted')
  })
})

describe('mowerRun', () => {
  it('drives 4 patches, each one step forward with at most one sideways jog', () => {
    for (let id = 1; id < 40; id++) {
      const start = 7 * COLS + 6
      const path = mowerRun(99, id, start, 0, 1)
      expect(path).toHaveLength(4)
      let prev = start
      for (const patch of path) {
        expect(Math.floor(patch / COLS) - Math.floor(prev / COLS)).toBe(1)
        expect(Math.abs((patch % COLS) - (prev % COLS))).toBeLessThanOrEqual(1)
        prev = patch
      }
    }
  })

  it('turns back at the back wall and stays on the lawn', () => {
    const path = mowerRun(5, 3, 15 * COLS + 11, 0.2, 1)
    expect(Math.floor((path[0] as number) / COLS)).toBe(14)
    for (const patch of path) {
      expect(patch).toBeGreaterThanOrEqual(0)
      expect(patch).toBeLessThan(COLS * ROWS)
    }
  })
})

describe('litterSpill', () => {
  it('spills 4 different looks round the bin, on the lawn', () => {
    const spill = litterSpill(12, 40, 20, 600)
    expect(spill.map(s => s.look).sort()).toEqual([0, 1, 2, 3])
    for (const s of spill) {
      expect(s.lx).toBeGreaterThanOrEqual(10)
      expect(s.ly).toBeLessThanOrEqual(630)
    }
  })
})

describe('rollSpeed', () => {
  it('brings a slide to rest within a unit of the distance asked for', () => {
    let x = 0
    let v = rollSpeed(90)
    const dt = TICK_MS / 1000
    const decay = Math.exp(-SLIDE_DECAY * dt)
    while (Math.abs(v) >= SLIDE_STOP) {
      v *= decay
      x += v * dt
    }
    expect(x).toBeGreaterThan(89)
    expect(x).toBeLessThan(91)
  })
})
