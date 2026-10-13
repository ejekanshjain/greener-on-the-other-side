import Matter from 'matter-js'

import type { Point } from './canvas'

const { Bodies, Body, Composite, Constraint, Engine } = Matter

/** Matter.js recommends steps no longer than one 60 Hz frame. */
const MAX_STEP_MS = 1000 / 60

export interface PhysicsOptions {
  /** Downward gravity scale. 1 is Matter's default. */
  gravity?: number
  /** Higher values make stacks and soft bodies steadier and cost more. Defaults to 8. */
  positionIterations?: number
  /** Defaults to 6. */
  velocityIterations?: number
  /** Higher values make springs stiffer. Defaults to 4. */
  constraintIterations?: number
  /** Lets resting bodies sleep to save work. Defaults to false. */
  enableSleeping?: boolean
}

/**
 * Creates a Matter.js engine with defaults tuned for soft bodies.
 *
 * @example const engine = createPhysics(); Composite.add(engine.world, ground)
 */
export function createPhysics({
  gravity = 1,
  positionIterations = 8,
  velocityIterations = 6,
  constraintIterations = 4,
  enableSleeping = false
}: PhysicsOptions = {}): Matter.Engine {
  const engine = Engine.create({
    positionIterations,
    velocityIterations,
    constraintIterations,
    enableSleeping
  })
  engine.gravity.y = gravity
  return engine
}

/**
 * Advances physics by `dtMs`, split into steps of at most 1/60 s. Time beyond `maxSteps`
 * steps is dropped, so a slow frame can't explode the simulation.
 */
export function stepPhysics(
  engine: Matter.Engine,
  dtMs: number,
  maxSteps = 4
): void {
  let remaining = Math.min(dtMs, MAX_STEP_MS * maxSteps)
  while (remaining > 0.01) {
    const step = Math.min(remaining, MAX_STEP_MS)
    Engine.update(engine, step)
    remaining -= step
  }
}

export interface SoftBodyOptions {
  /** Centre of the block. */
  x: number
  y: number
  /** Particles across and down. Both at least 2. */
  cols: number
  rows: number
  /** Distance between neighbouring particle centres. */
  spacing: number
  particleRadius: number
  /**
   * Spring stiffness from 0 to 1. A 6 x 5 block hanging from its top corners stretches
   * about 24% at 0.02, 13% at 0.04, 5% at 0.1 and 2% at 0.3. Defaults to 0.1.
   */
  stiffness?: number
  /** Spring damping. Defaults to 0.05. */
  damping?: number
  /**
   * Defaults to a fresh group of the body's own. Its particles collide with each other
   * when `2 * particleRadius < spacing`, so a hard landing can't fold the grid through
   * itself; otherwise they overlap at rest and skip each other.
   */
  collisionFilter?: Matter.ICollisionFilter
  label?: string
  /** Extra Matter body options for every particle, such as `friction` or `density`. */
  particle?: Matter.IBodyDefinition
}

/** One connected piece of a soft body, as `SoftBody.outline` reports it. */
export interface SoftBodyPiece {
  /** Outline as flat points, clockwise on screen, pushed out to wrap the particles. Pass it to `sketchBlob`. */
  points: Float64Array
  /** Number of points in `points`. */
  count: number
  /** Number of particles in the piece. 1 is a loose drop. */
  particles: number
  /** Average particle position. */
  centerX: number
  centerY: number
}

/** A grid of circles joined by springs. Draw it with `outline`. */
export interface SoftBody {
  composite: Matter.Composite
  /** Particles by `[row][col]`. */
  particles: Matter.Body[][]
  bodies: Matter.Body[]
  /** Springs still attached. Torn springs are removed from this list. Tear springs with `tear` or `tearNear`, not by editing it. */
  constraints: Matter.Constraint[]
  /**
   * Writes the outline of every connected piece and returns the pieces. After tears, each
   * piece the springs still hold together is its own outline, and loose particles are
   * small round drops. Points are pushed outward by `inflate` (defaults to the particle
   * radius). Pieces and their buffers are reused, and only rebuilt after springs tear.
   */
  outline(inflate?: number): readonly SoftBodyPiece[]
  /** Average particle position. */
  center(out?: Point): Point
  setStiffness(stiffness: number): void
  /** Removes one spring. Returns false if it was already gone. */
  tear(constraint: Matter.Constraint): boolean
  /** Removes springs whose midpoint is within `radius` of (x, y). Returns how many tore. */
  tearNear(x: number, y: number, radius: number): number
  /** Fraction of the original springs still attached, from 0 to 1. */
  integrity(): number
}

