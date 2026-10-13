import type { Point } from '../canvas'
import { angleDiff, clamp } from '../math'

const TAU = Math.PI * 2
/** Longest gap between samples that counts as continuous movement. Longer pauses count as this long. */
const MAX_SAMPLE_GAP_MS = 250
/** How much uneven radius (as a coefficient of variation) lowers evenness. */
const RADIUS_PENALTY = 1.5
/** How much uneven speed (as a coefficient of variation) lowers evenness. */
const SPEED_PENALTY = 0.5
/** Speed is averaged over this window, so timestamp jitter between samples doesn't read as uneven stirring. */
const SPEED_WINDOW_MS = 80
const CENTER_SAMPLES = 256
/** Samples kept per circle for scoring. A circle drawn over 8 s at 120 Hz still fits. */
const CIRCLE_SAMPLES = 1024
/** Larger turns between two samples are ignored: they come from crossing the centre, not circling. */
const MAX_STEP_TURN = Math.PI / 2

/** Details of one completed circle. */
export interface CircleInfo {
  /** 1 for clockwise on screen, -1 for anticlockwise. */
  direction: 1 | -1
  /** Mean radius of the circle as drawn, around its own centre. */
  radius: number
  /** 0 to 1: how steady the radius and speed were during this circle. */
  evenness: number
}

export interface CircleGestureOptions {
  /** Fixed centre, such as a pot, crank axle or screw head. Omit to track the centre automatically. */
  center?: Point
  /** Samples closer to the centre than this are ignored, because angles jump near it. Defaults to 12. */
  minRadius?: number
  /** Auto-centre only: the centre is the middle of the points drawn in this window. Defaults to 1200 ms. */
  centerWindowMs?: number
  onCircle?: (circle: CircleInfo) => void
}

/**
 * Counts full circles drawn around a centre, for stirring, cranking and screwing.
 * Feed it the primary pointer while pressed, and call `end` when it lifts.
 *
 * Turns are counted around `center`. Evenness is scored around the circle actually
 * drawn, so stirring a little off the given centre isn't punished: each circle scores
 * 1 minus penalties for radius spread and for speed spread (speed averaged over 80 ms).
 *
 * @example
 * const stir = new CircleGesture({ center: { x: 300, y: 400 }, onCircle: c => stirs.push(c.evenness) })
 * pointer.onDrag((p, e) => stir.add(p.x, p.y, e.timeStamp))
 * pointer.onRelease(() => stir.end())
 */
export class CircleGesture {
  /** Completed circles in either direction. */
  circles = 0
  /** Direction of the latest circle, or of the current turn before the first circle. 0 when unknown. */
  direction: -1 | 0 | 1 = 0
  /** Mean radius of the latest circle, or of the current one before the first circle completes. */
  radius = 0
  /** Mean evenness over all completed circles, from 0 to 1. */
  evenness = 0
  /** Evenness of the latest circle. */
  lastEvenness = 0
  /** Signed turn of the current circle in radians, from -2 PI to 2 PI. */
  turn = 0
  readonly center: Point
  private readonly fixed: boolean
  private readonly minRadius: number
  private readonly windowMs: number
  private readonly onCircle: ((circle: CircleInfo) => void) | undefined
  private readonly xs = new Float64Array(CENTER_SAMPLES)
  private readonly ys = new Float64Array(CENTER_SAMPLES)
  private readonly ts = new Float64Array(CENTER_SAMPLES)
  private head = 0
  private size = 0
  private hasPrev = false
  private prevX = 0
  private prevY = 0
  private evenSum = 0
  private firstSamples = 0
  // Samples of the current circle. `runStart` marks samples that begin a new stroke.
  private readonly sx = new Float64Array(CIRCLE_SAMPLES)
  private readonly sy = new Float64Array(CIRCLE_SAMPLES)
  private readonly st = new Float64Array(CIRCLE_SAMPLES)
  private readonly runStart = new Uint8Array(CIRCLE_SAMPLES)
  private readonly cumLength = new Float64Array(CIRCLE_SAMPLES)
  private readonly cumTime = new Float64Array(CIRCLE_SAMPLES)
  private samples = 0
  private broken = true

