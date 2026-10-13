import { describe, expect, it } from 'vitest'

import { planThrow, throwDistance } from './flight'
import { Garden } from './garden'
import {
  GUST_MS,
  LAWN_W,
  ROUND_MS,
  TICK_MS,
  VANE_LEAD_MS,
  WIND_SIDE_MAX,
  WIND_SLIDE
} from './tuning'
import type { GardenEvent } from './types'
import { gustDir, gustsFor, windAt, windDrift, type Wind } from './wind'

describe('gusts', () => {
  it('give each player 2 tailwinds, 1 in the last 40s, for 1,000 seeds', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const gusts = gustsFor(seed, ROUND_MS)
      expect(gusts).toHaveLength(6)
      for (const host of [true, false]) {
        const tail = gusts.filter(
          g => g.kind === 'over' && gustDir(g, host) > 0
        )
        expect(tail).toHaveLength(2)
        expect(tail.filter(g => ROUND_MS - g.at <= 40_000)).toHaveLength(1)
      }
      const along = gusts.filter(g => g.kind === 'along').map(g => g.dir)
      expect(along.sort()).toEqual([-1, 1])
      // In order, never overlapping, all inside the round.
      for (let k = 1; k < gusts.length; k++)
        expect(gusts[k]!.at).toBeGreaterThan(gusts[k - 1]!.end)
      expect(gusts[5]!.end).toBeLessThan(ROUND_MS)
    }
  })

  it('reverses both kinds of gust for the guest', () => {
    const gusts = gustsFor(31, ROUND_MS)
    const host: Wind = { over: 0, side: 0 }
    const guest: Wind = { over: 0, side: 0 }
    for (const gust of gusts) {
      const mid = gust.at + GUST_MS / 2
      windAt(gusts, mid, true, host)
      windAt(gusts, mid, false, guest)
      expect(Math.abs(host.over) + Math.abs(host.side)).toBe(1)
      expect(guest.over + host.over).toBe(0)
      expect(guest.side + host.side).toBe(0)
    }
    windAt(gusts, gusts[0]!.at - 10, true, host)
    expect(host).toEqual({ over: 0, side: 0 })
  })
})

describe('wind on throws', () => {
  it('adds 30% with a tailwind and takes 30% off into a headwind', () => {
    const calm = planThrow(
      { lx: 300, ly: 600, speedPx: 1000, dirX: 0, dirY: -1 },
      0
    )
    const tail = planThrow(
      { lx: 300, ly: 600, speedPx: 1000, dirX: 0, dirY: -1, wind: 1.3 },
      0
    )
    const head = planThrow(
      { lx: 300, ly: 600, speedPx: 1000, dirX: 0, dirY: -1, wind: 0.7 },
      0
    )
    expect(calm.y0 - calm.y1).toBeCloseTo(throwDistance(1000), 6)
    expect(tail.y0 - tail.y1).toBeCloseTo(1.3 * throwDistance(1000), 6)
    expect(head.y0 - head.y1).toBeCloseTo(0.7 * throwDistance(1000), 6)
  })

  it('pushes a throw up to 150 units sideways without changing its depth', () => {
    const short = planThrow(
      { lx: 300, ly: 300, speedPx: 600, dirX: 0, dirY: -1, side: 1 },
      0
    )
    expect(short.x1 - short.x0).toBeCloseTo(windDrift(1, 240), 6)
    expect(short.y0 - short.y1).toBeCloseTo(240, 6)
    const long = planThrow(
      { lx: 300, ly: 600, speedPx: 2500, dirX: 0, dirY: -1, side: -1 },
      0
    )
    expect(long.x0 - long.x1).toBeCloseTo(WIND_SIDE_MAX, 6)
    // A throw aimed near a hedge ends up in it.
    const nearHedge = {
      lx: LAWN_W - 40,
      ly: 500,
      speedPx: 1500,
      dirX: 0,
      dirY: -1
    }
    expect(planThrow(nearHedge, 0).outcome).toBe('cross')
    expect(planThrow({ ...nearHedge, side: 1 }, 0).outcome).toBe('wide')
  })
})

describe('wind in the garden', () => {
  it('swings the vane 2s early, then blows and calms on both lawns at the same moments', () => {
    const run = (host: boolean) => {
      const garden = new Garden({ seed: 8, host })
      const log: { at: number; event: GardenEvent }[] = []
      while (garden.t < ROUND_MS - 1) {
        garden.advanceTo(garden.t + TICK_MS * 30)
        for (const event of garden.drainEvents())
          if (['vane', 'gust', 'calm'].includes(event.type))
            log.push({ at: garden.t, event })
      }
      return log
    }
    const host = run(true)
    const guest = run(false)
    expect(host.filter(e => e.event.type === 'gust')).toHaveLength(6)
    expect(guest.map(e => e.at)).toEqual(host.map(e => e.at))
    host.forEach((e, k) => {
      const other = guest[k]!.event
      if (e.event.type === 'gust' && other.type === 'gust')
        expect(other.dir).toBe(-e.event.dir)
    })
    const gusts = gustsFor(8, ROUND_MS)
    const vane = host.find(e => e.event.type === 'vane')!
    expect(vane.at).toBeGreaterThanOrEqual(gusts[0]!.at - VANE_LEAD_MS)
    expect(vane.at).toBeLessThan(gusts[0]!.at - VANE_LEAD_MS + TICK_MS * 30)
  })

  it('slides light litter with the gust but leaves gnomes where they stand', () => {
    const garden = new Garden({ seed: 8 })
    const gust = garden.gusts[0]!
    garden.advanceTo(gust.at - 500)
    garden.command({ type: 'spawn', kind: 'litter', lx: 300, ly: 320 })
    garden.advanceTo(gust.at)
    const litter = garden.items.find(i => i.kind === 'litter')!
    const gnomes = garden.items
      .filter(i => i.kind === 'gnome')
      .map(i => [i.lx, i.ly])
    const before = { x: litter.lx, y: litter.ly }
    garden.advanceTo(gust.end + 500)
    const moved = Math.hypot(litter.lx - before.x, litter.ly - before.y)
    expect(moved).toBeCloseTo((WIND_SLIDE * GUST_MS) / 1000, -1)
    // A tailwind for the host blows toward the fence, at lower ly.
    if (gust.kind === 'over')
      expect(Math.sign(before.y - litter.ly)).toBe(gust.dir)
    expect(
      garden.items.filter(i => i.kind === 'gnome').map(i => [i.lx, i.ly])
    ).toEqual(gnomes)
  })
})
