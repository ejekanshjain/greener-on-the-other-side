import { palette } from '../shared/palette'
import {
  sketchCircle,
  sketchEllipse,
  sketchLine,
  sketchPolygon,
  sketchRect,
  type SketchStyle
} from '../shared/sketch'

/**
 * Sketch art for the finale's junk: the wheelie bin, the trampoline, the 4 kinds of
 * litter, and the shed standing open. Each stamp is centred on (0, 0).
 */

const BIN_BODY: SketchStyle = {
  fill: '#3c6e47',
  width: 2.5,
  wobble: 1.2,
  seed: 141
}
const BIN_LID: SketchStyle = {
  fill: '#2b5234',
  width: 2.5,
  wobble: 1,
  seed: 142
}
const WHEEL: SketchStyle = { fill: '#333333', width: 2, wobble: 0.6, seed: 143 }
const binShape = new Float64Array(8)

/** The wheelie bin standing upright, lid shut, wheels at the bottom. */
export function paintBin(ctx: CanvasRenderingContext2D): void {
  binShape[0] = -26
  binShape[1] = -30
  binShape[2] = 26
  binShape[3] = -30
  binShape[4] = 22
  binShape[5] = 32
  binShape[6] = -22
  binShape[7] = 32
  sketchPolygon(ctx, binShape, BIN_BODY)
  sketchRect(ctx, -30, -40, 60, 11, BIN_LID)
  sketchCircle(ctx, -15, 35, 6, WHEEL)
  sketchCircle(ctx, 15, 35, 6, WHEEL)
  sketchLine(ctx, -14, -18, -14, 22, { width: 1.5, color: '#2b5234' })
  sketchLine(ctx, 14, -18, 14, 22, { width: 1.5, color: '#2b5234' })
}

/** The wheelie bin knocked flat on its side with its lid flung open. Centred on the ground. */
export function paintBinDown(ctx: CanvasRenderingContext2D): void {
  // A dark stain of a week's rubbish leaking out of the open end.
  ctx.fillStyle = 'rgba(60, 45, 25, 0.45)'
  ctx.beginPath()
  ctx.ellipse(22, 6, 26, 14, 0, 0, Math.PI * 2)
  ctx.fill()
  sketchRect(ctx, -44, -18, 64, 34, BIN_BODY)
  binShape[0] = 20
  binShape[1] = -22
  binShape[2] = 30
  binShape[3] = -30
  binShape[4] = 44
  binShape[5] = 8
  binShape[6] = 34
  binShape[7] = 16
  sketchPolygon(ctx, binShape, BIN_LID)
  sketchCircle(ctx, -40, -20, 6, WHEEL)
  sketchCircle(ctx, -40, 18, 6, WHEEL)
}

const PAD: SketchStyle = { fill: '#1c7ed6', width: 2.5, wobble: 1, seed: 151 }
const MAT: SketchStyle = { fill: '#212529', width: 2, wobble: 0.8, seed: 152 }

/** The trampoline rolling on its side like a wheel: padded rim, black mat, springs. */
export function paintTrampoline(ctx: CanvasRenderingContext2D): void {
  sketchCircle(ctx, 0, 0, 40, PAD)
  sketchCircle(ctx, 0, 0, 30, MAT)
  ctx.strokeStyle = '#adb5bd'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    ctx.moveTo(Math.cos(a) * 30, Math.sin(a) * 30)
    ctx.lineTo(Math.cos(a) * 37, Math.sin(a) * 37)
  }
  ctx.stroke()
}

/** The trampoline lying flat where it landed, filling its 3 by 3 patch footprint. */
export function paintTrampolineFlat(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'
  ctx.beginPath()
  ctx.ellipse(4, 8, 70, 50, 0, 0, Math.PI * 2)
  ctx.fill()
  sketchEllipse(ctx, 0, 0, 70, 52, PAD)
  sketchEllipse(ctx, 0, 0, 56, 40, MAT)
  ctx.strokeStyle = '#adb5bd'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2
    ctx.moveTo(Math.cos(a) * 56, Math.sin(a) * 40)
    ctx.lineTo(Math.cos(a) * 66, Math.sin(a) * 49)
  }
  ctx.stroke()
}

const FOIL: SketchStyle = { fill: '#e03131', width: 2, wobble: 1, seed: 161 }
const BOX: SketchStyle = { fill: '#c99a5b', width: 2, wobble: 1, seed: 162 }
const PEEL: SketchStyle = { fill: '#fcc419', width: 2, wobble: 1.2, seed: 163 }
const SOCK: SketchStyle = { fill: '#f8f9fa', width: 2, wobble: 1.2, seed: 164 }
const peel = new Float64Array(12)

/** A crumpled crisp packet. */
export function paintCrisps(ctx: CanvasRenderingContext2D): void {
  sketchRect(ctx, -11, -9, 22, 18, FOIL)
  ctx.fillStyle = palette.yellow
  ctx.beginPath()
  ctx.arc(0, 0, 5, 0, Math.PI * 2)
  ctx.fill()
  sketchLine(ctx, -13, -9, 13, -9, { width: 2 })
  sketchLine(ctx, -13, 9, 13, 9, { width: 2 })
}

/** A greasy pizza box, lid shut. */
export function paintPizzaBox(ctx: CanvasRenderingContext2D): void {
  sketchRect(ctx, -15, -13, 30, 26, BOX)
  ctx.fillStyle = 'rgba(150, 90, 20, 0.45)'
  ctx.beginPath()
  ctx.ellipse(4, 3, 6, 4, 0.4, 0, Math.PI * 2)
  ctx.fill()
  sketchLine(ctx, -15, -6, 15, -6, { width: 1.5 })
}

/** A banana skin with its three flaps splayed. */
export function paintBanana(ctx: CanvasRenderingContext2D): void {
  peel[0] = 0
  peel[1] = -4
  peel[2] = -14
  peel[3] = -12
  peel[4] = -4
  peel[5] = 2
  peel[6] = 0
  peel[7] = 12
  peel[8] = 4
  peel[9] = 2
  peel[10] = 14
  peel[11] = -11
  sketchPolygon(ctx, peel, PEEL)
  ctx.fillStyle = '#5c3d0f'
  ctx.fillRect(-2, -7, 4, 4)
}

/** One odd sock, striped. */
export function paintSock(ctx: CanvasRenderingContext2D): void {
  sketchRect(ctx, -6, -14, 11, 20, SOCK)
  sketchEllipse(ctx, 3, 8, 11, 6, SOCK)
  ctx.strokeStyle = palette.red
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-5, -10)
  ctx.lineTo(4, -10)
  ctx.moveTo(-5, -5)
  ctx.lineTo(4, -5)
  ctx.stroke()
}

const DOORWAY: SketchStyle = {
  fill: '#2b1d12',
  width: 2.5,
  wobble: 1,
  seed: 171
}
const OPEN_DOOR: SketchStyle = {
  fill: '#a8703f',
  width: 2.5,
  wobble: 1.2,
  seed: 172
}
const door = new Float64Array(8)

/** Where the shed's open door is drawn, in design units. */
export const SHED_OPEN_RECT = { x: 540, y: 900, width: 140, height: 170 }

/** The shed with its door banged open: a dark doorway and the door swung out. */
export function paintShedOpen(ctx: CanvasRenderingContext2D): void {
  sketchRect(ctx, 600, 920, 64, 140, DOORWAY)
  door[0] = 600
  door[1] = 920
  door[2] = 566
  door[3] = 906
  door[4] = 566
  door[5] = 1064
  door[6] = 600
  door[7] = 1060
  sketchPolygon(ctx, door, OPEN_DOOR)
}
