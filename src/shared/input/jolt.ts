import { damp } from '../math'
import { ASSIST_JOLT_SCALE, settings } from '../settings'

export interface JoltMeterOptions {
  /** Level at which `over` turns true. Defaults to 1. */
  limit?: number
  /** Device jolt in m/s² that reads as level 1. Defaults to 4. */
  motionRef?: number
  /** Pointer acceleration in logical units/s² that reads as level 1. Defaults to 6000. */
  pointerRef?: number
  /** Rate per second at which the level rises towards a bigger jolt. Defaults to 25. */
  rise?: number
  /** Rate per second at which the level falls back. Defaults to 3. */
  fall?: number
  /** Multiplies every reading in Assist Mode. Defaults to `ASSIST_JOLT_SCALE` (0.6). */
  assistScale?: number
}

/**
 * A steadiness meter that reads either device motion or pointer movement. The level is
 * scaled by the sensitivity and Assist Mode settings. Feed it once per update step.
 *
 * @example
 * const steady = new JoltMeter({ limit: 1 })
 * // in update:
 * if (prefersMotion(motion, pointer)) steady.feedMotion(motion.jolt, dt)
 * else if (pointer.isDown) steady.feedPointer(pointer.vx, pointer.vy, dt)
 * else steady.feed(0, dt)
 * if (steady.over) drainSieve()
 */
export class JoltMeter {
  /** Smoothed level. 1 is the default limit; it can go above. */
  level = 0
  limit: number
  private readonly motionRef: number
  private readonly pointerRef: number
  private readonly rise: number
  private readonly fall: number
  private readonly assistScale: number
  private lastVx = 0
  private lastVy = 0
  private hasVelocity = false

  constructor({
    limit = 1,
    motionRef = 4,
    pointerRef = 6000,
    rise = 25,
    fall = 3,
    assistScale = ASSIST_JOLT_SCALE
  }: JoltMeterOptions = {}) {
    this.limit = limit
    this.motionRef = motionRef
    this.pointerRef = pointerRef
    this.rise = rise
    this.fall = fall
    this.assistScale = assistScale
  }

  /** True when the level has reached the limit. */
  get over(): boolean {
    return this.level >= this.limit
  }

  /** Level as a fraction of the limit, for meters. */
  get fraction(): number {
    return this.level / this.limit
  }

  /** Feeds a device jolt in m/s², such as `motion.jolt`. */
  feedMotion(jolt: number, dtMs: number): void {
    this.hasVelocity = false
    this.push(jolt / this.motionRef, dtMs)
  }

  /**
   * Feeds pointer velocity in logical units/s, such as `pointer.vx` and `pointer.vy`.
   * The meter reads the change in velocity (acceleration), so smooth movement stays calm.
   * The first reading after any other kind of feed only sets the baseline.
   */
  feedPointer(vx: number, vy: number, dtMs: number): void {
    if (!this.hasVelocity || dtMs <= 0) {
      this.lastVx = vx
      this.lastVy = vy
      this.hasVelocity = true
      this.push(0, dtMs)
      return
    }
    const acceleration =
      Math.hypot(vx - this.lastVx, vy - this.lastVy) / (dtMs / 1000)
    this.lastVx = vx
    this.lastVy = vy
    this.push(acceleration / this.pointerRef, dtMs)
  }

  /**
   * Feeds a raw reading where 1 means "at the default limit". Sensitivity and Assist Mode
   * apply. Feed 0 while idle, which also makes the next press start from a clean baseline.
   */
  feed(raw: number, dtMs: number): void {
    this.hasVelocity = false
    this.push(raw, dtMs)
  }

  /** Forgets the last pointer velocity. Only needed if you skip feeding between presses. */
  resetPointer(): void {
    this.hasVelocity = false
  }

  reset(): void {
    this.level = 0
    this.hasVelocity = false
  }

  private push(raw: number, dtMs: number): void {
    const { sensitivity, assist } = settings.get()
    const target = raw * sensitivity * (assist ? this.assistScale : 1)
    const rate = target > this.level ? this.rise : this.fall
    this.level = damp(this.level, target, rate, dtMs / 1000)
  }
}
