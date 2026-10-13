import { clamp } from '../math'
import { settings } from '../settings'
import type { Keyboard } from './keyboard'
import type { Motion } from './motion'
import { isTouchDevice, type PointerTracker } from './pointer'

/** The parts of a `PointerTracker` the controls read, so tests can pass plain objects. */
export type PointerInput = Pick<PointerTracker, 'isDown' | 'x' | 'lastType'>
/** The parts of a `Keyboard` the controls read. */
export type KeyInput = Pick<Keyboard, 'anyDown'>
/** The parts of a `Motion` the controls read. */
export type MotionInput = Pick<Motion, 'available' | 'tiltX'>

/**
 * True when device sensors should drive tilt and steadiness: sensors are sending data
 * and the player is using a finger. Mouse or pen input switches to pointer and keys, so
 * a laptop or 2-in-1 with sensors still plays with the mouse. Before any pointer input,
 * it follows `isTouchDevice()`.
 *
 * @example
 * if (prefersMotion(motion, pointer)) steady.feedMotion(motion.jolt, dt)
 */
export function prefersMotion(
  motion: Pick<Motion, 'available'> | null | undefined,
  pointer?: Pick<PointerTracker, 'lastType'> | null
): boolean {
  if (!motion?.available) return false
  const type = pointer?.lastType ?? ''
  return type === '' ? isTouchDevice() : type === 'touch'
}

/**
 * True while the player holds the action: the primary pointer is pressed, or any of
 * `codes` is held. Use it for "hold a thumb down or W to walk".
 *
 * @example const walking = isHeld(pointer, keys, ['KeyW', 'ArrowUp'])
 */
export function isHeld(
  pointer: Pick<PointerTracker, 'isDown'> | null | undefined,
  keys: KeyInput | null | undefined,
  codes: readonly string[]
): boolean {
  return (pointer?.isDown ?? false) || (keys?.anyDown(codes) ?? false)
}

/** Which input set `TiltAxis.value` in the latest update. */
export type TiltSource = 'motion' | 'keys' | 'pointer' | 'none'

export interface TiltAxisOptions {
  motion?: MotionInput | null
  keys?: KeyInput | null
  /** Pass with `pointerRange` to steer by the pointer's horizontal offset from `originX`. */
  pointer?: PointerInput | null
  /** Defaults to A and the left arrow. */
  negativeKeys?: readonly string[]
  /** Defaults to D and the right arrow. */
  positiveKeys?: readonly string[]
  /** Device tilt in degrees that reads as full tilt. Defaults to 30. */
  maxDegrees?: number
  /** Device tilt below this many degrees reads as 0, so a resting hand doesn't drift. Defaults to 1.5. */
  deadZoneDegrees?: number
  /** Time for held keys to ramp from 0 to full tilt, and back after release. Defaults to 300 ms. */
  rampMs?: number
  /** Pointer offset from `originX`, in logical units, that reads as full tilt. Omit to ignore the pointer. */
  pointerRange?: number
}

const DEFAULT_NEGATIVE = ['KeyA', 'ArrowLeft']
const DEFAULT_POSITIVE = ['KeyD', 'ArrowRight']

/**
 * One left-right control from whichever input the player is using, from -1 to 1:
 * held keys (ramped), calibrated device tilt when `prefersMotion` is true, or the
 * pointer's horizontal offset from `originX`. Held keys win over the others. Sensitivity
 * scales tilt and pointer readings; keys always ramp to exactly 1.
 *
 * @example
 * const level = new TiltAxis({ motion, keys, pointer, pointerRange: 150 })
 * // in update:
 * level.originX = tray.x
 * tray.angle += level.update(dt) * 0.04
 */
export class TiltAxis {
  /** Latest reading, from -1 (left) to 1 (right). */
  value = 0
  source: TiltSource = 'none'
  /** Reference x for pointer steering, in logical units. Move it with the thing being steered. */
  originX = 0
  private keyLevel = 0
  private readonly motion: MotionInput | null
  private readonly keys: KeyInput | null
  private readonly pointer: PointerInput | null
  private readonly negativeKeys: readonly string[]
  private readonly positiveKeys: readonly string[]
  private readonly maxDegrees: number
  private readonly deadZoneDegrees: number
  private readonly rampMs: number
  private readonly pointerRange: number

  constructor({
    motion = null,
    keys = null,
    pointer = null,
    negativeKeys = DEFAULT_NEGATIVE,
    positiveKeys = DEFAULT_POSITIVE,
    maxDegrees = 30,
    deadZoneDegrees = 1.5,
    rampMs = 300,
    pointerRange = 0
  }: TiltAxisOptions = {}) {
    this.motion = motion
    this.keys = keys
    this.pointer = pointer
    this.negativeKeys = negativeKeys
    this.positiveKeys = positiveKeys
    this.maxDegrees = maxDegrees
    this.deadZoneDegrees = deadZoneDegrees
    this.rampMs = rampMs
    this.pointerRange = pointerRange
  }

  /** Reads the inputs once per update step. Returns the new `value`. */
  update(dtMs: number): number {
    const keys = this.keys
    const direction = keys
      ? (keys.anyDown(this.positiveKeys) ? 1 : 0) -
        (keys.anyDown(this.negativeKeys) ? 1 : 0)
      : 0
    const step = this.rampMs > 0 ? dtMs / this.rampMs : 1
    this.keyLevel = approach(this.keyLevel, direction, step)
    const sensitivity = settings.get().sensitivity

    if (direction !== 0) {
      this.source = 'keys'
      this.value = this.keyLevel
    } else if (this.motion && prefersMotion(this.motion, this.pointer)) {
      const degrees = this.motion.tiltX
      const beyond = Math.max(0, Math.abs(degrees) - this.deadZoneDegrees)
      this.source = 'motion'
      this.value = clamp(
        ((Math.sign(degrees) * beyond) / this.maxDegrees) * sensitivity,
        -1,
        1
      )
    } else if (this.pointerSteers()) {
      const offset = (this.pointer as PointerInput).x - this.originX
      this.source = 'pointer'
      this.value = clamp((offset / this.pointerRange) * sensitivity, -1, 1)
    } else {
      // Keys just released: ease back to level instead of snapping.
      this.source = this.keyLevel !== 0 ? 'keys' : 'none'
      this.value = this.keyLevel
    }
    return this.value
  }

  private pointerSteers(): boolean {
    const pointer = this.pointer
    if (!pointer || this.pointerRange <= 0) return false
    // A mouse or pen steers while hovering; a finger only while touching.
    return (
      pointer.isDown ||
      pointer.lastType === 'mouse' ||
      pointer.lastType === 'pen'
    )
  }
}

function approach(current: number, target: number, step: number): number {
  return current < target
    ? Math.min(target, current + step)
    : Math.max(target, current - step)
}
