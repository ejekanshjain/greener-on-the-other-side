import { describe, expect, it } from 'vitest'

import { noBlame, noCounts, type LawnReport } from '../game/report'
import { COLS, PATCHES } from '../game/tuning'
import { NeighbourView } from './neighbour'

function lawn(landings: LawnReport['landings']): LawnReport {
  return {
    round: 0,
    patches: new Uint8Array(PATCHES),
    counts: noCounts(),
    patio: { heaviesThrown: 0, mowerThrown: false, crateLeft: 0 },
    tally: [0, 0],
    blame: noBlame(),
    chores: { bag: 0, can: 0, tapOn: false, tapRunMs: 0, arm: 0 },
    markers: [],
    landings
  }
}

describe('NeighbourView', () => {
  it('puffs each landing at its mirrored column and row', () => {
    const view = new NeighbourView()
    view.applyLawn(
      lawn([
        { patch: 2 * COLS + 1, kind: 'weed' },
        { patch: 10 * COLS + 9, kind: 'snailShell' }
      ]),
      5000
    )
    expect(view.puffs).toEqual([
      { x: 525, row: 2, kind: 'weed', at: 5000 },
      { x: 125, row: 10, kind: 'snailShell', at: 5000 }
    ])
    expect(view.heads).toHaveLength(0)
  })

  it('pops their head up, angry, on a gnome or heavy hit', () => {
    const view = new NeighbourView()
    view.applyLawn(
      lawn([
        { patch: 1 * COLS + 3, kind: 'gnome' },
        { patch: 8 * COLS + 0, kind: 'bin' }
      ]),
      100
    )
    expect(view.heads).toEqual([
      { x: 425, at: 100, angry: true },
      { x: 575, at: 100, angry: true }
    ])
  })

  it('forgets the last round on clear', () => {
    const view = new NeighbourView()
    view.applyLawn(lawn([{ patch: 0, kind: 'gnome' }]), 0)
    const version = view.lawnVersion
    view.clear()
    expect(view.lawn).toBeNull()
    expect(view.puffs).toHaveLength(0)
    expect(view.lawnVersion).toBeGreaterThan(version)
  })
})