/** Grid steps in clockwise order on screen (y down): E, SE, S, SW, W, NW, N, NE. */
const STEP_ROW = [0, 1, 1, 1, 0, -1, -1, -1]
const STEP_COL = [1, 1, 0, -1, -1, -1, 0, 1]
const WEST = 4
/** Points around each end of a drop's outline. */
const DROP_STEPS = 4

/** Internal piece data: which particles it has and which ones form its edge. */
interface PieceShape extends SoftBodyPiece {
  members: Int32Array
  /** Edge particles in clockwise order. Fewer than 3 means the piece draws as a drop. */
  ring: Int32Array
}

/**
 * Builds a soft body: circles joined by structural and shear springs. Add `composite`
 * to the world yourself. Keep it small on phones: 4x4 to 6x6 particles per block, and
 * about 300 particles in motion at once.
 *
 * @example
 * const jelly = softBody({ x: 300, y: 200, cols: 5, rows: 4, spacing: 18, particleRadius: 8 })
 * Composite.add(engine.world, jelly.composite)
 * // in render:
 * for (const piece of jelly.outline()) sketchBlob(ctx, piece.points, JELLY, piece.count)
 */
export function softBody({
  x,
  y,
  cols,
  rows,
  spacing,
  particleRadius,
  stiffness = 0.1,
  damping = 0.05,
  collisionFilter,
  label = 'soft-body',
  particle
}: SoftBodyOptions): SoftBody {
  if (cols < 2 || rows < 2)
    throw new Error(
      'softBody: cols and rows must both be 2 or more to form an outline'
    )
  // A positive group always collides with itself; a negative one never does.
  const selfCollide = particleRadius * 2 < spacing
  const filter = { group: Body.nextGroup(!selfCollide), ...collisionFilter }
  const left = x - ((cols - 1) * spacing) / 2
  const top = y - ((rows - 1) * spacing) / 2
  const composite = Composite.create({ label })
  const particles: Matter.Body[][] = []
  const bodies: Matter.Body[] = []
  for (let row = 0; row < rows; row++) {
    const line: Matter.Body[] = []
    for (let col = 0; col < cols; col++) {
      const body = Bodies.circle(
        left + col * spacing,
        top + row * spacing,
        particleRadius,
        {
          friction: 0.4,
          frictionAir: 0.02,
          restitution: 0,
          ...particle,
          collisionFilter: filter,
          label
        }
      )
      line.push(body)
      bodies.push(body)
    }
    particles.push(line)
  }

  const constraints: Matter.Constraint[] = []
  const link = (a: Matter.Body | undefined, b: Matter.Body | undefined) => {
    if (!a || !b) return
    constraints.push(
      Constraint.create({ bodyA: a, bodyB: b, stiffness, damping, label })
    )
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const here = particles[row]?.[col]
      link(here, particles[row]?.[col + 1])
      link(here, particles[row + 1]?.[col])
      // Shear springs on both diagonals stop each cell from collapsing sideways.
      link(here, particles[row + 1]?.[col + 1])
      link(particles[row]?.[col + 1], particles[row + 1]?.[col])
    }
  }
  Composite.add(composite, bodies)
  Composite.add(composite, constraints)
  const originalCount = constraints.length
  // Grid index of each particle, by body id, for grouping after tears.
  const indexOf = new Map<number, number>()
  bodies.forEach((body, i) => indexOf.set(body.id, i))

  let pieces: PieceShape[] = []
  let builtFor = -1

  const tear = (constraint: Matter.Constraint) => {
    const index = constraints.indexOf(constraint)
    if (index < 0) return false
    constraints.splice(index, 1)
    Composite.remove(composite, constraint)
    return true
  }

  return {
    composite,
    particles,
    bodies,
    constraints,
    outline(inflate = particleRadius) {
      // Springs only ever tear, so the count changes exactly when the pieces might.
      if (builtFor !== constraints.length) {
        pieces = buildPieces(rows, cols, constraints, indexOf)
        builtFor = constraints.length
      }
      for (const piece of pieces) writePiece(piece, bodies, inflate)
      return pieces
    },
    center(out = { x: 0, y: 0 }) {
      let sx = 0
      let sy = 0
      for (const body of bodies) {
        sx += body.position.x
        sy += body.position.y
      }
      out.x = sx / bodies.length
      out.y = sy / bodies.length
      return out
    },
    setStiffness(k) {
      for (const constraint of constraints) constraint.stiffness = k
    },
    tear,
    tearNear(px, py, radius) {
      const torn = constraints.filter(c => {
        const a = c.bodyA?.position
        const b = c.bodyB?.position
        if (!a || !b) return false
        return Math.hypot((a.x + b.x) / 2 - px, (a.y + b.y) / 2 - py) <= radius
      })
      for (const constraint of torn) tear(constraint)
      return torn.length
    },
    integrity: () => constraints.length / originalCount
  }
}

