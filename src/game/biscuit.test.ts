import { describe, expect, it } from 'vitest'

import { DOG_LIFT } from './biscuit'
import { digSoon } from './cheats'
import { Garden } from './garden'
import { patchAt, patchCenter } from './grid'
import { biscuitWakeAt, digTimes } from './seed'
import {
  BARK_MS,
  CIRCLE_MS,
  COLS,
  DIG_EVERY_MS,
  DIG_FIRST_MS,
  FETCH_COOLDOWN_MS,
  FETCH_MS,
  ROUND_MS,
  ROWS,
  SIT_MS,
  TICK_MS,
  TRAMPLE_MAX
} from './tuning'
import { Mess, type GardenEvent } from './types'

const WAKE = biscuitWakeAt(ROUND_MS)

/** Runs a garden to garden time `t`, collecting every event with the time it came out. */
function run(
  garden: Garden,
  t: number,
  log: { at: number; event: GardenEvent }[] = []
) {
  while (garden.t < t - 1e-6) {
    garden.advanceTo(garden.t + TICK_MS)
    for (const event of garden.drainEvents()) log.push({ at: garden.t, event })
  }
  return log
}

function first<T extends GardenEvent['type']>(
  log: { at: number; event: GardenEvent }[],
  type: T
) {
  const hit = log.find(e => e.event.type === type)
  if (!hit) throw new Error(`no ${type} event`)
  return hit as { at: number; event: Extract<GardenEvent, { type: T }> }
}

/** A seed whose first dig comes late, so a fetch right after waking runs undisturbed. */
function lateDigSeed(): number {
  for (let seed = 1; ; seed++)
    if ((digTimes(seed, ROUND_MS)[0] as number) > WAKE + 16_000) return seed
}

describe('Biscuit digs', () => {
  it('schedules digs 5s to 20s after he wakes, then every 40s to 60s', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const times = digTimes(seed, ROUND_MS)
      const firstGap = (times[0] as number) - WAKE
      expect(firstGap).toBeGreaterThanOrEqual(DIG_FIRST_MS[0])
      expect(firstGap).toBeLessThanOrEqual(DIG_FIRST_MS[1])
      for (let k = 1; k < times.length; k++) {
        const gap = (times[k] as number) - (times[k - 1] as number)
        expect(gap).toBeGreaterThanOrEqual(DIG_EVERY_MS[0])
        expect(gap).toBeLessThanOrEqual(DIG_EVERY_MS[1])
      }
      expect((times.at(-1) as number) + CIRCLE_MS).toBeLessThan(ROUND_MS)
      expect(times.length).toBeGreaterThanOrEqual(2)
    }
    // ?fast rounds scale the schedule with the round.
    const fast = digTimes(9, 45_000)
    expect(fast[0]).toBeCloseTo((digTimes(9, ROUND_MS)[0] as number) / 4, 6)
  })

  it('digs the same holes at the same moments on both lawns when nobody taps him', () => {
    const a = new Garden({ seed: 77 })
    const b = new Garden({ seed: 77 })
    const digs = (log: { at: number; event: GardenEvent }[]) =>
      log.flatMap(e => (e.event.type === 'dig' ? [[e.at, e.event.patch]] : []))
    const logA = run(a, ROUND_MS)
    b.advanceTo(ROUND_MS)
    const holes = Array.from(a.grid.hole).filter(h => h === 1).length
    expect(digs(logA).length).toBe(digTimes(77, ROUND_MS).length)
    expect(holes).toBe(digs(logA).length)
    expect(Array.from(b.grid.hole)).toEqual(Array.from(a.grid.hole))
    expect(a.blame.digs).toBe(holes)
    // Each hole appears as the 2s circle ends.
    const circles = logA.filter(e => e.event.type === 'circle')
    digs(logA).forEach(([at], k) =>
      expect(at).toBeCloseTo((circles[k]?.at as number) + CIRCLE_MS, -2)
    )
  })

  it('sits for 10s instead of digging when you tap him during the circle', () => {
    const garden = new Garden({ seed: 77 })
    const log = run(garden, (digTimes(77, ROUND_MS)[0] as number) + 500)
    const { event } = first(log, 'circle')
    const c = patchCenter(event.patch)
    expect(garden.biscuitHit(c.lx, c.ly - DOG_LIFT + 30, 1)).toBe(true)
    garden.command({ type: 'pat' })
    run(garden, garden.t + CIRCLE_MS + 500, log)
    expect(first(log, 'sit').event.patch).toBe(event.patch)
    expect(log.some(e => e.event.type === 'dig')).toBe(false)
    expect(garden.grid.hole[event.patch]).toBe(0)
    expect(garden.blame.digs).toBe(0)
    expect(garden.biscuit.state).toBe('sit')
    run(garden, first(log, 'sit').at + SIT_MS - 100)
    expect(garden.biscuit.state).toBe('sit')
    run(garden, garden.t + 200)
    expect(garden.biscuit.state).not.toBe('sit')
  })

  it('only wins presses while he circles', () => {
    const garden = new Garden({ seed: 77 })
    run(garden, WAKE + 100)
    const { x, y } = garden.biscuit
    expect(garden.biscuitHit(x, y - DOG_LIFT, 30)).toBe(false)
    garden.command({ type: 'pat' })
    run(garden, garden.t + TICK_MS)
    expect(garden.biscuit.state).not.toBe('sit')
  })
})

