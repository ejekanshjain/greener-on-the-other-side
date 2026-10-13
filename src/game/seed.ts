import { hash01 } from '../shared/math'
import { stretchAt } from './match'
import {
  BACK_ROW_WEED_MS,
  BISCUIT_WAKE_LEFT_MS,
  CIRCLE_MS,
  COLS,
  CRATE_COLS,
  CRATE_GNOMES,
  CRATE_ROWS,
  DIG_COLS,
  DIG_EVERY_MS,
  DIG_FIRST_MS,
  DIG_ROWS,
  GNOME_ROW_MAX,
  GNOME_ROW_MIN,
  ROUND_MS,
  ROWS,
  SCHEDULE_JITTER,
  SHED_LEFT_MS,
  SNAIL_EVERY_MS,
  START_GNOMES,
  WEED_EVERY_MS
} from './tuning'

/** Salts keep each schedule's random draws independent of the others. */
const SALT = {
  round: 0x51ed270b,
  gnome: 0x1b873593,
  weed: 0x2c1b3c6d,
  offset: 0x297a2d39,
  dry: 0x3c6ef372,
  grow: 0x7f4a7c15,
  weedAt: 0x6a09e667,
  weedSpot: 0x3c6ef373,
  snailAt: 0x510e527f,
  snailSpot: 0x1f83d9ab,
  spread: 0x5be0cd19,
  digAt: 0x428a2f98,
  digSpot: 0x71374491,
  crate: 0x0b5ad4ec
} as const

/** The seed for one round of a match. Both gardens derive the same one. */
export function roundSeed(matchSeed: number, round: number): number {
  return Math.floor(hash01(matchSeed ^ SALT.round, round) * 0x7fffffff)
}

/** A whole number in [min, max] drawn from `seed` at index `k`. */
function drawInt(seed: number, k: number, min: number, max: number): number {
  return min + Math.floor(hash01(seed, k) * (max - min + 1))
}

/**
 * Distinct patches drawn by index from `seed`, inside the row and column ranges and
 * outside `avoid`.
 */
function drawPatches(
  seed: number,
  count: number,
  rows: [number, number],
  cols: [number, number],
  avoid: readonly number[] = []
): number[] {
  const out: number[] = []
  for (let k = 0; out.length < count && k < 1000; k += 2) {
    const row = drawInt(seed, k, rows[0], rows[1])
    const col = drawInt(seed, k + 1, cols[0], cols[1])
    const patch = row * COLS + col
    if (!out.includes(patch) && !avoid.includes(patch)) out.push(patch)
  }
  return out
}

/** The patches where the round's starting gnomes stand, the same on both lawns. */
export function gnomeSpots(seed: number): number[] {
  return drawPatches(
    seed ^ SALT.gnome,
    START_GNOMES,
    [GNOME_ROW_MIN, GNOME_ROW_MAX],
    [1, COLS - 2]
  )
}

/**
 * Garden times of a schedule's arrivals in a round of `roundMs`. Each gap is the interval
 * for the stretch the previous arrival fell in, early or late by up to 20%, drawn by its
 * own index. `?fast` rounds scale the intervals with the round, like the lawn timers.
 */
function scheduleTimes(
  seed: number,
  intervals: readonly number[],
  roundMs: number
): number[] {
  const scale = roundMs / ROUND_MS
  const out: number[] = []
  let t = 0
  for (let k = 0; ; k++) {
    const every = intervals[stretchAt(roundMs - t, roundMs)] as number
    t += every * scale * (1 + SCHEDULE_JITTER * (2 * hash01(seed, k) - 1))
    if (t >= roundMs) return out
    out.push(t)
  }
}

/**
 * When the round's weeds sprout, the same on both lawns. In round 1 the second weed comes
 * at 2:50 left, on the back row (see `weedSpot`), so the first hard throw comes early.
 */
export function weedTimes(
  seed: number,
  round: number,
  roundMs: number
): number[] {
  const times = scheduleTimes(seed ^ SALT.weedAt, WEED_EVERY_MS, roundMs)
  const backRow = (BACK_ROW_WEED_MS * roundMs) / ROUND_MS
  // The first weed comes at 4s to 6s and the third after 12s, so 10s always fits between.
  if (round === 0 && times.length > 2) times[1] = backRow
  return times
}

/**
 * The `j`-th patch to try for weed `k`, the same on both lawns. Round 1's second weed
 * always tries the back row.
 */
