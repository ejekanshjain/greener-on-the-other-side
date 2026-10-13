import { describe, expect, it } from 'vitest'

import { noCounts, packPatch, type LawnReport } from '../game/report'
import { PATCHES } from '../game/tuning'
import { ITEM_CODES } from '../game/types'
import { decodeLawn, encodeLawn } from './lawnCodec'
import { isMsg } from './protocol'

function report(over: Partial<LawnReport> = {}): LawnReport {
  return {
    round: 1,
    patches: Uint8Array.from({ length: PATCHES }, (_, i) =>
      packPatch(i % 8, i % 4, (i * 3) % 8)
    ),
    counts: { ...noCounts(), weeds: 12, gnomes: 3, snails: 300 },
    patio: { heaviesThrown: 2, mowerThrown: true, crateLeft: 9 },
    tally: [1, 0],
    blame: {
      drowned: 300,
      scalped: 4,
      clips: 5,
      flattened: 0,
      bounces: 1,
      digs: 2
    },
    chores: { bag: 90, can: 8300, tapOn: true, tapRunMs: 6400, arm: 0.6 },
    markers: [
      { patch: 5, kind: 'gnome' },
      { patch: 170, kind: 'trampoline' }
    ],
    landings: [{ patch: 26, kind: 'snailShell' }],
    ...over
  }
}

describe('lawn pack', () => {
  it('round-trips a report with its faults and chores, capping counts at 255', () => {
    const back = decodeLawn(encodeLawn(report()))
    expect(back).toEqual(
      report({
        counts: { ...report().counts, snails: 255 },
        blame: { ...report().blame, drowned: 255 }
      })
    )
  })

  it('stays under 600 bytes as a message in the worst case', () => {
    const kinds = ITEM_CODES
    const worst = report({
      counts: { ...noCounts(), weeds: 255, gnomes: 255 },
      markers: Array.from({ length: 30 }, (_, k) => ({
        patch: k,
        kind: kinds[k % kinds.length] ?? 'gnome'
      })),
      landings: Array.from({ length: 8 }, (_, k) => ({
        patch: 180 + k,
        kind: 'trampoline' as const
      }))
    })
    const msg = { k: 'lawn' as const, g: encodeLawn(worst) }
    expect(isMsg(msg)).toBe(true)
    expect(JSON.stringify(msg).length).toBeLessThan(600)
  })

  it('refuses malformed packs', () => {
    const good = encodeLawn(report())
    expect(decodeLawn('not base64!')).toBeNull()
    expect(decodeLawn(good.slice(0, 40))).toBeNull()
    expect(decodeLawn(btoa('\u0009' + atob(good).slice(1)))).toBeNull()
    // A marker on a patch past the lawn.
    const bytes = Uint8Array.from(atob(good), c => c.charCodeAt(0))
    bytes[217] = 250
    expect(decodeLawn(btoa(String.fromCharCode(...bytes)))).toBeNull()
  })
})
