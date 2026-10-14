import { describe, expect, it } from 'vitest'

import { setPatch } from './cheats'
import { Garden } from './garden'
import { patchAt } from './grid'
import {
  COLS,
  LAWN_D,
  ROWS,
  TICK_MS,
  YARD_RETURN_MS,
  YARD_WEED_PATCH
} from './tuning'
import type { GardenEvent } from './types'
import { YARD_LINES, YardSteps, type YardChange } from './yard'

/** A yard garden with its steps begun at `step`, and a way to run it and see what changed. */
function yard(step = 0) {
  const garden = new Garden({ seed: 9, yard: true })
  const steps = new YardSteps(garden)
  steps.begin(step)
  const changes: YardChange[] = []
  const events: GardenEvent[] = []
  const run = (ms: number) => {
    const end = garden.t + ms
    while (garden.t < end) {
      garden.advanceTo(garden.t + TICK_MS)
      for (const e of garden.drainEvents()) {
        events.push(e)
        const change = steps.event(e)
        if (change) changes.push(change)
      }
      const change = steps.check()
      if (change) changes.push(change)
    }
  }
  return { garden, steps, changes, events, run }
}

/** Grabs the step's object where it lies, moves it by (dx, dy), then lets go with `release`. */
function grabAndLetGo(
  y: ReturnType<typeof yard>,
  release:
    | { type: 'throw'; speedPx: number; dirX: number; dirY: number }
    | { type: 'putDown'; reason: 'slow' },
  dx = 0,
  dy = 0
) {
  const { garden, steps } = y
  const weed = garden.weeds.find(w => w.id === steps.id)
  const item = garden.item(steps.id)
  const at = weed ?? item
  if (!at) throw new Error('the step has no object')
  garden.command({
    type: 'grab',
    target: { type: weed ? 'weed' : 'item', id: steps.id, distance: 0 },
    lx: at.lx,
    ly: at.ly
  })
  if (dx || dy) garden.command({ type: 'hold', lx: at.lx + dx, ly: at.ly + dy })
  garden.command({ type: 'release', release })
}

const up = (speedPx: number) =>
  ({ type: 'throw', speedPx, dirX: 0, dirY: -1 }) as const

describe('the yard', () => {
  it('raises no sprout, snail, dig, gust, drying or growth in 10 minutes', () => {
    const y = yard(0)
    // Every step's object at once, with nobody playing.
    y.steps.begin(1)
    y.steps.begin(2)
    const health = Array.from(y.garden.grid.health)
    y.run(600_000)
    const types = new Set(y.events.map(e => e.type))
    for (const type of [
      'sprout',
      'snail',
      'circle',
      'dig',
      'vane',
      'gust',
      'dry',
      'shaggy',
      'clock',
      'shed',
      'wilt'
    ])
      expect(types.has(type as GardenEvent['type'])).toBe(false)
    expect(Array.from(y.garden.grid.health)).toEqual(health)
    expect(y.garden.weeds).toHaveLength(1)
    expect(y.garden.items.filter(i => i.kind === 'gnome')).toHaveLength(1)
  })

  it('finishes the gnome step on its crossing, not on a put-down, a hedge or a short throw', () => {
    const y = yard(0)
    expect(y.steps.line).toBe(YARD_LINES.throw)
    grabAndLetGo(y, { type: 'putDown', reason: 'slow' })
    y.run(500)
    // Aimed 58 degrees left, it hits the left hedge first, comes down there, and goes
    // back to its start after 1s.
    grabAndLetGo(y, { type: 'throw', speedPx: 1400, dirX: -0.85, dirY: -0.53 })
    y.run(3500)
    expect(y.changes).toEqual(['failed', 'failed', 'returned'])
    grabAndLetGo(y, up(500))
    y.run(2500)
    expect(y.steps.step).toBe(0)
    expect(y.changes.filter(c => c === 'failed')).toHaveLength(3)
    grabAndLetGo(y, up(1300))
    y.run(2500)
    expect(y.changes.at(-1)).toBe('done')
    expect(y.steps.step).toBe(1)
  })

  it('keeps the weed step open through a clip, and finishes it on the crossing', () => {
    const y = yard(1)
    expect(y.garden.weeds[0]?.patch).toBe(YARD_WEED_PATCH)
    expect(y.steps.line).toBe(YARD_LINES.pull)
    // Pulled out sideways, so it stays on the back row, then thrown too softly.
    grabAndLetGo(y, up(1700), 70, 0)
    y.run(3000)
    expect(y.changes.slice(0, 1)).toEqual(['pulled'])
    expect(y.events.some(e => e.type === 'clip')).toBe(true)
    expect(y.steps.step).toBe(1)
    expect(y.steps.line).toBe(YARD_LINES.swipe)
    grabAndLetGo(y, up(2200))
    y.run(3000)
    expect(y.changes.at(-1)).toBe('done')
    expect(y.steps.step).toBe(2)
  })

  it('puts an object resting on the patio back at its start after 1s', () => {
    const y = yard(0)
    const gnome = y.garden.item(y.steps.id)
    if (!gnome) throw new Error('no gnome')
    const start = { lx: gnome.lx, ly: gnome.ly }
    // Dragged down onto the patio in 4 presses, 100 units each, and left there.
    for (let k = 0; k < 4; k++) {
      grabAndLetGo(y, { type: 'putDown', reason: 'slow' }, 0, 100)
      y.garden.advanceTo(y.garden.t + TICK_MS)
    }
    expect(y.garden.item(y.steps.id)?.ly).toBeGreaterThanOrEqual(LAWN_D)
    y.run(YARD_RETURN_MS - 100)
    expect(y.changes).not.toContain('returned')
    y.run(300)
    expect(y.changes).toContain('returned')
    expect(y.garden.item(y.steps.id)).toMatchObject(start)
    expect(y.events).toContainEqual(
      expect.objectContaining({ type: 'putBack', id: y.steps.id })
    )
  })

  it('grows a clear column for the mow step and finishes it on the stripe', () => {
    const garden = new Garden({ seed: 9, yard: true })
    // Marks, an item and a hole on the 4 columns nearest the middle.
    setPatch(garden, 3 * COLS + 6, { mess: 3 })
    setPatch(garden, 9 * COLS + 5, { mess: 1 })
    setPatch(garden, 12 * COLS + 4, { hole: 1 })
    garden.place('gnome', 7 * 50 + 25, 300)
    const steps = new YardSteps(garden)
    steps.begin(2)
    expect(steps.col).toBe(8)
    expect(steps.target).toEqual({ kind: 'column', col: 8 })
    for (let row = 0; row < ROWS; row++)
      expect(garden.grid.length[row * COLS + 8]).toBe(3)
    // One slow pass down the column, then letting go.
    const x = 8 * 50 + 25
    for (let row = 0; row < ROWS; row++)
      garden.command({ type: 'mow', lx: x, ly: row * 40 + 20, speedPx: 300 })
    garden.command({ type: 'mowEnd' })
    garden.advanceTo(garden.t + TICK_MS)
    for (const e of garden.drainEvents()) steps.event(e)
    expect(steps.check()).toBe('done')
    expect(steps.step).toBe(3)
    expect(steps.line).toBe(YARD_LINES.done)
    expect(patchAt(x, 300) % COLS).toBe(8)
  })
})
