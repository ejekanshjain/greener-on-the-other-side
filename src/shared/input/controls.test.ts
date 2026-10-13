import { afterEach, describe, expect, it } from 'vitest'

import { settings } from '../settings'
import { prefersMotion, TiltAxis, type KeyInput } from './controls'

afterEach(() => {
  settings.set({ sensitivity: 1 })
})

function fakeKeys(held: Set<string>): KeyInput {
  return { anyDown: codes => codes.some(code => held.has(code)) }
}

describe('prefersMotion', () => {
  it('uses sensors for fingers and the pointer for a mouse', () => {
    const motion = { available: true }
    expect(prefersMotion(motion, { lastType: 'touch' })).toBe(true)
    expect(prefersMotion(motion, { lastType: 'mouse' })).toBe(false)
    expect(prefersMotion({ available: false }, { lastType: 'touch' })).toBe(
      false
    )
  })
})

describe('TiltAxis', () => {
  it('ramps held keys to full tilt and back', () => {
    const held = new Set(['KeyD'])
    const axis = new TiltAxis({ keys: fakeKeys(held), rampMs: 300 })
    expect(axis.update(150)).toBeCloseTo(0.5)
    expect(axis.update(300)).toBe(1)
    held.clear()
    expect(axis.update(150)).toBeCloseTo(0.5)
    expect(axis.source).toBe('keys')
  })

  it('scales device tilt by Sensitivity and ignores the dead zone', () => {
    const motion = { available: true, tiltX: 16.5 }
    const pointer = { isDown: true, x: 0, lastType: 'touch' }
    const axis = new TiltAxis({ motion, pointer, maxDegrees: 30 })
    expect(axis.update(16)).toBeCloseTo(0.5)
    settings.set({ sensitivity: 2 })
    expect(axis.update(16)).toBe(1)
    motion.tiltX = 1
    expect(axis.update(16)).toBe(0)
    expect(axis.source).toBe('motion')
  })

  it('steers by the mouse on a laptop that also has sensors', () => {
    const motion = { available: true, tiltX: 20 }
    const pointer = { isDown: false, x: 350, lastType: 'mouse' }
    const axis = new TiltAxis({ motion, pointer, pointerRange: 100 })
    axis.originX = 300
    expect(axis.update(16)).toBeCloseTo(0.5)
    expect(axis.source).toBe('pointer')
  })
})