  constructor({
    center,
    minRadius = 12,
    centerWindowMs = 1200,
    onCircle
  }: CircleGestureOptions = {}) {
    this.fixed = center !== undefined
    this.center = { x: center?.x ?? 0, y: center?.y ?? 0 }
    this.minRadius = minRadius
    this.windowMs = centerWindowMs
    this.onCircle = onCircle
  }

  /** How far through the current circle, from 0 to 1. */
  get progress(): number {
    return Math.abs(this.turn) / TAU
  }

  /**
   * Adds a sample. Pass the event's own `timeStamp`, not the time it was handled.
   * Returns how many circles it completed (almost always 0 or 1).
   */
  add(x: number, y: number, timeMs: number): number {
    if (!this.fixed) this.trackCenter(x, y, timeMs)
    const cx = this.center.x
    const cy = this.center.y
    const r = Math.hypot(x - cx, y - cy)
    if (r < this.minRadius) {
      // Angles jump near the centre, so a sample there breaks the stroke.
      this.hasPrev = false
      this.broken = true
      return 0
    }
    if (this.hasPrev) {
      const delta = angleDiff(
        Math.atan2(this.prevY - cy, this.prevX - cx),
        Math.atan2(y - cy, x - cx)
      )
      if (Math.abs(delta) <= MAX_STEP_TURN) this.turn += delta
      if (this.circles === 0 && this.turn !== 0)
        this.direction = this.turn > 0 ? 1 : -1
    }
    this.record(x, y, timeMs)
    if (this.circles === 0) {
      // Running mean distance to the centre, shown until the first circle completes.
      this.firstSamples++
      this.radius += (r - this.radius) / this.firstSamples
    }
    let completed = 0
    while (Math.abs(this.turn) >= TAU) {
      const direction = this.turn > 0 ? 1 : -1
      this.turn -= direction * TAU
      this.completeCircle(direction)
      // The completing sample also starts the next circle.
      this.record(x, y, timeMs)
      completed++
    }
    this.hasPrev = true
    this.prevX = x
    this.prevY = y
    return completed
  }

  /** Call when the pointer lifts. Keeps counts and the current partial circle. */
  end(): void {
    this.hasPrev = false
    this.broken = true
  }

  /** Clears everything, including counts. */
  reset(): void {
    this.circles = 0
    this.direction = 0
    this.radius = 0
    this.evenness = 0
    this.lastEvenness = 0
    this.turn = 0
    this.evenSum = 0
    this.hasPrev = false
    this.size = 0
    this.samples = 0
    this.firstSamples = 0
    this.broken = true
  }

  private record(x: number, y: number, timeMs: number): void {
    const i = this.samples
    if (i >= CIRCLE_SAMPLES) return
    this.sx[i] = x
    this.sy[i] = y
    this.st[i] = timeMs
    this.runStart[i] = this.broken ? 1 : 0
    this.broken = false
    this.samples = i + 1
  }

