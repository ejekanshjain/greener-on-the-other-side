import Matter from 'matter-js'
import { describe, expect, it } from 'vitest'

import { createPhysics, pinToWorld, softBody, stepPhysics } from './physics'

function grid(cols = 3, rows = 3) {
  return softBody({
    x: 0,
    y: 0,
    cols,
    rows,
    spacing: 10,
    particleRadius: 4
  })
}

/** Outline points of one piece as [x, y] pairs. */
function pairs(points: Float64Array, count: number) {
  const out: [number, number][] = []
  for (let i = 0; i < count; i++) out.push([points[i * 2]!, points[i * 2 + 1]!])
  return out
}

/** Signed area of the outer ring of particle centres; negative means turned inside out. */
function ringArea(jelly: ReturnType<typeof softBody>) {
  const [piece] = jelly.outline(0)
  const pts = pairs(piece!.points, piece!.count)
  let area = 0
  pts.forEach(([x, y], i) => {
    const [nx, ny] = pts[(i + 1) % pts.length]!
    area += x * ny - nx * y
  })
  return area / 2
}

describe('softBody', () => {
  it('outlines an intact block clockwise around the grid edge', () => {
    const pieces = grid().outline(0)
    expect(pieces).toHaveLength(1)
    const piece = pieces[0]!
    expect(piece.particles).toBe(9)
    expect(pairs(piece.points, piece.count)).toEqual([
      [-10, -10],
      [0, -10],
      [10, -10],
      [10, 0],
      [10, 10],
      [0, 10],
      [-10, 10],
      [-10, 0]
    ])
  })

  it('pushes the outline outward by the particle radius', () => {
    const [piece] = grid().outline()
    // Top-middle point moves up; right-middle moves right; the corner moves diagonally out.
    expect(piece!.points[3]).toBeCloseTo(-14)
    expect(piece!.points[6]).toBeCloseTo(14)
    expect(piece!.points[0]).toBeCloseTo(-10 - 4 / Math.SQRT2)
  })

  it('splits into two outlines when a tear cuts the block in two', () => {
    const jelly = grid(4, 3)
    // Cut every spring crossing between column 1 and column 2.
    for (const c of [...jelly.constraints]) {
      const a = c.bodyA!.position.x
      const b = c.bodyB!.position.x
      if (Math.min(a, b) < 0 && Math.max(a, b) > 0) jelly.tear(c)
    }
    const pieces = jelly.outline(0)
    expect(pieces).toHaveLength(2)
    expect(pieces.map(p => p.particles)).toEqual([6, 6])
    expect(pieces[0]!.centerX).toBeCloseTo(-10)
    expect(pieces[1]!.centerX).toBeCloseTo(10)
  })

  it('draws a particle torn loose as a round drop', () => {
    const jelly = grid()
    const corner = jelly.particles[0]![0]!
    for (const c of [...jelly.constraints])
      if (c.bodyA === corner || c.bodyB === corner) jelly.tear(c)
    const pieces = jelly.outline()
    const drop = pieces.find(p => p.particles === 1)!
    expect(pieces).toHaveLength(2)
    for (const [x, y] of pairs(drop.points, drop.count))
      expect(Math.hypot(x + 10, y + 10)).toBeCloseTo(4)
  })

  it('tears springs near a point and reports integrity', () => {
    const jelly = grid()
    const total = jelly.constraints.length
    expect(total).toBe(20)
    expect(jelly.tearNear(-5, -10, 1)).toBe(1)
    expect(Matter.Composite.allConstraints(jelly.composite)).toHaveLength(
      total - 1
    )
    expect(jelly.integrity()).toBeCloseTo(19 / 20)
  })

  it('keeps its shape after a hard landing', () => {
    const engine = createPhysics()
    const floor = Matter.Bodies.rectangle(300, 630, 2000, 60, {
      isStatic: true
    })
    const jelly = softBody({
      x: 300,
      y: 0,
      cols: 6,
      rows: 5,
      spacing: 26,
      particleRadius: 11,
      stiffness: 0.04
    })
    Matter.Composite.add(engine.world, [floor, jelly.composite])
    const before = ringArea(jelly)
    for (let i = 0; i < 600; i++) stepPhysics(engine, 1000 / 60)
    expect(ringArea(jelly) / before).toBeGreaterThan(0.8)
  })

  it('hangs from two pins without falling away', () => {
    const engine = createPhysics()
    const jelly = softBody({
      x: 100,
      y: 100,
      cols: 4,
      rows: 3,
      spacing: 16,
      particleRadius: 6
    })
    const topRow = jelly.particles[0]!
    Matter.Composite.add(engine.world, [
      jelly.composite,
      pinToWorld(topRow[0]!, { x: 76, y: 84 }),
      pinToWorld(topRow[3]!, { x: 124, y: 84 })
    ])
    for (let i = 0; i < 180; i++) stepPhysics(engine, 1000 / 60)
    const center = jelly.center()
    expect(center.y).toBeGreaterThan(100)
    expect(center.y).toBeLessThan(160)
  })
})
