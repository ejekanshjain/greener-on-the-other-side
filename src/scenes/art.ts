import { HEALTH_MAX, PATCH_D, PATCH_W } from '../game/tuning'
import { Mess, type ItemKind } from '../game/types'
import { hash01 } from '../shared/math'
import { palette } from '../shared/palette'
import {
  sketchCircle,
  sketchEllipse,
  sketchLine,
  sketchPolygon,
  sketchRect,
  sketchText,
  type SketchStyle
} from '../shared/sketch'
import { BED_POS, TAP_POS } from '../game/tuning'
import {
  paintBanana,
  paintBin,
  paintBinDown,
  paintCrisps,
  paintPizzaBox,
  paintSock,
  paintTrampoline,
  paintTrampolineFlat
} from './junkArt'
import { designX, designY, DESIGN_W, FENCE, PATIO, PEEK } from './layout'

/**
 * Grass colour by drawn health level, mud (0) to lush (7). Lightness rises about 9 L* per
 * level, also for protan and deutan viewers, so levels separate without colour vision.
 */
export const GRASS_RAMP = [
  '#372717',
  '#543b1f',
  '#6b5027',
  '#786a2d',
  '#738a36',
  '#60aa3d',
  '#64c64c',
  '#90dd66'
] as const

/** Grass colour for a drawn level, clamped to the ramp. */
export function grassColor(level: number): string {
  const i = Math.max(0, Math.min(HEALTH_MAX, Math.round(level)))
  return GRASS_RAMP[i] ?? GRASS_RAMP[0]
}

const INK_THIN: SketchStyle = { width: 2, wobble: 1.5 }

// ---------------------------------------------------------------- Items

/**
 * What a stamp shows: an item kind, or one of the extra looks. Sunk heavy junk lies flat
 * (`binDown`, `trampolineFlat`), and litter comes in 4 looks (`litter` is the crisp packet).
 */
export type StampKey =
  ItemKind | 'binDown' | 'trampolineFlat' | 'litter1' | 'litter2' | 'litter3'

const LITTER_KEYS = ['litter', 'litter1', 'litter2', 'litter3'] as const

/** The stamp for a litter look, 0 to 3. */
export function litterKey(look: number): StampKey {
  return LITTER_KEYS[look & 3] ?? 'litter'
}

/** Stamp rectangles centred on each item's visual centre, in design units. */
export const STAMP_RECT: Record<
  StampKey,
  { x: number; y: number; width: number; height: number }
> = {
  weed: { x: -24, y: -24, width: 48, height: 48 },
  dandelion: { x: -24, y: -34, width: 48, height: 62 },
  seedClock: { x: -24, y: -38, width: 48, height: 66 },
  snailShell: { x: -18, y: -18, width: 36, height: 36 },
  gnome: { x: -24, y: -30, width: 48, height: 60 },
  litter: { x: -20, y: -20, width: 40, height: 40 },
  litter1: { x: -20, y: -20, width: 40, height: 40 },
  litter2: { x: -20, y: -20, width: 40, height: 40 },
  litter3: { x: -20, y: -20, width: 40, height: 40 },
  bag: { x: -34, y: -30, width: 68, height: 60 },
  bin: { x: -36, y: -48, width: 72, height: 96 },
  binDown: { x: -54, y: -36, width: 106, height: 64 },
  mower: { x: -36, y: -28, width: 72, height: 98 },
  trampoline: { x: -46, y: -46, width: 92, height: 92 },
  trampolineFlat: { x: -76, y: -58, width: 156, height: 120 },
  seed: { x: -16, y: -14, width: 32, height: 28 }
}

const WEED_LEAF: SketchStyle = {
  fill: '#3f8f2f',
  color: palette.ink,
  width: 2,
  wobble: 1.5,
  seed: 4
}
const WEED_ROOT: SketchStyle = {
  fill: '#c9a26b',
  color: palette.ink,
  width: 2,
  wobble: 1,
  seed: 5
}
const leaf = new Float64Array(16)

/** A spiky weed: four jagged leaves round a pale root. Centred on (0, 0). */
export function paintWeed(ctx: CanvasRenderingContext2D): void {
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k - 2) * 0.55
    const len = 18 + (k % 2) * 4
    const cx = Math.cos(a)
    const cy = Math.sin(a)
    const nx = -cy * 5
    const ny = cx * 5
    leaf[0] = 0
    leaf[1] = 8
    leaf[2] = cx * len * 0.5 + nx
    leaf[3] = 8 + cy * len * 0.5 + ny
    leaf[4] = cx * len
    leaf[5] = 8 + cy * len
    leaf[6] = cx * len * 0.5 - nx
    leaf[7] = 8 + cy * len * 0.5 - ny
    WEED_LEAF.seed = 4 + k
    sketchPolygon(ctx, leaf, WEED_LEAF, 4)
  }
  sketchEllipse(ctx, 0, 10, 6, 4, WEED_ROOT)
}

const PETALS: SketchStyle = {
  fill: palette.yellow,
  width: 2,
  wobble: 1.5,
  seed: 8
}
const FLUFF: SketchStyle = {
  fill: 'rgba(255, 255, 255, 0.92)',
  color: '#8a8f94',
  width: 1.5,
  wobble: 1.5,
  seed: 9
}

