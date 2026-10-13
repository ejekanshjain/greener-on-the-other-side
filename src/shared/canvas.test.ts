import { describe, expect, it } from 'vitest'

import { fitDesign, FixedStepper } from './canvas'

describe('fitDesign', () => {
  it('letterboxes in contain mode and crops in cover mode', () => {
    expect(fitDesign(400, 1000, 200, 300, 'contain')).toEqual({
      scale: 2,
      offsetX: 0,
      offsetY: 200
    })
    const cover = fitDesign(400, 1000, 200, 300, 'cover')
    expect(cover.scale).toBeCloseTo(1000 / 300)
    expect(cover.offsetX).toBeCloseTo((400 - 200 * cover.scale) / 2)
    expect(cover.offsetY).toBeCloseTo(0)
  })

  it('puts all spare height above the design with alignY end', () => {
    expect(fitDesign(400, 1000, 200, 300, 'contain', 'end')).toEqual({
      scale: 2,
      offsetX: 0,
      offsetY: 400
    })
  })
})

describe('FixedStepper', () => {
  it('runs one step per 60 Hz frame despite timing jitter', () => {
    const stepper = new FixedStepper(1000 / 60, 100)
    const frames = [16.9, 16.4, 16.8, 16.5, 16.7, 16.6]
    expect(frames.map(ms => stepper.advance(ms))).toEqual([1, 1, 1, 1, 1, 1])
  })

  it('carries the remainder and clamps long pauses', () => {
    const stepper = new FixedStepper(10, 50)
    expect(stepper.advance(5)).toBe(0)
    expect(stepper.alpha).toBeCloseTo(0.5)
    expect(stepper.advance(13)).toBe(1)
    expect(stepper.advance(60_000)).toBe(5)
  })
})
