import { COLS, PATCH_D, PATCH_W } from '../game/tuning'
import type { GardenEvent } from '../game/types'
import { palette } from '../shared/palette'
import { LAWN, PATIO } from './layout'

/** What a stripe cue shows: a stripe gained, a stripe lost, or a stripe blocked. */
export type StripeCueKind = 'sweep' | 'flicker' | 'blocked'

/** One stripe cue, kept for its time on screen and for the dev check. */
export interface StripeCue {
  kind: StripeCueKind
  /** The column it's about. */
  col: number
  /** The patches that block the stripe, for `blocked`. */
  patches: readonly number[]
  /** Scene time it started. */
  at: number
  /** `performance.now()` when the scene heard of it, and when it first drew, or 0. */
  heardAt: number
  shownAt: number
}

/** How long each cue shows, in ms. */
export const STRIPE_CUE_MS: Record<StripeCueKind, number> = {
  sweep: 650,
  flicker: 450,
  blocked: 1000
}

/** The sweep's band of light, in design units. */
const SWEEP_BAND = 140
const RECENT_CAP = 16
const NO_PATCHES: readonly number[] = []

/**
 * The stripe cues every player sees on their own lawn: a light sweeping down a column
 * that gains a stripe, a flicker on one that loses it, and a red flash on the patches
 * that block a stripe after a long mowing press. Under Reduced Motion the sweep and the
 * flicker don't play, and the flash holds still.
 */
export class StripeCues {
  private readonly live: StripeCue[] = []
  /** The last few cues that showed, newest last, for the dev `cues()` hook. */
  readonly recent: StripeCue[] = []

  /** Starts the sweep and flicker cues for columns that gained or lost a stripe. */
  change(gained: number, lost: number, time: number, still: boolean): void {
    if (still) return
    for (let col = 0; col < COLS; col++) {
      if ((gained >> col) & 1) this.add('sweep', col, NO_PATCHES, time)
      else if ((lost >> col) & 1) this.add('flicker', col, NO_PATCHES, time)
    }
  }

  /** Starts the blocked-stripe flash for your garden's events. */
  onEvents(events: readonly GardenEvent[], time: number): void {
    for (const e of events)
      if (e.type === 'blocked') this.add('blocked', e.col, e.patches, time)
  }

  /** Draws every cue still on show over the lawn, and drops the finished ones. */
  draw(ctx: CanvasRenderingContext2D, time: number, still: boolean): void {
    const live = this.live
    for (let i = live.length - 1; i >= 0; i--) {
      const cue = live[i] as StripeCue
      if (time - cue.at > STRIPE_CUE_MS[cue.kind]) live.splice(i, 1)
    }
    for (const cue of live) {
      if (cue.shownAt === 0) {
        cue.shownAt = performance.now()
        this.recent.push(cue)
        if (this.recent.length > RECENT_CAP) this.recent.shift()
      }
      const k = (time - cue.at) / STRIPE_CUE_MS[cue.kind]
      if (cue.kind === 'sweep') drawSweep(ctx, cue.col, k)
      else if (cue.kind === 'flicker')
        drawFlicker(ctx, cue.col, time - cue.at, k)
      else drawBlocked(ctx, cue.patches, time - cue.at, k, still)
    }
    ctx.globalAlpha = 1
  }

  private add(
    kind: StripeCueKind,
    col: number,
    patches: readonly number[],
    time: number
  ): void {
    // A newer cue on the same column replaces the old one.
    const old = this.live.findIndex(c => c.col === col && c.kind !== 'blocked')
    if (kind !== 'blocked' && old >= 0) this.live.splice(old, 1)
    this.live.push({
      kind,
      col,
      patches,
      at: time,
      heardAt: performance.now(),
      shownAt: 0
    })
  }
}

