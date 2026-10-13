/** A random source returning numbers in [0, 1), like `Math.random`. */
export type Rng = () => number

const TAU = Math.PI * 2

/** Limits `value` to the range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/** Blends from `a` to `b` by `t` (0 gives `a`, 1 gives `b`). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Returns where `value` sits between `a` and `b` (0 at `a`, 1 at `b`). Returns 0 when `a === b`. */
export function invLerp(a: number, b: number, value: number): number {
  return a === b ? 0 : (value - a) / (b - a)
}

/**
 * Moves `current` towards `target` at the same speed on any frame rate.
 * `lambda` is the rate per second: 5 closes about 99% of the gap in 1 second.
 *
 * @example x = damp(x, targetX, 8, dtMs / 1000)
 */
export function damp(
  current: number,
  target: number,
  lambda: number,
  dtSeconds: number
): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dtSeconds))
}

/** Distance between two points, given as separate numbers to avoid allocating objects. */
export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

/** Wraps an angle in radians into the range (-PI, PI]. */
export function wrapAngle(angle: number): number {
  const wrapped = angle - TAU * Math.floor((angle + Math.PI) / TAU)
  // floor maps exactly PI to -PI; keep PI so the range stays (-PI, PI].
  return wrapped === -Math.PI ? Math.PI : wrapped
}

/** Shortest signed turn in radians from angle `from` to angle `to`. */
export function angleDiff(from: number, to: number): number {
  return wrapAngle(to - from)
}

/**
 * Creates a seeded random source (mulberry32). The same seed always gives the same sequence.
 *
 * @example const r = rng(42); const roll = r()
 */
export function rng(seed: number): Rng {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Random number in [min, max). Pass a seeded `random` for repeatable results. */
export function randRange(
  min: number,
  max: number,
  random: Rng = Math.random
): number {
  return min + (max - min) * random()
}

/** Random item from a non-empty list. Throws on an empty list. */
export function pick<T>(items: readonly T[], random: Rng = Math.random): T {
  if (items.length === 0)
    throw new Error('pick: the list is empty, so no item can be chosen')
  return items[Math.floor(random() * items.length)] as T
}

/** Shuffles `items` in place (Fisher-Yates) and returns the same array. */
export function shuffle<T>(items: T[], random: Rng = Math.random): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const swap = items[i] as T
    items[i] = items[j] as T
    items[j] = swap
  }
  return items
}

/**
 * Hashes a seed and an index into a number in [0, 1). Use it for stable per-item randomness
 * without creating a random source, for example per-vertex wobble.
 */
export function hash01(seed: number, index: number): number {
  let h =
    Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(index + 0x632be5ab, 0xc2b2ae35)
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
