import { describe, expect, it } from 'vitest'

import { Garden } from './garden'
import { patchAt } from './grid'
import { footprintPatches, footprintRect } from './heavy'
import { ITEM_LIFT } from './items'
import { lawnReport } from './report'
import {
  BIN_POS,
  COLS,
  CRATE_GNOMES,
  CRATE_ROWS,
  MOWER_POS,
  MOWER_RUN,
  TICK_MS,
  TRAMPOLINE_POS
} from './tuning'
import { Mess, type Crossing, type GardenEvent, type Item } from './types'

/** A calm full-round garden with the shed already open and everything settled. */
function finale(seed = 11): Garden {
  const g = new Garden({ seed, calm: true })
  g.openShed()
  g.advanceTo(2500)
  g.drainEvents()
  return g
}

function junk(g: Garden, kind: Item['kind']): Item {
  const item = g.items.find(i => i.kind === kind && i.state !== 'sunk')
  if (!item) throw new Error(`no ${kind}`)
  return item
}

function run(g: Garden, ms: number): GardenEvent[] {
  g.advanceTo(g.t + ms)
  return g.drainEvents()
}

function grab(g: Garden, item: Item): void {
  g.command({
    type: 'grab',
    target: { type: 'item', id: item.id, distance: 0 },
    lx: item.lx,
    ly: item.ly
  })
}

/** Drags heavy junk to (lx, ly) in one move, then lets go. */
function drag(g: Garden, item: Item, lx: number, ly: number): GardenEvent[] {
  grab(g, item)
  g.command({ type: 'hold', lx, ly })
  g.command({ type: 'release', release: { type: 'putDown' } })
  return run(g, TICK_MS)
}

/** Lifts heavy junk and throws it straight at the fence. */
function liftAndThrow(g: Garden, item: Item, speedPx: number): GardenEvent[] {
  grab(g, item)
  g.command({ type: 'lift' })
  g.command({
    type: 'release',
    release: { type: 'throw', speedPx, dirX: 0, dirY: -1 }
  })
  return run(g, TICK_MS)
}

/** Patches whose drying fired during these events, to leave out of exact health checks. */
function dried(events: GardenEvent[]): Set<number> {
  return new Set(events.flatMap(e => (e.type === 'dry' ? [e.patch] : [])))
}

describe('the shed', () => {
  it('opens at 0:40 left: crate gnomes settle on rows 8 to 13 and the junk rolls onto the patio', () => {
    const g = new Garden({ seed: 4, roundMs: 45_000, calm: true })
    g.advanceTo(34_990)
    expect(g.shedOpen).toBe(false)
    g.drainEvents()
    const events = run(g, 3000)
    expect(events.some(e => e.type === 'shed')).toBe(true)
    // Settling gnomes crush nothing: no landing happens at all.
    expect(events.some(e => e.type === 'land')).toBe(false)
    const crate = g.items.filter(i => i.kind === 'gnome').slice(-CRATE_GNOMES)
    expect(crate).toHaveLength(CRATE_GNOMES)
    for (const gnome of crate) {
      expect(gnome.state).toBe('rest')
      const row = Math.floor(patchAt(gnome.lx, gnome.ly) / COLS)
      expect(row).toBeGreaterThanOrEqual(CRATE_ROWS[0])
      expect(row).toBeLessThanOrEqual(CRATE_ROWS[1])
    }
    const bin = junk(g, 'bin')
    const trampoline = junk(g, 'trampoline')
    expect(bin.state).toBe('rest')
    expect(Math.abs(bin.lx - BIN_POS.lx)).toBeLessThan(2)
    expect(Math.abs(trampoline.lx - TRAMPOLINE_POS.lx)).toBeLessThan(2)
    expect(g.mowerHome()).toMatchObject(MOWER_POS)
  })
})