export function weedSpot(
  seed: number,
  round: number,
  k: number,
  j: number
): number {
  const s = seed ^ SALT.weedSpot
  const row =
    round === 0 && k === 1 ? ROWS - 1 : drawInt(s, k * 64 + j * 2, 0, ROWS - 1)
  return row * COLS + drawInt(s, k * 64 + j * 2 + 1, 0, COLS - 1)
}

/** When the round's snails crawl in, the same on both lawns. */
export function snailTimes(seed: number, roundMs: number): number[] {
  return scheduleTimes(seed ^ SALT.snailAt, SNAIL_EVERY_MS, roundMs)
}

/** Which hedge snail `k` comes from (1: the left, crawling right) and its row. */
export function snailSpot(
  seed: number,
  k: number
): { dir: 1 | -1; row: number } {
  const s = seed ^ SALT.snailSpot
  return {
    dir: hash01(s, k * 2) < 0.5 ? 1 : -1,
    row: drawInt(s, k * 2 + 1, 0, ROWS - 1)
  }
}

/** A number from 0 to 1 for a weed's `n`-th spread, picking which neighbour it takes. */
export function spreadDraw(seed: number, weedId: number, n: number): number {
  return hash01(seed ^ SALT.spread, weedId * 64 + n)
}

/** A small seeded offset inside a patch, so items don't sit on a grid. */
export function patchJitter(
  seed: number,
  k: number
): { dx: number; dy: number } {
  return {
    dx: (hash01(seed ^ SALT.offset, k * 2) - 0.5) * 24,
    dy: (hash01(seed ^ SALT.offset, k * 2 + 1) - 0.5) * 16
  }
}

/**
 * Where a patch starts in its drying cycle, from 0 to 1. A patch with stagger `s` first
 * dries once `1 - s` of a dry period has passed, so the lawn dries a patch at a time.
 */
export function dryStagger(seed: number, patch: number): number {
  return hash01(seed ^ SALT.dry, patch)
}

/** Where a patch starts in its growth cycle, from 0 to 1, like `dryStagger`. */
export function growStagger(seed: number, patch: number): number {
  return hash01(seed ^ SALT.grow, patch)
}

/** Garden time Biscuit wakes in a round of `roundMs`: 2:20 left, scaled for `?fast`. */
export function biscuitWakeAt(roundMs: number): number {
  return (ROUND_MS - BISCUIT_WAKE_LEFT_MS) * (roundMs / ROUND_MS)
}

/**
 * When Biscuit starts circling for each dig, the same on both lawns: 5s to 20s after he
 * wakes, then every 40s to 60s, each gap drawn by its own index and scaled for `?fast`.
 * A dig whose circle would end after play stops never comes.
 */
export function digTimes(seed: number, roundMs: number): number[] {
  const s = seed ^ SALT.digAt
  const scale = roundMs / ROUND_MS
  const span = (range: readonly [number, number], k: number) =>
    (range[0] + (range[1] - range[0]) * hash01(s, k)) * scale
  const out: number[] = []
  let t = biscuitWakeAt(roundMs) + span(DIG_FIRST_MS, 0)
  for (let k = 1; t + CIRCLE_MS < roundMs; k++) {
    out.push(t)
    t += span(DIG_EVERY_MS, k)
  }
  return out
}

/** The `j`-th patch to try for dig `k`, the same on both lawns. */
export function digSpot(seed: number, k: number, j: number): number {
  const s = seed ^ SALT.digSpot
  const row = drawInt(s, k * 64 + j * 2, DIG_ROWS[0], DIG_ROWS[1])
  return row * COLS + drawInt(s, k * 64 + j * 2 + 1, DIG_COLS[0], DIG_COLS[1])
}

/** Garden time the shed bangs open in a round of `roundMs`: 0:40 left, scaled for `?fast`. */
export function shedAt(roundMs: number): number {
  return roundMs - SHED_LEFT_MS * (roundMs / ROUND_MS)
}

/** The 15 patches the crate's gnomes land on, in the back half, the same on both lawns. */
export function crateSpots(seed: number): number[] {
  return drawPatches(
    seed ^ SALT.crate,
    CRATE_GNOMES,
    [CRATE_ROWS[0], CRATE_ROWS[1]],
    [CRATE_COLS[0], CRATE_COLS[1]]
  )
}
