import { patchCenter } from '../game/grid'
import { ITEM_LIFT } from '../game/items'
import {
  patchHealth,
  patchLength,
  patchTop,
  reportStripes,
  Top,
  type LawnReport
} from '../game/report'
import {
  COLS,
  HEALTH_MAX,
  LAWN_W,
  PATCH_D,
  PEEK_ITEM_SCALE,
  PEEK_ROW_COUNT,
  PEEK_TINT
} from '../game/tuning'
import { isHeavy, Mess, type ItemKind } from '../game/types'
import { PUFF_MS, type NeighbourView } from '../net/neighbour'
import type { CachedLayer } from '../shared/layer'
import { hash01 } from '../shared/math'
import { palette } from '../shared/palette'
import { sketchCircle, sketchEllipse, type SketchStyle } from '../shared/sketch'
import { paintPatch } from './art'
import { DESIGN_W, LAWN, PEEK, PEEK_ROWS } from './layout'

/** The peek strip's caption in each round: the greener lie grows. */
export const CAPTIONS = [
  'Somehow greener.',
  'Still greener.',
  'Even greener. Somehow.'
] as const

/**
 * The peek strip draws as three cached layers. The sky behind and the hedge in front
 * change only with the round; the rows between repaint when a report changes them.
 */
export const PEEK_BACK_RECT = {
  x: 0,
  y: 0,
  width: DESIGN_W,
  height: 200
} as const
export const PEEK_ROWS_RECT = {
  x: 0,
  y: PEEK.y - 10,
  width: DESIGN_W,
  height: 112
} as const
export const PEEK_FRONT_RECT = {
  x: 0,
  y: 0,
  width: DESIGN_W,
  height: 120
} as const

/** Where their horizon sits, for puffs and heavy junk beyond the peek rows. */
const HORIZON_Y = PEEK.y + 4
const HORIZON_SCALE = 0.35

/** Design x for a point on their lawn: their left is your right. */
export function peekX(theirLx: number): number {
  return LAWN.x + LAWN_W - theirLx
}

/** A peek row's band, row 0 nearest the fence. */
function band(row: number): { y: number; h: number } {
  return PEEK_ROWS.find(b => b.row === row) ?? { y: PEEK.y, h: 19 }
}

/**
 * A key for what the peek layer shows, so a report that changed nothing visible skips
 * the repaint.
 */
export function peekKey(lawn: LawnReport | null): string {
  if (!lawn) return ''
  let key = `${lawn.round}:${reportStripes(lawn.patches)}:`
  for (let i = 0; i < PEEK_ROW_COUNT * COLS; i++)
    key += String.fromCharCode(65 + ((lawn.patches[i] as number) & 0x3f))
  for (const m of lawn.markers) key += `${m.patch}.${m.kind},`
  return key
}

/**
 * Paints their four rows nearest the fence, squashed with distance and drawn greener
 * than they are, with weeds, holes, heaps and their junk 30% smaller. Heavy junk deeper
 * in shows on the horizon. With no report yet, their lawn is perfect and striped.
 */
export function paintPeekRows(
  ctx: CanvasRenderingContext2D,
  lawn: LawnReport | null,
  round: number,
  stamp: (kind: ItemKind) => CachedLayer
): void {
  const tint = PEEK_TINT[round] ?? PEEK_TINT[0]
  const stripes = lawn ? reportStripes(lawn.patches) : 0
  // From the horizon down, so nearer rows overlap further ones.
  for (const { row, y, h } of PEEK_ROWS) {
    for (let col = 0; col < COLS; col++) {
      const patch = row * COLS + col
      const byte = lawn?.patches[patch] ?? 0
      const top = patchTop(byte)
      ctx.save()
      ctx.translate(peekX(col * 50 + 50), y)
      ctx.scale(1, h / PATCH_D)
      paintPatch(ctx, 0, 0, patch + 7000, {
        level: lawn ? Math.min(HEALTH_MAX, patchHealth(byte) + tint) : 7,
        length: lawn ? patchLength(byte) : 1,
        // The lie hides their mess; only what you threw there and their heaps show.
        mess: top === Top.heap ? Mess.heap : Mess.none,
        hole: top === Top.hole,
        // Before their first report, next door looks perfectly striped.
        stripe: !lawn || (stripes >> col) & 1 ? (col % 2 === 0 ? 1 : 2) : 0,
        grey: false
      })
      ctx.restore()
    }
    if (!lawn) continue
    const scale = (h / PATCH_D) * PEEK_ITEM_SCALE
    for (let col = 0; col < COLS; col++) {
      const patch = row * COLS + col
      if (patchTop(lawn.patches[patch] as number) === Top.weed)
        drawScaled(ctx, stamp, 'weed', patch, 0, y + h * 0.75, scale)
    }
    lawn.markers.forEach((m, k) => {
      if (Math.floor(m.patch / COLS) === row)
        drawScaled(ctx, stamp, m.kind, m.patch, k + 1, y + h * 0.75, scale)
    })
  }
  if (lawn)
    lawn.markers.forEach((m, k) => {
      if (isHeavy(m.kind) && Math.floor(m.patch / COLS) >= PEEK_ROW_COUNT)
        drawScaled(ctx, stamp, m.kind, m.patch, k + 1, HORIZON_Y, HORIZON_SCALE)
    })
}

