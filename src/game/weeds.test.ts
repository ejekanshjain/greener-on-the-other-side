import { describe, expect, it } from 'vitest'

import { Garden } from './garden'
import { createGrid, patchAt, patchCenter } from './grid'
import { gnomeSpots, snailSpot, snailTimes, weedSpot, weedTimes } from './seed'
import {
  COLS,
  HEALTH_START,
  LOOSE_CAP,
  ROUND_MS,
  ROWS,
  SNAIL_CAP,
  TICK_MS,
  WEED_CAP,
  WEED_EVERY_MS
} from './tuning'
import { Mess, type GardenEvent } from './types'
import { newWeed, spreadPatch, stepWeeds } from './weeds'

/** A garden whose grass never dries or grows, so health changes come only from the rule under test. */
function stillGarden(seed = 4): Garden {
  const garden = new Garden({ seed })
  garden.grid.nextTimerAt = Infinity
  return garden
}

/** Advances in 1s steps, collecting every event so none fall out of the garden's buffer. */
function run(garden: Garden, to: number): GardenEvent[] {
  const events: GardenEvent[] = []
  for (let t = garden.t + 1000; t < to; t += 1000) {
    garden.advanceTo(t)
    events.push(...garden.drainEvents())
  }
  garden.advanceTo(to)
  events.push(...garden.drainEvents())
  return events
}

describe('schedules', () => {
  it('spaces arrivals by the stretch interval, give or take 20%', () => {
    const times = weedTimes(77, 1, ROUND_MS)
    const gaps = times.map((t, i) => t - (times[i - 1] ?? 0))
    for (const [i, gap] of gaps.entries()) {
      const before = (times[i - 1] ?? 0) / 1000
      const every =
        WEED_EVERY_MS[before < 40 ? 0 : before < 100 ? 1 : before < 140 ? 2 : 3]
      expect(gap).toBeGreaterThanOrEqual(every * 0.8 - 1e-6)
      expect(gap).toBeLessThanOrEqual(every * 1.2 + 1e-6)
    }
    expect(times.length).toBeGreaterThan(44)
    expect(times.length).toBeLessThan(58)
    expect(snailTimes(77, ROUND_MS).length).toBeGreaterThan(14)
  })

  it('gives both gardens the same schedule from the same seed', () => {
    expect(weedTimes(5, 2, ROUND_MS)).toEqual(weedTimes(5, 2, ROUND_MS))
    expect(weedTimes(5, 2, ROUND_MS)).not.toEqual(weedTimes(6, 2, ROUND_MS))
    expect(snailSpot(5, 3)).toEqual(snailSpot(5, 3))
  })

  it('sprouts round 1’s second weed on the back row at 2:50 left', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(weedTimes(seed, 0, ROUND_MS)[1]).toBe(10_000)
      expect(Math.floor(weedSpot(seed, 0, 1, 0) / COLS)).toBe(ROWS - 1)
    }
  })

  it('stands the 3 starting gnomes in the middle third, on distinct patches', () => {
    for (let seed = 0; seed < 50; seed++) {
      const spots = gnomeSpots(seed)
      expect(new Set(spots).size).toBe(3)
      for (const patch of spots) {
        const row = Math.floor(patch / COLS)
        expect(row).toBeGreaterThanOrEqual(5)
        expect(row).toBeLessThanOrEqual(10)
      }
    }
  })

  it('scales arrivals with a ?fast round', () => {
    const fast = weedTimes(9, 1, 45_000)
    const full = weedTimes(9, 1, ROUND_MS)
    expect(fast.length).toBe(full.length)
    expect(fast[3]).toBeCloseTo((full[3] as number) / 4)
  })
})

