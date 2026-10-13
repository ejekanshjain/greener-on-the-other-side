import { describe, expect, it } from 'vitest'

import { decodeLawn, encodeLawn } from '../net/lawnCodec'
import { armLevel } from './arm'
import { setPatch } from './cheats'
import { Garden, type GardenOptions } from './garden'
import { patchCenter } from './grid'
import { rebuildGarden } from './rebuild'
import { lawnReport, type LawnReport } from './report'
import { Mess } from './types'

/** A report's markers as sorted strings, since the rebuild may list them in another order. */
function markerSet(report: LawnReport): string[] {
  return report.markers.map(m => `${m.kind}@${m.patch}`).sort()
}

/** The report a neighbour would hold, after a trip through the wire codec. */
function copyOf(garden: Garden): LawnReport {
  const copy = decodeLawn(encodeLawn(lawnReport(garden, [])))
  if (!copy) throw new Error('the lawn pack did not decode')
  return copy
}

function expectSameLawn(a: LawnReport, b: LawnReport): void {
  expect(Array.from(b.patches)).toEqual(Array.from(a.patches))
  expect(b.counts).toEqual(a.counts)
  expect(b.patio).toEqual(a.patio)
  expect(markerSet(b)).toEqual(markerSet(a))
}

describe('reload rebuild', () => {
  it('rebuilds a busy lawn that re-encodes to the same pack', () => {
    const options: GardenOptions = { seed: 4242, round: 1 }
    const g = new Garden(options)
    g.advanceTo(70_000)
    setPatch(g, 30, { hole: 1 })
    setPatch(g, 31, { mess: Mess.puddle, health: 2 })
    setPatch(g, 80, { mess: Mess.slime })
    setPatch(g, 95, { health: 7, length: 0 })
    g.heapOn(120)
    g.heapOn(121)
    // Things in the peek rows carry markers; the rest only counts.
    for (const [kind, patch] of [
      ['gnome', 2],
      ['gnome', 2],
      ['litter', 14],
      ['snailShell', 40],
      ['weed', 150],
      ['gnome', 170]
    ] as const) {
      const c = patchCenter(patch)
      g.place(kind, c.lx, c.ly)
    }
    g.advanceTo(70_050)
    const copy = copyOf(g)
    expect(copy.counts.weeds).toBeGreaterThan(3)
    const rebuilt = rebuildGarden(options, copy, g.t)
    expectSameLawn(copy, lawnReport(rebuilt, []))
  })

  it('brings back sunk junk, a mower set down on the lawn, and the right patio', () => {
    const options: GardenOptions = { seed: 77, round: 2, calm: true }
    const g = new Garden(options)
    g.advanceTo(150_000)
    expect(g.shedOpen).toBe(true)
    // Their bin landed and sank between columns 5 and 6, rows 7 and 8.
    const bin = g.place('bin', 300, 320)
    bin.state = 'sunk'
    // Your mower, dragged off the patio and set down on row 12.
    const mower = g.item(g.mowerId)
    if (!mower) throw new Error('no mower')
    mower.lx = 125
    mower.ly = 500
    g.advanceTo(150_050)
    const copy = copyOf(g)
    const rebuilt = rebuildGarden(options, copy, g.t)
    expectSameLawn(copy, lawnReport(rebuilt, []))
    const heavies = rebuilt.items.filter(
      i => i.kind === 'bin' || i.kind === 'mower' || i.kind === 'trampoline'
    )
    expect(heavies.map(i => `${i.kind}:${i.state}`).sort()).toEqual([
      'bin:rest',
      'bin:sunk',
      'mower:rest',
      'trampoline:rest'
    ])
    expect(rebuilt.mowerHome()).toMatchObject({ lx: 125, ly: 500 })
  })

  it('drops the mower from the patio when the copy says you threw it', () => {
    const options: GardenOptions = { seed: 9, calm: true }
    const g = new Garden(options)
    g.advanceTo(150_000)
    g.mowerGone = true
    g.heaviesThrown = 1
    const copy = copyOf(g)
    const rebuilt = rebuildGarden(options, copy, g.t)
    expect(rebuilt.mowerGone).toBe(true)
    expect(rebuilt.items.some(i => i.kind === 'mower')).toBe(false)
    expect(rebuilt.heaviesThrown).toBe(1)
  })

  it('keeps your own faults, the bag, the can, a running tap and a tired arm', () => {
    const options: GardenOptions = { seed: 31, calm: true }
    const g = new Garden(options)
    g.advanceTo(60_000)
    Object.assign(g.blame, { drowned: 5, clips: 2, digs: 1 })
    g.mower.bag = 90
    g.water.can = 8300
    g.command({ type: 'tap' })
    g.arm.level = 0.8
    g.arm.at = 60_000
    g.advanceTo(63_000)
    const rebuilt = rebuildGarden(options, copyOf(g), g.t)
    expect(rebuilt.blame).toEqual(g.blame)
    expect(rebuilt.mower.bag).toBe(90)
    expect(rebuilt.water.tapOn).toBe(true)
    expect(rebuilt.water.can).toBe(Math.round(g.water.can / 100) * 100)
    expect(armLevel(rebuilt.arm, rebuilt.t)).toBeCloseTo(
      armLevel(g.arm, g.t),
      2
    )
    // The tap floods on time during catch-up, and Brenda counts it as your fault.
    for (const garden of [g, rebuilt]) garden.advanceTo(75_000)
    expect(rebuilt.blame.drowned).toBe(g.blame.drowned)
    expect(rebuilt.blame.drowned).toBeGreaterThan(5)
  })

  it('keeps the schedules in step, so catch-up sprouts the missed weeds', () => {
    const options: GardenOptions = { seed: 1310, round: 0, calm: true }
    const live = new Garden(options)
    live.advanceTo(40_000)
    const copy = copyOf(live)
    const rebuilt = rebuildGarden(options, copy, live.t)
    expect(rebuilt.weeds.map(w => w.patch).sort()).toEqual(
      live.weeds.map(w => w.patch).sort()
    )
    live.drainEvents()
    // Drained every second, since a garden keeps only its last 64 events.
    const sprouts = (g: Garden) => {
      let n = 0
      for (let t = 41_000; t <= 90_000; t += 1000) {
        g.advanceTo(t)
        for (const e of g.drainEvents())
          if (e.type === 'sprout' && !e.spread) n++
      }
      return n
    }
    const missed = sprouts(live)
    expect(missed).toBeGreaterThan(5)
    expect(sprouts(rebuilt)).toBe(missed)
  })
})