/** A band of light running down the column from the fence to the patio. */
function drawSweep(
  ctx: CanvasRenderingContext2D,
  col: number,
  k: number
): void {
  const x = LAWN.x + col * PATCH_W
  const mid = LAWN.y - SWEEP_BAND / 2 + k * (LAWN.h + SWEEP_BAND)
  const top = Math.max(LAWN.y, mid - SWEEP_BAND / 2)
  const bottom = Math.min(LAWN.y + LAWN.h, mid + SWEEP_BAND / 2)
  if (bottom <= top) return
  const glow = ctx.createLinearGradient(
    0,
    mid - SWEEP_BAND / 2,
    0,
    mid + SWEEP_BAND / 2
  )
  glow.addColorStop(0, 'rgba(255, 252, 214, 0)')
  glow.addColorStop(0.5, 'rgba(255, 252, 214, 0.75)')
  glow.addColorStop(1, 'rgba(255, 252, 214, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(x, top, PATCH_W, bottom - top)
}

/** The column blinking pale three times as its stripe goes. */
function drawFlicker(
  ctx: CanvasRenderingContext2D,
  col: number,
  age: number,
  k: number
): void {
  if (Math.floor(age / 75) % 2 === 1) return
  ctx.globalAlpha = 0.4 * (1 - k)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(LAWN.x + col * PATCH_W, LAWN.y, PATCH_W, LAWN.h)
  ctx.globalAlpha = 1
}

/** The patches that block a stripe, flashing red, or held steady under Reduced Motion. */
function drawBlocked(
  ctx: CanvasRenderingContext2D,
  patches: readonly number[],
  age: number,
  k: number,
  still: boolean
): void {
  const fade = Math.min(1, 5 * (1 - k))
  const pulse = still ? 0.9 : 0.7 + 0.3 * Math.cos(age / 90)
  ctx.globalAlpha = fade * pulse
  ctx.fillStyle = 'rgba(201, 42, 42, 0.4)'
  ctx.strokeStyle = palette.red
  ctx.lineWidth = 5
  for (const p of patches) {
    const x = LAWN.x + (p % COLS) * PATCH_W
    const y = LAWN.y + Math.floor(p / COLS) * PATCH_D
    ctx.fillRect(x + 3, y + 3, PATCH_W - 6, PATCH_D - 6)
    ctx.strokeRect(x + 3, y + 3, PATCH_W - 6, PATCH_D - 6)
  }
  ctx.globalAlpha = 1
}

/** How long a lost stripe's red cross shows under its column, in ms. */
export const CROSS_MS = 1000
/** The marks' middle, in design units below the patio's top edge, and their half size. */
const MARK_Y = PATIO.y + 15
const MARK_R = 8

/** What the patio's edge shows under a column. */
export type StripeMark = 'tick' | 'cross' | null

/**
 * The chalk marks on the patio's edge: a white tick under each column your settled
 * stripes mark, so you can count them at a glance, and a red cross for 1s under one that
 * just lost its stripe. Feed it the settled mask every frame and live losses as they
 * happen; start it fresh on a new garden. Under Reduced Motion the cross holds still for
 * its 1s instead of fading.
 */
export class StripeTicks {
  private mask = 0
  private readonly lostAt = new Float64Array(COLS).fill(-Infinity)
  /** Scene time of the last draw. */
  private drawnAt = 0

  /** The settled stripes now, as a 12-bit mask. */
  follow(mask: number): void {
    this.mask = mask
  }

  /** Columns that lost their stripe in live play at scene time `time`. */
  lose(lost: number, time: number): void {
    for (let col = 0; col < COLS; col++)
      if ((lost >> col) & 1) this.lostAt[col] = time
  }

  /** Forgets every mark, for a new garden. */
  reset(): void {
    this.mask = 0
    this.lostAt.fill(-Infinity)
  }

  /** The mark under column `col` at scene time `time`, by default the last draw's. */
  mark(col: number, time = this.drawnAt): StripeMark {
    if ((this.mask >> col) & 1) return 'tick'
    return time - (this.lostAt[col] as number) < CROSS_MS ? 'cross' : null
  }

  /** Draws the marks along the patio's edge. Draw it after the patio props. */
  draw(ctx: CanvasRenderingContext2D, time: number, still: boolean): void {
    this.drawnAt = time
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (let col = 0; col < COLS; col++) {
      const mark = this.mark(col, time)
      if (!mark) continue
      const x = LAWN.x + col * PATCH_W + PATCH_W / 2
      if (mark === 'tick') {
        drawTick(ctx, x, MARK_Y)
        continue
      }
      const k = (time - (this.lostAt[col] as number)) / CROSS_MS
      ctx.globalAlpha = still ? 1 : Math.min(1, 4 * (1 - k))
      drawCross(ctx, x, MARK_Y)
      ctx.globalAlpha = 1
    }
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'miter'
  }
}

/** Each mark's two passes, edge first: colour and line width. */
const TICK_PASSES = [
  ['rgba(34, 34, 34, 0.55)', 7],
  ['#ffffff', 4]
] as const
const CROSS_PASSES = [
  ['#ffffff', 7],
  [palette.red, 4]
] as const

/** A chalk tick: white over a soft ink edge, so it reads on pale paving. */
function drawTick(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  for (const [color, width] of TICK_PASSES) {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(x - MARK_R, y)
    ctx.lineTo(x - MARK_R / 3, y + MARK_R * 0.7)
    ctx.lineTo(x + MARK_R, y - MARK_R)
    ctx.stroke()
  }
}

/** A red cross where a stripe just went. */
function drawCross(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  for (const [color, width] of CROSS_PASSES) {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(x - MARK_R, y - MARK_R)
    ctx.lineTo(x + MARK_R, y + MARK_R)
    ctx.moveTo(x + MARK_R, y - MARK_R)
    ctx.lineTo(x - MARK_R, y + MARK_R)
    ctx.stroke()
  }
}
