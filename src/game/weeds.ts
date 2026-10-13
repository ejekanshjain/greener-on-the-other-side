import type { Grid } from './grid'
import { spreadDraw, weedSpot } from './seed'
import { hash01 } from '../shared/math'
import {
  CLOCK_MS,
  CLOCK_SEEDS,
  COLS,
  ROWS,
  WEED_CAP,
  WEED_DRAIN_MS,
  WEED_SPREAD_MS
} from './tuning'
import type { RootedWeed } from './types'

/** Patches a scheduled weed tries before it gives up. */
const SPOT_TRIES = 8

/** True when a weed can root on `patch`: no weed there already and no hole. */
function canRoot(
  weeds: readonly RootedWeed[],
  grid: Grid,
  patch: number
): boolean {
  return grid.hole[patch] === 0 && !weeds.some(w => w.patch === patch)
}

/**
 * A weed rooted on `patch` at garden time `at`, with its drain and spread timers. A
 * dandelion also gets the time it turns into a seed clock.
 */
export function newWeed(
  id: number,
  patch: number,
  lx: number,
  ly: number,
  at: number,
  kind: 'weed' | 'dandelion' = 'weed'
): RootedWeed {
  return {
    id,
    patch,
    lx,
    ly,
    kind,
    bornAt: at,
    clockAt: kind === 'dandelion' ? at + CLOCK_MS : Infinity,
    nextDrainAt: at + WEED_DRAIN_MS,
    nextSpreadAt: at + WEED_SPREAD_MS,
    spreads: 0
  }
}

/**
 * The patch where scheduled weed `k` roots: the first seeded spot that is free, the same
 * on both lawns unless your play filled it. -1 when the lawn holds 40 weeds or no spot is free.
 */
export function sproutPatch(
  seed: number,
  round: number,
  k: number,
  weeds: readonly RootedWeed[],
  grid: Grid
): number {
  if (weeds.length >= WEED_CAP) return -1
  for (let j = 0; j < SPOT_TRIES; j++) {
    const patch = weedSpot(seed, round, k, j)
    if (canRoot(weeds, grid, patch)) return patch
  }
  return -1
}

const around: number[] = []

/** The free neighbouring patch a weed spreads to, picked by the seed, or -1. */
export function spreadPatch(
  seed: number,
  weed: RootedWeed,
  weeds: readonly RootedWeed[],
  grid: Grid
): number {
  if (weeds.length >= WEED_CAP) return -1
  const row = Math.floor(weed.patch / COLS)
  const col = weed.patch % COLS
  around.length = 0
  if (row > 0) around.push(weed.patch - COLS)
  if (row < ROWS - 1) around.push(weed.patch + COLS)
  if (col > 0) around.push(weed.patch - 1)
  if (col < COLS - 1) around.push(weed.patch + 1)
  for (let i = around.length - 1; i >= 0; i--)
    if (!canRoot(weeds, grid, around[i] as number)) around.splice(i, 1)
  if (around.length === 0) return -1
  const pick = Math.floor(
    spreadDraw(seed, weed.id, weed.spreads) * around.length
  )
  return around[pick] as number
}

/**
 * Runs every weed's drain and spread timers due by garden time `t`. A weed takes 1 health
 * from its patch every 15s and spreads every 30s; `drain` and `spread` carry them out.
 * A dandelion turns into a seed clock 40s after it sprouts, and `clock` hears it.
 * Weeds that spread this tick only start their own timers from their birth.
 */
export function stepWeeds(
  weeds: RootedWeed[],
  t: number,
  drain: (weed: RootedWeed) => void,
  spread: (weed: RootedWeed, at: number) => void,
  clock?: (weed: RootedWeed) => void
): void {
  const count = weeds.length
  for (let i = 0; i < count; i++) {
    const weed = weeds[i] as RootedWeed
    if (weed.clockAt <= t) {
      weed.kind = 'seedClock'
      weed.clockAt = Infinity
      clock?.(weed)
    }
    while (weed.nextDrainAt <= t) {
      drain(weed)
      weed.nextDrainAt += WEED_DRAIN_MS
    }
    while (weed.nextSpreadAt <= t) {
      const at = weed.nextSpreadAt
      weed.nextSpreadAt += WEED_SPREAD_MS
      spread(weed, at)
      weed.spreads++
    }
  }
}

/** True when weed `k` of a round sprouts as a dandelion: 1 in 4, from round 2 on. */
export function isDandelion(
  seed: number,
  round: number,
  k: number,
  fromRound: number,
  share: number
): boolean {
  return round >= fromRound && hash01(seed ^ 0x6d2b79f5, k) < share
}

/**
 * The patches a seed clock bursting at `patch` scatters its seeds on: 3 different
 * patches from it and its 8 neighbours, picked by the seed and the clock's id.
 */
export function seedPatches(seed: number, id: number, patch: number): number[] {
  const row = Math.floor(patch / COLS)
  const col = patch % COLS
  const around: number[] = []
  for (let r = row - 1; r <= row + 1; r++)
    for (let c = col - 1; c <= col + 1; c++)
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) around.push(r * COLS + c)
  const out: number[] = []
  for (let k = 0; out.length < CLOCK_SEEDS && around.length > 0; k++) {
    const pick = Math.floor(
      hash01(seed ^ 0x1b56c4e9, id * 16 + k) * around.length
    )
    out.push(...around.splice(pick, 1))
  }
  return out
}
