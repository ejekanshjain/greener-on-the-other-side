import { describe, expect, it } from 'vitest'

import { Brain, closingColumn } from './brain'
import { setPatch } from './cheats'
import { Garden } from './garden'
import { patchCenter } from './grid'
import { PEMBERTON, PLAYERS, type Profile } from './profiles'
import { COLS, PATCHES, ROWS } from './tuning'
import { isHeavy, Mess, type GardenEvent } from './types'

/** A windless garden whose grass never dries, so the only drying is what a test feeds the brain. */
function quietGarden(seed = 4): Garden {
  const garden = new Garden({ seed, calm: true })
  garden.grid.nextTimerAt = Infinity
  for (let patch = 0; patch < PATCHES; patch++)
    setPatch(garden, patch, { health: 3 })
  return garden
}

/** `n` drying events, each worth 1 health of water debt. */
function dries(n: number): GardenEvent[] {
  return Array.from({ length: n }, (_, patch) => ({
    type: 'dry' as const,
    patch,
    health: 2
  }))
}

/** Runs a brain on its garden in 50 ms steps, like the headless runs, and returns every event. */
function play(brain: Brain, garden: Garden, ms: number): GardenEvent[] {
  const events: GardenEvent[] = []
  const end = garden.t + ms
  while (garden.t < end) {
    brain.step(garden)
    garden.advanceTo(Math.min(end, garden.t + 50))
    const batch = garden.drainEvents()
    brain.observe(batch)
    events.push(...batch)
  }
  return events
}

/** Fills the arm meter and keeps throws locked for a minute. */
function exhaust(garden: Garden): void {
  garden.arm.level = 1
  garden.arm.at = garden.t
  garden.arm.lockUntil = garden.t + 60_000
}

/**
 * A quiet garden `leftMs` before 0:00 with the shed open: long grass everywhere, no weeds,
 * snails or gnomes, and only the patio's heavy junk.
 */
function lateGarden(leftMs: number, seed = 6): Garden {
  const garden = quietGarden(seed)
  garden.advanceTo(garden.endMs - leftMs)
  garden.drainEvents()
  garden.weeds.length = 0
  garden.snails.length = 0
  const heavy = garden.items.filter(i => isHeavy(i.kind))
  garden.items.length = 0
  garden.items.push(...heavy)
  for (let patch = 0; patch < PATCHES; patch++)
    setPatch(garden, patch, { length: 2, mess: Mess.none })
  return garden
}

/** Puts a hole in the first `n` rows of column `col`. */
function holes(garden: Garden, col: number, n: number): void {
  for (let row = 0; row < n; row++)
    setPatch(garden, row * COLS + col, { hole: 1 })
}

/** An expert with the thrower's finale: every piece of heavy junk, then the gnomes. */
const THROWER: Profile = {
  ...PLAYERS.expert,
  finale: {
    ...PLAYERS.expert.finale,
    junk: true,
    mower: 'junk',
    closeMs: 0
  }
}

const heavyCross = (e: GardenEvent) =>
  e.type === 'cross' && isHeavy(e.crossing.kind)
const heavyClip = (e: GardenEvent) => e.type === 'clip' && isHeavy(e.clip.kind)

