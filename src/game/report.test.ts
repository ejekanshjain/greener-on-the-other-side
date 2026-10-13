import { describe, expect, it } from 'vitest'

import { setPatch } from './cheats'
import { Garden } from './garden'
import { patchCenter } from './grid'
import {
  lawnReport,
  packPatch,
  patchHealth,
  patchLength,
  patchTop,
  reportStripes,
  Top
} from './report'
import { COLS, TICK_MS } from './tuning'
import { Mess } from './types'

/** A garden with its 3 gnomes and nothing else, one tick in. */
function fresh(seed = 11): Garden {
  const garden = new Garden({ seed })
  garden.advanceTo(TICK_MS)
  return garden
}

function spawn(
  garden: Garden,
  kind: 'gnome' | 'litter' | 'bin',
  patch: number
) {
  const { lx, ly } = patchCenter(patch)
  garden.command({ type: 'spawn', kind, lx, ly })
}

describe('lawnReport', () => {
  it('packs health, length and the top state into one byte per patch', () => {
    const byte = packPatch(6, 3, Top.hole)
    expect([patchHealth(byte), patchLength(byte), patchTop(byte)]).toEqual([
      6,
      3,
      Top.hole
    ])
  })

  it('counts what lies on the lawn and ranks what sits on top of each patch', () => {
    const garden = fresh()
    garden.command({ type: 'sprout', patch: 30 })
    setPatch(garden, 30, { mess: Mess.scuff })
    setPatch(garden, 31, { mess: Mess.puddle })
    setPatch(garden, 32, { hole: 1 })
    garden.command({ type: 'sprout', patch: 32 })
    spawn(garden, 'litter', 33)
    garden.advanceTo(garden.t + TICK_MS)
    const report = lawnReport(garden, [])
    expect(report.counts).toMatchObject({ weeds: 2, gnomes: 3, litter: 1 })
    expect(patchTop(report.patches[30] as number)).toBe(Top.weed)
    expect(patchTop(report.patches[31] as number)).toBe(Top.puddle)
    expect(patchTop(report.patches[32] as number)).toBe(Top.hole)
    expect(patchTop(report.patches[33] as number)).toBe(Top.item)
  })

  it('marks items only in the peek rows, but heavy junk at any depth', () => {
    const garden = fresh()
    spawn(garden, 'litter', 2 * COLS + 4)
    spawn(garden, 'litter', 9 * COLS + 4)
    spawn(garden, 'bin', 12 * COLS + 6)
    garden.advanceTo(garden.t + TICK_MS)
    const { markers } = lawnReport(garden, [])
    expect(markers).toEqual([
      { patch: 2 * COLS + 4, kind: 'litter' },
      { patch: 12 * COLS + 6, kind: 'bin' }
    ])
  })

  it('keeps the latest 8 landings', () => {
    const landings = Array.from({ length: 11 }, (_, k) => ({
      patch: k,
      kind: 'weed' as const
    }))
    const report = lawnReport(fresh(), landings)
    expect(report.landings.map(l => l.patch)).toEqual([3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('finds the same stripes as the live lawn', () => {
    const garden = fresh(12)
    for (const item of garden.items) item.lx = 590
    for (let row = 0; row < 16; row++)
      garden.command({
        type: 'mow',
        lx: 125,
        ly: row * 40 + 20,
        speedPx: 600
      })
    garden.advanceTo(garden.t + TICK_MS)
    const report = lawnReport(garden, [])
    expect(reportStripes(report.patches)).toBe(garden.stripes())
    expect(garden.stripes() & (1 << 2)).not.toBe(0)
  })
})
