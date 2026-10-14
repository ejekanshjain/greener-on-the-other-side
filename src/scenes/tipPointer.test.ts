import { describe, expect, it } from 'vitest'

import { Garden } from '../game/garden'
import { FENCE_TOP_H, PATCH_D } from '../game/tuning'
import { designY } from './layout'
import { OUTLINE_ROW, pointerSpot, tipSpotFor } from './tipPointer'

function gnome(garden: Garden) {
  const item = garden.items.find(i => i.kind === 'gnome')
  if (!item) throw new Error('no gnome')
  return item
}

describe('tip placement', () => {
  it('moves a tip to the patio strip while its item teeters on the fence', () => {
    const garden = new Garden({ seed: 3, calm: true })
    const item = gnome(garden)
    const target = { kind: 'item', id: item.id } as const
    item.ly = 0
    item.h = FENCE_TOP_H
    item.state = 'teeter'
    expect(tipSpotFor(garden, target)).toBe('patio')
    // Dropped back so close to the fence that its hat pokes above the lawn's edge.
    item.ly = 30
    item.h = 0
    item.state = 'rest'
    expect(tipSpotFor(garden, target)).toBe('patio')
    // A little further in, the line over the fence is clear of it.
    item.ly = 45
    expect(tipSpotFor(garden, target)).toBe('fence')
    expect(tipSpotFor(garden, undefined)).toBe('fence')
  })

  it('points at nothing held in your hand, or gone', () => {
    const garden = new Garden({ seed: 3, calm: true })
    const item = gnome(garden)
    const target = { kind: 'item', id: item.id } as const
    expect(pointerSpot(garden, target)).not.toBeNull()
    item.state = 'held'
    expect(pointerSpot(garden, target)).toBeNull()
    expect(pointerSpot(garden, { kind: 'item', id: 999 })).toBeNull()
  })

  it("points at a column's row 2, below the tip line", () => {
    const garden = new Garden({ seed: 3, calm: true })
    const spot = pointerSpot(garden, { kind: 'column', col: 3 })
    expect(spot?.y).toBe(designY(OUTLINE_ROW * PATCH_D))
    expect(tipSpotFor(garden, { kind: 'column', col: 3 })).toBe('fence')
  })
})
