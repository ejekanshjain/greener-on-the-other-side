import { setHealth, setMess, type Grid } from './grid'
import {
  CAN_MS,
  COLS,
  DROWN_MS,
  FILL_MS,
  FLOOD_MS,
  FLOOD_PATCHES,
  HEALTH_MAX,
  HEATWAVE_FILL_MS,
  MUD_HEALTH,
  PATCH_D,
  PATCH_W,
  PATCHES,
  POUR_RADIUS,
  POUR_STEP_MS,
  ROWS,
  TAP_POS,
  TAP_TIP_MS
} from './tuning'
import { Mess, type GardenEvent } from './types'

/** The can, the tap and the pour. Only your own browser changes them. */
export interface Water {
  /** Ms of pouring left in the can. */
  can: number
  /** Ms a running tap takes to fill an empty can: 3s, or 6s in the heatwave. */
  readonly fillMs: number
  tapOn: boolean
  /** Ms the tap has run since it was turned on or last flooded. */
  tapRunMs: number
  /** Ms the can has sat full under the running tap. */
  fullForMs: number
  /** Where the can pours, in lawn units, or null when you aren't pouring. */
  pour: { lx: number; ly: number } | null
  /** True once this pour has reported an empty can. */
  warned: boolean
  /** Pour time each patch has banked toward its next +1 health. */
  readonly pourMs: Float64Array
  /** Pour time on each full patch; 1.5s of it drowns the patch. */
  readonly fullMs: Float64Array
  /** Patches with banked pour time, so a pour that moves away clears them. */
  wet: number[]
}

/** Water events, a subset of garden events. */
export type WaterEvent = Extract<
  GardenEvent,
  { type: 'sparkle' | 'drown' | 'flood' | 'canEmpty' | 'tapFull' }
>

/** A full can, the tap off and nothing pouring. The heatwave fills the can more slowly. */
export function createWater(heatwave = false): Water {
  return {
    can: CAN_MS,
    fillMs: heatwave ? HEATWAVE_FILL_MS : FILL_MS,
    tapOn: false,
    tapRunMs: 0,
    fullForMs: 0,
    pour: null,
    warned: false,
    pourMs: new Float64Array(PATCHES),
    fullMs: new Float64Array(PATCHES),
    wet: []
  }
}

/** The patches a flood turns to mud: the ones nearest the tap. */
export const FLOOD_TARGETS: readonly number[] = Array.from(
  { length: PATCHES },
  (_, i) => i
)
  .map(i => ({
    i,
    d: Math.hypot(
      (i % COLS) * PATCH_W + PATCH_W / 2 - TAP_POS.lx,
      Math.floor(i / COLS) * PATCH_D + PATCH_D / 2 - TAP_POS.ly
    )
  }))
  .sort((a, b) => a.d - b.d)
  .slice(0, FLOOD_PATCHES)
  .map(p => p.i)

/** Writes the patches whose centres lie within the pour circle at (lx, ly) into `out`. */
export function pourPatches(lx: number, ly: number, out: number[]): number[] {
  out.length = 0
  const c0 = Math.max(0, Math.floor((lx - POUR_RADIUS) / PATCH_W))
  const c1 = Math.min(COLS - 1, Math.floor((lx + POUR_RADIUS) / PATCH_W))
  const r0 = Math.max(0, Math.floor((ly - POUR_RADIUS) / PATCH_D))
  const r1 = Math.min(ROWS - 1, Math.floor((ly + POUR_RADIUS) / PATCH_D))
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const dx = c * PATCH_W + PATCH_W / 2 - lx
      const dy = r * PATCH_D + PATCH_D / 2 - ly
      if (dx * dx + dy * dy <= POUR_RADIUS * POUR_RADIUS) out.push(r * COLS + c)
    }
  return out
}

