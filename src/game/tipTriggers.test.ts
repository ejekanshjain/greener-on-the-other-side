import { describe, expect, it } from 'vitest'

import { setPatch } from './cheats'
import { Garden } from './garden'
import type { TipRequest } from './tipQueue'
import {
  nearestGnome,
  SHED_BANNER_MS,
  TipTriggers,
  WATER_TIP_AT_MS
} from './tipTriggers'
import { ALL_LINES, FETCH_TIPS, WIND_TIPS } from './tips'
import { COLS, PATCHES, ROUND_MS, ROWS, TICK_MS } from './tuning'
import { Mess, type GardenEvent } from './types'

/** Triggers on a calm garden of round `round` (from 0), recording what they raise and end. */
function harness(
  round = 0,
  options: { roundMs?: number; host?: boolean; calm?: boolean } = {}
) {
  const garden = new Garden({ seed: 7, round, calm: true, ...options })
  const raised: TipRequest[] = []
  const ended: string[] = []
  /** Moments that ended during catch-up, out of sight. */
  const unseen: string[] = []
  const banners: number[] = []
  const triggers = new TipTriggers(garden, {
    raise: req => raised.push(req),
    end: (moment, watched) => (watched ? ended : unseen).push(moment),
    shedBanner: () => banners.push(garden.t)
  })
  return {
    garden,
    triggers,
    raised,
    ended,
    unseen,
    banners,
    ids: () => raised.map(r => r.id),
    feed: (...events: GardenEvent[]) => events.forEach(e => triggers.event(e))
  }
}

const land = (id: number, fromNeighbour: boolean): GardenEvent => ({
  type: 'land',
  id,
  landing: { patch: 30, kind: 'gnome', at: 0 },
  fromNeighbour
})

