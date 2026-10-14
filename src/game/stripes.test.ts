import { describe, expect, it } from 'vitest'

import { setPatch } from './cheats'
import { Garden } from './garden'
import { patchCenter } from './grid'
import { lawnReport, reportStripes } from './report'
import { StripeWatch } from './stripeWatch'
import { COLS, CUT_COOLDOWN_MS, ROWS, TICK_MS } from './tuning'
import { Mess, type GardenEvent } from './types'

const COL = 4

/** A calm garden with nothing on its lawn, one tick in. */
function bare(): Garden {
  const g = new Garden({ seed: 3, calm: true })
  g.items.length = 0
  g.advanceTo(TICK_MS)
  g.drainEvents()
  return g
}

/** One slow mowing press down `rows` of column `col`, then the time to cut again. */
function mow(g: Garden, col: number, rows = ROWS): GardenEvent[] {
  for (let row = 0; row < rows; row++)
    g.command({
      type: 'mow',
      lx: col * 50 + 25,
      ly: row * 40 + 20,
      speedPx: 600
    })
  g.command({ type: 'mowEnd' })
  g.advanceTo(g.t + CUT_COOLDOWN_MS + TICK_MS)
  return g.drainEvents()
}

const striped = (g: Garden, col = COL) => ((g.stripes() >> col) & 1) === 1
/** The patch on row `row` of the test column. */
const at = (row: number) => row * COLS + COL

/** Drops an item of `kind` on a patch's centre, and returns it once it lies there. */
function drop(g: Garden, kind: 'gnome' | 'bin' | 'trampoline', patch: number) {
  const c = patchCenter(patch)
  g.command({ type: 'spawn', kind, lx: c.lx, ly: c.ly })
  g.advanceTo(g.t + TICK_MS)
  g.drainEvents()
  const item = g.items[g.items.length - 1]
  if (!item) throw new Error('nothing spawned')
  return item
}

describe('repairable stripes', () => {
  it('clear each of the 8 marks in one pass, and the column stripes again', () => {
    const marks = [
      Mess.slime,
      Mess.trample,
      Mess.scuff,
      Mess.clippings,
      Mess.wilt,
      Mess.scalp,
      Mess.puddle,
      Mess.flat
    ]
    for (const mess of marks) {
      const g = bare()
      mow(g, COL)
      expect(striped(g)).toBe(true)
      for (const row of [2, 7, 11]) setPatch(g, at(row), { mess })
      expect(striped(g)).toBe(false)
      mow(g, COL)
      expect([mess, striped(g)]).toEqual([mess, true])
    }
  })

  it('come back once the gnome on them is thrown off and the column is mown', () => {
    const g = bare()
    mow(g, COL)
    const gnome = drop(g, 'gnome', at(6))
    for (const row of [3, 9]) setPatch(g, at(row), { mess: Mess.scuff })
    expect(striped(g)).toBe(false)
    g.command({
      type: 'grab',
      target: { type: 'item', id: gnome.id, distance: 0 },
      lx: gnome.lx,
      ly: gnome.ly
    })
    g.command({
      type: 'release',
      release: { type: 'throw', speedPx: 2000, dirX: 0, dirY: -1 }
    })
    g.advanceTo(g.t + 3000)
    expect(g.items.some(i => i.id === gnome.id)).toBe(false)
    mow(g, COL)
    expect(striped(g)).toBe(true)
  })

  it('stay gone over 3 holes or a sunk trampoline, mown or not', () => {
    const holes = bare()
    for (const row of [1, 5, 9]) setPatch(holes, at(row), { hole: 1 })
    mow(holes, COL)
    expect(striped(holes)).toBe(false)
    const sunk = bare()
    drop(sunk, 'trampoline', at(8)).state = 'sunk'
    mow(sunk, COL)
    expect(striped(sunk)).toBe(false)
  })

  it("count the same on your screen and in Brenda's report, whatever an item is doing", () => {
    for (const state of ['held', 'carried', 'slide', 'sunk', 'rest'] as const) {
      const g = bare()
      mow(g, COL)
      // Two scuffs leave the column one covered patch from losing its stripe.
      for (const row of [3, 9]) setPatch(g, at(row), { mess: Mess.scuff })
      // Only heavy junk sinks.
      drop(g, state === 'sunk' ? 'bin' : 'gnome', at(6)).state = state
      const brenda = reportStripes(lawnReport(g, []).patches)
      expect([state, g.stripes()]).toEqual([state, brenda])
      expect([state, striped(g)]).toEqual([state, false])
      // Carried and held items hide the stripe only for a moment: the cues ignore them.
      const settled = ((g.settledStripes() >> COL) & 1) === 1
      expect([state, settled]).toEqual([
        state,
        state === 'held' || state === 'carried'
      ])
    }
  })
})

describe('the blocked-stripe flash', () => {
  it('names what blocks a column after a 12-patch cut, and not after a 10-patch one', () => {
    const g = bare()
    for (const row of [2, 6, 13]) g.command({ type: 'sprout', patch: at(row) })
    g.advanceTo(g.t + TICK_MS)
    g.drainEvents()
    expect(mow(g, COL, 10).filter(e => e.type === 'blocked')).toEqual([])
    const blocked = mow(g, COL, 12).filter(e => e.type === 'blocked')
    expect(blocked).toEqual([
      {
        type: 'blocked',
        col: COL,
        patches: [at(2), at(6), at(12), at(13), at(14), at(15)]
      }
    ])
  })

  it('stays quiet when the column stripes', () => {
    const g = bare()
    expect(mow(g, COL).some(e => e.type === 'blocked')).toBe(false)
    expect(striped(g)).toBe(true)
  })
})

describe('StripeWatch', () => {
  it('reports live gains and losses, and starts fresh with each garden', () => {
    const watch = new StripeWatch()
    const g = bare()
    expect(watch.step(g, true)).toEqual({ gained: 0, lost: 0 })
    mow(g, COL)
    expect(watch.step(g, true)).toEqual({ gained: 1 << COL, lost: 0 })
    for (const row of [1, 2, 3]) setPatch(g, at(row), { length: 3 })
    // Catch-up moves the mask on without a cue.
    expect(watch.step(g, false)).toEqual({ gained: 0, lost: 0 })
    mow(g, COL)
    const next = bare()
    expect(watch.step(next, true)).toEqual({ gained: 0, lost: 0 })
  })
})
