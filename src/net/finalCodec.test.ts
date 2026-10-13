import { describe, expect, it } from 'vitest'

import { Garden } from '../game/garden'
import { finalReport, type FinalReport } from '../game/report'
import { PATCHES } from '../game/tuning'
import {
  decodeFinal,
  encodeFinal,
  FINAL_MARKER_MAX,
  finalRound
} from './finalCodec'
import { isMsg } from './protocol'

describe('final pack', () => {
  it('round-trips a garden final with its blame and every item', () => {
    const garden = new Garden({ seed: 8, round: 2, calm: true })
    garden.openShed()
    garden.advanceTo(3000)
    garden.blame.clips = 3
    garden.blame.flattened = 400
    const report = finalReport(garden)
    const back = decodeFinal(encodeFinal(report))
    expect(back).toEqual({
      ...report,
      blame: { ...report.blame, flattened: 255 }
    })
    expect(finalRound(encodeFinal(report))).toBe(2)
  })

  it('keeps the worst case under its size limit and the validator', () => {
    const worst: FinalReport = {
      round: 1,
      patches: new Uint8Array(PATCHES).fill(255),
      counts: {
        weeds: 255,
        snails: 255,
        gnomes: 255,
        litter: 255,
        heaps: 255,
        bins: 255,
        mowers: 255,
        trampolines: 255
      },
      healthSum: 1344,
      blame: {
        drowned: 255,
        scalped: 255,
        clips: 255,
        flattened: 255,
        bounces: 255,
        digs: 255
      },
      markers: Array.from({ length: FINAL_MARKER_MAX }, (_, i) => ({
        patch: i % PATCHES,
        kind: 'litter' as const,
        look: 3,
        sunk: true
      }))
    }
    const pack = encodeFinal(worst)
    expect(pack.length).toBeLessThanOrEqual(760)
    expect(isMsg({ k: 'final', g: pack })).toBe(true)
    expect(decodeFinal(pack)?.markers).toHaveLength(FINAL_MARKER_MAX)
  })

  it('refuses a lawn pack or garbage', () => {
    expect(decodeFinal('AQ==')).toBeNull()
    expect(decodeFinal('not base64!')).toBeNull()
    expect(finalRound('AgA=')).toBe(-1)
  })
})
