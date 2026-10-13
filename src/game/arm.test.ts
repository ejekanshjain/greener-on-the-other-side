import { describe, expect, it } from 'vitest'

import { armBlock, armLevel, createArm, spendThrow } from './arm'
import { throwDistance } from './flight'

describe('arm meter', () => {
  it('fills 18% per light throw and 45% per heavy one, and drains 15% a second', () => {
    const arm = createArm()
    spendThrow(arm, 1000, false)
    expect(armLevel(arm, 1000)).toBeCloseTo(0.18)
    spendThrow(arm, 2000, true)
    expect(armLevel(arm, 2000)).toBeCloseTo(0.03 + 0.45)
    expect(armLevel(arm, 4000)).toBeCloseTo(0.18)
    expect(armLevel(arm, 60_000)).toBe(0)
  })

  it('needs 0.4s between throws', () => {
    const arm = createArm()
    spendThrow(arm, 1000, false)
    expect(armBlock(arm, 1399)).toBe('hand')
    expect(armBlock(arm, 1400)).toBeNull()
  })

  it('blocks throws for 1.5s once the meter fills', () => {
    const arm = createArm()
    let t = 0
    // A throw every 0.4s adds 18% and drains 6% in between, so the 8th fills it.
    for (let k = 0; k < 8; k++, t += 400) {
      expect(armBlock(arm, t)).toBeNull()
      spendThrow(arm, t, false)
    }
    const filledAt = t - 400
    expect(armLevel(arm, filledAt)).toBe(1)
    expect(armBlock(arm, filledAt + 1499)).toBe('tired')
    expect(armBlock(arm, filledAt + 1500)).toBeNull()
  })

  it('shortens throws by up to 40% as it fills', () => {
    expect(throwDistance(1500, 0)).toBeCloseTo(600)
    expect(throwDistance(1500, 0.5)).toBeCloseTo(480)
    expect(throwDistance(1500, 1)).toBeCloseTo(360)
  })
})