describe('heavy junk', () => {
  it('flattens each patch a drag crosses once, and counts each one', () => {
    const g = finale()
    const bin = junk(g, 'bin')
    grab(g, bin)
    g.command({ type: 'hold', lx: bin.lx, ly: 500 })
    g.command({ type: 'hold', lx: bin.lx, ly: 600 })
    g.command({ type: 'release', release: { type: 'putDown' } })
    const events = run(g, TICK_MS)
    // Columns 2 and 3, rows 11 to 15, once each even though it went back over rows 13 to 15.
    const flat = events.flatMap(e => (e.type === 'flatten' ? [e.patch] : []))
    expect(flat.sort((a, b) => a - b)).toEqual(
      [11, 12, 13, 14, 15].flatMap(r => [r * COLS + 2, r * COLS + 3])
    )
    expect(g.blame.flattened).toBe(10)
    expect(g.grid.mess[15 * COLS + 2]).toBe(Mess.flat)
    // A new drag over the same patches counts them again.
    drag(g, bin, bin.lx, 560)
    expect(g.blame.flattened).toBeGreaterThan(10)
  })

  it('throws only after a lift, at 0.6 times a light throw', () => {
    const g = finale()
    const bin = junk(g, 'bin')
    drag(g, bin, 125, 600)
    // Swiping without the lift sets it down.
    grab(g, bin)
    g.command({
      type: 'release',
      release: { type: 'throw', speedPx: 1500, dirX: 0, dirY: -1 }
    })
    let events = run(g, TICK_MS)
    expect(events.some(e => e.type === 'setDown')).toBe(true)
    expect(bin.state).toBe('rest')
    // After a lift a drag does nothing, and letting go slowly sets it down.
    grab(g, bin)
    g.command({ type: 'lift' })
    g.command({ type: 'hold', lx: 300, ly: 300 })
    g.command({ type: 'release', release: { type: 'putDown' } })
    run(g, TICK_MS)
    expect([bin.lx, bin.ly, bin.state]).toEqual([125, 600, 'rest'])
    events = liftAndThrow(g, bin, 1000)
    const thrown = events.find(e => e.type === 'throw')
    expect(thrown?.type === 'throw' && thrown.distance).toBeCloseTo(
      0.4 * 1000 * 0.6
    )
  })

  it('sinks where it lands: footprint crushed by 2, 4 litter spilled, never lifted again', () => {
    const g = finale()
    const bin = junk(g, 'bin')
    drag(g, bin, 125, 600)
    const before = Array.from(g.grid.health)
    const events = [...liftAndThrow(g, bin, 600), ...run(g, 2500)]
    expect(bin.state).toBe('sunk')
    const skip = dried(events)
    const prints = footprintPatches(footprintRect('bin', bin.lx, bin.ly, true))
    expect(prints).toHaveLength(4)
    for (const p of prints)
      if (!skip.has(p)) expect(g.grid.health[p]).toBe((before[p] as number) - 2)
    const litter = g.items.filter(i => i.kind === 'litter')
    expect(litter.map(i => i.look).sort()).toEqual([0, 1, 2, 3])
    expect(litter.every(i => i.state === 'rest')).toBe(true)
    expect(g.hitTest(bin.lx, bin.ly - ITEM_LIFT.bin, 30)?.id).not.toBe(bin.id)
    grab(g, bin)
    run(g, TICK_MS)
    expect(bin.state).toBe('sunk')
    const report = lawnReport(g, [])
    expect(report.counts.bins).toBe(1)
    expect(report.counts.litter).toBe(4)
  })

  it('ends your mowing when you throw the mower, which scalps 4 patches next door', () => {
    const g = finale()
    const mower = junk(g, 'mower')
    drag(g, mower, 300, 380)
    const events = liftAndThrow(g, mower, 2000)
    expect(g.mowerGone).toBe(true)
    g.command({ type: 'mow', lx: 100, ly: 100, speedPx: 500 })
    const crossing = [...events, ...run(g, 2000)].find(e => e.type === 'cross')
    expect(g.drainEvents().some(e => e.type === 'noMower')).toBe(false)
    if (crossing?.type !== 'cross') throw new Error('the mower never crossed')
    const next = new Garden({ seed: 11, calm: true, host: false })
    next.command({ type: 'arrive', arrival: crossing.crossing, ffMs: 0 })
    const landed = run(next, 4000)
    const scalps = landed.flatMap(e => (e.type === 'run' ? [e.patch] : []))
    expect(scalps).toHaveLength(MOWER_RUN)
    for (const p of scalps) expect(next.grid.mess[p]).toBe(Mess.scalp)
    expect(next.items.find(i => i.kind === 'mower')?.state).toBe('sunk')
  })

  it('says once per press that the mower is gone', () => {
    const g = finale()
    liftAndThrow(g, junk(g, 'mower'), 1500)
    g.command({ type: 'mow', lx: 100, ly: 100, speedPx: 500 })
    g.command({ type: 'mow', lx: 100, ly: 140, speedPx: 500 })
    const said = run(g, TICK_MS).filter(e => e.type === 'noMower')
    expect(said).toHaveLength(1)
  })
})

