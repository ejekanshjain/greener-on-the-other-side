import { dryStagger, growStagger } from './seed'
import {
  COLS,
  DRY_MS,
  GROW_MS,
  HEALTH_MAX,
  HEALTH_START,
  HEATWAVE_DRY,
  LATE_DRY_LEFT_MS,
  LATE_DRY_MS,
  LAWN_D,
  LAWN_W,
  LENGTH_MAX,
  LENGTH_START,
  PATCH_D,
  PATCH_W,
  PATCHES,
  ROUND_MS,
  ROWS,
  SHORT_MAX,
  STRIPE_MIN
} from './tuning'
import { Mess, type MessKind } from './types'

/** One round's drying and growth timings, in garden ms. */
export interface LawnClock {
  /** Garden time from which patches dry faster (1:20 left). */
  lateAt: number
  /** Ms per dry step before `lateAt`, and from `lateAt` on. */
  dryMs: number
  lateDryMs: number
  /** Ms per growth step. */
  growMs: number
}

/**
 * The lawn timings for a round of `roundMs`. `?fast` rounds scale every timing by their
 * share of a full round, so an idle fast round ends like an idle full one. The heatwave
 * speeds up drying only.
 */
export function lawnClock(roundMs = ROUND_MS, heatwave = false): LawnClock {
  const scale = roundMs / ROUND_MS
  const heat = heatwave ? HEATWAVE_DRY : 1
  return {
    lateAt: roundMs - LATE_DRY_LEFT_MS * scale,
    dryMs: (DRY_MS * scale) / heat,
    lateDryMs: (LATE_DRY_MS * scale) / heat,
    growMs: GROW_MS * scale
  }
}

/** Dry periods passed by garden time `t`: 1 per `dryMs`, then 1 per `lateDryMs` from `lateAt`. */
export function dryProgress(clock: LawnClock, t: number): number {
  if (t <= clock.lateAt) return t / clock.dryMs
  return clock.lateAt / clock.dryMs + (t - clock.lateAt) / clock.lateDryMs
}

/** The garden time when dry progress reaches `progress`; the inverse of `dryProgress`. */
export function dryTime(clock: LawnClock, progress: number): number {
  const early = clock.lateAt / clock.dryMs
  if (progress <= early) return progress * clock.dryMs
  return clock.lateAt + (progress - early) * clock.lateDryMs
}

/** The lawn's patches as typed arrays indexed by `row * COLS + col`. Row 0 touches the fence. */
export interface Grid {
  /** 0 (mud) to 7 (lush). */
  health: Uint8Array
  /** 0 to 3 (shaggy). */
  length: Uint8Array
  /** A `Mess` code. */
  mess: Uint8Array
  /** 1 where Biscuit dug a hole. */
  hole: Uint8Array
  /** Dry progress at which each patch next dries; it steps by 1 per dry. */
  dryStep: Float64Array
  /** Garden time of each patch's next dry, from `dryStep`. */
  dryAt: Float64Array
  /** Garden time of each patch's next growth. */
  growAt: Float64Array
  /** No timer fires before this garden time. It is a lower bound, so pushing a timer later never breaks it. */
  nextTimerAt: number
  readonly clock: LawnClock
  /** One bit per row that changed since the renderer last looked. */
  dirtyRows: number
}

/** Every row's dirty bit. */
export const ALL_ROWS = (1 << ROWS) - 1

/**
 * A fresh lawn: every patch at the starting health and length, no mess, no holes. Each
 * patch's first dry and first growth fall at a seeded point in its cycle.
 */
export function createGrid(seed = 0, clock = lawnClock()): Grid {
  const grid: Grid = {
    health: new Uint8Array(PATCHES).fill(HEALTH_START),
    length: new Uint8Array(PATCHES).fill(LENGTH_START),
    mess: new Uint8Array(PATCHES),
    hole: new Uint8Array(PATCHES),
    dryStep: new Float64Array(PATCHES),
    dryAt: new Float64Array(PATCHES),
    growAt: new Float64Array(PATCHES),
    nextTimerAt: 0,
    clock,
    dirtyRows: ALL_ROWS
  }
  for (let i = 0; i < PATCHES; i++) {
    const step = 1 - dryStagger(seed, i)
    grid.dryStep[i] = step
    grid.dryAt[i] = dryTime(clock, step)
    grid.growAt[i] = clock.growMs * (1 - growStagger(seed, i))
  }
  return grid
}

