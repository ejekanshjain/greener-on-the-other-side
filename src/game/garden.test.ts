import { describe, expect, it } from 'vitest'

import { crossingOf, planThrow } from './flight'
import { Garden } from './garden'
import { patchAt } from './grid'
import { ITEM_LIFT } from './items'
import {
  FENCE_TOP_H,
  HEALTH_START,
  HOLD_CLAMP,
  LAWN_D,
  TICK_MS
} from './tuning'
import type { Crossing, GardenEvent } from './types'

/** A garden with one weed sprouted mid-lawn on patch 8 * 12 + 5, at garden time one tick. */
function gardenWithWeed(seed: number): Garden {
  const garden = new Garden({ seed })
  garden.command({ type: 'sprout', patch: 8 * 12 + 5 })
  garden.advanceTo(TICK_MS)
  garden.drainEvents()
  return garden
}

function firstWeed(garden: Garden) {
  const weed = garden.weeds[0]
  if (!weed) throw new Error('the test garden has no rooted weed')
  return weed
}

/** Grabs a rooted weed, pulls it toward the fence by `pull` units, and returns its item id. */
function yank(garden: Garden, pull: number): number | null {
  const weed = firstWeed(garden)
  const fingerY = weed.ly - ITEM_LIFT.weed
  garden.command({
    type: 'grab',
    target: { type: 'weed', id: weed.id, distance: 0 },
    lx: weed.lx,
    ly: fingerY
  })
  garden.command({ type: 'hold', lx: weed.lx, ly: fingerY - pull })
  garden.advanceTo(garden.t + TICK_MS)
  const yanked = garden.drainEvents().find(e => e.type === 'yank')
  return yanked?.type === 'yank' ? yanked.id : null
}

function crossings(events: GardenEvent[]): Crossing[] {
  return events.flatMap(e => (e.type === 'cross' ? [e.crossing] : []))
}

/** Grabs a loose item and lets go at once with a straight throw at `speedPx`. */
function throwItem(garden: Garden, id: number, speedPx: number): void {
  const item = garden.item(id)
  if (!item) throw new Error(`no item ${id}`)
  garden.command({
    type: 'grab',
    target: { type: 'item', id, distance: 0 },
    lx: item.lx,
    ly: item.ly
  })
  garden.command({
    type: 'release',
    release: { type: 'throw', speedPx, dirX: 0, dirY: -1 }
  })
}

/** The crossing of a straight throw from (lx, ly) at `speedPx`. */
function crossingFrom(lx: number, ly: number, speedPx: number): Crossing {
  const flight = planThrow({ lx, ly, speedPx, dirX: 0, dirY: -1 }, 0)
  if (flight.outcome !== 'cross') throw new Error(flight.outcome)
  return crossingOf(flight, 'gnome', 0, -1)
}

