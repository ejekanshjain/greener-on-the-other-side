import { describe, expect, it } from 'vitest'

import { CircleGesture, HoldCharge, RubGesture } from './gestures'

/** Feeds `turns` circles of radius `r` around (cx, cy); `wobble` varies radius and speed. */
function drawCircles(
  gesture: CircleGesture,
  {
    cx = 0,
    cy = 0,
    r = 100,
    turns = 1,
    direction = 1,
    wobble = 0,
    samplesPerTurn = 60
  } = {}
) {
  let angle = 0
  let time = 0
  for (let i = 0; i <= turns * samplesPerTurn; i++) {
    const radius = r * (1 + wobble * Math.sin(i * 0.7))
    gesture.add(
      cx + radius * Math.cos(angle),
      cy + radius * Math.sin(angle),
      time
    )
    angle +=
      direction *
      ((Math.PI * 2) / samplesPerTurn) *
      (1 + wobble * Math.sin(i * 1.3))
    time += 16
  }
}

describe('CircleGesture', () => {
  it('counts steady clockwise circles around a fixed centre as even', () => {
    const stir = new CircleGesture({ center: { x: 0, y: 0 } })
    drawCircles(stir, { turns: 3 })
    expect(stir.circles).toBe(3)
    expect(stir.direction).toBe(1)
    expect(stir.radius).toBeCloseTo(100)
    expect(stir.evenness).toBeGreaterThan(0.95)
  })

  it('scores wobbly circles lower and reports anticlockwise direction', () => {
    const stir = new CircleGesture({ center: { x: 0, y: 0 } })
    drawCircles(stir, { turns: 2.2, direction: -1, wobble: 0.3 })
    expect(stir.circles).toBe(2)
    expect(stir.direction).toBe(-1)
    expect(stir.evenness).toBeLessThan(0.7)
  })

  it('scores steady circles drawn off the given centre as even', () => {
    const stir = new CircleGesture({ center: { x: 0, y: 0 } })
    drawCircles(stir, { cx: 30, r: 80, turns: 3 })
    expect(stir.circles).toBe(3)
    expect(stir.radius).toBeCloseTo(80, 0)
    expect(stir.evenness).toBeGreaterThan(0.95)
  })

  it('tolerates timestamp jitter between samples', () => {
    const stir = new CircleGesture({ center: { x: 0, y: 0 } })
    let angle = 0
    for (let i = 0; i <= 180; i++) {
      // Alternate 6 ms early and late, like a busy main thread delivering events.
      stir.add(
        100 * Math.cos(angle),
        100 * Math.sin(angle),
        i * 16 + (i % 2 === 0 ? 6 : -6)
      )
      angle += (Math.PI * 2) / 60
    }
    expect(stir.circles).toBe(3)
    expect(stir.evenness).toBeGreaterThan(0.95)
  })

  it('finds the centre automatically', () => {
    const crank = new CircleGesture()
    drawCircles(crank, { cx: 300, cy: 200, r: 80, turns: 3.5 })
    expect(crank.circles).toBeGreaterThanOrEqual(3)
    expect(crank.center.x).toBeCloseTo(300, 0)
    expect(crank.center.y).toBeCloseTo(200, 0)
  })

  it('does not count rubbing straight through the centre', () => {
    const stir = new CircleGesture({ center: { x: 0, y: 0 } })
    for (let i = 0; i < 40; i++) stir.add(i % 2 === 0 ? -50 : 50, 0, i * 16)
    expect(stir.circles).toBe(0)
  })
})

describe('RubGesture', () => {
  it('counts strokes longer than the minimum amplitude', () => {
    const mop = new RubGesture({ minAmplitude: 60 })
    const xs = [0, 40, 80, 100, 60, 20, 0, 50, 100]
    for (const x of xs) mop.add(x, 10)
    expect(mop.strokes).toBe(2)
    expect(mop.lastAmplitude).toBe(100)
    expect(mop.distance).toBe(300)
  })

  it('counts the stroke in progress when the pointer lifts', () => {
    const mop = new RubGesture({ minAmplitude: 60 })
    for (const x of [0, 50, 100, 50, 0]) mop.add(x, 0)
    expect(mop.end()).toBe(1)
    expect(mop.strokes).toBe(2)
    for (let swipe = 0; swipe < 3; swipe++) {
      for (const x of [0, 50, 100]) mop.add(x, 0)
      mop.end()
    }
    expect(mop.strokes).toBe(5)
  })

  it('ignores small wiggles', () => {
    const mop = new RubGesture({ minAmplitude: 60 })
    for (let i = 0; i < 30; i++) mop.add(i % 2 === 0 ? 0 : 20, 0)
    mop.end()
    expect(mop.strokes).toBe(0)
  })
})

describe('HoldCharge', () => {
  it('charges while held and resets on release by default', () => {
    const hammer = new HoldCharge({ fillMs: 1000 })
    hammer.start()
    hammer.update(400)
    expect(hammer.level).toBeCloseTo(0.4)
    hammer.update(2000)
    expect(hammer.release()).toBe(1)
    expect(hammer.level).toBe(0)
  })

  it('swings back down when oscillating', () => {
    const meter = new HoldCharge({ fillMs: 1000, oscillate: true })
    meter.start()
    meter.update(1250)
    expect(meter.level).toBeCloseTo(0.75)
    meter.update(1000)
    expect(meter.level).toBeCloseTo(0.25)
  })

  it('drains gradually and resumes from the current level', () => {
    const heat = new HoldCharge({ fillMs: 1000, drainMs: 2000 })
    heat.start()
    heat.update(800)
    heat.release()
    heat.update(1000)
    expect(heat.level).toBeCloseTo(0.3)
    heat.start()
    heat.update(100)
    expect(heat.level).toBeCloseTo(0.4)
  })
})