/** Groups particles by the springs still attached, then traces each group's edge on the grid. */
function buildPieces(
  rows: number,
  cols: number,
  constraints: readonly Matter.Constraint[],
  indexOf: ReadonlyMap<number, number>
): PieceShape[] {
  const n = rows * cols
  const parent = new Int32Array(n)
  for (let i = 0; i < n; i++) parent[i] = i
  const find = (i: number): number => {
    while (parent[i] !== i) {
      const up = parent[i] as number
      parent[i] = parent[up] as number
      i = up
    }
    return i
  }
  for (const constraint of constraints) {
    const a = constraint.bodyA ? indexOf.get(constraint.bodyA.id) : undefined
    const b = constraint.bodyB ? indexOf.get(constraint.bodyB.id) : undefined
    if (a === undefined || b === undefined) continue
    parent[find(a)] = find(b)
  }

  const piece = new Int32Array(n).fill(-1)
  const members: number[][] = []
  for (let i = 0; i < n; i++) {
    const root = find(i)
    let id = piece[root] as number
    if (id < 0) {
      // Roots are labelled in raster order of their first particle, so each piece's first member is its top-left.
      id = members.length
      members.push([])
    }
    piece[root] = id
    piece[i] = id
    members[id]!.push(i)
  }

  return members.map((list, id) => {
    const ring = traceRing(list[0] as number, id, piece, rows, cols)
    const count = ring.length >= 3 ? ring.length : DROP_STEPS * 2
    return {
      members: Int32Array.from(list),
      ring: Int32Array.from(ring),
      points: new Float64Array(count * 2),
      count,
      particles: list.length,
      centerX: 0,
      centerY: 0
    }
  })
}

/**
 * Walks the edge of one piece clockwise on the grid, starting from its top-left particle.
 * At each particle it turns to the first neighbour in the piece, scanning clockwise from
 * the particle it came from, and stops when the first step repeats.
 */
function traceRing(
  start: number,
  id: number,
  piece: Int32Array,
  rows: number,
  cols: number
): number[] {
  const ring = [start]
  const next = (from: number, back: number): [number, number] | null => {
    const row = Math.floor(from / cols)
    const col = from % cols
    for (let i = 1; i <= 8; i++) {
      const dir = (back + i) % 8
      const r = row + (STEP_ROW[dir] as number)
      const c = col + (STEP_COL[dir] as number)
      if (
        r >= 0 &&
        r < rows &&
        c >= 0 &&
        c < cols &&
        piece[r * cols + c] === id
      )
        return [r * cols + c, dir]
    }
    return null
  }
  // Nothing in the piece lies west of or above its top-left particle.
  const first = next(start, WEST)
  if (!first) return ring
  let [current, dir] = first
  for (let guard = 4 * rows * cols; guard > 0; guard--) {
    const step = next(current, (dir + 4) % 8)
    if (!step) break
    if (current === start && step[0] === first[0] && step[1] === first[1]) break
    ring.push(current)
    ;[current, dir] = step
  }
  return ring
}

