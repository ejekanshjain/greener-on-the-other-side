import { describe, expect, it } from 'vitest'

import { gustSoon } from './cheats'
import { crossingOf } from './flight'
import { Garden } from './garden'
import { ITEM_LIFT } from './items'
import {
  CLOCK_MS,
  CLOCK_SEEDS,
  COLS,
  DANDELION_FROM_ROUND,
  DANDELION_SHARE,
  SEED_ROOT_MS,
  TICK_MS
} from './tuning'
import type { GardenEvent, RootedWeed } from './types'
import { isDandelion, seedPatches } from './weeds'

type Logged = { at: number; event: GardenEvent }

function run(garden: Garden, t: number, log: Logged[] = []): Logged[] {
  while (garden.t < t - 1e-6) {
    garden.advanceTo(garden.t + TICK_MS)
    for (const event of garden.drainEvents()) log.push({ at: garden.t, event })
  }
  return log
}

/** A round 2 garden run until its first seed clock appears. */
function gardenWithClock(seed = 5): { garden: Garden; clock: RootedWeed } {
  const garden = new Garden({ seed, round: 1 })
  for (let t = 1000; t < 120_000; t += 1000) {
    run(garden, t)
    const clock = garden.weeds.find(w => w.kind === 'seedClock')
    if (clock) return { garden, clock }
  }
  throw new Error('no seed clock in 2 minutes')
}

/** Yanks a rooted weed and holds it, returning the yanked item's id. */
function yank(garden: Garden, weed: RootedWeed): number {
  const y = weed.ly - ITEM_LIFT[weed.kind]
  garden.command({
    type: 'grab',
    target: { type: 'weed', id: weed.id, distance: 0 },
    lx: weed.lx,
    ly: y
  })
  garden.command({ type: 'hold', lx: weed.lx, ly: y - 70 })
  const log = run(garden, garden.t + TICK_MS * 2)
  const hit = log.find(e => e.event.type === 'yank')
  if (hit?.event.type !== 'yank') throw new Error('no yank')
  return hit.event.id
}

describe('dandelions', () => {
  it('sprout as 1 weed in 4 from round 2 on, never in round 1', () => {
    let count = 0
    for (let k = 0; k < 2000; k++) {
      expect(isDandelion(7, 0, k, DANDELION_FROM_ROUND, DANDELION_SHARE)).toBe(
        false
      )
      if (isDandelion(7, 1, k, DANDELION_FROM_ROUND, DANDELION_SHARE)) count++
    }
    expect(count / 2000).toBeGreaterThan(0.21)
    expect(count / 2000).toBeLessThan(0.29)
  })

  it('turn into seed clocks 40s after sprouting, at the same moments on both lawns', () => {
    const clocks = (garden: Garden) => {
      const log = run(garden, 100_000)
      const sprouts = new Map<number, number>()
      const out: [number, number][] = []
      for (const { at, event } of log) {
        if (event.type === 'sprout' && !sprouts.has(event.patch))
          sprouts.set(event.patch, at)
        if (event.type === 'clock') {
          expect(at - (sprouts.get(event.patch) ?? -1e9)).toBeCloseTo(
            CLOCK_MS,
            -2
          )
          out.push([at, event.patch])
        }
      }
      return out
    }
    const a = clocks(new Garden({ seed: 5, round: 1 }))
    expect(a.length).toBeGreaterThan(0)
    expect(clocks(new Garden({ seed: 5, round: 1, host: false }))).toEqual(a)
    expect(clocks(new Garden({ seed: 5, round: 0 }))).toEqual([])
  })
})