/** A stalk from the leaves up to a flower head at (0, `top`). */
function stalk(ctx: CanvasRenderingContext2D, top: number): void {
  ctx.strokeStyle = '#3f7f2a'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(0, 6)
  ctx.quadraticCurveTo(3, top / 2, 0, top)
  ctx.stroke()
}

/** A dandelion: weed leaves with a yellow flower on a stalk. Centred like a weed. */
export function paintDandelion(ctx: CanvasRenderingContext2D): void {
  paintWeed(ctx)
  stalk(ctx, -18)
  sketchCircle(ctx, 0, -22, 10, PETALS)
  ctx.fillStyle = '#e8590c'
  ctx.beginPath()
  ctx.arc(0, -22, 3.5, 0, Math.PI * 2)
  ctx.fill()
}

/** A seed clock: weed leaves with a white puffball of seeds on a stalk. */
export function paintSeedClock(ctx: CanvasRenderingContext2D): void {
  paintWeed(ctx)
  stalk(ctx, -12)
  sketchCircle(ctx, 0, -22, 14, FLUFF)
  ctx.strokeStyle = 'rgba(120, 125, 130, 0.8)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    ctx.moveTo(Math.cos(a) * 3, -22 + Math.sin(a) * 3)
    ctx.lineTo(Math.cos(a) * 12, -22 + Math.sin(a) * 12)
  }
  ctx.stroke()
}

/** One dandelion seed drifting: a fluffy parachute on a short stem. Centred on (0, 0). */
export function paintSeed(ctx: CanvasRenderingContext2D): void {
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, 9)
  ctx.lineTo(0, 0)
  for (let k = 0; k < 7; k++) {
    const a = Math.PI + (k / 6) * Math.PI
    ctx.moveTo(0, 0)
    ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 9)
  }
  // A dark edge under white fluff, so seeds show on any grass.
  ctx.strokeStyle = 'rgba(60, 64, 68, 0.7)'
  ctx.lineWidth = 4
  ctx.stroke()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.lineCap = 'butt'
  ctx.fillStyle = '#6b4a2a'
  ctx.beginPath()
  ctx.ellipse(0, 9, 2, 3, 0, 0, Math.PI * 2)
  ctx.fill()
}

const GNOME_HAT: SketchStyle = {
  fill: palette.red,
  width: 2.5,
  wobble: 1.5,
  seed: 11
}
const GNOME_FACE: SketchStyle = {
  fill: '#f6c9a0',
  width: 2,
  wobble: 1,
  seed: 12
}
const GNOME_BEARD: SketchStyle = {
  fill: '#ffffff',
  width: 2,
  wobble: 1.5,
  seed: 13
}
const GNOME_COAT: SketchStyle = {
  fill: palette.blue,
  width: 2.5,
  wobble: 1.5,
  seed: 14
}
const hat = new Float64Array(6)

/** A garden gnome: red hat, white beard, blue coat. Centred on (0, 0). */
export function paintGnome(ctx: CanvasRenderingContext2D): void {
  sketchRect(ctx, -12, 4, 24, 22, GNOME_COAT)
  sketchEllipse(ctx, 0, 6, 11, 12, GNOME_BEARD)
  sketchCircle(ctx, 0, -6, 8, GNOME_FACE)
  hat[0] = -13
  hat[1] = -9
  hat[2] = 13
  hat[3] = -9
  hat[4] = 2
  hat[5] = -28
  sketchPolygon(ctx, hat, GNOME_HAT)
  ctx.fillStyle = palette.ink
  ctx.fillRect(-4, -8, 2.5, 2.5)
  ctx.fillRect(2, -8, 2.5, 2.5)
}

const SHELL: SketchStyle = { fill: '#b9773a', width: 2.5, wobble: 1, seed: 61 }
const SNAIL_BODY: SketchStyle = {
  fill: '#a9b59a',
  width: 2,
  wobble: 1,
  seed: 62
}

