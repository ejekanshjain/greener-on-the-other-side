import { describe, expect, it } from 'vitest'

import { heapPatches, overCompost } from './bag'
import { Garden } from './garden'
import { patchCenter } from './grid'
import {
  BAG_CUTS,
  BAG_POS,
  COLS,
  COMPOST_RECT,
  HEALTH_START,
  HEAP_CUTS,
  MOWER_POS,
  TICK_MS
} from './tuning'
import { Mess, type Crossing, type GardenEvent } from './types'

/** A garden one tick in, with `cuts` in the bag. */
function garden(cuts: number): Garden {
  const g = new Garden({ seed: 21 })
  g.mower.bag = cuts
  g.advanceTo(TICK_MS)
  g.drainEvents()
  return g
}

function step(g: Garden, ms = TICK_MS): GardenEvent[] {
  g.advanceTo(g.t + ms)
  return g.drainEvents()
}

/** Lifts the bag off the mower and drags it to (lx, ly). */
function lift(g: Garden, lx: number, ly: number): void {
  g.command({ type: 'grabBag', lx: BAG_POS.lx, ly: BAG_POS.ly })
  g.command({ type: 'hold', lx, ly })
}

/** Lifts the bag, drags it 100 units toward the fence and swipes it at `speedPx`. */
function swipe(g: Garden, speedPx: number): GardenEvent[] {
  lift(g, BAG_POS.lx, BAG_POS.ly - 200)
  g.command({
    type: 'release',
    release: { type: 'throw', speedPx, dirX: 0, dirY: -1 }
  })
  return step(g, 4000)
}

describe('heap patches', () => {
  it('cover the landing patch and its neighbours toward the landing point', () => {
    // (110, 95) sits in the top left of patch (2, 2), so the heap reaches up and left.
    expect(heapPatches(110, 95)).toEqual([
      1 * COLS + 1,
      1 * COLS + 2,
      2 * COLS + 1,
      2 * COLS + 2
    ])
    expect(heapPatches(5, 5)).toEqual([0, 1, COLS, COLS + 1])
    expect(heapPatches(599, 639)).toEqual([
      14 * COLS + 10,
      14 * COLS + 11,
      15 * COLS + 10,
      15 * COLS + 11
    ])
  })

  it('count the bag as on the compost once they overlap', () => {
    expect(overCompost(COMPOST_RECT.lx - 20, COMPOST_RECT.ly + 30)).toBe(true)
    expect(overCompost(COMPOST_RECT.lx - 30, COMPOST_RECT.ly + 30)).toBe(false)
  })
})