describe('weeds', () => {
  it('drains its patch every 15s and spreads every 30s', () => {
    const weeds = [newWeed(1, 50, 0, 0, 0)]
    let drains = 0
    let spreads = 0
    stepWeeds(
      weeds,
      45_000,
      () => drains++,
      () => spreads++
    )
    expect(drains).toBe(3)
    expect(spreads).toBe(1)
  })

  it('spreads only to free neighbours', () => {
    const grid = createGrid(1)
    const weed = newWeed(1, 5 * COLS + 5, 0, 0, 0)
    const around = [4 * COLS + 5, 6 * COLS + 5, 5 * COLS + 4]
    const weeds = [weed, ...around.map((p, i) => newWeed(2 + i, p, 0, 0, 0))]
    expect(spreadPatch(1, weed, weeds, grid)).toBe(5 * COLS + 6)
    grid.hole[5 * COLS + 6] = 1
    expect(spreadPatch(1, weed, weeds, grid)).toBe(-1)
  })

  it('roots the same weeds and snails in two idle gardens for 40s', () => {
    const a = new Garden({ seed: 31 })
    const b = new Garden({ seed: 31 })
    run(a, 40_000)
    for (let t = 0; t <= 40_000; t += 250) b.advanceTo(t)
    const spawns = (g: Garden) => ({
      weeds: g.weeds.map(w => [w.patch, w.bornAt]),
      snails: g.snails.map(s => [s.lx, s.ly, s.dir])
    })
    expect(spawns(a).weeds.length).toBeGreaterThan(6)
    expect(spawns(a).snails.length).toBeGreaterThan(1)
    expect(spawns(a)).toEqual(spawns(b))
  })

  it('fills an idle lawn up to 40 weeds and no more', () => {
    const garden = new Garden({ seed: 12 })
    run(garden, ROUND_MS)
    expect(garden.weeds).toHaveLength(WEED_CAP)
    expect(new Set(garden.weeds.map(w => w.patch)).size).toBe(WEED_CAP)
  })

  it('wilts a yanked weed 20s later into a mess mark that never roots', () => {
    const garden = stillGarden()
    const patch = 7 * COLS + 6
    garden.command({ type: 'sprout', patch })
    garden.advanceTo(TICK_MS)
    const weed = garden.weeds.find(w => w.patch === patch)
    if (!weed) throw new Error('no weed')
    garden.command({
      type: 'grab',
      target: { type: 'weed', id: weed.id, distance: 0 },
      lx: weed.lx,
      ly: weed.ly
    })
    garden.command({ type: 'hold', lx: weed.lx, ly: weed.ly - 70 })
    garden.command({ type: 'release', release: { type: 'putDown' } })
    const yankedAt = garden.t + TICK_MS
    garden.advanceTo(yankedAt)
    const item = garden.items.find(i => i.kind === 'weed')
    if (!item) throw new Error('no loose weed')
    const lyingOn = patchAt(item.lx, item.ly)
    const events = run(garden, yankedAt + 19_900)
    expect(garden.items.some(i => i.id === item.id)).toBe(true)
    events.push(...run(garden, yankedAt + 20_100))
    expect(garden.items.some(i => i.id === item.id)).toBe(false)
    expect(garden.grid.mess[lyingOn]).toBe(Mess.wilt)
    expect(events.some(e => e.type === 'wilt')).toBe(true)
  })

  it('wilts a thrown weed on the other lawn 20s after its yank', () => {
    const receiver = stillGarden()
    receiver.command({
      type: 'arrive',
      arrival: {
        kind: 'weed',
        x: 300,
        d: 300,
        dx: 0,
        tau: 0.4,
        T: 1200,
        H: 300,
        spin: 0,
        wiltIn: 18_000
      },
      ffMs: 0
    })
    run(receiver, 17_900)
    expect(receiver.items.some(i => i.kind === 'weed')).toBe(true)
    run(receiver, 18_100)
    expect(receiver.items.some(i => i.kind === 'weed')).toBe(false)
  })
})

