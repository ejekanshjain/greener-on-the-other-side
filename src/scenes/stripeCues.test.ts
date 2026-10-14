import { describe, expect, it } from 'vitest'

import { setPatch } from '../game/cheats'
import { Garden } from '../game/garden'
import { COLS, ROWS, TICK_MS } from '../game/tuning'
import { CROSS_MS, StripeTicks } from './stripeCues'

describe('StripeTicks', () => {
  it('ticks the columns the settled stripes mark, a carried item included', () => {
    const garden = new Garden({ seed: 3, calm: true })
    garden.items.length = 0
    // Column 7 has the 2 long patches a stripe allows, so a gnome on it breaks it.
    for (const col of [2, 7])
      for (let row = 0; row < ROWS; row++)
        setPatch(garden, row * COLS + col, {
          length: col === 7 && row % 7 === 2 ? 2 : 1
        })
    // A gnome carried across column 7 hides it from Brenda but not from the ticks.
    garden.command({ type: 'spawn', kind: 'gnome', lx: 300, ly: 300 })
    garden.advanceTo(TICK_MS)
    const gnome = garden.items[0]
    if (!gnome) throw new Error('no gnome spawned')
    garden.command({
      type: 'grab',
      target: { type: 'item', id: gnome.id, distance: 0 },
      lx: gnome.lx,
      ly: gnome.ly
    })
    garden.command({ type: 'hold', lx: 375, ly: 300 })
    garden.advanceTo(2 * TICK_MS)
    expect(garden.stripes()).toBe(1 << 2)

    const ticks = new StripeTicks()
    ticks.follow(garden.settledStripes())
    const marks = Array.from({ length: COLS }, (_, col) => ticks.mark(col, 0))
    expect(marks.flatMap((m, col) => (m ? [`${col} ${m}`] : []))).toEqual([
      '2 tick',
      '7 tick'
    ])
  })

  it('shows a red cross for 1s under a column that lost its stripe', () => {
    const ticks = new StripeTicks()
    ticks.follow(1 << 5)
    ticks.lose(1 << 5, 1000)
    ticks.follow(0)
    expect(ticks.mark(5, 1000)).toBe('cross')
    expect(ticks.mark(5, 1000 + CROSS_MS - 1)).toBe('cross')
    expect(ticks.mark(5, 1000 + CROSS_MS)).toBeNull()
    // A stripe mown back at once trades the cross for its tick.
    ticks.follow(1 << 5)
    expect(ticks.mark(5, 1200)).toBe('tick')
    ticks.reset()
    expect(ticks.mark(5, 1200)).toBeNull()
  })
})