/** The hedge at their horizon, with round 1's bird singing on top. */
export function paintPeekFront(
  ctx: CanvasRenderingContext2D,
  round: number
): void {
  if (round === 0) paintSunRays(ctx)
  for (let x = 0; x < DESIGN_W; x += 28)
    sketchCircle(ctx, x + 8, PEEK.y - 16, 14, { ...HEDGE, seed: 300 + x })
  if (round === 0) paintBird(ctx, BIRD_X, PEEK.y - 26)
}

/** Where round 1's bird perches on their hedge. */
const BIRD_X = 186

/**
 * Stamps an item on their lawn at its patch's column, standing at `groundY`. Items after
 * the first in a patch shift sideways, so a pile stays readable.
 */
function drawScaled(
  ctx: CanvasRenderingContext2D,
  stamp: (kind: ItemKind) => CachedLayer,
  kind: ItemKind,
  patch: number,
  k: number,
  groundY: number,
  scale: number
): void {
  const { lx } = patchCenter(patch)
  const jitter = k === 0 ? 0 : (hash01(patch, k) - 0.5) * 30
  ctx.save()
  ctx.translate(peekX(lx + jitter), groundY)
  ctx.scale(scale, scale)
  stamp(kind).drawAt(ctx, 0, -ITEM_LIFT[kind])
  ctx.restore()
}

const HEDGE: SketchStyle = {
  fill: '#2f6b2a',
  color: '#1d4219',
  width: 2,
  wobble: 2
}
const SUN: SketchStyle = {
  fill: palette.yellow,
  width: 2.5,
  wobble: 1,
  seed: 81
}
const BIRD: SketchStyle = { fill: '#5b4a8a', width: 2, wobble: 0.8, seed: 82 }
const RAINBOW = [
  '#ff6b6b',
  '#ffa94d',
  '#ffe066',
  '#8ce99a',
  '#74c0fc',
  '#b197fc'
] as const

/** The sky behind their lawn. Round 1: the sun. Round 2: a rainbow. Round 3: clear. */
export function paintPeekBack(
  ctx: CanvasRenderingContext2D,
  round: number
): void {
  if (round === 1) {
    ctx.lineWidth = 6
    RAINBOW.forEach((color, k) => {
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.75
      ctx.beginPath()
      ctx.arc(DESIGN_W / 2, PEEK.y + 70, 190 - k * 6, Math.PI, 0)
      ctx.stroke()
    })
    ctx.globalAlpha = 1
    return
  }
  if (round !== 0) return
  ctx.strokeStyle = palette.orange
  ctx.lineWidth = 3
  ctx.beginPath()
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2
    ctx.moveTo(470 + Math.cos(a) * 26, 46 + Math.sin(a) * 26)
    ctx.lineTo(470 + Math.cos(a) * 36, 46 + Math.sin(a) * 36)
  }
  ctx.stroke()
  sketchCircle(ctx, 470, 46, 20, SUN)
}

/** Sunlight slanting onto their lawn from round 1's sun. */
function paintSunRays(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(255, 236, 140, 0.22)'
  ctx.beginPath()
  for (let k = 0; k < 4; k++) {
    ctx.moveTo(470, 46)
    ctx.lineTo(120 + k * 120, PEEK.y + 100)
    ctx.lineTo(170 + k * 120, PEEK.y + 100)
  }
  ctx.fill()
}

