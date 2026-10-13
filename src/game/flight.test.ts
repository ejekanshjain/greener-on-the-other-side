import { describe, expect, it } from 'vitest'

import {
  arrivalFlight,
  crossingOf,
  flightPoint,
  planThrow,
  requiredSpeed,
  throwDistance
} from './flight'
import { HOLD_CLAMP } from './tuning'

const up = { dirX: 0, dirY: -1 }

describe('throw distance', () => {
  it('flies 0.4 units per px/s and caps at 2,500 px/s', () => {
    expect(throwDistance(1500)).toBeCloseTo(600)
    expect(throwDistance(4000)).toBeCloseTo(1000)
    expect(throwDistance(1500, 1)).toBeCloseTo(360)
    expect(throwDistance(1500, 0, 1, true)).toBeCloseTo(360)
  })

  it('needs about 1,530 from the back row, 650 mid-lawn and 400 at the front', () => {
    // A held item may move 100 units forward from where you grabbed it.
    expect(requiredSpeed(620 - HOLD_CLAMP)).toBeCloseTo(1529, 0)
    expect(requiredSpeed(320 - HOLD_CLAMP)).toBeCloseTo(647, 0)
    expect(requiredSpeed(180 - HOLD_CLAMP)).toBeLessThan(400)
  })
})

describe('planThrow', () => {
  it('lands short when the fence is out of reach', () => {
    const f = planThrow({ lx: 300, ly: 500, speedPx: 600, ...up }, 0)
    expect(f.outcome).toBe('land')
    expect(f.y1).toBeCloseTo(500 - 240)
  })

  it('clips when the throw carries less than 15% past the fence', () => {
    // D = 400; the fence is 360 away, so only 10% carries past it.
    const f = planThrow({ lx: 300, ly: 360, speedPx: 1000, ...up }, 0)
    expect(f.outcome).toBe('clip')
    expect(f.endTau).toBeCloseTo(0.9)
  })

  it('crosses with the margin and hands over the rest of the arc', () => {
    const f = planThrow(
      { lx: 200, ly: 200, speedPx: 1000, dirX: 0.2, dirY: -1 },
      0
    )
    expect(f.outcome).toBe('cross')
    const c = crossingOf(f, 'weed', 0, -1)
    expect(c.tau).toBeCloseTo(f.endTau)
    expect(c.d).toBeGreaterThan(0)
    expect(c.x).toBeGreaterThan(200)
    expect(c.dx).toBeGreaterThan(0)
  })

  it('goes wide when the path leaves past a hedge before the fence', () => {
    const f = planThrow(
      { lx: 560, ly: 400, speedPx: 2000, dirX: 0.8, dirY: -0.6 },
      0
    )
    expect(f.outcome).toBe('wide')
  })
})

describe('arrivalFlight', () => {
  it('mirrors the crossing and lands the remaining depth past the fence', () => {
    const f = planThrow(
      { lx: 150, ly: 200, speedPx: 1200, dirX: 0.1, dirY: -1 },
      0
    )
    const c = crossingOf(f, 'gnome', 0, -1)
    const arrival = arrivalFlight(c, 1000)
    const p = flightPoint(arrival, c.tau, { x: 0, y: 0, h: 0 })
    expect(p.x).toBeCloseTo(600 - c.x)
    expect(p.y).toBeCloseTo(0)
    expect(arrival.x1).toBeCloseTo(600 - c.x - c.dx)
    expect(arrival.y1).toBeCloseTo(c.d)
    expect(arrival.t0 + c.tau * arrival.T).toBeCloseTo(1000)
    expect(arrival.outcome).toBe('land')
  })

  it('stops a long arrival at the back of the lawn', () => {
    const arrival = arrivalFlight(
      { x: 300, d: 900, dx: 0, tau: 0.3, T: 1300, H: 400 },
      0
    )
    expect(arrival.outcome).toBe('wide')
    expect(
      flightPoint(arrival, arrival.endTau, { x: 0, y: 0, h: 0 }).y
    ).toBeCloseTo(640)
  })
})
