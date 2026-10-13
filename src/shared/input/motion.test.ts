import { describe, expect, it } from 'vitest'

import { screenTilt } from './motion'

describe('screenTilt', () => {
  it('maps device angles onto screen axes for each rotation', () => {
    const out = { x: 0, y: 0 }
    expect(screenTilt(30, 10, 0, out)).toEqual({ x: 10, y: 30 })
    expect(screenTilt(30, 10, 90, out)).toEqual({ x: 30, y: -10 })
    expect(screenTilt(30, 10, 180, out)).toEqual({ x: -10, y: -30 })
    expect(screenTilt(30, 10, -90, out)).toEqual({ x: -30, y: 10 })
  })
})