describe('the bot brain', () => {
  it('waters only its share of the drying, so a long pour pays ahead', () => {
    const garden = quietGarden()
    const brain = new Brain(PLAYERS.regular, 1)
    // A brain starts afresh on a new garden, so it meets the garden before the drying.
    brain.step(garden)
    brain.observe(dries(3))
    const first = play(brain, garden, 2500)
    expect(first.filter(e => e.type === 'pourStart')).toHaveLength(1)
    // That pour gave back far more than 3 health, so 3 more drying asks for nothing.
    brain.observe(dries(3))
    const second = play(brain, garden, 2500)
    expect(second.some(e => e.type === 'pourStart')).toBe(false)
  })

  it('waters while a tired arm rests, then pulls the weed and drops it', () => {
    const garden = quietGarden()
    garden.plantWeed(6 * COLS + 5)
    const brain = new Brain(PLAYERS.regular, 2)
    brain.step(garden)
    garden.advanceTo(PLAYERS.regular.weedReactMs)
    garden.drainEvents()
    exhaust(garden)
    brain.observe(dries(3))
    const events = play(brain, garden, 5000)
    const pour = events.findIndex(e => e.type === 'pourStart')
    const yank = events.findIndex(e => e.type === 'yank')
    expect(pour).toBeGreaterThanOrEqual(0)
    expect(yank).toBeGreaterThan(pour)
    expect(events.some(e => e.type === 'putDown')).toBe(true)
    expect(events.some(e => e.type === 'throw')).toBe(false)
  })

  it('has Mr Pemberton throw theirs back before his chores, while a player waters first', () => {
    const firstMove = (profile: Profile) => {
      const garden = quietGarden()
      const gnome = garden.place('gnome', 300, 200)
      gnome.fromNeighbour = true
      const brain = new Brain(profile, 3)
      brain.step(garden)
      // Both throw-backs are due by now, and the hand is free.
      garden.advanceTo(3100)
      garden.drainEvents()
      brain.observe(dries(3))
      return play(brain, garden, 400).find(
        e => e.type === 'throw' || e.type === 'pourStart'
      )?.type
    }
    expect(firstMove(PEMBERTON[2])).toBe('throw')
    expect(firstMove(PLAYERS.regular)).toBe('pourStart')
  })

  it('throws heavy junk only with a fresh arm, dragged no deeper than its slowest swipe needs', () => {
    const garden = quietGarden(9)
    garden.openShed()
    garden.advanceTo(3000)
    garden.drainEvents()
    garden.arm.level = 0.9
    garden.arm.at = garden.t
    const brain = new Brain(THROWER, 4)
    expect(play(brain, garden, 1000).some(e => e.type === 'grip')).toBe(false)
    let liftLy = Infinity
    const events: GardenEvent[] = []
    const end = garden.t + 15_000
    while (garden.t < end) {
      brain.step(garden)
      garden.advanceTo(garden.t + 50)
      const batch = garden.drainEvents()
      brain.observe(batch)
      for (const e of batch)
        if (e.type === 'lift')
          liftLy = Math.min(liftLy, garden.item(e.id)?.ly ?? Infinity)
      events.push(...batch)
    }
    // The old fixed drag went to 280; an expert's slowest heavy throw clears from 244.
    expect(liftLy).toBeLessThan(250)
    expect(events.filter(heavyCross)).toHaveLength(3)
    expect(events.some(heavyClip)).toBe(false)
  })

  it("keeps Mr Pemberton's fumbles to light throws", () => {
    const garden = quietGarden(9)
    garden.openShed()
    garden.advanceTo(3000)
    garden.drainEvents()
    const brain = new Brain({ ...PEMBERTON[2], clipChance: 1 }, 5)
    const events = play(brain, garden, 15_000)
    expect(events.some(heavyCross)).toBe(true)
    expect(events.some(heavyClip)).toBe(false)
    expect(events.some(e => e.type === 'clip' && e.clip.kind === 'gnome')).toBe(
      true
    )
  })

  it("counts only what a mowing pass can't clear as stuck, and picks the safest column to close", () => {
    const garden = lateGarden(10_000)
    for (let col = 0; col < COLS; col++) holes(garden, col, 3)
    // Column 3 holds 2 stuck patches: a hole and a gnome. Column 5 holds 1 hole.
    for (const col of [3, 5])
      for (let row = 0; row < 3; row++)
        setPatch(garden, row * COLS + col, { hole: 0 })
    setPatch(garden, 3, { hole: 1 })
    const spot = patchCenter(COLS + 3)
    garden.place('gnome', spot.lx, spot.ly)
    setPatch(garden, 5, { hole: 1 })
    // Slime and long grass clear in one pass, so they never count.
    setPatch(garden, 4 * COLS + 5, { mess: Mess.slime })
    const stuck = garden.stuckByColumn()
    expect([stuck[0], stuck[3], stuck[5]]).toEqual([3, 2, 1])
    expect(closingColumn(garden)).toBe(5)
    // Once column 5 stripes, the next safest unstriped column is 3.
    for (let row = 1; row < ROWS; row++)
      setPatch(garden, row * COLS + 5, { length: 1, mess: Mess.none })
    expect((garden.stripes() >> 5) & 1).toBe(1)
    expect(closingColumn(garden)).toBe(3)
  })

  it('has a closer mow for stripes before it throws, emptying a full bag first', () => {
    const garden = lateGarden(10_000)
    const gnome = garden.place('gnome', 300, 300)
    garden.mower.bag = 90
    const brain = new Brain(PLAYERS.expert, 7)
    const events = play(brain, garden, 6000)
    const compost = events.findIndex(e => e.type === 'compost')
    const firstCut = events.findIndex(e => e.type === 'cut')
    const thrown = events.findIndex(
      e => e.type === 'throw' && e.id === gnome.id
    )
    expect(compost).toBeGreaterThanOrEqual(0)
    expect(firstCut).toBeGreaterThan(compost)
    // Its first full pass stripes a column, and the gnome waits.
    expect(garden.stripes()).not.toBe(0)
    expect(thrown === -1 || thrown > firstCut).toBe(true)
  })

  it('has petty Mr Pemberton keep his mower through the junk, then throw it in the last seconds', () => {
    const garden = lateGarden(30_000, 9)
    const brain = new Brain(PEMBERTON[2], 8)
    const crossings: { kind: string; left: number }[] = []
    let cutsLate = 0
    const end = garden.endMs
    while (garden.t < end) {
      brain.step(garden)
      garden.advanceTo(Math.min(end, garden.t + 50))
      const batch = garden.drainEvents()
      brain.observe(batch)
      for (const e of batch) {
        if (heavyCross(e) && e.type === 'cross')
          crossings.push({ kind: e.crossing.kind, left: end - garden.t })
        if (e.type === 'cut' && end - garden.t < 15_000) cutsLate++
      }
    }
    const mower = crossings.find(c => c.kind === 'mower')
    expect(crossings.filter(c => c.kind !== 'mower')).toHaveLength(2)
    expect(mower?.left).toBeLessThan(6000)
    expect(mower?.left).toBeGreaterThan(1000)
    expect(cutsLate).toBeGreaterThanOrEqual(ROWS)
  })
})
