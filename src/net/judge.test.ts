import { describe, expect, it } from 'vitest'

import { noBlame, noCounts, packPatch, Top } from '../game/report'
import { PATCHES } from '../game/tuning'
import { encodeFinal } from './finalCodec'
import { judgeRound, matchSummary, resultFrom, resultMsg } from './judge'
import { isMsg } from './protocol'

/** A final for `round` with `gnomes` gnomes and a trampoline from next door. */
function final(round: number, gnomes: number): string {
  return encodeFinal({
    round,
    patches: new Uint8Array(PATCHES).fill(packPatch(5, 2, Top.clean)),
    counts: { ...noCounts(), gnomes, trampolines: 1 },
    healthSum: 5 * PATCHES,
    blame: noBlame(),
    markers: [
      { patch: 60, kind: 'trampoline', look: 0, sunk: true, theirs: true }
    ]
  })
}

describe('judgeRound', () => {
  it('counts both lawns, and the counts reach the guest in the result', () => {
    const r = judgeRound(1, final(1, 4), final(1, 9), undefined)
    if (!r) throw new Error('the host final did not judge')
    expect(r.counts.map(c => [c.gnomes, c.trampolines, c.theirJunk])).toEqual([
      [4, 1, 6],
      [9, 1, 6]
    ])
    const msg = resultMsg(r)
    expect(isMsg(msg)).toBe(true)
    expect(resultFrom(msg).counts).toEqual(r.counts)
    expect(isMsg({ ...msg, ct: [msg.ct[0]] })).toBe(false)
  })

  it('counts a missing guest final as a fresh lawn', () => {
    const r = judgeRound(0, final(0, 1), null, undefined)
    expect(r?.counts[1]).toMatchObject({ gnomes: 3, stripes: 0, theirJunk: 0 })
  })
})

describe('matchSummary', () => {
  it('says the rounds score from each side', () => {
    expect(matchSummary([2, 1], [150, 160], true, 'Turf Lord')).toBe(
      'You won 2 rounds to 1.'
    )
    expect(matchSummary([2, 0], [150, 90], false, 'Turf Lord')).toBe(
      'Turf Lord won 2 rounds to 0.'
    )
    expect(matchSummary([0, 1], [100, 101], true, 'Sid')).toBe(
      'Sid won 1 round to 0.'
    )
  })

  it('falls back to points when rounds are level, then to the council', () => {
    expect(matchSummary([1, 1], [170, 182], true, 'Sid')).toBe(
      'Level on rounds, so points decide it: 182 to 170.'
    )
    expect(matchSummary([1, 1], [170, 170], false, 'Sid')).toBe(
      "Brenda can't choose. She's calling the council."
    )
  })
})