/**
 * Fires every dry and growth timer due by garden time `t`. A dry takes 1 health, a growth
 * adds 1 length up to shaggy. `onDry` and `onGrow` hear each change with the new value.
 */
export function runTimers(
  grid: Grid,
  t: number,
  onDry?: (patch: number, health: number) => void,
  onGrow?: (patch: number, length: number) => void
): void {
  if (t < grid.nextTimerAt) return
  const { dryAt, dryStep, growAt, clock } = grid
  let next = Infinity
  for (let i = 0; i < PATCHES; i++) {
    while ((dryAt[i] as number) <= t) {
      const health = Math.max(0, (grid.health[i] as number) - 1)
      setHealth(grid, i, health)
      onDry?.(i, health)
      const step = (dryStep[i] as number) + 1
      dryStep[i] = step
      dryAt[i] = dryTime(clock, step)
    }
    while ((growAt[i] as number) <= t) {
      if ((grid.length[i] as number) < LENGTH_MAX) {
        const length = (grid.length[i] as number) + 1
        grid.length[i] = length
        markDirty(grid, i)
        onGrow?.(i, length)
      }
      growAt[i] = (growAt[i] as number) + clock.growMs
    }
    next = Math.min(next, dryAt[i] as number, growAt[i] as number)
  }
  grid.nextTimerAt = next
}

/** The patch index under a lawn point, or -1 off the lawn (hedges, patio, beyond the fence). */
export function patchAt(lx: number, ly: number): number {
  if (lx < 0 || lx >= LAWN_W || ly < 0 || ly >= LAWN_D) return -1
  return Math.floor(ly / PATCH_D) * COLS + Math.floor(lx / PATCH_W)
}

/** Centre of a patch in lawn units. */
export function patchCenter(patch: number): { lx: number; ly: number } {
  return {
    lx: (patch % COLS) * PATCH_W + PATCH_W / 2,
    ly: Math.floor(patch / COLS) * PATCH_D + PATCH_D / 2
  }
}

/** Takes `amount` health from a patch, never below 0, and marks its row for repaint. */
export function crush(grid: Grid, patch: number, amount: number): void {
  const next = Math.max(0, (grid.health[patch] ?? 0) - amount)
  setHealth(grid, patch, next)
}

/** Sets a patch's health within 0 to 7 and marks its row for repaint. */
export function setHealth(grid: Grid, patch: number, health: number): void {
  const value = Math.max(0, Math.min(HEALTH_MAX, Math.round(health)))
  if (grid.health[patch] === value) return
  grid.health[patch] = value
  markDirty(grid, patch)
}

/**
 * Puts a mess mark on a patch. A puddle or a heap is never replaced by a lighter mark;
 * only mowing clears a heap.
 */
export function setMess(grid: Grid, patch: number, mess: MessKind): void {
  const current = grid.mess[patch]
  if (current === mess || current === Mess.puddle || current === Mess.heap)
    return
  grid.mess[patch] = mess
  markDirty(grid, patch)
}

/** Flags a patch's row for the lawn renderer. */
export function markDirty(grid: Grid, patch: number): void {
  grid.dirtyRows |= 1 << Math.floor(patch / COLS)
}

/** The sum of every patch's health. */
export function healthSum(grid: Grid): number {
  let sum = 0
  for (let i = 0; i < PATCHES; i++) sum += grid.health[i] ?? 0
  return sum
}

/**
 * The columns that show a stripe, as a 12-bit mask with column 0 in bit 0. A column
 * stripes once 14 of its 16 patches are short and clean: no mess, no hole, and not
 * flagged in `occupied` (a weed, an item or a heap on it).
 */
export function stripeMask(grid: Grid, occupied?: Uint8Array): number {
  let mask = 0
  for (let c = 0; c < COLS; c++) {
    let good = 0
    for (let i = c; i < PATCHES; i += COLS) {
      if (
        (grid.length[i] as number) <= SHORT_MAX &&
        grid.mess[i] === Mess.none &&
        grid.hole[i] === 0 &&
        !occupied?.[i]
      )
        good++
    }
    if (good >= STRIPE_MIN) mask |= 1 << c
  }
  return mask
}
