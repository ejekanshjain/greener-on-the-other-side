import { describe, expect, it } from 'vitest'

import { setPatch } from './cheats'
import { Garden } from './garden'
import { createGrid, patchCenter } from './grid'
import {
  CAN_MS,
  COLS,
  HEALTH_MAX,
  MUD_HEALTH,
  PATCHES,
  TICK_MS
} from './tuning'
import { Mess, type GardenEvent } from './types'
import {
  createWater,
  FLOOD_TARGETS,
  pourAt,
  pourPatches,
  stepWater,
  stopPour,
  toggleTap,
  type Water,
  type WaterEvent
} from './water'

/** A grid with no timers in the way, a fresh can, and a log of water events. */
function setup(heatwave = false) {
  const grid = createGrid(1)
  grid.nextTimerAt = Infinity
  const w = createWater(heatwave)
  const events: { at: number; event: WaterEvent }[] = []
  let t = 0
  const run = (ms: number) => {
    const end = t + ms
    while (t + TICK_MS <= end + 1e-9) {
      t += TICK_MS
      stepWater(w, grid, TICK_MS, event => events.push({ at: t, event }))
    }
  }
  return { grid, w, events, run, now: () => t }
}

const firstAt = (events: { at: number; event: WaterEvent }[], type: string) =>
  events.find(e => e.event.type === type)?.at ?? -1

describe('pouring', () => {
  it('waters a plus-shaped spot of 5 patches from a patch centre', () => {
    const { lx, ly } = patchCenter(5 * COLS + 5)
    expect(pourPatches(lx, ly, []).sort((a, b) => a - b)).toEqual([
      4 * COLS + 5,
      5 * COLS + 4,
      5 * COLS + 5,
      5 * COLS + 6,
      6 * COLS + 5
    ])
  })

  it('adds 1 health per 0.4s, sparkles at 7 and drowns 1.5s later', () => {
    const { grid, w, events, run } = setup()
    const patch = 6 * COLS + 6
    const { lx, ly } = patchCenter(patch)
    pourAt(w, lx, ly)
    run(380)
    expect(grid.health[patch]).toBe(5)
    run(40)
    expect(grid.health[patch]).toBe(6)
    run(2000)
    expect(firstAt(events, 'sparkle')).toBeCloseTo(800, -2)
    const drownedAt = firstAt(events, 'drown')
    expect(drownedAt).toBeGreaterThan(2250)
    expect(drownedAt).toBeLessThan(2350)
    expect(grid.health[patch]).toBe(MUD_HEALTH)
    expect(grid.mess[patch]).toBe(Mess.puddle)
  })

  it('loses banked pour time when the pour moves off a patch', () => {
    const { grid, w, run } = setup()
    const patch = 3 * COLS + 2
    const { lx, ly } = patchCenter(patch)
    pourAt(w, lx, ly)
    run(300)
    pourAt(w, lx + 300, ly)
    run(100)
    pourAt(w, lx, ly)
    run(300)
    expect(grid.health[patch]).toBe(5)
  })

  it('empties the can after 10s of pouring and then pours nothing', () => {
    const { grid, w, events, run } = setup()
    pourAt(w, 300, 300)
    run(CAN_MS + 500)
    expect(w.can).toBe(0)
    expect(events.filter(e => e.event.type === 'canEmpty')).toHaveLength(1)
    const before = Array.from(grid.health)
    run(2000)
    expect(Array.from(grid.health)).toEqual(before)
  })
})

describe('the tap', () => {
  function emptyCan(w: Water) {
    w.can = 0
  }

  it('fills an empty can in 3s, or 6s in the heatwave', () => {
    for (const [heatwave, ms] of [
      [false, 3000],
      [true, 6000]
    ] as const) {
      const { w, run } = setup(heatwave)
      emptyCan(w)
      toggleTap(w)
      run(ms - 100)
      expect(w.can).toBeLessThan(CAN_MS)
      run(200)
      expect(w.can).toBe(CAN_MS)
    }
  })

  it('stops filling the can while you pour, but keeps running', () => {
    const { w, run } = setup()
    emptyCan(w)
    toggleTap(w)
    pourAt(w, 300, 300)
    run(2000)
    expect(w.can).toBe(0)
    expect(w.tapOn).toBe(true)
    stopPour(w)
    run(1000)
    expect(w.can).toBeGreaterThan(3000)
  })

  it('floods exactly the 2 patches nearest it after 8s running', () => {
    const { grid, w, events, run } = setup()
    toggleTap(w)
    run(7900)
    expect(events.some(e => e.event.type === 'flood')).toBe(false)
    run(200)
    expect(FLOOD_TARGETS).toHaveLength(2)
    const changed = Array.from({ length: PATCHES }, (_, i) => i).filter(
      i => grid.health[i] !== 5
    )
    expect(changed.sort()).toEqual([...FLOOD_TARGETS].sort())
    for (const patch of FLOOD_TARGETS) {
      expect(grid.health[patch]).toBe(MUD_HEALTH)
      expect(grid.mess[patch]).toBe(Mess.puddle)
    }
    // The flood patches sit on the back row, nearest the tap on the patio.
    for (const patch of FLOOD_TARGETS) expect(Math.floor(patch / COLS)).toBe(15)
  })

  it('reports a full can left under the running tap after 4s', () => {
    const { w, events, run } = setup()
    toggleTap(w)
    run(3900)
    expect(events.some(e => e.event.type === 'tapFull')).toBe(false)
    run(200)
    expect(events.some(e => e.event.type === 'tapFull')).toBe(true)
  })
})

describe('watering in the garden', () => {
  it('counts drowned and flooded patches against you', () => {
    const garden = new Garden({ seed: 8 })
    const patch = 8 * COLS + 3
    setPatch(garden, patch, { health: HEALTH_MAX })
    const { lx, ly } = patchCenter(patch)
    garden.command({ type: 'pour', lx, ly })
    garden.command({ type: 'tap' })
    garden.advanceTo(8100)
    const events: GardenEvent[] = garden.drainEvents()
    expect(events.some(e => e.type === 'drown' && e.patch === patch)).toBe(true)
    expect(events.some(e => e.type === 'flood')).toBe(true)
    expect(garden.blame.drowned).toBeGreaterThanOrEqual(3)
  })
})