describe('Garden', () => {
  it('starts with 3 gnomes placed by the seed and no weeds', () => {
    const a = new Garden({ seed: 42 })
    const b = new Garden({ seed: 42 })
    expect(a.items.filter(i => i.kind === 'gnome')).toHaveLength(3)
    expect(a.weeds).toHaveLength(0)
    expect(a.items.map(i => [i.lx, i.ly])).toEqual(
      b.items.map(i => [i.lx, i.ly])
    )
  })

  it('needs a 60-unit pull before a weed comes out', () => {
    const garden = gardenWithWeed(7)
    expect(yank(garden, 50)).toBeNull()
    garden.command({
      type: 'release',
      release: { type: 'putDown', reason: 'slow' }
    })
    expect(yank(garden, 70)).not.toBeNull()
    expect(garden.weeds).toHaveLength(0)
  })

  it('reports pull progress by distance in any direction, and yanks at 60 units', () => {
    const garden = gardenWithWeed(7)
    const weed = { ...firstWeed(garden) }
    expect(garden.pullProgress()).toBe(-1)
    garden.command({
      type: 'grab',
      target: { type: 'weed', id: weed.id, distance: 0 },
      lx: weed.lx,
      ly: weed.ly
    })
    garden.advanceTo(garden.t + TICK_MS)
    expect(garden.pullProgress()).toBe(0)
    const pullTo = (dx: number, dy: number) => {
      garden.command({ type: 'hold', lx: weed.lx + dx, ly: weed.ly + dy })
      garden.advanceTo(garden.t + TICK_MS)
      return garden.pullProgress()
    }
    expect(pullTo(30, 0)).toBeCloseTo(0.5)
    expect(pullTo(0, 30)).toBeCloseTo(0.5)
    expect(pullTo(-18, -24)).toBeCloseTo(0.5)
    expect(pullTo(0, -59)).toBeCloseTo(59 / 60)
    expect(garden.drainEvents().some(e => e.type === 'yank')).toBe(false)
    // At the full pull the weed comes out, and there's nothing left to pull.
    expect(pullTo(-60, 0)).toBe(-1)
    expect(garden.drainEvents().filter(e => e.type === 'yank')).toEqual([
      expect.objectContaining({ lx: weed.lx, ly: weed.ly })
    ])
    expect(garden.weeds).toHaveLength(0)
  })

  it('keeps a held item within 100 units of its root', () => {
    const garden = gardenWithWeed(7)
    const root = { ...firstWeed(garden) }
    const id = yank(garden, 70)
    garden.command({ type: 'hold', lx: root.lx, ly: root.ly - 400 })
    garden.advanceTo(garden.t + TICK_MS)
    const item = garden.item(id ?? -1)
    expect(
      item && Math.hypot(item.lx - root.lx, item.ly - root.ly)
    ).toBeCloseTo(HOLD_CLAMP)
  })

  it('throws an item over the fence and hands it to the neighbour, who lands it mirrored', () => {
    const thrower = gardenWithWeed(9)
    const id = yank(thrower, 70)
    thrower.command({
      type: 'release',
      release: { type: 'throw', speedPx: 2000, dirX: 0, dirY: -1 }
    })
    thrower.advanceTo(thrower.t + 3000)
    const [crossing] = crossings(thrower.drainEvents())
    expect(crossing?.kind).toBe('weed')
    expect(thrower.item(id ?? -1)).toBeUndefined()

    const receiver = new Garden({ seed: 9 })
    receiver.command({ type: 'arrive', arrival: crossing as Crossing, ffMs: 0 })
    receiver.advanceTo(3000)
    const landed = receiver.items.find(i => i.fromNeighbour)
    expect(landed?.state).toBe('rest')
    const col = Math.floor((600 - (crossing as Crossing).x) / 50)
    expect(Math.floor((landed?.lx ?? 0) / 50)).toBe(col)
    const patch = receiver.drainEvents().find(e => e.type === 'land')
    expect(
      patch?.type === 'land' && receiver.grid.health[patch.landing.patch]
    ).toBe(HEALTH_START - 1)
  })

  it('drops a clipped throw back onto your front rows', () => {
    const garden = new Garden({ seed: 9 })
    const gnome = garden.items.find(i => i.kind === 'gnome')
    if (!gnome) throw new Error('no gnome')
    garden.command({
      type: 'grab',
      target: { type: 'item', id: gnome.id, distance: 0 },
      lx: gnome.lx,
      ly: gnome.ly
    })
    garden.command({ type: 'hold', lx: gnome.lx, ly: gnome.ly - 100 })
    // From depth ly, a throw of D = ly / 0.9 clips (only 10% past the fence).
    const ly = gnome.ly - 100
    garden.command({
      type: 'release',
      release: { type: 'throw', speedPx: ly / 0.9 / 0.4, dirX: 0, dirY: -1 }
    })
    garden.advanceTo(4000)
    const events = garden.drainEvents()
    expect(events.some(e => e.type === 'clip')).toBe(true)
    expect(crossings(events)).toHaveLength(0)
    expect(gnome.state).not.toBe('air')
    expect(patchAt(gnome.lx, gnome.ly)).toBeLessThan(24)
  })

  it('reaches the same lawn from tick steps, 250 ms steps or one 60s jump', () => {
    const gardens = [0, 1, 2].map(() => gardenWithWeed(3))
    for (const g of gardens) {
      yank(g, 80)
      g.command({
        type: 'release',
        release: { type: 'throw', speedPx: 900, dirX: 0.1, dirY: -1 }
      })
    }
    const [a, b, c] = gardens as [Garden, Garden, Garden]
    for (let t = TICK_MS; t < 60_000; t += TICK_MS) a.advanceTo(t)
    for (let t = 0; t < 60_000; t += 250) b.advanceTo(t)
    for (const g of gardens) g.advanceTo(60_000)
    const snapshot = (g: Garden) => ({
      health: Array.from(g.grid.health),
      length: Array.from(g.grid.length),
      mess: Array.from(g.grid.mess),
      hole: Array.from(g.grid.hole),
      items: g.items.map(i => [i.lx, i.ly, i.state])
    })
    // Drying and growth ran, so the comparison covers the lawn timers too.
    expect(
      snapshot(c).health.filter(h => h < HEALTH_START).length
    ).toBeGreaterThan(50)
    expect(snapshot(a)).toEqual(snapshot(c))
    expect(snapshot(b)).toEqual(snapshot(c))
  })

  it('stops the lawn at the round end', () => {
    const g = new Garden({ seed: 4, roundMs: 45_000 })
    g.advanceTo(45_000)
    const at = Array.from(g.grid.health)
    g.advanceTo(400_000)
    expect(Array.from(g.grid.health)).toEqual(at)
    expect(g.t).toBeLessThanOrEqual(45_000)
  })

  it('puts a throw down when the hand needs 0.4s more', () => {
    const garden = new Garden({ seed: 5 })
    const [a, b] = garden.items
    throwItem(garden, a?.id ?? -1, 2000)
    garden.advanceTo(200)
    throwItem(garden, b?.id ?? -1, 2000)
    garden.advanceTo(300)
    const events = garden.drainEvents()
    expect(events.filter(e => e.type === 'throw')).toHaveLength(1)
    expect(events.find(e => e.type === 'tired')).toMatchObject({
      reason: 'hand',
      lx: b?.lx,
      ly: b?.ly
    })
    expect(garden.item(b?.id ?? -1)?.state).toBe('rest')
  })

  it('shakes a weed left rooted by a short flick, but not after a full yank', () => {
    const flick = gardenWithWeed(7)
    const weed = { ...firstWeed(flick) }
    expect(yank(flick, 40)).toBeNull()
    flick.command({
      type: 'release',
      release: { type: 'throw', speedPx: 1800, dirX: 0, dirY: -1 }
    })
    flick.advanceTo(flick.t + TICK_MS)
    const rooted = flick.drainEvents().filter(e => e.type === 'rooted')
    expect(rooted).toEqual([
      { type: 'rooted', id: weed.id, lx: weed.lx, ly: weed.ly }
    ])
    expect(flick.weeds).toHaveLength(1)

    const pulled = gardenWithWeed(7)
    expect(yank(pulled, 70)).not.toBeNull()
    pulled.command({
      type: 'release',
      release: { type: 'throw', speedPx: 1800, dirX: 0, dirY: -1 }
    })
    pulled.advanceTo(pulled.t + TICK_MS)
    expect(pulled.drainEvents().some(e => e.type === 'rooted')).toBe(false)

    // A press the browser cancelled isn't a flick.
    const cut = gardenWithWeed(7)
    yank(cut, 10)
    cut.command({
      type: 'release',
      release: { type: 'putDown', reason: 'cancel' }
    })
    cut.advanceTo(cut.t + TICK_MS)
    expect(cut.drainEvents().some(e => e.type === 'rooted')).toBe(false)
  })

  it('reports a fast flick that grabs nothing, and grabs what lies in reach', () => {
    const garden = new Garden({ seed: 5 })
    garden.items.length = 0
    garden.command({ type: 'spawn', kind: 'gnome', lx: 300, ly: 300 })
    garden.advanceTo(TICK_MS)
    garden.drainEvents()
    const gnome = garden.items[0]
    if (!gnome) throw new Error('no gnome')
    const snap = (lx: number, ly: number, toX: number, toY: number) => {
      garden.command({ type: 'snap', lx, ly, toX, toY, reach: 40, near: 80 })
      garden.advanceTo(garden.t + TICK_MS)
      return garden.drainEvents().find(e => e.type === 'miss') ?? null
    }
    const grassY = gnome.ly - ITEM_LIFT.gnome
    // Bare grass far from the gnome, flicked at the fence: a miss with nothing near.
    expect(snap(100, 500, 100, 440)).toMatchObject({
      type: 'miss',
      lx: 100,
      ly: 500,
      dirX: 0,
      dirY: -1,
      near: null
    })
    // 60 units from the gnome, aimed at the fence: a miss that names it.
    expect(snap(360, grassY, 360, grassY - 50)).toMatchObject({
      near: { type: 'item', id: gnome.id }
    })
    // The same spot, rubbed sideways: too fast to mow, with nothing named.
    expect(snap(360, grassY, 420, grassY)).toMatchObject({ near: null })
    // 30 units away: the snap grabs it, and nothing missed.
    expect(snap(330, grassY, 330, grassY - 40)).toBeNull()
    expect(garden.held?.id).toBe(gnome.id)
  })

  it('throws shorter with a tired arm', () => {
    const fresh = new Garden({ seed: 5 })
    const tired = new Garden({ seed: 5 })
    tired.arm.level = 1
    for (const g of [fresh, tired]) throwItem(g, g.items[0]?.id ?? -1, 900)
    for (const g of [fresh, tired]) g.advanceTo(TICK_MS)
    const f = fresh.items[0]?.flight
    const t = tired.items[0]?.flight
    expect(f && t && (t.y0 - t.y1) / (f.y0 - f.y1)).toBeCloseTo(0.6)
  })

  it('catches a falling throw where it is drawn, before it lands', () => {
    const garden = new Garden({ seed: 6 })
    garden.command({
      type: 'arrive',
      arrival: crossingFrom(300, 300, 1400),
      ffMs: 0
    })
    garden.advanceTo(TICK_MS)
    const item = garden.items.find(i => i.fromNeighbour)
    if (!item) throw new Error('no arrival')
    // Rising toward its peak, it can't be caught yet.
    expect(garden.catchable(item)).toBe(false)
    while (!garden.catchable(item)) garden.advanceTo(garden.t + TICK_MS)
    const drawnY = item.ly - item.h - ITEM_LIFT.gnome
    const hit = garden.hitTest(item.lx, drawnY, 5)
    expect(hit).toMatchObject({ type: 'item', id: item.id })
    garden.command({
      type: 'grab',
      target: hit as NonNullable<typeof hit>,
      lx: item.lx,
      ly: drawnY
    })
    garden.advanceTo(garden.t + TICK_MS)
    expect(item.state).toBe('held')
    expect(item.h).toBe(0)
    expect(garden.drainEvents().some(e => e.type === 'catch')).toBe(true)
  })

  it('drops a throw that would cross the whole lawn onto the back row', () => {
    const garden = new Garden({ seed: 6 })
    garden.command({
      type: 'arrive',
      arrival: crossingFrom(300, 60, 2500),
      ffMs: 0
    })
    garden.advanceTo(4000)
    const item = garden.items.find(i => i.fromNeighbour)
    expect(item?.state).toBe('rest')
    expect(Math.floor((item?.ly ?? 0) / 40)).toBe(LAWN_D / 40 - 1)
  })

  it('never lets a late arrival enter below the fence top', () => {
    for (const [ly, speed] of [
      [40, 400],
      [300, 900],
      [300, 1500],
      [580, 2400]
    ] as const) {
      const crossing = crossingFrom(300, ly, speed)
      const garden = new Garden({ seed: 6 })
      garden.command({ type: 'arrive', arrival: crossing, ffMs: 300 })
      garden.advanceTo(TICK_MS)
      const arrived = garden.drainEvents().find(e => e.type === 'arrive')
      expect(
        arrived?.type === 'arrive' && arrived.ly - arrived.h
      ).toBeLessThanOrEqual(-FENCE_TOP_H + 1e-6)
    }
  })
})