/** A round bird perched on their hedge, beak open mid-song. */
function paintBird(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  sketchEllipse(ctx, x, y, 11, 8, BIRD)
  sketchCircle(ctx, x + 9, y - 6, 6, BIRD)
  ctx.fillStyle = palette.orange
  ctx.beginPath()
  ctx.moveTo(x + 14, y - 8)
  ctx.lineTo(x + 21, y - 10)
  ctx.lineTo(x + 14, y - 5)
  ctx.fill()
  ctx.fillStyle = palette.ink
  ctx.fillRect(x + 9, y - 8, 2, 2)
}

/**
 * The live parts of the peek strip, drawn every frame: dust puffs where your throws
 * landed, the bird's song notes in round 1 and the sprinkler in round 3.
 */
export function drawPeekLive(
  ctx: CanvasRenderingContext2D,
  view: NeighbourView | null,
  round: number,
  now: number,
  time: number
): void {
  if (round === 0) drawNotes(ctx, time)
  if (round === 2) drawSprinkler(ctx, time)
  if (!view) return
  for (const puff of view.puffs) {
    const age = now - puff.at
    if (age < 0 || age >= PUFF_MS) continue
    drawPuff(ctx, puff.x, puff.row, age / PUFF_MS)
  }
}

/** A dust puff rising where a throw landed: in its peek row, or small on the horizon. */
function drawPuff(
  ctx: CanvasRenderingContext2D,
  theirLx: number,
  row: number,
  f: number
): void {
  const near = row < PEEK_ROW_COUNT
  const b = band(row)
  const x = LAWN.x + theirLx
  const y = near ? b.y + b.h * 0.7 : HORIZON_Y
  const size = near ? b.h / PATCH_D : HORIZON_SCALE
  ctx.globalAlpha = 0.7 * (1 - f)
  ctx.fillStyle = '#c9b48a'
  ctx.beginPath()
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2
    const r = (8 + f * 22) * size
    const cx = x + Math.cos(a) * r * 1.4
    const cy = y - f * 18 * size + Math.sin(a) * r * 0.5
    ctx.moveTo(cx + r, cy)
    ctx.arc(cx, cy, r * (0.7 + 0.3 * f), 0, Math.PI * 2)
  }
  ctx.fill()
  ctx.globalAlpha = 1
}

/** Two song notes floating up from the bird. */
function drawNotes(ctx: CanvasRenderingContext2D, time: number): void {
  ctx.fillStyle = palette.ink
  ctx.strokeStyle = palette.ink
  ctx.lineWidth = 1.5
  for (let k = 0; k < 2; k++) {
    const f = (time / 1600 + k / 2) % 1
    const x = BIRD_X + 26 + k * 10 + Math.sin(f * 6 + k) * 4
    const y = PEEK.y - 40 - f * 30
    ctx.globalAlpha = 1 - f
    ctx.beginPath()
    ctx.ellipse(x, y, 3, 2.2, -0.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x + 2.6, y)
    ctx.lineTo(x + 2.6, y - 9)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

/** Their sprinkler on row 1, sweeping arcs of water back and forth. */
function drawSprinkler(ctx: CanvasRenderingContext2D, time: number): void {
  const b = band(1)
  const x = SPRINKLER_X
  const y = b.y + b.h * 0.7
  ctx.fillStyle = '#7d858c'
  ctx.fillRect(x - 4, y - 10, 8, 10)
  const sweep = Math.sin(time / 600) * 1.1
  ctx.fillStyle = 'rgba(160, 215, 255, 0.95)'
  ctx.strokeStyle = 'rgba(40, 110, 180, 0.6)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let jet = -2; jet <= 2; jet++) {
    // Each jet throws drops up and out along a parabola.
    const spread = sweep + jet * 0.22
    for (let k = 0; k < 7; k++) {
      const f = (time / 700 + k / 7 + jet * 0.13) % 1
      const px = x + Math.sin(spread) * f * 120
      const py = y - 10 - f * 120 + f * f * 110
      ctx.moveTo(px + 3, py)
      ctx.arc(px, py, 3, 0, Math.PI * 2)
    }
  }
  ctx.fill()
  ctx.stroke()
}

/** Round 3's sprinkler stands on their row 1, off to one side of the caption. */
const SPRINKLER_X = LAWN.x + 160