/** Turns the tap on or off. Either way its flood timer restarts. */
export function toggleTap(w: Water): void {
  w.tapOn = !w.tapOn
  w.tapRunMs = 0
  w.fullForMs = 0
}

/** Starts pouring at a lawn point, or moves the pour there. */
export function pourAt(w: Water, lx: number, ly: number): void {
  if (w.pour) {
    w.pour.lx = lx
    w.pour.ly = ly
    return
  }
  w.pour = { lx, ly }
  w.warned = false
}

/** Stops pouring; every patch's banked pour time is lost. */
export function stopPour(w: Water): void {
  w.pour = null
  clearWet(w, null)
}

const under: number[] = []

/**
 * Advances the can, the tap and the pour by one tick. Each patch under the pour gains 1
 * health per 0.4s of pouring; a full patch sparkles, and 1.5s more turns it to mud. A
 * running tap fills the can unless you're pouring, and floods the patches nearest it
 * every 8s.
 */
export function stepWater(
  w: Water,
  grid: Grid,
  dtMs: number,
  emit: (event: WaterEvent) => void
): void {
  if (w.pour) pourStep(w, grid, dtMs, emit)
  if (!w.tapOn) return
  w.tapRunMs += dtMs
  if (!w.pour) {
    if (w.can < CAN_MS)
      w.can = Math.min(CAN_MS, w.can + (dtMs * CAN_MS) / w.fillMs)
    else {
      const before = w.fullForMs
      w.fullForMs += dtMs
      if (before < TAP_TIP_MS && w.fullForMs >= TAP_TIP_MS)
        emit({ type: 'tapFull' })
    }
  }
  if (w.tapRunMs >= FLOOD_MS) {
    w.tapRunMs -= FLOOD_MS
    for (const patch of FLOOD_TARGETS) drown(w, grid, patch)
    emit({ type: 'flood', patches: [...FLOOD_TARGETS] })
  }
}

function pourStep(
  w: Water,
  grid: Grid,
  dtMs: number,
  emit: (event: WaterEvent) => void
): void {
  const pour = w.pour as { lx: number; ly: number }
  if (w.can <= 0) {
    clearWet(w, null)
    if (!w.warned) {
      w.warned = true
      emit({ type: 'canEmpty' })
    }
    return
  }
  const dt = Math.min(dtMs, w.can)
  w.can -= dt
  pourPatches(pour.lx, pour.ly, under)
  clearWet(w, under)
  for (const patch of under) {
    if ((grid.health[patch] as number) < HEALTH_MAX) {
      const banked = (w.pourMs[patch] as number) + dt
      if (banked < POUR_STEP_MS) {
        w.pourMs[patch] = banked
        continue
      }
      w.pourMs[patch] = banked - POUR_STEP_MS
      setHealth(grid, patch, (grid.health[patch] as number) + 1)
      if (grid.health[patch] === HEALTH_MAX) {
        w.fullMs[patch] = 0
        emit({ type: 'sparkle', patch })
      }
      continue
    }
    const full = (w.fullMs[patch] as number) + dt
    w.fullMs[patch] = full
    if (full >= DROWN_MS) {
      drown(w, grid, patch)
      emit({ type: 'drown', patch })
    }
  }
  w.wet.length = 0
  for (const patch of under) w.wet.push(patch)
}

/** Turns a patch to mud with a puddle and forgets its banked pour time. */
function drown(w: Water, grid: Grid, patch: number): void {
  setHealth(grid, patch, MUD_HEALTH)
  setMess(grid, patch, Mess.puddle)
  w.pourMs[patch] = 0
  w.fullMs[patch] = 0
}

/** Clears banked pour time on wet patches that aren't in `keep`. */
function clearWet(w: Water, keep: readonly number[] | null): void {
  for (const patch of w.wet) {
    if (keep?.includes(patch)) continue
    w.pourMs[patch] = 0
    w.fullMs[patch] = 0
  }
  if (!keep) w.wet.length = 0
}
