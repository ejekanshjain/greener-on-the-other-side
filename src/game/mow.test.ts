import { describe, expect, it } from 'vitest'

import { Garden } from './garden'
import { createGrid, patchCenter, runTimers, stripeMask } from './grid'
import { createMower, mowTo, parkMower, type MowEvent } from './mow'
import { BAG_CUTS, COLS, HEALTH_START, PATCH_D, ROWS, TICK_MS } from './tuning'
import { Mess } from './types'

function mowSetup() {
  const grid = createGrid(1)
  const m = createMower()
  const events: MowEvent[] = []
  const mow = (patch: number, t: number, speedPx = 600) => {
    const { lx, ly } = patchCenter(patch)
    mowTo(m, grid, lx, ly, speedPx, t, e => events.push(e))
  }
  return { grid, m, events, mow }
}

/** Rubs the mower down a whole column, one patch per tick, starting at the garden's time. */
function passDown(garden: Garden, col: number, speedPx = 600): void {
  for (let row = 0; row < ROWS; row++) {
    garden.command({
      type: 'mow',
      lx: col * 50 + 25,
      ly: row * PATCH_D + 20,
      speedPx
    })
    garden.advanceTo(garden.t + TICK_MS)
  }
  garden.command({ type: 'mowEnd' })
  garden.advanceTo(garden.t + TICK_MS)
}

describe('mowing', () => {
  it('cuts a patch on entry, clears its mess and fills the bag', () => {
    const { grid, m, mow } = mowSetup()
    const patch = 4 * COLS + 2
    grid.mess[patch] = Mess.puddle
    mow(patch, 1000)
    expect(grid.length[patch]).toBe(1)
    expect(grid.mess[patch]).toBe(Mess.none)
    expect(grid.growAt[patch]).toBe(1000 + 75_000)
    expect(m.bag).toBe(1)
  })

  it('leaves grown grass short after one pass, and at 0 after a second', () => {
    const { grid, mow } = mowSetup()
    const patch = 4 * COLS + 2
    grid.length[patch] = 3
    mow(patch, 1000)
    expect(grid.length[patch]).toBe(1)
    mow(patch + 1, 1100)
    mow(patch, 1400)
    expect(grid.length[patch]).toBe(0)
  })

  it('cuts every patch it rolls through between two samples', () => {
    const { grid, m, events } = mowSetup()
    mowTo(m, grid, 125, 20, 600, 1000, e => events.push(e))
    mowTo(m, grid, 125, 620, 600, 1016, e => events.push(e))
    expect(events.filter(e => e.type === 'cut')).toHaveLength(16)
    for (let row = 0; row < 16; row++)
      expect(grid.length[row * COLS + 2]).toBe(1)
  })

  it('skips a patch cut in the last 250 ms', () => {
    const { grid, mow } = mowSetup()
    const a = 2 * COLS + 2
    mow(a, 1000)
    mow(a + 1, 1100)
    mow(a, 1200)
    expect(grid.length[a]).toBe(1)
    mow(a + 1, 1300)
    mow(a, 1400)
    expect(grid.length[a]).toBe(0)
  })

  it('scalps from 1,300 px/s and only shakes below that', () => {
    const { grid, events, mow } = mowSetup()
    mow(30, 1000, 1299)
    expect(grid.health[30]).toBe(HEALTH_START)
    mow(31, 1000, 1300)
    expect(grid.health[31]).toBe(HEALTH_START - 1)
    expect(grid.mess[31]).toBe(Mess.scalp)
    expect(events.filter(e => e.type === 'scalp')).toHaveLength(1)
  })

  it('stops cutting with a full bag and spits clippings instead', () => {
    const { grid, m, events, mow } = mowSetup()
    m.bag = BAG_CUTS - 1
    mow(10, 1000)
    expect(m.bag).toBe(BAG_CUTS)
    expect(events.some(e => e.type === 'bagFull')).toBe(true)
    mow(11, 1100)
    expect(grid.length[11]).toBe(2)
    expect(grid.mess[11]).toBe(Mess.clippings)
    parkMower(m)
    mow(12, 1200)
    expect(events.filter(e => e.type === 'bagFull')).toHaveLength(2)
  })
})

describe('stripes in the garden', () => {
  /** A grid with column 5 cut once (or twice) at garden time 1s; returns when it stripes. */
  function cutColumn(passes: number): (t: number) => boolean {
    const { grid, m, mow } = mowSetup()
    for (let pass = 0; pass < passes; pass++) {
      for (let row = 0; row < ROWS; row++)
        mow(row * COLS + 5, 1000 + pass * 300)
      parkMower(m)
    }
    return t => {
      runTimers(grid, t)
      return (stripeMask(grid) & (1 << 5)) !== 0
    }
  }

  it('stripes a column for 75s after one pass', () => {
    const striped = cutColumn(1)
    expect(striped(1000)).toBe(true)
    expect(striped(75_900)).toBe(true)
    expect(striped(76_100)).toBe(false)
  })

  it('holds the stripe for 150s after two passes', () => {
    const striped = cutColumn(2)
    expect(striped(150_000)).toBe(true)
    expect(striped(151_400)).toBe(false)
  })

  it('counts scalps against you', () => {
    const garden = new Garden({ seed: 5 })
    passDown(garden, 0, 1500)
    expect(garden.blame.scalped).toBe(ROWS)
    expect(garden.mower.bag).toBe(ROWS)
    expect(garden.mower.at).toBeNull()
  })

  it('tells you when a whole column goes shaggy', () => {
    const garden = new Garden({ seed: 5 })
    const shaggy: number[] = []
    for (let t = 1000; t <= 76_000; t += 1000) {
      garden.advanceTo(t)
      for (const e of garden.drainEvents())
        if (e.type === 'shaggy') shaggy.push(e.col)
    }
    // Every patch grows once in its first 75s, so every column goes shaggy once.
    expect(shaggy.sort((a, b) => a - b)).toEqual(
      Array.from({ length: COLS }, (_, c) => c)
    )
  })
})