describe('grass bag', () => {
  it('lifts only with a quarter load or more', () => {
    expect(garden(23).bagHit(BAG_POS.lx, BAG_POS.ly, 5)).toBe(false)
    expect(garden(24).bagHit(BAG_POS.lx, BAG_POS.ly, 5)).toBe(true)
  })

  it('ignores a press on a bag too empty to lift, instead of poking the mower', () => {
    const g = garden(23)
    expect(g.mowerHit(BAG_POS.lx, BAG_POS.ly, 20)).toBe(false)
    expect(g.mowerHit(MOWER_POS.lx, MOWER_POS.ly, 20)).toBe(true)
  })

  it('says why the bag went back: off the compost, or a cancelled press', () => {
    const reasons = (['slow', 'angle', 'cancel'] as const).map(reason => {
      const g = garden(60)
      lift(g, 200, 600)
      g.command({ type: 'release', release: { type: 'putDown', reason } })
      const down = step(g).find(e => e.type === 'putDown')
      return down?.type === 'putDown' ? down.reason : null
    })
    expect(reasons).toEqual(['bag', 'bag', 'cancel'])
  })

  it('empties after 1.5s held on the compost bin', () => {
    const g = garden(90)
    lift(g, COMPOST_RECT.lx, COMPOST_RECT.ly + 40)
    step(g, 1400)
    expect(g.mower.bag).toBe(90)
    expect(g.mower.bagOff).toBe(true)
    const events = step(g, 200)
    expect(events).toContainEqual({ type: 'compost', cuts: 90 })
    expect(g.mower.bag).toBe(0)
    expect(g.mower.bagOff).toBe(false)
    expect(g.items.some(i => i.kind === 'bag')).toBe(false)
  })

  it('goes back full when let go on the compost early, even with a swipe', () => {
    const g = garden(60)
    lift(g, COMPOST_RECT.lx, COMPOST_RECT.ly + 40)
    step(g, 500)
    g.command({
      type: 'release',
      release: { type: 'throw', speedPx: 2000, dirX: 0.3, dirY: -1 }
    })
    expect(step(g)).toContainEqual({ type: 'bagBack' })
    expect(g.mower).toMatchObject({ bag: 60, bagOff: false })
  })

  it('crosses the fence from the patio at 1,900 px/s, emptying the bag', () => {
    const g = garden(BAG_CUTS)
    const crossed = swipe(g, 1900).find(e => e.type === 'cross')
    expect(crossed?.type === 'cross' && crossed.crossing.kind).toBe('bag')
    expect(g.mower).toMatchObject({ bag: 0, bagOff: false })
  })

  it('clips at 1,700 px/s and bursts across your own front rows', () => {
    const g = garden(BAG_CUTS)
    const events = swipe(g, 1700)
    expect(events.some(e => e.type === 'clip')).toBe(true)
    const heap = events.find(e => e.type === 'heap')
    expect(heap?.type === 'heap' && heap.patches.every(p => p < 3 * COLS)).toBe(
      true
    )
    expect(g.blame.clips).toBe(1)
  })
})

describe('clippings heap', () => {
  /** A bag from next door landing mid-lawn. */
  function landBag(g: Garden): number[] {
    const crossing: Crossing = {
      kind: 'bag',
      x: 300,
      at: 0,
      d: 300,
      dx: 0,
      tau: 0.4,
      T: 1000,
      H: 300,
      spin: 0,
      wiltIn: -1,
      bounced: false,
      back: false,
      look: 0
    }
    g.command({ type: 'arrive', arrival: crossing, ffMs: 0 })
    const heap = step(g, 2000).find(e => e.type === 'heap')
    if (heap?.type !== 'heap') throw new Error('no heap')
    return heap.patches
  }

  it('smothers 4 patches, 1 health each every 10s, until mown', () => {
    const g = garden(0)
    const patches = landBag(g)
    expect(patches).toHaveLength(4)
    for (const p of patches) expect(g.grid.mess[p]).toBe(Mess.heap)
    const before = patches.map(p => g.grid.health[p] as number)
    step(g, 10_000)
    expect(patches.map(p => g.grid.health[p])).toEqual(before.map(h => h - 1))
    // Mowing one heap patch clears it into the bag, 6 cuts plus the grass cut.
    const { lx, ly } = patchCenter(patches[0] as number)
    g.command({ type: 'mow', lx, ly, speedPx: 600 })
    g.command({ type: 'mowEnd' })
    const events = step(g)
    expect(events).toContainEqual({ type: 'unheap', patch: patches[0] })
    expect(g.grid.mess[patches[0] as number]).toBe(Mess.none)
    expect(g.mower.bag).toBe(HEAP_CUTS + 1)
    step(g, 10_000)
    expect(g.grid.health[patches[0] as number]).toBe((before[0] as number) - 1)
    expect(g.grid.health[patches[1] as number]).toBe((before[1] as number) - 2)
    expect(HEALTH_START).toBeGreaterThan(2)
  })

  it('stays when a full bag rolls over it', () => {
    const g = garden(BAG_CUTS)
    const [patch] = landBag(g)
    const { lx, ly } = patchCenter(patch as number)
    g.command({ type: 'mow', lx, ly, speedPx: 600 })
    step(g)
    expect(g.grid.mess[patch as number]).toBe(Mess.heap)
  })
})