describe('TipTriggers', () => {
  it('keeps bark and wind for round 2, and teaches the dig in round 1', () => {
    const r1 = harness(0)
    r1.feed(
      { type: 'bark', id: 4 },
      { type: 'vane', kind: 'over', dir: 1 },
      { type: 'circle', patch: 40 }
    )
    expect(r1.ids()).toEqual(['biscuit'])
    expect(r1.raised[0]).toMatchObject({ urgent: true, moment: 'circle:40' })
    r1.feed({ type: 'sit', patch: 40 })
    expect(r1.ended).toContain('circle:40')

    const r2 = harness(1)
    r2.feed({ type: 'bark', id: 4 }, { type: 'vane', kind: 'over', dir: 1 })
    expect(r2.ids()).toEqual(['bark', 'wind'])
  })

  it('teaches catching from round 3 only, in the patio strip', () => {
    const arrive: GardenEvent = {
      type: 'arrive',
      id: 9,
      kind: 'gnome',
      x: 300,
      ly: 0,
      h: 60
    }
    const r2 = harness(1)
    r2.feed(arrive)
    expect(r2.ids()).toEqual([])
    const r3 = harness(2)
    r3.feed(arrive, { type: 'arrive', id: 10, kind: 'bin', x: 1, ly: 0, h: 9 })
    expect(r3.raised).toEqual([
      expect.objectContaining({ id: 'catch', urgent: true, spot: 'patio' })
    ])
    r3.feed({ type: 'catch', id: 9 })
    expect(r3.ended).toContain('fall:9')
  })

  it('still teaches a round 1 lesson you never earned in round 2', () => {
    const r2 = harness(1)
    r2.feed({ type: 'sprout', id: 3, patch: 20, spread: false, lx: 0, ly: 0 })
    expect(r2.raised[0]).toMatchObject({
      id: 'weed',
      target: { kind: 'weed', id: 3 }
    })
  })

  it('tells you to throw back light things from next door, not sunk junk', () => {
    const h = harness(0)
    h.feed(land(5, false), {
      type: 'land',
      id: 6,
      landing: { patch: 30, kind: 'trampoline', at: 0 },
      fromNeighbour: true
    })
    expect(h.ids()).toEqual([])
    h.feed(land(7, true))
    expect(h.raised[0]).toMatchObject({
      id: 'back',
      target: { kind: 'item', id: 7 }
    })
  })

  it('gives each put-down its reason, and a cancelled press nothing', () => {
    const h = harness(0)
    const down = (
      reason: 'slow' | 'angle' | 'bag' | 'cancel'
    ): GardenEvent => ({
      type: 'putDown',
      id: 4,
      reason
    })
    h.feed(down('cancel'), down('slow'), down('angle'), down('bag'))
    expect(h.raised).toEqual([
      expect.objectContaining({
        id: 'slow',
        text: "Let go while you're still moving.",
        failure: true,
        target: { kind: 'item', id: 4 }
      }),
      expect.objectContaining({
        id: 'angle',
        text: 'Swipe up toward the fence.',
        failure: true
      }),
      expect.objectContaining({
        id: 'bagOff',
        text: 'Hold the bag on the compost to empty it.',
        target: { kind: 'bag' }
      })
    ])
  })

  it('tells a rooted weed and each kind of missed flick apart', () => {
    const h = harness(0)
    const miss = (near: { type: 'item'; id: number } | null): GardenEvent => ({
      type: 'miss',
      lx: 100,
      ly: 300,
      dirX: 0,
      dirY: -1,
      near: near && { ...near, distance: 30 }
    })
    h.feed(
      { type: 'rooted', id: 8, lx: 100, ly: 200 },
      miss({ type: 'item', id: 6 }),
      miss(null)
    )
    expect(h.raised).toEqual([
      expect.objectContaining({
        id: 'rooted',
        text: "It's rooted. Drag it until it pops out.",
        failure: true,
        target: { kind: 'weed', id: 8 }
      }),
      expect.objectContaining({
        id: 'missed',
        text: 'Missed. Press on it first, then swipe.',
        target: { kind: 'item', id: 6 }
      }),
      expect.objectContaining({
        id: 'tooFast',
        text: 'Too fast to mow. Press, then drag slowly.',
        failure: true
      })
    ])
  })

  it('points the blocked-stripe tip at its column', () => {
    const h = harness(0)
    h.feed({ type: 'blocked', col: 7, patches: [7, 19, 31] })
    expect(h.raised).toEqual([
      expect.objectContaining({
        id: 'blocked',
        text: 'Weeds or junk block this stripe. Clear them.',
        failure: true,
        target: { kind: 'column', col: 7 }
      })
    ])
  })

  it('waits for a clipped throw to drop back before the clip tip', () => {
    const h = harness(0)
    h.feed({ type: 'clip', id: 5, clip: { kind: 'gnome', x: 100, at: 0 } })
    expect(h.ids()).toEqual([])
    h.feed(land(6, false))
    expect(h.ids()).toEqual([])
    h.feed(land(5, false))
    expect(h.raised[0]).toMatchObject({ id: 'clip', failure: true })
  })

  it('answers a heavy drag that ends in a swipe, and ends the grip tip on letting go', () => {
    const h = harness(0)
    h.feed({ type: 'grip', id: 8, patio: true })
    expect(h.raised[0]).toMatchObject({ id: 'patio', moment: 'grip:8' })
    h.feed({ type: 'setDown', id: 8, fast: true })
    expect(h.ended).toContain('grip:8')
    expect(h.raised[1]).toMatchObject({ id: 'heavyFast', failure: true })
    h.feed({ type: 'setDown', id: 8, fast: false })
    expect(h.raised).toHaveLength(2)
  })

  it('ends the sparkle tip when the pour stops, and the tap tip when it floods', () => {
    const h = harness(0)
    h.feed({ type: 'sparkle', patch: 50 }, { type: 'pourStop' })
    expect(h.raised[0]).toMatchObject({ id: 'sparkle', moment: 'pour' })
    expect(h.ended).toEqual(['pour'])
    h.feed({ type: 'tap', on: true }, { type: 'flood', patches: [1] })
    expect(h.ended).toEqual(['pour', 'tap'])
    expect(h.ids()).toEqual(['sparkle', 'tap', 'flood'])
  })

  it('ends every moment during catch-up, raising nothing', () => {
    const h = harness(1)
    const caughtUp: GardenEvent[] = [
      { type: 'dig', patch: 40 },
      { type: 'sit', patch: 41 },
      { type: 'catch', id: 2 },
      land(3, true),
      { type: 'pourStop' },
      { type: 'drown', patch: 50 },
      { type: 'tap', on: false },
      { type: 'flood', patches: [1] },
      { type: 'gust', kind: 'over', dir: 1 },
      { type: 'setDown', id: 4, fast: true },
      { type: 'throw', id: 5, speedPx: 1400, distance: 600 },
      { type: 'fetch', id: 6, kind: 'gnome' },
      { type: 'drop', id: 7, patch: 20 },
      { type: 'takeBack', id: 8 }
    ]
    caughtUp.forEach(e => h.triggers.ends(e))
    expect(h.raised).toEqual([])
    expect(h.ended).toEqual([])
    expect(h.unseen).toEqual([
      'circle:40',
      'circle:41',
      'fall:2',
      'fall:3',
      'pour',
      'pour',
      'tap',
      'tap',
      'gust',
      'grip:4',
      'grip:5',
      'bark:5',
      'bark:6',
      'mouth:7',
      'mouth:8'
    ])
  })

  it('forgets a clipped throw that dropped back during catch-up', () => {
    const h = harness(0)
    h.feed({ type: 'clip', id: 9, clip: { kind: 'gnome', x: 100, at: 0 } })
    h.triggers.ends(land(9, false))
    h.feed(land(9, false))
    expect(h.ids()).not.toContain('clip')
  })

  it('points the stripe tip at the first column that gains a stripe', () => {
    const h = harness(0)
    h.triggers.frame()
    for (let row = 0; row < ROWS; row++)
      setPatch(h.garden, row * COLS + 4, { length: 0 })
    // Gnomes on column 4 would block it; clear the lawn.
    h.garden.items.length = 0
    h.triggers.frame()
    expect(h.raised.find(r => r.id === 'stripe')).toMatchObject({
      target: { kind: 'column', col: 4 }
    })
  })

  it('raises nothing for a stripe gained while the page was catching up', () => {
    const h = harness(0)
    h.triggers.frame()
    for (let row = 0; row < ROWS; row++)
      setPatch(h.garden, row * COLS + 4, { length: 0 })
    h.garden.items.length = 0
    h.triggers.quiet()
    h.triggers.frame()
    expect(h.ids()).not.toContain('stripe')
  })

  /**
   * A round 1 harness whose column 4 stripes with 2 long patches, the most a stripe
   * allows, so one more thing on it breaks it. Its first frame is seen.
   */
  function striped() {
    const h = harness(0)
    h.garden.items.length = 0
    for (let row = 0; row < ROWS; row++)
      setPatch(h.garden, row * COLS + 4, { length: row % 7 === 2 ? 2 : 1 })
    h.triggers.frame()
    expect(h.garden.settledStripes() & (1 << 4)).toBeTruthy()
    return h
  }

  it('says a stripe broke when a weed lands on it or a scuff marks it', () => {
    const landed = striped()
    landed.garden.command({ type: 'spawn', kind: 'weed', lx: 225, ly: 300 })
    landed.garden.advanceTo(landed.garden.t + TICK_MS)
    landed.triggers.frame()
    expect(landed.raised).toEqual([
      expect.objectContaining({
        id: 'broken',
        text: 'Stripe broken. Clear it and mow again.',
        failure: false,
        target: { kind: 'column', col: 4 }
      })
    ])

    // The 2 long patches still leave 14 short ones: the scuff is what breaks it.
    const scuffed = striped()
    setPatch(scuffed.garden, 5 * COLS + 4, { mess: Mess.scuff })
    scuffed.triggers.frame()
    expect(scuffed.ids()).toEqual(['broken'])
  })

  it('stays quiet for a stripe that grew back, was carried across or broke in catch-up', () => {
    const grown = striped()
    setPatch(grown.garden, 12 * COLS + 4, { length: 2 })
    grown.triggers.frame()
    expect(grown.garden.settledStripes() & (1 << 4)).toBe(0)
    expect(grown.ids()).toEqual([])

    // A weed carried across in your hand hides the stripe from Brenda, not from the cue.
    const carried = striped()
    carried.garden.command({ type: 'spawn', kind: 'weed', lx: 120, ly: 300 })
    carried.garden.advanceTo(carried.garden.t + TICK_MS)
    const weed = carried.garden.items[0]
    if (!weed) throw new Error('no weed spawned')
    carried.garden.command({
      type: 'grab',
      target: { type: 'item', id: weed.id, distance: 0 },
      lx: weed.lx,
      ly: weed.ly
    })
    carried.garden.command({ type: 'hold', lx: 225, ly: 300 })
    carried.garden.advanceTo(carried.garden.t + TICK_MS)
    expect(carried.garden.stripes() & (1 << 4)).toBe(0)
    carried.triggers.frame()
    expect(carried.ids()).toEqual([])

    const caughtUp = striped()
    setPatch(caughtUp.garden, 5 * COLS + 4, { mess: Mess.scuff })
    caughtUp.triggers.quiet()
    caughtUp.triggers.frame()
    expect(caughtUp.ids()).toEqual([])
  })

  it('times the watering tip by the share of the round, also in a ?fast round', () => {
    for (const roundMs of [ROUND_MS, ROUND_MS / 4]) {
      const h = harness(0, { roundMs })
      for (let p = 0; p < PATCHES; p++) setPatch(h.garden, p, { health: 3 })
      const at = (WATER_TIP_AT_MS * roundMs) / ROUND_MS
      h.garden.t = at - 100
      h.triggers.frame()
      expect(h.ids()).not.toContain('water')
      h.garden.t = at
      h.triggers.frame()
      expect(h.raised.find(r => r.id === 'water')?.target).toMatchObject({
        kind: 'patch'
      })
    }
  })

  it('shows the stripes tip once the gnomes are gone after 0:40, and at 0:15 from round 2', () => {
    const r1 = harness(0)
    r1.garden.t = ROUND_MS - 15_000
    r1.triggers.frame()
    expect(r1.ids()).not.toContain('stripes')
    const cleared = harness(0)
    cleared.garden.t = cleared.garden.shedAt + 1000
    cleared.triggers.frame()
    expect(cleared.ids()).not.toContain('stripes')
    cleared.garden.items.length = 0
    cleared.garden.t += 250
    cleared.triggers.frame()
    expect(cleared.ids()).toContain('stripes')

    const r2 = harness(1)
    r2.garden.t = ROUND_MS - 15_000
    r2.triggers.frame()
    expect(r2.ids()).toContain('stripes')
  })

  it("gives the wind tip for the gust in each garden's own frame", () => {
    // Seed 7's first gust is over the fence, blowing toward the guest in the host's frame.
    const lines = [true, false].map(host => {
      const h = harness(1, { host, calm: false })
      const gust = h.garden.gusts[0]
      if (gust?.kind !== 'over')
        throw new Error('seed 7 starts with an along gust')
      h.garden.advanceTo(gust.at - 1000)
      for (const e of h.garden.drainEvents()) h.triggers.event(e)
      const wind = h.raised.find(r => r.id === 'wind')
      expect(wind?.urgent).toBe(true)
      return { dir: gust.dir, text: wind?.text }
    })
    const [host, guest] = lines
    expect(host?.text).toBe(host?.dir === 1 ? WIND_TIPS.tail : WIND_TIPS.head)
    expect(guest?.text).toBe(host?.dir === 1 ? WIND_TIPS.head : WIND_TIPS.tail)
  })

  it("shows round 1's shed banner first, then the shed tip 3s later", () => {
    const r1 = harness(0)
    r1.garden.t = r1.garden.shedAt
    r1.feed({ type: 'shed' })
    expect(r1.banners).toHaveLength(1)
    expect(r1.ids()).toEqual([])
    r1.garden.t += SHED_BANNER_MS - 10
    r1.triggers.frame()
    expect(r1.ids()).not.toContain('shed')
    r1.garden.t += 10
    r1.triggers.frame()
    expect(r1.ids()).toContain('shed')

    const r2 = harness(1)
    r2.feed({ type: 'shed' })
    expect(r2.banners).toEqual([])
    expect(r2.ids()).toEqual(['shed'])
  })

  it('points the start tip at the gnome nearest the middle of the patio', () => {
    const h = harness(0)
    const gnomes = h.garden.items.filter(i => i.kind === 'gnome')
    const near = gnomes.reduce((a, b) =>
      Math.hypot(a.lx - 300, a.ly - 640) < Math.hypot(b.lx - 300, b.ly - 640)
        ? a
        : b
    )
    expect(nearestGnome(h.garden)).toBe(near.id)
    h.triggers.countdown()
    expect(h.raised[0]?.target).toEqual({ kind: 'item', id: near.id })
  })

  it('gives each round its countdown tips', () => {
    const tipsOf = (round: number) => {
      const h = harness(round)
      h.triggers.countdown()
      return h.ids()
    }
    expect(tipsOf(0)).toEqual(['start'])
    expect(tipsOf(1)).toEqual([])
    expect(tipsOf(2)).toEqual(['heat'])
  })

  it('raises the coach tip first in the round 2 and 3 countdowns, in its own words', () => {
    const line = 'Gnomes cost you 11. Throw them all over.'
    const coached = (round: number) => {
      const h = harness(round)
      h.triggers.countdown(line)
      return h.raised
    }
    expect(coached(0).map(r => r.id)).toEqual(['start'])
    // Round 2's countdown queues the coach tip alone.
    expect(coached(1)).toEqual([
      expect.objectContaining({ id: 'coach', text: line, eachRound: true })
    ])
    expect(coached(2).map(r => r.id)).toEqual(['coach', 'heat'])
  })

  it('answers a light item held still with the still tip, and a still weed with the rooted tip', () => {
    const h = harness(0)
    h.feed(
      { type: 'putDown', id: 5, reason: 'still' },
      { type: 'rooted', id: 8, lx: 100, ly: 200 }
    )
    expect(h.raised).toEqual([
      expect.objectContaining({
        id: 'still',
        text: 'Swipe it up to throw it. Water bare grass.',
        failure: true,
        target: { kind: 'item', id: 5 }
      }),
      expect.objectContaining({ id: 'rooted' })
    ])
  })

  it('names what Biscuit carries in the fetch tip', () => {
    const h = harness(1)
    const kinds = [
      'weed',
      'dandelion',
      'seedClock',
      'seed',
      'gnome',
      'litter'
    ] as const
    kinds.forEach((kind, id) => h.feed({ type: 'fetch', id, kind }))
    expect(h.raised.map(r => r.text)).toEqual([
      'Biscuit has your weed. Press it.',
      'Biscuit has your dandelion. Press it.',
      'Biscuit has your seed clock. Press it.',
      'Biscuit has your seed. Press it.',
      'Biscuit has your gnome. Press it.',
      'Biscuit has your litter. Press it.'
    ])
    expect(h.raised[2]).toMatchObject({
      urgent: true,
      target: { kind: 'item', id: 2 },
      moment: 'mouth:2'
    })
    expect(FETCH_TIPS).toEqual(h.raised.map(r => r.text))
  })

  it('never raises the cut round 2 line', () => {
    const cut = 'Trust the sparkle, not the colour.'
    expect(ALL_LINES).not.toContain(cut)
    for (const round of [0, 1, 2]) {
      const h = harness(round)
      h.triggers.countdown('Gnomes cost you 11. Throw them all over.')
      expect(h.raised.map(r => r.text)).not.toContain(cut)
    }
  })
})
