import type { Point } from '../canvas'
import { damp } from '../math'

/** Result of asking for motion sensor access. */
export type MotionPermission = 'granted' | 'denied' | 'unsupported'

/** iOS adds `requestPermission` to the motion event constructors. */
interface PermissionedEvent {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

/**
 * Asks for motion and orientation access. On iOS this must run inside a tap handler and
 * shows a system prompt; elsewhere it resolves at once. 'granted' doesn't promise sensors
 * exist (desktop browsers report it too), so check `Motion.available` before relying on tilt.
 * Motion sensors also need HTTPS, except on localhost.
 */
export async function requestMotionPermission(): Promise<MotionPermission> {
  if (typeof window === 'undefined' || typeof DeviceMotionEvent === 'undefined')
    return 'unsupported'
  const motion = DeviceMotionEvent as unknown as PermissionedEvent
  const orientation = (typeof DeviceOrientationEvent === 'undefined'
    ? {}
    : DeviceOrientationEvent) as unknown as PermissionedEvent
  if (typeof motion.requestPermission !== 'function') return 'granted'
  try {
    const results = await Promise.all([
      motion.requestPermission(),
      orientation.requestPermission?.() ?? 'granted'
    ])
    return results.every(result => result === 'granted') ? 'granted' : 'denied'
  } catch {
    return 'denied'
  }
}

/**
 * Maps device beta/gamma (degrees) into screen axes for a screen rotation `angle`, writing
 * into `out`. `out.x` is positive when the screen's right edge dips (gamma in portrait);
 * `out.y` is positive when the screen's top edge rises (beta in portrait).
 */
export function screenTilt(
  beta: number,
  gamma: number,
  angle: number,
  out: Point
): Point {
  switch (((angle % 360) + 360) % 360) {
    case 90:
      out.x = beta
      out.y = -gamma
      break
    case 180:
      out.x = -gamma
      out.y = -beta
      break
    case 270:
      out.x = -beta
      out.y = gamma
      break
    default:
      out.x = gamma
      out.y = beta
  }
  return out
}

export interface MotionOptions {
  /** Window for `peakJolt` in ms. Defaults to 500. */
  peakWindowMs?: number
  /** Smoothing rate per second for `jolt`. Defaults to 10. */
  smoothing?: number
  /** Rate per second at which the high-pass filter tracks slow changes such as gravity. Defaults to 1.5. */
  highPass?: number
}

const PEAK_SAMPLES = 128

/**
 * Reads tilt and jolts from the device motion sensors. Call `requestMotionPermission`
 * from a tap first on iOS.
 */
export interface Motion {
  /** True once real sensor data has arrived. Some laptops send data too, so pick the input with `prefersMotion`. */
  readonly available: boolean
  /** Degrees from the calibrated pose; positive when the screen's right edge dips. */
  readonly tiltX: number
  /** Degrees from the calibrated pose; positive when the screen's top edge rises. */
  readonly tiltY: number
  /** Smoothed high-passed acceleration magnitude in m/s². Around 0.1 at rest, 2 to 5 for a jolt. */
  readonly jolt: number
  /** Highest unsmoothed jolt within the last `peakWindowMs`, in m/s². */
  readonly peakJolt: number
  /** Treats the current pose as level. */
  calibrate(): void
  dispose(): void
}

/**
 * Starts listening to motion sensors.
 *
 * @example
 * const motion = createMotion()
 * motion.calibrate() // when the player holds the phone the way they will play
 * // in update: if (prefersMotion(motion, pointer)) steady.feedMotion(motion.jolt, dt)
 */
export function createMotion({
  peakWindowMs = 500,
  smoothing = 10,
  highPass = 1.5
}: MotionOptions = {}): Motion {
  let available = false
  const raw: Point = { x: 0, y: 0 }
  let baseX = 0
  let baseY = 0
  let jolt = 0
  let lastMotionAt = -1
  let lowX = 0
  let lowY = 0
  let lowZ = 0
  const peakValues = new Float64Array(PEAK_SAMPLES)
  const peakTimes = new Float64Array(PEAK_SAMPLES)
  let peakHead = 0
  let peakJolt = 0

  const onOrientation = (event: DeviceOrientationEvent) => {
    if (event.beta === null || event.gamma === null) return
    available = true
    screenTilt(event.beta, event.gamma, screen.orientation?.angle ?? 0, raw)
  }

  const onMotion = (event: DeviceMotionEvent) => {
    const a =
      event.acceleration?.x != null
        ? event.acceleration
        : event.accelerationIncludingGravity
    if (!a || a.x == null || a.y == null || a.z == null) return
    available = true
    const dt =
      lastMotionAt < 0
        ? 0.016
        : Math.min(0.1, (event.timeStamp - lastMotionAt) / 1000)
    if (lastMotionAt < 0) {
      lowX = a.x
      lowY = a.y
      lowZ = a.z
    }
    lastMotionAt = event.timeStamp
    // Subtract a slow-moving average so gravity and sensor drift don't count as jolts.
    lowX = damp(lowX, a.x, highPass, dt)
    lowY = damp(lowY, a.y, highPass, dt)
    lowZ = damp(lowZ, a.z, highPass, dt)
    const magnitude = Math.hypot(a.x - lowX, a.y - lowY, a.z - lowZ)
    jolt = damp(jolt, magnitude, smoothing, dt)

    peakValues[peakHead] = magnitude
    peakTimes[peakHead] = event.timeStamp
    peakHead = (peakHead + 1) % PEAK_SAMPLES
    const oldest = event.timeStamp - peakWindowMs
    peakJolt = 0
    for (let i = 0; i < PEAK_SAMPLES; i++) {
      if (
        (peakTimes[i] as number) >= oldest &&
        (peakValues[i] as number) > peakJolt
      ) {
        peakJolt = peakValues[i] as number
      }
    }
  }

  window.addEventListener('deviceorientation', onOrientation)
  window.addEventListener('devicemotion', onMotion)

  return {
    get available() {
      return available
    },
    get tiltX() {
      return wrapDegrees(raw.x - baseX)
    },
    get tiltY() {
      return wrapDegrees(raw.y - baseY)
    },
    get jolt() {
      return jolt
    },
    get peakJolt() {
      return peakJolt
    },
    calibrate() {
      baseX = raw.x
      baseY = raw.y
    },
    dispose() {
      window.removeEventListener('deviceorientation', onOrientation)
      window.removeEventListener('devicemotion', onMotion)
    }
  }
}

function wrapDegrees(degrees: number): number {
  return degrees - 360 * Math.floor((degrees + 180) / 360)
}