/** A snail shell with a spiral. Centred on (0, 0). */
export function paintShell(ctx: CanvasRenderingContext2D): void {
  sketchCircle(ctx, 0, 0, 12, SHELL)
  ctx.strokeStyle = palette.ink
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let k = 0; k <= 24; k++) {
    const a = k * 0.55
    const r = 1 + k * 0.38
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (k === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

/** A crawling snail facing right: body, eye stalks and its shell on top. Centred on the shell. */
export function paintSnail(ctx: CanvasRenderingContext2D): void {
  sketchEllipse(ctx, 4, 10, 20, 6, SNAIL_BODY)
  ctx.strokeStyle = palette.ink
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(18, 6)
  ctx.lineTo(22, -6)
  ctx.moveTo(14, 6)
  ctx.lineTo(16, -5)
  ctx.stroke()
  ctx.fillStyle = palette.ink
  ctx.beginPath()
  ctx.arc(22, -7, 2, 0, Math.PI * 2)
  ctx.arc(16, -6, 2, 0, Math.PI * 2)
  ctx.fill()
  paintShell(ctx)
}

/** The same snail facing left. */
export function paintSnailLeft(ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.scale(-1, 1)
  paintSnail(ctx)
  ctx.restore()
}

/** Where a crawling snail's stamp sits around its shell. */
export const SNAIL_RECT = { x: -28, y: -16, width: 56, height: 34 } as const

const BAG_SACK: SketchStyle = {
  fill: '#d8cfa8',
  width: 2.5,
  wobble: 1.5,
  seed: 71
}

/** The grass bag off the mower: a stuffed sack with cut grass poking out. Centred on (0, 0). */
export function paintBag(ctx: CanvasRenderingContext2D): void {
  sketchRect(ctx, -20, -12, 40, 34, BAG_SACK)
  ctx.strokeStyle = '#6f9a2e'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  for (let k = 0; k < 7; k++) {
    const x = -15 + k * 5
    ctx.moveTo(x, -10)
    ctx.lineTo(x + (k % 2 ? 3 : -3), -22 - (k % 3) * 3)
  }
  ctx.stroke()
  ctx.strokeStyle = palette.ink
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-12, -14)
  ctx.lineTo(12, -14)
  ctx.stroke()
}

/** The painter for a stamp. */
export function itemPainter(
  kind: StampKey
): (ctx: CanvasRenderingContext2D) => void {
  switch (kind) {
    case 'weed':
      return paintWeed
    case 'dandelion':
      return paintDandelion
    case 'seedClock':
      return paintSeedClock
    case 'seed':
      return paintSeed
    case 'gnome':
      return paintGnome
    case 'mower':
      return paintMower
    case 'snailShell':
      return paintShell
    case 'bag':
      return paintBag
    case 'bin':
      return paintBin
    case 'binDown':
      return paintBinDown
    case 'trampoline':
      return paintTrampoline
    case 'trampolineFlat':
      return paintTrampolineFlat
    case 'litter':
      return paintCrisps
    case 'litter1':
      return paintPizzaBox
    case 'litter2':
      return paintBanana
    case 'litter3':
      return paintSock
  }
}

// ---------------------------------------------------------------- Lawn

/** How a patch looks: the drawn health level and what lies on it. */
export interface PatchLook {
  /** Drawn health level, 0 (mud) to 7 (lush), after any tint. */
  level: number
  length: number
  mess: number
  hole: boolean
  /** 0 for no stripe, 1 for a light stripe, 2 for a dark one. */
  stripe: 0 | 1 | 2
  /** Your own lawn sits under a grey sky. */
  grey: boolean
}

/**
 * Paints one patch at design (x, y), 50 by 40, without drawing outside it: a base colour
 * by level, blades by health and length, cracks at level 2 or less, a mess mark, a hole,
 * the stripe overlay and the grey wash. Lightness and texture both change with health, so
 * levels read without colour vision.
 */
export function paintPatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  index: number,
  look: PatchLook
): void {
  const level = look.level
  ctx.fillStyle = grassColor(level)
  ctx.fillRect(x, y, PATCH_W + 0.5, PATCH_D + 0.5)
  // Blades: 2 plus 2 per level, as tall as the grass is long, kept inside the patch.
  ctx.strokeStyle =
    level >= 3 ? 'rgba(20, 60, 20, 0.45)' : 'rgba(60, 40, 20, 0.45)'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  const blades = 2 + level * 2
  const tall = 4 + look.length * 3
  for (let b = 0; b < blades; b++) {
    const bx = x + 4 + hash01(index, b * 2) * 42
    const by = y + tall + 3 + hash01(index, b * 2 + 1) * (PATCH_D - tall - 5)
    ctx.moveTo(bx, by)
    ctx.lineTo(bx + (hash01(index, b + 99) - 0.5) * 4, by - tall)
  }
  ctx.stroke()
  if (level <= 2) paintCracks(ctx, x, y, index, level)
  if (look.mess !== Mess.none) paintMess(ctx, x, y, index, look.mess)
  if (look.hole) paintHole(ctx, x, y, index)
  if (look.stripe) paintStripe(ctx, x, y, look.stripe)
  if (look.grey) {
    ctx.fillStyle = 'rgba(96, 102, 112, 0.14)'
    ctx.fillRect(x, y, PATCH_W + 0.5, PATCH_D + 0.5)
  }
}

/** Dry cracks: one at level 2, two at 1, three in bare mud. */
function paintCracks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  index: number,
  level: number
): void {
  ctx.strokeStyle = 'rgba(30, 18, 8, 0.75)'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  for (let k = 0; k < 3 - level; k++) {
    const cx = x + 11 + hash01(index, 300 + k * 2) * 28
    const cy = y + 12 + hash01(index, 301 + k * 2) * 16
    ctx.moveTo(cx - 9, cy - 4)
    ctx.lineTo(cx, cy)
    ctx.lineTo(cx + 7, cy - 6)
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + 2, cy + 8)
  }
  ctx.stroke()
}

