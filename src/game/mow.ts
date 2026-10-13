import { markDirty, setHealth, type Grid } from './grid'
import {
  BAG_CUTS,
  BAG_TIP_CUTS,
  COLS,
  CUT_COOLDOWN_MS,
  LAWN_D,
  LAWN_W,
  HEAP_CUTS,
  MOW_SCALP_PX,
  SHORT_MAX,
  PATCH_D,
  PATCH_W,
  PATCHES
} from './tuning'
import { Mess, type GardenEvent } from './types'

/** The mower checks the patch under it this often along its path, in units. */
const MOW_PATH_STEP = 10

/** The mower and its grass bag. Only your own browser changes them. */
export interface Mower {
  /** Where the mower runs while you mow, in lawn units, or null while it's parked. */
  at: { lx: number; ly: number } | null
  /** The patch the mower is in, or -1 off the lawn. */
  patch: number
  /** Your finger's speed in screen pixels per second, for the shake and the scalp. */
  speedPx: number
  /** Cuts in the grass bag, 0 to 96. */
  bag: number
  /** True while the bag is off the mower, in your hand. */
  bagOff: boolean
  /** Garden time of each patch's last cut, for the cooldown. */
  readonly lastCutAt: Float64Array
}

/** Mow events, a subset of garden events. */
export type MowEvent = Extract<
  GardenEvent,
  { type: 'cut' | 'scalp' | 'bagFull' | 'bagHigh' | 'unheap' }
>

/** A parked mower with an empty bag. */
export function createMower(): Mower {
  return {
    at: null,
    patch: -1,
    speedPx: 0,
    bag: 0,
    bagOff: false,
    lastCutAt: new Float64Array(PATCHES).fill(-Infinity)
  }
}

/** The patch under a mower point; unlike a press, a mower never leaves the lawn. */
function mowerPatch(lx: number, ly: number): number {
  if (lx < 0 || lx >= LAWN_W || ly < 0 || ly >= LAWN_D) return -1
  return Math.floor(ly / PATCH_D) * COLS + Math.floor(lx / PATCH_W)
}

/**
 * Moves the mower to (lx, ly) at garden time `t`, rolling through every patch on the way.
 * Each time it enters a patch it cuts it: length drops by 1 into the bag, mess marks
 * clear, and growth restarts. A heap patch clears too, adding 6 cuts to the bag. A patch
 * cut in the last 250 ms is skipped. At 1,300 px/s or faster it also scalps the patch. A
 * full bag cuts nothing and spits clippings instead, leaving heaps where they are.
 */
export function mowTo(
  m: Mower,
  grid: Grid,
  lx: number,
  ly: number,
  speedPx: number,
  t: number,
  emit: (event: MowEvent) => void
): void {
  m.speedPx = speedPx
  if (!m.at) {
    m.at = { lx, ly }
    if (m.bag >= BAG_CUTS) emit({ type: 'bagFull' })
    enter(m, grid, mowerPatch(lx, ly), t, emit)
    return
  }
  const x0 = m.at.lx
  const y0 = m.at.ly
  m.at.lx = lx
  m.at.ly = ly
  const steps = Math.ceil(Math.hypot(lx - x0, ly - y0) / MOW_PATH_STEP)
  for (let k = 1; k <= steps; k++)
    enter(
      m,
      grid,
      mowerPatch(x0 + ((lx - x0) * k) / steps, y0 + ((ly - y0) * k) / steps),
      t,
      emit
    )
}

/** The mower rolls into `patch`; a new patch gets cut. */
function enter(
  m: Mower,
  grid: Grid,
  patch: number,
  t: number,
  emit: (event: MowEvent) => void
): void {
  if (patch === m.patch) return
  m.patch = patch
  if (patch < 0 || t - (m.lastCutAt[patch] as number) < CUT_COOLDOWN_MS) return
  m.lastCutAt[patch] = t
  if (m.bag >= BAG_CUTS) {
    if (grid.mess[patch] === Mess.heap) return
    grid.mess[patch] = Mess.clippings
    markDirty(grid, patch)
    return
  }
  const before = m.bag
  if (grid.mess[patch] === Mess.heap) {
    m.bag = Math.min(BAG_CUTS, m.bag + HEAP_CUTS)
    emit({ type: 'unheap', patch })
  }
  const length = grid.length[patch] as number
  if (length > 0) {
    // One pass always leaves the patch short, however long it grew.
    grid.length[patch] = Math.min(length - 1, SHORT_MAX)
    m.bag = Math.min(BAG_CUTS, m.bag + 1)
  }
  grid.mess[patch] = Mess.none
  grid.growAt[patch] = t + grid.clock.growMs
  markDirty(grid, patch)
  emit({ type: 'cut', patch })
  if (m.speedPx >= MOW_SCALP_PX) {
    setHealth(grid, patch, (grid.health[patch] as number) - 1)
    grid.mess[patch] = Mess.scalp
    emit({ type: 'scalp', patch })
  }
  if (before < BAG_TIP_CUTS && m.bag >= BAG_TIP_CUTS) emit({ type: 'bagHigh' })
  if (before < BAG_CUTS && m.bag === BAG_CUTS) emit({ type: 'bagFull' })
}

/** Lets go of the mower; it rolls back to the patio. */
export function parkMower(m: Mower): void {
  m.at = null
  m.patch = -1
  m.speedPx = 0
}
