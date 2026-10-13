import { clamp, hash01 } from '../shared/math'
import {
  BIN_LITTER,
  COLS,
  FOOTPRINT,
  LAWN_D,
  LAWN_W,
  LIFT_MS,
  LIFT_SETTLE_MS,
  LIFT_WOBBLE_PX,
  LITTER_REACH,
  LITTER_SPREAD,
  MOWER_RUN,
  PATCH_D,
  PATCH_W,
  ROWS,
  SLIDE_DECAY,
  THROW_MIN_PX,
  TICK_MS
} from './tuning'

/** The heavy junk kinds, each with a footprint in patches. */
export type HeavyKind = keyof typeof FOOTPRINT

/** Salts keep the run and the spill draws apart from every other seeded draw. */
const RUN_SALT = 0x2545f491
const SPILL_SALT = 0x6c8e9cf5

/** A rectangle on the lawn in units, half-open on its right and bottom edges. */
export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * The footprint rectangle of heavy junk centred at (lx, ly). With `inside`, it shifts to
 * lie wholly on the lawn, as a landing does at a hedge or the back wall.
 */
export function footprintRect(
  kind: HeavyKind,
  lx: number,
  ly: number,
  inside: boolean
): Rect {
  const [cols, rows] = FOOTPRINT[kind]
  const w = cols * PATCH_W
  const h = rows * PATCH_D
  let x0 = lx - w / 2
  let y0 = ly - h / 2
  if (inside) {
    x0 = clamp(x0, 0, LAWN_W - w)
    y0 = clamp(y0, 0, LAWN_D - h)
  }
  return { x0, y0, x1: x0 + w, y1: y0 + h }
}

/**
 * The lawn patches whose centres lie inside a footprint rectangle, written into `out`.
 * A full rectangle holds exactly its footprint's columns by rows; the part over the
 * patio or past a hedge holds none.
 */
export function footprintPatches(rect: Rect, out: number[] = []): number[] {
  out.length = 0
  const c0 = Math.max(0, Math.ceil((rect.x0 - PATCH_W / 2) / PATCH_W))
  const c1 = Math.min(COLS, Math.ceil((rect.x1 - PATCH_W / 2) / PATCH_W))
  const r0 = Math.max(0, Math.ceil((rect.y0 - PATCH_D / 2) / PATCH_D))
  const r1 = Math.min(ROWS, Math.ceil((rect.y1 - PATCH_D / 2) / PATCH_D))
  for (let r = r0; r < r1; r++)
    for (let c = c0; c < c1; c++) out.push(r * COLS + c)
  return out
}

/** True when a lawn point lies inside a rectangle. */
export function inRect(rect: Rect, lx: number, ly: number): boolean {
  return lx >= rect.x0 && lx < rect.x1 && ly >= rect.y0 && ly < rect.y1
}

/** What a press on heavy junk is doing. `down` means it was set back down. */
export type Grip = 'wait' | 'drag' | 'lifted' | 'down'

/**
 * Decides what a press on heavy junk does, in screen pixels and ms. Slide more than
 * 12 px before 0.6s and you drag it. Hold still for 0.6s and it lifts. After a lift only
 * a throw works: a finger still slower than a throw 100 ms after it leaves the 12 px
 * wobble sets it back down. A swipe needs those 100 ms to show its speed, because a
 * still finger sends no samples to measure from.
 */
export class HeavyGrip {
  grip: Grip = 'wait'
  private x0 = 0
  private y0 = 0
  private t0 = 0
  /** Event time the finger first left the wobble after the lift, or -1. */
  private leftAt = -1

  /** Starts a press at client pixels (x, y) and event time `t`. */
  start(x: number, y: number, t: number): void {
    this.grip = 'wait'
    this.x0 = x
    this.y0 = y
    this.t0 = t
    this.leftAt = -1
  }

  /** Feeds a pointer sample with the finger's recent peak speed and returns the grip after it. */
  move(x: number, y: number, t: number, speedPx: number): Grip {
    const grip = this.tick(t)
    const moved = Math.hypot(x - this.x0, y - this.y0) > LIFT_WOBBLE_PX
    if (grip === 'wait' && moved) this.grip = 'drag'
    else if (grip === 'lifted' && moved) {
      if (this.leftAt < 0) this.leftAt = t
      else if (t - this.leftAt >= LIFT_SETTLE_MS && speedPx < THROW_MIN_PX)
        this.grip = 'down'
    }
    return this.grip
  }

  /** Moves the grip on with time alone: a press held still for 0.6s lifts. */
  tick(t: number): Grip {
    if (this.grip === 'wait' && t - this.t0 >= LIFT_MS) this.grip = 'lifted'
    return this.grip
  }
}

/**
 * The patches a thrown mower drives after it lands on `patch` heading along (dx, dy):
 * 4 steps forward along its main heading, about half of them with a jog sideways. It
 * turns back at a hedge, the fence or the back wall.
 */
export function mowerRun(
  seed: number,
  id: number,
  patch: number,
  dx: number,
  dy: number
): number[] {
  let col = patch % COLS
  let row = Math.floor(patch / COLS)
  const alongRows = Math.abs(dy) >= Math.abs(dx)
  let forward = (alongRows ? Math.sign(dy) : Math.sign(dx)) || 1
  const path: number[] = []
  for (let k = 0; k < MOWER_RUN; k++) {
    const draw = hash01(seed ^ RUN_SALT, id * 8 + k)
    let jog = draw < 0.25 ? -1 : draw < 0.5 ? 1 : 0
    let fc = alongRows ? col + jog : col + forward
    let fr = alongRows ? row + forward : row + jog
    if (alongRows ? fr < 0 || fr >= ROWS : fc < 0 || fc >= COLS) {
      forward = -forward
      if (alongRows) fr = row + forward
      else fc = col + forward
    }
    if (alongRows ? fc < 0 || fc >= COLS : fr < 0 || fr >= ROWS) {
      jog = -jog
      if (alongRows) fc = col + jog
      else fr = row + jog
    }
    col = fc
    row = fr
    path.push(row * COLS + col)
  }
  return path
}

/** Where one piece of a landing bin's litter ends up, and which look it has. */
export interface Spill {
  lx: number
  ly: number
  look: number
}

/**
 * Where a bin landing at (lx, ly) spills its 4 pieces of litter: one in each direction
 * round it, at a seeded angle and reach, kept on the lawn. Each gets its own look.
 */
export function litterSpill(
  seed: number,
  id: number,
  lx: number,
  ly: number
): Spill[] {
  const s = seed ^ SPILL_SALT
  const turn = hash01(s, id * 16) * Math.PI * 2
  const out: Spill[] = []
  for (let k = 0; k < BIN_LITTER; k++) {
    const a =
      turn + (k * Math.PI * 2) / BIN_LITTER + (hash01(s, id * 16 + k + 1) - 0.5)
    const r = LITTER_REACH + hash01(s, id * 16 + k + 8) * LITTER_SPREAD
    out.push({
      lx: clamp(lx + Math.cos(a) * r, 10, LAWN_W - 10),
      ly: clamp(ly + Math.sin(a) * r * 0.8, 10, LAWN_D - 10),
      look: k
    })
  }
  return out
}

/** The speed a slide needs to come to rest `distance` units away under the slide's decay. */
export function rollSpeed(distance: number): number {
  const decay = Math.exp((-SLIDE_DECAY * TICK_MS) / 1000)
  return (distance * (1 - decay)) / ((TICK_MS / 1000) * decay)
}