/** The scribble for each mess mark. Mowing clears every one of them. */
function paintMess(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  index: number,
  mess: number
): void {
  const jx = hash01(index, 400) * 10 - 5
  const jy = hash01(index, 401) * 6 - 3
  const cx = x + PATCH_W / 2 + jx
  const cy = y + PATCH_D / 2 + jy
  ctx.beginPath()
  switch (mess) {
    case Mess.slime:
      // A silvery trail wriggling across the patch.
      ctx.strokeStyle = 'rgba(235, 240, 245, 0.6)'
      ctx.lineWidth = 2.5
      ctx.moveTo(x + 2, cy)
      for (let k = 1; k <= 6; k++)
        ctx.lineTo(x + 2 + k * 7.5, cy + (k % 2 ? -3 : 3))
      ctx.stroke()
      return
    case Mess.trample:
      // Paw prints.
      ctx.fillStyle = 'rgba(55, 38, 20, 0.7)'
      for (let k = 0; k < 2; k++) {
        const px = cx - 9 + k * 16
        const py = cy + (k ? -5 : 5)
        ctx.moveTo(px + 4, py)
        ctx.ellipse(px, py, 4, 3, 0, 0, Math.PI * 2)
        for (let t = 0; t < 3; t++) {
          ctx.moveTo(px - 3 + t * 3 + 1.4, py - 5)
          ctx.arc(px - 3 + t * 3, py - 5, 1.4, 0, Math.PI * 2)
        }
      }
      ctx.fill()
      return
    case Mess.scuff:
      ctx.strokeStyle = 'rgba(80, 50, 25, 0.75)'
      ctx.lineWidth = 2
      for (let k = 0; k < 4; k++) {
        ctx.moveTo(cx - 12 + k * 4, cy + 6)
        ctx.lineTo(cx - 6 + k * 4, cy - 4)
      }
      ctx.stroke()
      return
    case Mess.clippings:
      // Hatched cut grass.
      ctx.strokeStyle = 'rgba(150, 170, 60, 0.9)'
      ctx.lineWidth = 1.6
      for (let k = 0; k < 9; k++) {
        const px = x + 6 + hash01(index, 410 + k) * 36
        const py = y + 8 + hash01(index, 430 + k) * 24
        ctx.moveTo(px, py)
        ctx.lineTo(px + 5, py - 3)
      }
      ctx.stroke()
      return
    case Mess.wilt:
      // A curled brown dead weed.
      ctx.strokeStyle = 'rgba(110, 72, 30, 0.9)'
      ctx.lineWidth = 2
      ctx.moveTo(cx - 10, cy + 6)
      ctx.quadraticCurveTo(cx - 4, cy - 10, cx + 2, cy + 2)
      ctx.moveTo(cx + 2, cy + 6)
      ctx.quadraticCurveTo(cx + 8, cy - 8, cx + 12, cy)
      ctx.stroke()
      return
    case Mess.scalp:
      // A bald pale strip where the blades cut into the soil.
      ctx.fillStyle = 'rgba(196, 160, 110, 0.85)'
      ctx.fillRect(x + 14, y + 2, 22, PATCH_D - 4)
      ctx.strokeStyle = 'rgba(90, 60, 30, 0.6)'
      ctx.lineWidth = 1
      ctx.moveTo(x + 14, y + 6)
      ctx.lineTo(x + 14, y + PATCH_D - 4)
      ctx.moveTo(x + 36, y + 6)
      ctx.lineTo(x + 36, y + PATCH_D - 4)
      ctx.stroke()
      return
    case Mess.heap:
      // A mound of cut grass smothering the patch.
      ctx.fillStyle = '#9fb84e'
      ctx.ellipse(cx, cy + 2, 23, 16, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(70, 95, 25, 0.9)'
      ctx.lineWidth = 1.6
      for (let k = 0; k < 12; k++) {
        const px = cx - 18 + hash01(index, 450 + k) * 34
        const py = cy - 9 + hash01(index, 470 + k) * 20
        ctx.moveTo(px, py)
        ctx.lineTo(px + 5, py - 3)
      }
      ctx.stroke()
      return
    case Mess.flat:
      // Two ruts where heavy junk was dragged through, blades pressed flat between them.
      ctx.strokeStyle = 'rgba(70, 48, 22, 0.6)'
      ctx.lineWidth = 4
      ctx.moveTo(x + 13, y + 1)
      ctx.lineTo(x + 15, y + PATCH_D - 1)
      ctx.moveTo(x + 35, y + 1)
      ctx.lineTo(x + 37, y + PATCH_D - 1)
      ctx.stroke()
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(200, 220, 140, 0.5)'
      ctx.lineWidth = 1.5
      for (let k = 0; k < 4; k++) {
        ctx.moveTo(x + 18, y + 6 + k * 9)
        ctx.lineTo(x + 32, y + 9 + k * 9)
      }
      ctx.stroke()
      return
    case Mess.puddle:
      // Muddy water with a shine on it.
      ctx.fillStyle = 'rgba(84, 98, 104, 0.85)'
      ctx.ellipse(cx, cy + 2, 17, 10, 0.1, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(220, 235, 245, 0.8)'
      ctx.lineWidth = 2
      ctx.moveTo(cx - 8, cy - 2)
      ctx.lineTo(cx - 1, cy - 4)
      ctx.stroke()
      return
  }
}

/** A hole Biscuit dug: dark, with a rim of thrown-up dirt. */
function paintHole(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  index: number
): void {
  const cx = x + PATCH_W / 2 + hash01(index, 500) * 6 - 3
  const cy = y + PATCH_D / 2 + 2
  ctx.beginPath()
  ctx.fillStyle = '#8a6239'
  ctx.ellipse(cx, cy, 19, 13, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.fillStyle = '#20140a'
  ctx.ellipse(cx, cy + 1, 14, 9, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** A mown stripe: a light or dark wash with fine parallel lines, so it reads without colour. */
function paintStripe(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  stripe: 1 | 2
): void {
  const light = stripe === 1
  ctx.fillStyle = light ? 'rgba(255, 255, 230, 0.16)' : 'rgba(0, 30, 0, 0.14)'
  ctx.fillRect(x, y, PATCH_W + 0.5, PATCH_D + 0.5)
  ctx.strokeStyle = light ? 'rgba(255, 255, 230, 0.35)' : 'rgba(0, 30, 0, 0.3)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let lx = x + 5; lx < x + PATCH_W; lx += 8) {
    ctx.moveTo(lx, y)
    ctx.lineTo(lx, y + PATCH_D)
  }
  ctx.stroke()
}

// ---------------------------------------------------------------- Static scenery

const PLANK: SketchStyle = {
  fill: '#b07a45',
  color: palette.ink,
  width: 2.5,
  wobble: 1.5
}
const RAIL: SketchStyle = {
  fill: '#8d5524',
  color: palette.ink,
  width: 2,
  wobble: 1
}
const HEDGE: SketchStyle = {
  fill: '#2f6b2a',
  color: '#1d4219',
  width: 2,
  wobble: 2
}
const SLAB: SketchStyle = {
  fill: '#cfc6b4',
  color: '#8b8272',
  width: 2,
  wobble: 1.5
}

/** The fence, the side hedges and the patio. */
export function paintScenery(ctx: CanvasRenderingContext2D): void {
  for (let x = 0; x < DESIGN_W; x += 34) {
    PLANK.seed = 50 + x
    sketchRect(ctx, x, FENCE.y - 4, 34, FENCE.h + 4, PLANK)
  }
  RAIL.seed = 7
  sketchRect(ctx, -4, FENCE.y + 8, DESIGN_W + 8, 7, RAIL)
  for (let y = FENCE.y + FENCE.h; y < PATIO.y; y += 38) {
    sketchCircle(ctx, 18, y + 18, 26, { ...HEDGE, seed: 100 + y })
    sketchCircle(ctx, DESIGN_W - 18, y + 18, 26, { ...HEDGE, seed: 200 + y })
  }
  ctx.fillStyle = '#d9d1bf'
  ctx.fillRect(0, PATIO.y, DESIGN_W, PATIO.h)
  for (let row = 0; row < 3; row++) {
    for (let x = (row % 2) * -40; x < DESIGN_W; x += 80) {
      SLAB.seed = 400 + row * 31 + x
      sketchRect(ctx, x + 2, PATIO.y + 6 + row * 60, 76, 54, SLAB)
    }
  }
  sketchLine(ctx, 0, PATIO.y, DESIGN_W, PATIO.y, INK_THIN)
  paintPatioProps(ctx)
}

// ---------------------------------------------------------------- Patio

const POST: SketchStyle = { fill: '#9a6a3c', width: 2.5, wobble: 1.2, seed: 31 }
const BRASS: SketchStyle = { fill: '#d6a93a', width: 2.5, wobble: 1, seed: 32 }
const COMPOST: SketchStyle = {
  fill: '#3f5f34',
  width: 2.5,
  wobble: 1.5,
  seed: 33
}
const SHED: SketchStyle = { fill: '#8a5a32', width: 3, wobble: 1.5, seed: 34 }
const SHED_DOOR: SketchStyle = {
  fill: '#a8703f',
  width: 2.5,
  wobble: 1.2,
  seed: 35
}

/** Where the tap's spout pours, in design units. */
export const TAP_SPOUT = {
  x: designX(TAP_POS.lx) + 16,
  y: designY(TAP_POS.ly) + 16
} as const

/** The static patio props: the tap on its post, the compost bin and the shed. */
function paintPatioProps(ctx: CanvasRenderingContext2D): void {
  const tx = designX(TAP_POS.lx)
  const ty = designY(TAP_POS.ly)
  sketchRect(ctx, tx - 24, ty - 26, 16, 118, POST)
  sketchRect(ctx, tx - 10, ty - 4, 30, 9, BRASS)
  sketchRect(ctx, tx + 12, ty + 2, 9, 14, BRASS)
  // The compost bin, where the grass bag empties.
  sketchRect(ctx, 352, 902, 96, 80, COMPOST)
  ctx.strokeStyle = 'rgba(20, 35, 15, 0.6)'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let y = 922; y < 980; y += 16) {
    ctx.moveTo(356, y)
    ctx.lineTo(444, y)
  }
  ctx.stroke()
  sketchText(ctx, 'Compost', 400, 896, {
    font: 'hand',
    size: 18,
    color: palette.ink,
    seed: 5
  })
  // Biscuit's bed: a squashed cushion with a raised rim.
  const bx = designX(BED_POS.lx)
  const by = designY(BED_POS.ly) + 4
  sketchEllipse(ctx, bx, by, 46, 22, BED_RIM)
  sketchEllipse(ctx, bx, by + 2, 34, 14, BED_CUSHION)
  // The shed, with its door shut until the finale.
  sketchRect(ctx, 584, 884, 130, 190, SHED)
  sketchRect(ctx, 600, 920, 64, 140, SHED_DOOR)
  sketchCircle(ctx, 652, 990, 4, { fill: palette.ink, width: 0, seed: 36 })
}

const BED_RIM: SketchStyle = {
  fill: '#6c4a86',
  width: 2.5,
  wobble: 1.5,
  seed: 37
}
const BED_CUSHION: SketchStyle = {
  fill: '#c3a2d9',
  width: 2,
  wobble: 1.2,
  seed: 38
}

const CAN_BODY: SketchStyle = {
  fill: '#4f8f74',
  width: 2.5,
  wobble: 1.2,
  seed: 41
}
const CAN_ROSE: SketchStyle = {
  fill: '#3d7560',
  width: 2,
  wobble: 0.8,
  seed: 42
}
const spout = new Float64Array(8)

/** The window on the can's side where its water level shows, in can units. */
export const CAN_WINDOW = { x: 4, y: -7, w: 9, h: 20 } as const

/** The watering can, centred on its body, spout to the left. */
export function paintCan(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = palette.ink
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(-10, -12)
  ctx.quadraticCurveTo(0, -30, 12, -12)
  ctx.stroke()
  spout[0] = -16
  spout[1] = 2
  spout[2] = -38
  spout[3] = -14
  spout[4] = -36
  spout[5] = -18
  spout[6] = -16
  spout[7] = -6
  sketchPolygon(ctx, spout, CAN_BODY)
  sketchEllipse(ctx, -40, -16, 5, 7, CAN_ROSE)
  sketchRect(ctx, -18, -12, 36, 28, CAN_BODY)
  ctx.fillStyle = '#e8f4fb'
  ctx.fillRect(CAN_WINDOW.x, CAN_WINDOW.y, CAN_WINDOW.w, CAN_WINDOW.h)
  ctx.strokeStyle = palette.ink
  ctx.lineWidth = 1.5
  ctx.strokeRect(CAN_WINDOW.x, CAN_WINDOW.y, CAN_WINDOW.w, CAN_WINDOW.h)
}

const DECK: SketchStyle = {
  fill: palette.red,
  width: 2.5,
  wobble: 1.2,
  seed: 51
}
const WHEEL: SketchStyle = { fill: '#333333', width: 2, wobble: 0.6, seed: 52 }
const SACK: SketchStyle = { fill: '#d8cfa8', width: 2, wobble: 1.5, seed: 53 }

/** The grass bag on the mower, where its fill shows, in mower units. */
export const MOWER_BAG = { x: -17, y: 20, w: 34, h: 24 } as const

/** The push mower without its bag, while the bag is in your hand. */
export function paintMowerBare(ctx: CanvasRenderingContext2D): void {
  paintMower(ctx, false)
}

/** The push mower from above: the deck at (0, 0), its bag and handle toward you. */
export function paintMower(
  ctx: CanvasRenderingContext2D,
  withBag = true
): void {
  ctx.strokeStyle = palette.ink
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(-14, 14)
  ctx.lineTo(-20, 62)
  ctx.moveTo(14, 14)
  ctx.lineTo(20, 62)
  ctx.moveTo(-24, 62)
  ctx.lineTo(24, 62)
  ctx.stroke()
  if (withBag)
    sketchRect(ctx, MOWER_BAG.x, MOWER_BAG.y, MOWER_BAG.w, MOWER_BAG.h, SACK)
  for (const [x, y] of [
    [-24, -14],
    [24, -14],
    [-24, 12],
    [24, 12]
  ] as const) {
    WHEEL.seed = 52 + x + y
    sketchCircle(ctx, x, y, 6, WHEEL)
  }
  sketchRect(ctx, -22, -18, 44, 34, DECK)
}

// ---------------------------------------------------------------- Characters

const DOG_FUR: SketchStyle = {
  fill: '#d39a5a',
  width: 2.5,
  wobble: 1.2,
  seed: 81
}
const DOG_EAR: SketchStyle = { fill: '#8a5a2b', width: 2, wobble: 1, seed: 82 }
const DOG_SNOUT: SketchStyle = {
  fill: '#f0d2a8',
  width: 2,
  wobble: 0.8,
  seed: 83
}

/** Where Biscuit's stamps sit around his body centre, facing right. */
export const DOG_RECT = { x: -34, y: -36, width: 92, height: 58 } as const
/** The same, facing left. */
export const DOG_RECT_LEFT = { x: -58, y: -36, width: 92, height: 58 } as const

/**
 * Biscuit standing, facing right: a blob body, a round head with a floppy ear, a snout and
 * a red collar. Centred on his body; legs and tail are drawn live so they can move.
 */
export function paintDog(ctx: CanvasRenderingContext2D): void {
  sketchEllipse(ctx, 0, 0, 27, 14, DOG_FUR)
  sketchCircle(ctx, 27, -14, 14, { ...DOG_FUR, seed: 84 })
  sketchEllipse(ctx, 39, -10, 9, 6, DOG_SNOUT)
  sketchEllipse(ctx, 19, -8, 6, 12, DOG_EAR)
  ctx.strokeStyle = palette.red
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(15, -4)
  ctx.lineTo(19, 6)
  ctx.stroke()
  ctx.fillStyle = palette.ink
  ctx.beginPath()
  ctx.arc(47, -11, 3.2, 0, Math.PI * 2)
  ctx.arc(31, -19, 2.4, 0, Math.PI * 2)
  ctx.fill()
}

/** Biscuit facing left. */
export function paintDogLeft(ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.scale(-1, 1)
  paintDog(ctx)
  ctx.restore()
}

/** Biscuit asleep, curled up with his head on his paws. Centred on his body. */
export function paintDogAsleep(ctx: CanvasRenderingContext2D): void {
  sketchEllipse(ctx, 0, 3, 28, 14, DOG_FUR)
  sketchCircle(ctx, 18, 0, 13, { ...DOG_FUR, seed: 85 })
  sketchEllipse(ctx, 12, 4, 6, 10, DOG_EAR)
  ctx.strokeStyle = palette.ink
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(22, -3, 4, 0.2, Math.PI - 0.2)
  ctx.stroke()
}

const SKIN = ['#f6c9a0', '#e0a77a', '#c68a5c', '#8d5a3b', '#f2d6bd'] as const
const HAIR = ['#3b2a1a', '#7a4a1f', '#d8b04a', '#a33a1f', '#222222'] as const

/** Where the neighbour's head stamp sits around its centre. */
export const HEAD_RECT = { x: -34, y: -40, width: 68, height: 76 } as const

/**
 * The neighbour's head, looking over the fence: skin and hair picked by `seed`, with
 * angry eyebrows when `angry`. Mr Pemberton (`pemberton`) is bald with a grey moustache.
 * Centred on the face.
 */
export function paintHead(
  ctx: CanvasRenderingContext2D,
  seed: number,
  angry: boolean,
  pemberton = false
): void {
  const skin = pemberton
    ? '#f0c8a8'
    : (SKIN[Math.floor(hash01(seed, 1) * SKIN.length)] ?? SKIN[0])
  const hair = HAIR[Math.floor(hash01(seed, 2) * HAIR.length)] ?? HAIR[0]
  sketchCircle(ctx, 0, 0, 24, { fill: skin, width: 2.5, wobble: 1.2, seed })
  ctx.lineCap = 'round'
  if (pemberton) {
    // A shine on the bald top, and a bushy grey moustache.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(-6, -10, 9, Math.PI * 1.15, Math.PI * 1.55)
    ctx.stroke()
    ctx.strokeStyle = '#8a8a8a'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(-13, 11)
    ctx.quadraticCurveTo(-6, 4, 0, 8)
    ctx.quadraticCurveTo(6, 4, 13, 11)
    ctx.stroke()
  } else {
    // A hair scribble across the top of the head.
    ctx.strokeStyle = hair
    ctx.lineWidth = 5
    ctx.beginPath()
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI * (1.05 + (k / 8) * 0.9)
      const r = 22 + hash01(seed, 10 + k) * 8
      const x = Math.cos(a) * r
      const y = Math.sin(a) * r - 4
      if (k === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.fillStyle = palette.ink
  ctx.beginPath()
  ctx.arc(-8, -2, 2.6, 0, Math.PI * 2)
  ctx.arc(8, -2, 2.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = palette.ink
  ctx.lineWidth = 2.5
  ctx.beginPath()
  if (angry) {
    ctx.moveTo(-14, -12)
    ctx.lineTo(-3, -7)
    ctx.moveTo(14, -12)
    ctx.lineTo(3, -7)
  } else {
    // A smug raised brow.
    ctx.moveTo(-13, -9)
    ctx.lineTo(-4, -10)
    ctx.moveTo(4, -13)
    ctx.lineTo(13, -10)
  }
  ctx.stroke()
  ctx.lineCap = 'butt'
}

/** Where the fist stamp sits round its knuckles. */
export const FIST_RECT = { x: -22, y: -22, width: 44, height: 56 } as const

/** A shaken fist: a mitten of knuckles on a sleeve, centred on the knuckles. */
export function paintFist(ctx: CanvasRenderingContext2D): void {
  sketchRect(ctx, -9, 10, 18, 22, {
    fill: '#5c7cfa',
    width: 2,
    wobble: 1,
    seed: 301
  })
  sketchCircle(ctx, 0, 0, 15, {
    fill: '#f0c8a8',
    width: 2.5,
    wobble: 1.2,
    seed: 302
  })
  ctx.strokeStyle = palette.ink
  ctx.lineWidth = 2
  ctx.beginPath()
  for (const x of [-6, 0, 6]) {
    ctx.moveTo(x, -12)
    ctx.lineTo(x, -4)
  }
  ctx.stroke()
}

/** Sky, their roof and extra hedge outside the design, across the whole visible area. */
export function paintBackdrop(
  ctx: CanvasRenderingContext2D,
  view: { x: number; y: number; width: number; height: number }
): void {
  // Your side always gets an overcast sky.
  const sky = ctx.createLinearGradient(0, view.y, 0, PEEK.y)
  sky.addColorStop(0, '#aeb4ba')
  sky.addColorStop(1, '#d6dad9')
  ctx.fillStyle = sky
  ctx.fillRect(view.x, view.y, view.width, PEEK.y - view.y + 1)
  for (let k = 0; k < 3; k++)
    sketchEllipse(
      ctx,
      DESIGN_W * (0.18 + k * 0.33),
      PEEK.y - 150 - (k % 2) * 60,
      90,
      26,
      { fill: '#c3c8cc', color: '#9aa0a6', width: 2, seed: 60 + k }
    )
  // Their roof peeks over the hedge when the screen has spare height.
  sketchPolygon(
    ctx,
    [
      DESIGN_W * 0.2,
      PEEK.y - 10,
      DESIGN_W * 0.5,
      PEEK.y - 120,
      DESIGN_W * 0.8,
      PEEK.y - 10
    ],
    { fill: '#9c4a3a', width: 3, seed: 77 }
  )
  const bottom = view.y + view.height
  const right = view.x + view.width
  ctx.fillStyle = '#2f6b2a'
  ctx.fillRect(view.x, PEEK.y, -view.x, bottom - PEEK.y)
  ctx.fillRect(DESIGN_W, PEEK.y, right - DESIGN_W, bottom - PEEK.y)
  // Wide screens get more hedge either side, and the big shed on the right.
  paintSideHedge(ctx, view.x, 0, bottom, 1)
  paintSideHedge(ctx, DESIGN_W, right, bottom, 2)
  // The shed shrinks to fit narrower spare widths, and stays away when it would be tiny.
  const spare = right - DESIGN_W
  const k = Math.min(1, (spare - 40) / SHED_SPAN)
  if (k < 0.45) return
  ctx.save()
  ctx.translate(DESIGN_W + spare / 2, PATIO.y + PATIO.h)
  ctx.scale(k, k)
  paintBigShed(ctx)
  ctx.restore()
}

/** Hedge clump fills, darkest at the back, so the wall of hedge has depth. */
const HEDGE_FILLS = ['#285d24', '#2f6b2a', '#3a7a33'] as const

/**
 * Rows of leafy hedge clumps from the peek strip down, between design x `from` and `to`.
 * It paints once per resize into the cached backdrop.
 */
function paintSideHedge(
  ctx: CanvasRenderingContext2D,
  from: number,
  to: number,
  bottom: number,
  side: number
): void {
  if (to - from < 8) return
  let row = 0
  for (let y = PEEK.y + 10; y < bottom + 40; y += 44, row++) {
    for (let x = from - 30 + (row % 2) * 28; x < to + 30; x += 56) {
      const k = side * 7919 + row * 131 + Math.round(x)
      sketchCircle(
        ctx,
        x + (hash01(k, 1) - 0.5) * 18,
        y + (hash01(k, 2) - 0.5) * 12,
        34 + hash01(k, 3) * 8,
        { ...HEDGE, fill: HEDGE_FILLS[row % 3], seed: k }
      )
    }
  }
}

const SHED_ROOF: SketchStyle = { fill: '#4b4f54', width: 3, seed: 81 }
const SHED_WINDOW: SketchStyle = { fill: '#cfe0e6', width: 2.5, seed: 82 }
const GRAVEL: SketchStyle = {
  fill: '#b9ad97',
  color: '#8b8272',
  width: 2,
  seed: 83
}
const BRACE: SketchStyle = { color: '#6b4426', width: 5, wobble: 1, seed: 84 }

/** The big shed's width with its roof and gravel, in design units. */
const SHED_SPAN = 380

/**
 * The big shed in the spare width beside the garden, standing on (0, 0). A gnome peers
 * out of its window: the crate inside is waiting for 0:40.
 */
function paintBigShed(ctx: CanvasRenderingContext2D): void {
  const w = 300
  const h = 300
  const cx = 0
  const base = 0
  const x = -w / 2
  const y = -h
  sketchEllipse(ctx, cx, base + 6, w / 2 + 40, 26, GRAVEL)
  sketchRect(ctx, x, y, w, h, { ...SHED, seed: 85 })
  // Planks.
  ctx.strokeStyle = 'rgba(40, 22, 10, 0.45)'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let px = x + 30; px < x + w - 10; px += 30) {
    ctx.moveTo(px, y + 6)
    ctx.lineTo(px + 1, base - 4)
  }
  ctx.stroke()
  sketchPolygon(ctx, [x - 24, y + 4, cx, y - 110, x + w + 24, y + 4], SHED_ROOF)
  // The door, with a Z brace and a padlock.
  const dx = x + 36
  const dy = y + 70
  sketchRect(ctx, dx, dy, 110, h - 70, { ...SHED_DOOR, seed: 86 })
  sketchLine(ctx, dx + 10, dy + 30, dx + 100, dy + 30, BRACE)
  sketchLine(ctx, dx + 10, base - 30, dx + 100, base - 30, BRACE)
  sketchLine(ctx, dx + 12, base - 34, dx + 98, dy + 34, BRACE)
  sketchRect(ctx, dx + 90, dy + 110, 14, 18, { ...BRASS, seed: 87 })
  // The window, with a gnome looking out.
  const wx = x + 180
  const wy = y + 70
  sketchRect(ctx, wx, wy, 90, 80, SHED_WINDOW)
  ctx.save()
  ctx.beginPath()
  ctx.rect(wx + 3, wy + 3, 84, 74)
  ctx.clip()
  ctx.translate(wx + 46, wy + 62)
  ctx.scale(1.4, 1.4)
  paintGnome(ctx)
  ctx.restore()
  sketchLine(ctx, wx + 45, wy + 2, wx + 45, wy + 78, INK_THIN)
  sketchLine(ctx, wx + 2, wy + 40, wx + 88, wy + 40, INK_THIN)
}

/** The peek strip's caption for a round: the greener lie grows each round. */
export function paintCaption(
  ctx: CanvasRenderingContext2D,
  caption: string
): void {
  sketchText(ctx, caption, DESIGN_W / 2, PEEK.y - 2, {
    font: 'marker',
    size: 20,
    color: '#ffffff',
    outline: '#2d5a1f',
    tilt: 0.04,
    seed: 3
  })
}