describe('the trampoline', () => {
  /** A garden whose own trampoline lies sunk at (300, 320). */
  function withTrampoline(seed = 21): { g: Garden; trampoline: Item } {
    const g = finale(seed)
    const trampoline = junk(g, 'trampoline')
    drag(g, trampoline, 300, 520)
    liftAndThrow(g, trampoline, 200 / 0.24)
    run(g, 4000)
    expect(trampoline.state).toBe('sunk')
    expect([trampoline.lx, trampoline.ly]).toEqual([300, 320])
    return { g, trampoline }
  }

  it('sends a throw from next door back over the fence at 90%, flagged as going home', () => {
    const { g, trampoline } = withTrampoline()
    const arrival: Crossing = {
      kind: 'gnome',
      x: 600 - trampoline.lx,
      at: 0,
      d: trampoline.ly,
      dx: 0,
      tau: 0.5,
      T: 1200,
      H: 300,
      spin: 2,
      wiltIn: -1,
      bounced: false,
      back: false,
      look: 0
    }
    g.command({ type: 'arrive', arrival, ffMs: 0 })
    const events = run(g, 3000)
    expect(events.find(e => e.type === 'bounce')).toMatchObject({ own: false })
    const cross = events.find(e => e.type === 'cross')
    if (cross?.type !== 'cross') throw new Error('it never went back over')
    expect(cross.crossing).toMatchObject({ bounced: true, back: true })
    // It flies 90% of the arc that brought it: 2 * 320 units.
    const f = cross.flight
    expect(Math.hypot(f.x1 - f.x0, f.y1 - f.y0)).toBeCloseTo(0.9 * 640)
    expect(g.blame.bounces).toBe(0)
    // Home again, the thrower counts the bounce against itself.
    const home = new Garden({ seed: 21, calm: true })
    home.command({ type: 'arrive', arrival: cross.crossing, ffMs: 0 })
    run(home, TICK_MS)
    expect(home.blame.bounces).toBe(1)
  })

  it('counts your own throw bouncing off your own trampoline', () => {
    const { g } = withTrampoline()
    g.command({ type: 'spawn', kind: 'gnome', lx: 300, ly: 520 })
    run(g, TICK_MS)
    const gnome = g.items[g.items.length - 1] as Item
    grab(g, gnome)
    g.command({
      type: 'release',
      release: { type: 'throw', speedPx: 190 / 0.4, dirX: 0, dirY: -1 }
    })
    const events = run(g, 3000)
    expect(events.find(e => e.type === 'bounce')).toMatchObject({ own: true })
    expect(g.blame.bounces).toBe(1)
    expect(gnome.state).toBe('rest')
    expect(gnome.ly).toBeGreaterThan(450)
  })
})