describe('snails', () => {
  it('crosses the lawn in 60s, sliming its row and eating every 8s', () => {
    const garden = stillGarden(8)
    const events = run(garden, 70_000)
    const first = events.find(e => e.type === 'snail')
    if (first?.type !== 'snail') throw new Error('no snail came')
    const row = first.row
    const slimed = Array.from(
      { length: COLS },
      (_, c) => row * COLS + c
    ).filter(p => garden.grid.mess[p] === Mess.slime)
    expect(slimed.length).toBeGreaterThanOrEqual(COLS - 1)
    // It crawled out at the far hedge after about 60s.
    expect(garden.snails.every(s => s.lx >= 0 && s.lx <= 600)).toBe(true)
    // Each patch in the row lost about 5s of its 8s eating cycle, so some lost 1.
    const eaten = Array.from({ length: COLS }, (_, c) => row * COLS + c).filter(
      p => (garden.grid.health[p] as number) < HEALTH_START
    )
    expect(eaten.length).toBeGreaterThan(3)
  })

  it('lets no more crawl in while 12 already crawl', () => {
    const garden = stillGarden(3)
    for (let k = 0; k < SNAIL_CAP; k++)
      garden.command({
        type: 'spawn',
        kind: 'snailShell',
        lx: 280 + (k % 4) * 15,
        ly: 60 + k * 40
      })
    // Mid-lawn snails need at least 28s to reach a hedge; the first arrival is due by 20s.
    expect(snailTimes(3, ROUND_MS)[0]).toBeLessThan(20_000)
    const events = run(garden, 20_000)
    expect(garden.snails).toHaveLength(SNAIL_CAP)
    expect(events.some(e => e.type === 'snail')).toBe(false)
  })

  it('hides in its shell when grabbed and comes out 3s after it lies still', () => {
    const garden = stillGarden(8)
    run(garden, 40_000)
    const snail = garden.snails[0]
    if (!snail) throw new Error('no snail')
    garden.command({
      type: 'grab',
      target: { type: 'snail', id: snail.id, distance: 0 },
      lx: snail.lx,
      ly: snail.ly
    })
    garden.command({ type: 'hold', lx: 120, ly: snail.ly })
    garden.command({ type: 'release', release: { type: 'putDown' } })
    garden.advanceTo(garden.t + TICK_MS)
    const count = garden.snails.length
    const shell = garden.items.find(i => i.kind === 'snailShell')
    expect(shell?.state).toBe('rest')
    garden.advanceTo(garden.t + 2900)
    expect(garden.items.some(i => i.kind === 'snailShell')).toBe(true)
    garden.advanceTo(garden.t + 200)
    expect(garden.items.some(i => i.kind === 'snailShell')).toBe(false)
    const out = garden.snails[garden.snails.length - 1]
    expect(garden.snails.length).toBe(count + 1)
    // Put down on the left half, it heads for the left hedge.
    expect(out?.dir).toBe(-1)
  })
})

describe('loose things', () => {
  it('take 1 health from the patch they lie on every 10s', () => {
    const garden = stillGarden()
    const patch = 12 * COLS + 1
    const { lx, ly } = patchCenter(patch)
    garden.command({ type: 'spawn', kind: 'gnome', lx, ly })
    garden.advanceTo(25_000)
    expect(garden.grid.health[patch]).toBe(HEALTH_START - 2)
  })

  it('wilt the oldest loose weed past 160 items', () => {
    const garden = stillGarden()
    for (let i = 0; i < LOOSE_CAP; i++)
      garden.command({
        type: 'spawn',
        kind: i < 5 ? 'weed' : 'litter',
        lx: 20 + (i % 12) * 50,
        ly: 20 + Math.floor(i / 12) * 40
      })
    garden.advanceTo(TICK_MS)
    const oldest = garden.items.find(i => i.kind === 'weed')
    expect(garden.items).toHaveLength(LOOSE_CAP)
    garden.command({ type: 'spawn', kind: 'litter', lx: 300, ly: 300 })
    garden.advanceTo(2 * TICK_MS)
    expect(garden.items).toHaveLength(LOOSE_CAP)
    expect(garden.items.some(i => i.id === oldest?.id)).toBe(false)
  })
})
