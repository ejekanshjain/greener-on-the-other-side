import { describe, expect, it } from 'vitest'

import {
  createGrid,
  dryProgress,
  dryTime,
  lawnClock,
  runTimers,
  stripeMask,
  type Grid
} from './grid'
import { dryStagger } from './seed'
import {
  COLS,
  DRY_MS,
  GROW_MS,
  HEALTH_START,
  HEATWAVE_DRY,
  LATE_DRY_LEFT_MS,
  LATE_DRY_MS,
  LENGTH_MAX,
  PATCHES,
  ROUND_MS,
  ROWS
} from './tuning'
import { Mess } from './types'

/** Runs a grid's timers tick by tick up to `t`, like a garden does. */
function runTo(grid: Grid, t: number, stepMs = 1000 / 60): void {
  for (let now = stepMs; now <= t; now += stepMs) runTimers(grid, now)
  runTimers(grid, t)
}

/** Garden times of one patch's first `n` dries. */
function dryTimes(grid: Grid, patch: number, n: number): number[] {
  const out: number[] = []
  let step = grid.dryStep[patch] as number
  for (let k = 0; k < n; k++) out.push(dryTime(grid.clock, step + k))
  return out
}

describe('lawn drying', () => {
  it('staggers each patch’s first dry across the first drying period', () => {
    const grid = createGrid(11)
    const first = Array.from(grid.dryAt)
    expect(Math.min(...first)).toBeGreaterThan(0)
    expect(Math.max(...first)).toBeLessThanOrEqual(DRY_MS)
    runTo(grid, DRY_MS / 2, 250)
    const dried = grid.health.filter(h => h === HEALTH_START - 1).length
    // Half the lawn has dried once halfway through the period, give or take the seed.
    expect(dried).toBeGreaterThan(70)
    expect(dried).toBeLessThan(122)
  })

  it('dries every period, then faster from 1:20 left', () => {
    const clock = lawnClock()
    expect(clock.lateAt).toBe(ROUND_MS - LATE_DRY_LEFT_MS)
    const grid = createGrid(5)
    for (let patch = 0; patch < PATCHES; patch += 17) {
      const [a, b, c] = dryTimes(grid, patch, 3) as [number, number, number]
      if (b <= clock.lateAt) expect(b - a).toBeCloseTo(DRY_MS)
      if (b >= clock.lateAt) expect(c - b).toBeCloseTo(LATE_DRY_MS)
    }
  })

  it('ends an idle round with each patch dried by its expected count', () => {
    const seed = 2024
    const grid = createGrid(seed)
    runTo(grid, ROUND_MS)
    const periods = dryProgress(grid.clock, ROUND_MS)
    const lateAt = ROUND_MS - LATE_DRY_LEFT_MS
    expect(periods).toBeCloseTo(
      lateAt / DRY_MS + LATE_DRY_LEFT_MS / LATE_DRY_MS
    )
    for (let i = 0; i < PATCHES; i++) {
      const expected = Math.floor(periods + dryStagger(seed, i))
      expect(grid.health[i]).toBe(HEALTH_START - expected)
    }
  })

  it('dries HEATWAVE_DRY times as fast in the heatwave, and grows as usual', () => {
    const hot = lawnClock(ROUND_MS, true)
    expect(hot.dryMs).toBeCloseTo(DRY_MS / HEATWAVE_DRY)
    expect(hot.lateDryMs).toBeCloseTo(LATE_DRY_MS / HEATWAVE_DRY)
    expect(hot.growMs).toBe(GROW_MS)
  })

  it('makes an idle fast round end like an idle full round', () => {
    const full = createGrid(77)
    const fast = createGrid(77, lawnClock(45_000))
    runTo(full, ROUND_MS, 250)
    runTo(fast, 45_000, 250)
    expect(Array.from(fast.health)).toEqual(Array.from(full.health))
    expect(Array.from(fast.length)).toEqual(Array.from(full.length))
  })
})

describe('lawn growth', () => {
  it('grows each patch once in its first 75s, staggered, up to shaggy', () => {
    const grid = createGrid(3)
    runTo(grid, 37_500, 250)
    const grown = grid.length.filter(l => l === 3).length
    expect(grown).toBeGreaterThan(70)
    expect(grown).toBeLessThan(122)
    runTo(grid, ROUND_MS, 250)
    expect(grid.length.every(l => l === LENGTH_MAX)).toBe(true)
  })

  it('marks only the rows that changed', () => {
    const grid = createGrid(9)
    grid.dirtyRows = 0
    const first = Math.min(
      ...Array.from(grid.dryAt),
      ...Array.from(grid.growAt)
    )
    runTimers(grid, first)
    expect(grid.dirtyRows).not.toBe(0)
    expect(grid.dirtyRows & (grid.dirtyRows - 1)).toBe(0)
  })
})

describe('stripes', () => {
  /** A grid whose column `col` has `short` short, clean patches. */
  function column(col: number, short: number): Grid {
    const grid = createGrid(1)
    for (let row = 0; row < short; row++) grid.length[row * COLS + col] = 1
    return grid
  }

  it('needs 14 of 16 patches short and clean', () => {
    expect(stripeMask(column(3, 14))).toBe(1 << 3)
    expect(stripeMask(column(3, 13))).toBe(0)
    expect(stripeMask(column(0, ROWS))).toBe(1)
  })

  it('counts mess, holes and anything lying on a patch as not clean', () => {
    const messy = column(5, 14)
    messy.mess[5] = Mess.scuff
    expect(stripeMask(messy)).toBe(0)
    const holed = column(5, 14)
    holed.hole[COLS + 5] = 1
    expect(stripeMask(holed)).toBe(0)
    const occupied = new Uint8Array(PATCHES)
    occupied[2 * COLS + 5] = 1
    expect(stripeMask(column(5, 14), occupied)).toBe(0)
    expect(stripeMask(column(5, 15), occupied)).toBe(1 << 5)
  })
})