/** Writes a piece's centre and outline points from the current particle positions. */
function writePiece(
  piece: PieceShape,
  bodies: readonly Matter.Body[],
  inflate: number
): void {
  let sx = 0
  let sy = 0
  for (let i = 0; i < piece.members.length; i++) {
    const p = bodies[piece.members[i] as number]!.position
    sx += p.x
    sy += p.y
  }
  piece.centerX = sx / piece.members.length
  piece.centerY = sy / piece.members.length

  const ring = piece.ring
  const k = ring.length
  const out = piece.points
  if (k < 3) {
    writeDrop(
      bodies[ring[0] as number]!.position,
      bodies[ring[k - 1] as number]!.position,
      inflate,
      out
    )
    return
  }
  for (let i = 0; i < k; i++) {
    const prev = bodies[ring[(i - 1 + k) % k] as number]!.position
    const here = bodies[ring[i] as number]!.position
    const next = bodies[ring[(i + 1) % k] as number]!.position
    // Average the outward normals of the two edges at this point. Each normal is unit
    // length, so a squashed corner can never push the outline further than `inflate`.
    let nx = 0
    let ny = 0
    const ax = here.x - prev.x
    const ay = here.y - prev.y
    const aLen = Math.hypot(ax, ay)
    if (aLen > 1e-6) {
      nx += ay / aLen
      ny -= ax / aLen
    }
    const bx = next.x - here.x
    const by = next.y - here.y
    const bLen = Math.hypot(bx, by)
    if (bLen > 1e-6) {
      nx += by / bLen
      ny -= bx / bLen
    }
    let len = Math.hypot(nx, ny)
    if (len < 1e-3) {
      // The edge doubles back (a one-particle spike): push straight out of the tip.
      nx = here.x - (prev.x + next.x) / 2
      ny = here.y - (prev.y + next.y) / 2
      len = Math.hypot(nx, ny) || 1
    }
    out[i * 2] = here.x + (nx / len) * inflate
    out[i * 2 + 1] = here.y + (ny / len) * inflate
  }
}

/** Writes a capsule around one or two particles, clockwise, for drops. */
function writeDrop(
  a: Matter.Vector,
  b: Matter.Vector,
  radius: number,
  out: Float64Array
): void {
  const base = a.x === b.x && a.y === b.y ? 0 : Math.atan2(b.y - a.y, b.x - a.x)
  const quarter = Math.PI / DROP_STEPS
  let o = 0
  // Half circle around `a` on the side away from `b`, then around `b` on the far side.
  for (let j = 0; j < DROP_STEPS; j++) {
    const angle = base + Math.PI / 2 + j * quarter
    out[o++] = a.x + Math.cos(angle) * radius
    out[o++] = a.y + Math.sin(angle) * radius
  }
  for (let j = 0; j < DROP_STEPS; j++) {
    const angle = base - Math.PI / 2 + j * quarter
    out[o++] = b.x + Math.cos(angle) * radius
    out[o++] = b.y + Math.sin(angle) * radius
  }
}

/**
 * Pins `body` to a fixed world point, like a nail. `length` 0 pulls the body's centre onto
 * the point. Add the returned constraint to the world (or the soft body's composite) yourself.
 *
 * @example Composite.add(engine.world, pinToWorld(jelly.particles[0][0], { x: 120, y: 80 }))
 */
export function pinToWorld(
  body: Matter.Body,
  point: Point,
  stiffness = 0.9,
  length = 0
): Matter.Constraint {
  return Constraint.create({
    bodyA: body,
    pointB: { x: point.x, y: point.y },
    stiffness,
    length,
    damping: 0.1,
    label: 'pin'
  })
}

/** Draws every body outline and constraint in plain lines, for `?debug`. Allocates; debug only. */
export function drawPhysicsDebug(
  ctx: CanvasRenderingContext2D,
  engine: Matter.Engine
): void {
  ctx.save()
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(0, 160, 80, 0.9)'
  ctx.beginPath()
  for (const body of Composite.allBodies(engine.world)) {
    // Compound bodies list themselves first in parts; draw only the real parts.
    const parts = body.parts.length > 1 ? body.parts.slice(1) : body.parts
    for (const part of parts) {
      const vertices = part.vertices
      const first = vertices[0]
      if (!first) continue
      ctx.moveTo(first.x, first.y)
      for (let i = 1; i < vertices.length; i++)
        ctx.lineTo(vertices[i]!.x, vertices[i]!.y)
      ctx.closePath()
    }
  }
  ctx.stroke()
  ctx.strokeStyle = 'rgba(230, 110, 0, 0.8)'
  ctx.beginPath()
  for (const constraint of Composite.allConstraints(engine.world)) {
    const a = Constraint.pointAWorld(constraint)
    const b = Constraint.pointBWorld(constraint)
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
  }
  ctx.stroke()
  ctx.restore()
}
