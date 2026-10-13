import { describe, expect, it } from 'vitest'

import { matchSummary } from './judge'

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
