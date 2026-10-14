import { describe, expect, it } from 'vitest'

import { Garden } from '../game/garden'
import type { GardenEvent } from '../game/types'
import { Effects } from './fx'
import { LAWN } from './layout'

/** The weeds a garden roots while it runs to garden time `ms`, by how they came. */
function sprouts(garden: Garden, ms: number) {
  garden.advanceTo(ms)
  return garden
    .drainEvents()
    .filter(
      (e): e is Extract<GardenEvent, { type: 'sprout' }> => e.type === 'sprout'
    )
}

describe('Effects', () => {
  it('puffs dirt where every new weed comes up: sprouts, spreads and rooted seeds', () => {
    // A sprout on its schedule.
    const sprouted = sprouts(new Garden({ seed: 4 }), 6_000)
    expect(sprouted.length).toBeGreaterThan(0)
    // A weed left alone spreads to a neighbouring patch.
    const spreadGarden = new Garden({ seed: 4, calm: true })
    spreadGarden.command({ type: 'sprout', patch: 100 })
    const spread = sprouts(spreadGarden, 40_000).filter(e => e.spread)
    expect(spread.length).toBeGreaterThan(0)
    // A burst seed clock's seeds root 10s after they land.
    const seeded = new Garden({ seed: 4, calm: true })
    seeded.seeds.push({ patch: 60, lx: 230, ly: 220, at: 500 })
    const rooted = sprouts(seeded, 1_000)
    expect(rooted).toEqual([
      expect.objectContaining({ patch: 60, spread: true })
    ])

    for (const event of [sprouted[0], spread[0], rooted[0]]) {
      if (!event) throw new Error('missing sprout')
      const fx = new Effects()
      fx.onEvents([event], 0)
      expect(fx.puffs).toEqual([
        expect.objectContaining({ x: LAWN.x + event.lx, y: LAWN.y + event.ly })
      ])
    }
  })

  it('puffs where a pulled weed pops out and where the yard puts an object back', () => {
    const fx = new Effects()
    fx.onEvents(
      [
        { type: 'yank', id: 3, lx: 120, ly: 300 },
        { type: 'putBack', id: 4, lx: 290, ly: 340 }
      ],
      0
    )
    expect(fx.puffs).toEqual([
      expect.objectContaining({ x: LAWN.x + 120, y: LAWN.y + 300 }),
      expect.objectContaining({ x: LAWN.x + 290, y: LAWN.y + 340 })
    ])
  })
})