  private completeCircle(direction: 1 | -1): void {
    const n = this.samples
    const { sx, sy, st, runStart, cumLength, cumTime } = this
    // Score around the centre of the circle actually drawn.
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (let i = 0; i < n; i++) {
      const x = sx[i] as number
      const y = sy[i] as number
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2

    // Radius spread, weighted by path length so bunched-up samples don't dominate.
    let length = 0
    let time = 0
    let weight = 0
    let radiusSum = 0
    let radiusSq = 0
    for (let i = 0; i < n; i++) {
      if (runStart[i] === 0) {
        const segment = Math.hypot(
          (sx[i] as number) - (sx[i - 1] as number),
          (sy[i] as number) - (sy[i - 1] as number)
        )
        const r = Math.hypot((sx[i] as number) - cx, (sy[i] as number) - cy)
        length += segment
        time += clamp(
          (st[i] as number) - (st[i - 1] as number),
          0,
          MAX_SAMPLE_GAP_MS
        )
        weight += segment
        radiusSum += r * segment
        radiusSq += r * r * segment
      }
      cumLength[i] = length
      cumTime[i] = time
    }
    const meanR = weight > 0 ? radiusSum / weight : 0
    const cvR =
      meanR > 0
        ? Math.sqrt(Math.max(0, radiusSq / weight - meanR * meanR)) / meanR
        : 1

    // Speed spread, with speed averaged over a short window inside each stroke.
    let speedWeight = 0
    let speedSum = 0
    let speedSq = 0
    let from = 0
    for (let i = 0; i < n; i++) {
      if (runStart[i] === 1) {
        from = i
        continue
      }
      while (
        from + 1 < i &&
        (cumTime[i] as number) - (cumTime[from + 1] as number) >=
          SPEED_WINDOW_MS
      )
        from++
      const span = (cumTime[i] as number) - (cumTime[from] as number)
      if (span < SPEED_WINDOW_MS / 2) continue
      const speed =
        ((cumLength[i] as number) - (cumLength[from] as number)) / span
      const dt = (cumTime[i] as number) - (cumTime[i - 1] as number)
      speedWeight += dt
      speedSum += speed * dt
      speedSq += speed * speed * dt
    }
    const meanSpeed = speedWeight > 0 ? speedSum / speedWeight : 0
    const cvSpeed =
      meanSpeed > 0
        ? Math.sqrt(
            Math.max(0, speedSq / speedWeight - meanSpeed * meanSpeed)
          ) / meanSpeed
        : 0

    const evenness = clamp(
      1 - cvR * RADIUS_PENALTY - cvSpeed * SPEED_PENALTY,
      0,
      1
    )
    this.circles++
    this.direction = direction
    this.radius = meanR
    this.lastEvenness = evenness
    this.evenSum += evenness
    this.evenness = this.evenSum / this.circles
    this.samples = 0
    this.broken = true
    this.onCircle?.({ direction, radius: meanR, evenness })
  }

  private trackCenter(x: number, y: number, timeMs: number): void {
    this.xs[this.head] = x
    this.ys[this.head] = y
    this.ts[this.head] = timeMs
    this.head = (this.head + 1) % CENTER_SAMPLES
    if (this.size < CENTER_SAMPLES) this.size++
    let minX = x
    let maxX = x
    let minY = y
    let maxY = y
    const oldest = timeMs - this.windowMs
    for (let i = 1; i < this.size; i++) {
      const index = (this.head - 1 - i + CENTER_SAMPLES) % CENTER_SAMPLES
      if ((this.ts[index] as number) < oldest) break
      const sx = this.xs[index] as number
      const sy = this.ys[index] as number
      if (sx < minX) minX = sx
      if (sx > maxX) maxX = sx
      if (sy < minY) minY = sy
      if (sy > maxY) maxY = sy
    }
    // The box centre is a fair centre estimate once the window spans most of a circle.
    this.center.x = (minX + maxX) / 2
    this.center.y = (minY + maxY) / 2
  }
}

// ---------------------------------------------------------------- Rub

export interface RubGestureOptions {
  /** Shortest stroke that counts, in the same units as the points. Defaults to 40. */
  minAmplitude?: number
  /** How far the pointer must come back before a reversal registers. Defaults to a quarter of `minAmplitude`. */
  reverseDistance?: number
  onStroke?: (amplitude: number) => void
}

/**
 * Counts back-and-forth strokes in any direction, for mopping, scraping and wiping.
 * Each one-way stroke counts once, so "back and forth" is 2 strokes. A stroke still in
 * progress counts when the pointer lifts, so short separate swipes count too.
 *
 * @example
 * const mop = new RubGesture({ minAmplitude: 60 })
 * pointer.onPress(p => mop.add(p.x, p.y))
 * pointer.onDrag(p => mop.add(p.x, p.y))
 * pointer.onRelease(() => mop.end())
 */
export class RubGesture {
  strokes = 0
  /** Total distance rubbed while pressed. */
  distance = 0
  /** Length of the latest counted stroke. */
  lastAmplitude = 0
  private readonly minAmplitude: number
  private readonly reverseDistance: number
  private readonly onStroke: ((amplitude: number) => void) | undefined
  private active = false
  private anchorX = 0
  private anchorY = 0
  private farX = 0
  private farY = 0
  private farDist = 0
  private lastX = 0
  private lastY = 0