describe('seed clocks', () => {
  it('burst into 3 seeds around them when put down, and each roots 10s later', () => {
    const { garden, clock } = gardenWithClock()
    yank(garden, clock)
    garden.command({
      type: 'release',
      release: { type: 'putDown', reason: 'slow' }
    })
    const log = run(garden, garden.t + TICK_MS * 2)
    const burst = log.find(e => e.event.type === 'burst')
    if (burst?.event.type !== 'burst') throw new Error('no burst')
    expect(burst.event.over).toBe(false)
    expect(garden.seeds).toHaveLength(CLOCK_SEEDS)
    const at = burst.event.patch
    const near = (p: number) =>
      Math.abs(Math.floor(p / COLS) - Math.floor(at / COLS)) <= 1 &&
      Math.abs((p % COLS) - (at % COLS)) <= 1
    expect(garden.seeds.every(s => near(s.patch))).toBe(true)
    const patches = garden.seeds.map(s => s.patch)
    run(garden, burst.at + SEED_ROOT_MS - 50, log)
    expect(garden.seeds).toHaveLength(CLOCK_SEEDS)
    run(garden, burst.at + SEED_ROOT_MS + 50, log)
    expect(garden.seeds).toHaveLength(0)
    for (const p of patches)
      expect(garden.weeds.some(w => w.patch === p)).toBe(true)
  })

  it('picks 3 different patches, kept on the lawn at a corner', () => {
    const corner = seedPatches(3, 9, 0)
    expect(new Set(corner).size).toBe(3)
    expect(corner.every(p => [0, 1, COLS, COLS + 1].includes(p))).toBe(true)
  })

  it('bursts on the lawn it lands on when thrown over the fence', () => {
    const { garden, clock } = gardenWithClock()
    yank(garden, clock)
    garden.command({
      type: 'release',
      release: { type: 'throw', speedPx: 2000, dirX: 0, dirY: -1 }
    })
    const log = run(garden, garden.t + 3000)
    const cross = log.find(e => e.event.type === 'cross')
    if (cross?.event.type !== 'cross') throw new Error('no crossing')
    expect(cross.event.crossing.kind).toBe('seedClock')
    expect(garden.seeds).toHaveLength(0)
    // The neighbour's garden lands it and gets the seeds.
    const other = new Garden({ seed: 5, round: 1, host: false })
    run(other, garden.t)
    other.command({ type: 'arrive', arrival: cross.event.crossing, ffMs: 0 })
    const theirs = run(other, other.t + 3000)
    expect(theirs.some(e => e.event.type === 'burst')).toBe(true)
    expect(other.seeds).toHaveLength(CLOCK_SEEDS)
  })

  it('blows its seeds over the fence when it bursts in your tailwind', () => {
    const { garden, clock } = gardenWithClock()
    yank(garden, clock)
    run(garden, garden.t + TICK_MS)
    while (!gustSoon(garden, 'over', 1)) run(garden, garden.t + 500)
    run(garden, garden.t + 2100)
    expect(garden.wind.over).toBe(1)
    garden.command({
      type: 'release',
      release: { type: 'putDown', reason: 'slow' }
    })
    const log = run(garden, garden.t + 3000)
    const burst = log.find(e => e.event.type === 'burst')
    expect(burst?.event).toEqual(expect.objectContaining({ over: true }))
    expect(garden.seeds).toHaveLength(0)
    const seeds = log.flatMap(e =>
      e.event.type === 'cross' ? [e.event.crossing.kind] : []
    )
    expect(seeds).toEqual(['seed', 'seed', 'seed'])
  })

  it('roots a seed that blew in from next door 10s after it lands, with no arrival tip', () => {
    const receiver = new Garden({ seed: 5, round: 1, host: false })
    const crossing = crossingOf(
      {
        x0: 300,
        y0: 200,
        x1: 300,
        y1: -200,
        H: 300,
        T: 960,
        t0: 0,
        outcome: 'cross',
        endTau: 0.5
      },
      'seed',
      0,
      -1
    )
    run(receiver, 1000)
    receiver.command({ type: 'arrive', arrival: crossing, ffMs: 0 })
    const log = run(receiver, 2000)
    expect(log.some(e => e.event.type === 'arrive')).toBe(false)
    expect(receiver.seeds).toHaveLength(1)
    expect(receiver.items.some(i => i.kind === 'seed')).toBe(false)
    const patch = receiver.seeds[0]?.patch as number
    run(receiver, 2000 + SEED_ROOT_MS)
    expect(receiver.weeds.some(w => w.patch === patch)).toBe(true)
  })
})
