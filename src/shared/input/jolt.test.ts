import { afterEach, describe, expect, it } from 'vitest'

import { settings } from '../settings'
import { JoltMeter } from './jolt'

const STEP = 1000 / 60

afterEach(() => {
  settings.set({ sensitivity: 1, assist: false })
})

/** Feeds a steady pointer for `ms`, then one sudden velocity change of `jump` units/s. */
function flick(meter: JoltMeter, jump: number) {
  for (let t = 0; t < 500; t += STEP) meter.feedPointer(200, 0, STEP)
  meter.feedPointer(200 + jump, 0, STEP)
  for (let i = 0; i < 3; i++) meter.feedPointer(200 + jump, 0, STEP)
  return meter.level
}

describe('JoltMeter', () => {
  it('stays calm for smooth pointer movement and spikes on a flick', () => {
    const meter = new JoltMeter()
    for (let t = 0; t < 1000; t += STEP) meter.feedPointer(300, 100, STEP)
    expect(meter.level).toBeLessThan(0.01)
    expect(flick(meter, 600)).toBeGreaterThan(1)
    expect(meter.over).toBe(true)
  })

  it('settles back down after a jolt', () => {
    const meter = new JoltMeter()
    flick(meter, 600)
    for (let t = 0; t < 2000; t += STEP) meter.feed(0, STEP)
    expect(meter.level).toBeLessThan(0.01)
  })

  it('starts each press from a clean baseline once fed idle readings', () => {
    const meter = new JoltMeter()
    for (let t = 0; t < 500; t += STEP) meter.feedPointer(300, 0, STEP)
    // Released while moving, then pressed again with the pointer still.
    meter.feed(0, STEP)
    meter.feedPointer(0, 0, STEP)
    meter.feedPointer(0, 0, STEP)
    expect(meter.level).toBeLessThan(0.01)
  })

  it('reads weaker in Assist Mode and stronger with high sensitivity', () => {
    const normal = flick(new JoltMeter(), 200)
    settings.set({ assist: true })
    const assisted = flick(new JoltMeter(), 200)
    settings.set({ assist: false, sensitivity: 2 })
    const sensitive = flick(new JoltMeter(), 200)
    expect(assisted).toBeCloseTo(normal * 0.6, 5)
    expect(sensitive).toBeCloseTo(normal * 2, 5)
  })

  it('uses its own Assist Mode scale when given one', () => {
    const normal = flick(new JoltMeter(), 200)
    settings.set({ assist: true })
    expect(flick(new JoltMeter({ assistScale: 0.8 }), 200)).toBeCloseTo(
      normal * 0.8,
      5
    )
  })
})