describe('Biscuit fetches', () => {
  it('barks at 1.5s, picks up at 3s and drops the item on the back row', () => {
    const seed = lateDigSeed()
    const garden = new Garden({ seed })
    const log = run(garden, WAKE + 9000)
    const bark = first(log, 'bark')
    const fetch = first(log, 'fetch')
    const drop = first(log, 'drop')
    // The starting gnomes lay still all along, so his watch starts as he wakes.
    expect(bark.at).toBeCloseTo(WAKE + BARK_MS, -2)
    expect(fetch.at).toBeGreaterThanOrEqual(WAKE + FETCH_MS - 1)
    expect(fetch.event.id).toBe(bark.event.id)
    expect(Math.floor(drop.event.patch / COLS)).toBe(ROWS - 1)
    const gnome = garden.item(drop.event.id)
    expect(gnome?.state).toBe('rest')
    expect(patchAt(gnome?.lx ?? -1, gnome?.ly ?? -1)).toBe(drop.event.patch)
    // At most 4 trampled patches, all on his straight trot back.
    const trampled = Array.from(garden.grid.mess).flatMap((m, i) =>
      m === Mess.trample ? [i] : []
    )
    expect(trampled.length).toBeGreaterThan(0)
    expect(trampled.length).toBeLessThanOrEqual(TRAMPLE_MAX)
  })

  it('fetches at most once every 20s', () => {
    const seed = lateDigSeed()
    const garden = new Garden({ seed })
    const log = run(garden, WAKE + 15_000)
    const fetches = log.filter(e => e.event.type === 'fetch')
    expect(fetches).toHaveLength(1)
    run(garden, (fetches[0]?.at as number) + FETCH_COOLDOWN_MS + 4000, log)
    const later = log.filter(e => e.event.type === 'fetch')
    // The other starting gnomes wait out the cooldown, then he fetches one.
    expect(later.length).toBe(2)
    expect(
      (later[1]?.at as number) - (later[0]?.at as number)
    ).toBeGreaterThanOrEqual(FETCH_COOLDOWN_MS - 1)
  })

  it('gives the item back when you press it in his mouth', () => {
    const seed = lateDigSeed()
    const garden = new Garden({ seed })
    const log = run(garden, WAKE + FETCH_MS + 300)
    const { event } = first(log, 'fetch')
    const item = garden.item(event.id)
    if (!item) throw new Error('no carried item')
    expect(item.state).toBe('carried')
    const target = garden.hitTest(item.lx, item.ly - item.h, 1)
    expect(target).toEqual(
      expect.objectContaining({ type: 'item', id: item.id })
    )
    garden.command({ type: 'grab', target: target!, lx: item.lx, ly: item.ly })
    run(garden, garden.t + TICK_MS * 2, log)
    expect(first(log, 'takeBack').event.id).toBe(item.id)
    expect(item.state).toBe('held')
    expect(garden.biscuit.state).toBe('idle')
    garden.command({
      type: 'release',
      release: { type: 'putDown', reason: 'slow' }
    })
    // The pickup started his cooldown, so he leaves it alone for 20s.
    run(garden, garden.t + 6000, log)
    expect(log.filter(e => e.event.type === 'fetch')).toHaveLength(1)
  })

  it('drops what he carries when a dig calls him away', () => {
    const garden = new Garden({ seed: lateDigSeed() })
    const log = run(garden, WAKE + FETCH_MS + 100)
    const { event } = first(log, 'fetch')
    digSoon(garden, 3500)
    run(garden, garden.t + 3400, log)
    expect(first(log, 'drop').event.id).toBe(event.id)
    expect(garden.item(event.id)?.state).toBe('rest')
    expect(garden.biscuit.state).toBe('toDig')
  })
})