  constructor({
    minAmplitude = 40,
    reverseDistance,
    onStroke
  }: RubGestureOptions = {}) {
    this.minAmplitude = minAmplitude
    this.reverseDistance = reverseDistance ?? minAmplitude / 4
    this.onStroke = onStroke
  }

  /** Adds a sample. Returns 1 when it completed a stroke, otherwise 0. */
  add(x: number, y: number): number {
    if (!this.active) {
      this.active = true
      this.anchorX = this.farX = this.lastX = x
      this.anchorY = this.farY = this.lastY = y
      this.farDist = 0
      return 0
    }
    this.distance += Math.hypot(x - this.lastX, y - this.lastY)
    this.lastX = x
    this.lastY = y
    const fromAnchor = Math.hypot(x - this.anchorX, y - this.anchorY)
    if (fromAnchor > this.farDist) {
      this.farDist = fromAnchor
      this.farX = x
      this.farY = y
      return 0
    }
    if (this.farDist - fromAnchor < this.reverseDistance) return 0
    // The pointer turned back: the far point ends this stroke and starts the next.
    const amplitude = this.farDist
    this.anchorX = this.farX
    this.anchorY = this.farY
    this.farDist = Math.hypot(x - this.anchorX, y - this.anchorY)
    this.farX = x
    this.farY = y
    return this.count(amplitude)
  }

  /** Call when the pointer lifts. Counts the stroke in progress if it is long enough, and keeps the counts. Returns 1 when it counted one. */
  end(): number {
    if (!this.active) return 0
    this.active = false
    return this.count(this.farDist)
  }

  reset(): void {
    this.strokes = 0
    this.distance = 0
    this.lastAmplitude = 0
    this.active = false
  }

  private count(amplitude: number): number {
    if (amplitude < this.minAmplitude) return 0
    this.strokes++
    this.lastAmplitude = amplitude
    this.onStroke?.(amplitude)
    return 1
  }
}

// ---------------------------------------------------------------- Hold charge

export interface HoldChargeOptions {
  /** Time to charge from 0 to 1 while held. Defaults to 1000 ms. */
  fillMs?: number
  /** Swing 0 to 1 to 0 while held, like a golf power meter, instead of stopping at 1. */
  oscillate?: boolean
  /**
   * 0 (default): the level drops to 0 on release and each press starts fresh (hammer).
   * Above 0: the level falls from 1 to 0 over this many ms while released, and a press
   * continues from the current level (boiling heat).
   */
  drainMs?: number
}

/**
 * A press-and-hold power meter from 0 to 1. Call `update` every step.
 *
 * @example
 * const hammer = new HoldCharge({ fillMs: 900 })
 * pointer.onPress(() => hammer.start())
 * pointer.onRelease(() => hit(hammer.release()))
 * // in update: hammer.update(dt)
 */
export class HoldCharge {
  level = 0
  holding = false
  /** Time held in the current press. */
  heldMs = 0
  private readonly fillMs: number
  private readonly oscillate: boolean
  private readonly drainMs: number
  private phase = 0

  constructor({
    fillMs = 1000,
    oscillate = false,
    drainMs = 0
  }: HoldChargeOptions = {}) {
    this.fillMs = fillMs
    this.oscillate = oscillate
    this.drainMs = drainMs
  }

  start(): void {
    if (this.holding) return
    this.holding = true
    this.heldMs = 0
    if (this.drainMs === 0) this.level = 0
    this.phase = this.level
  }

  /** Ends the press and returns the level at release, or 0 when it wasn't holding. */
  release(): number {
    if (!this.holding) return 0
    const level = this.level
    this.holding = false
    if (this.drainMs === 0) this.level = 0
    return level
  }

  update(dtMs: number): void {
    if (this.holding) {
      this.heldMs += dtMs
      this.phase += dtMs / this.fillMs
      if (this.oscillate) {
        this.phase %= 2
        this.level = this.phase <= 1 ? this.phase : 2 - this.phase
      } else {
        this.phase = Math.min(this.phase, 1)
        this.level = this.phase
      }
    } else if (this.drainMs > 0 && this.level > 0) {
      this.level = Math.max(0, this.level - dtMs / this.drainMs)
    }
  }

  reset(): void {
    this.level = 0
    this.holding = false
    this.heldMs = 0
    this.phase = 0
  }
}
