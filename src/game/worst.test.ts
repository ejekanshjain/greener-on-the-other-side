import { describe, expect, it } from 'vitest'

import { setPatch } from './cheats'
import { Garden } from './garden'
import type { GardenEvent } from './types'
import { WORST_LABELS, WorstWindow } from './worst'

const land = (patch: number, fromNeighbour = false): GardenEvent => ({
  type: 'land',
  landing: { patch, kind: 'gnome', at: 0 },
  fromNeighbour
})

describe('the worst moment', () => {
  it('blames a clip for the landing that follows it within 3s', () => {
    const g = new Garden({ seed: 1, calm: true })
    const w = new WorstWindow()
    w.step(g, [], 0)
    w.step(g, [{ type: 'clip', clip: { kind: 'gnome', x: 200, at: 0 } }], 100)
    setPatch(g, 10, { health: 3 })
    w.step(g, [land(10)], 700)
    expect(w.loss).toBe(2)
    expect(w.label).toBe(WORST_LABELS.clip)
    // Three seconds on, the window has forgotten it.
    w.step(g, [], 4000)
    expect(w.loss).toBe(0)
    expect(w.label).toBe(WORST_LABELS.other)
  })

  it('never counts scheduled drying or losses with no cause', () => {
    const g = new Garden({ seed: 1, calm: true })
    const w = new WorstWindow()
    w.step(g, [], 0)
    setPatch(g, 11, { health: 4 })
    w.step(g, [{ type: 'dry', patch: 11, health: 4 }], 100)
    setPatch(g, 12, { health: 3 })
    w.step(g, [], 200)
    expect(w.loss).toBe(0)
  })

  it('ignores a catch-up jump, and prefers your own faults to theirs', () => {
    const g = new Garden({ seed: 1, calm: true })
    const w = new WorstWindow()
    w.step(g, [], 0)
    g.advanceTo(5000)
    setPatch(g, 20, { health: 1 })
    w.step(g, [land(20, true)], 100)
    expect(w.loss).toBe(0)
    setPatch(g, 21, { health: 2 })
    w.step(g, [land(21, true)], 200)
    expect(w.label).toBe(WORST_LABELS.hit)
    setPatch(g, 22, { health: 4 })
    w.step(g, [{ type: 'scalp', patch: 22 }], 300)
    expect(w.loss).toBe(4)
    expect(w.label).toBe(WORST_LABELS.scalp)
  })
})
