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

/**
 * Sketch art for Brenda's reveal: Brenda with her hat, glasses and clipboard, the prize
 * rosette, and her own perfect lawn, which turns out to be plastic.
 */

const HAT: SketchStyle = { fill: '#7048e8', width: 2.5, wobble: 1, seed: 181 }
const FACE: SketchStyle = { fill: '#f2d6bd', width: 2, wobble: 0.8, seed: 182 }
const CARDIGAN: SketchStyle = {
  fill: '#e64980',
  width: 2.5,
  wobble: 1.2,
  seed: 183
}
const SKIRT: SketchStyle = { fill: '#364fc7', width: 2, wobble: 1, seed: 184 }
const BOARD: SketchStyle = { fill: '#a0703f', width: 2, wobble: 0.8, seed: 185 }
const PAPER: SketchStyle = {
  fill: '#ffffff',
  width: 1.5,
  wobble: 0.6,
  seed: 186
}
const skirt = new Float64Array(8)

/** Where Brenda's stamp sits round her middle; her feet stand at y 56. */
export const BRENDA_RECT = { x: -40, y: -74, width: 84, height: 134 } as const

/** Brenda from Number 7: wide purple hat, glasses, pink cardigan and her clipboard. */
export function paintBrenda(ctx: CanvasRenderingContext2D): void {
  sketchLine(ctx, -6, 30, -7, 56, { width: 3 })
  sketchLine(ctx, 6, 30, 7, 56, { width: 3 })
  skirt[0] = -14
  skirt[1] = 10
  skirt[2] = 14
  skirt[3] = 10
  skirt[4] = 19
  skirt[5] = 36
  skirt[6] = -19
  skirt[7] = 36
  sketchPolygon(ctx, skirt, SKIRT)
  sketchRect(ctx, -17, -24, 34, 38, CARDIGAN)
  sketchCircle(ctx, 0, -38, 13, FACE)
  ctx.strokeStyle = palette.ink
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.arc(-5, -39, 4, 0, Math.PI * 2)
  ctx.moveTo(9, -39)
  ctx.arc(5, -39, 4, 0, Math.PI * 2)
  ctx.moveTo(-1, -39)
  ctx.lineTo(1, -39)
  ctx.moveTo(-4, -31)
  ctx.quadraticCurveTo(0, -29, 4, -31)
  ctx.stroke()
  sketchEllipse(ctx, 0, -50, 25, 6, HAT)
  sketchRect(ctx, -11, -68, 22, 18, HAT)
  sketchCircle(ctx, 7, -60, 3.5, { fill: palette.yellow, width: 1, seed: 187 })
  // Her arm out to the clipboard.
  sketchLine(ctx, 15, -14, 26, -4, { width: 3 })
  sketchRect(ctx, 20, -16, 20, 28, BOARD)
  sketchRect(ctx, 23, -11, 14, 20, PAPER)
  ctx.beginPath()
  for (let k = 0; k < 3; k++) {
    ctx.moveTo(25, -6 + k * 5)
    ctx.lineTo(35, -6 + k * 5)
  }
  ctx.stroke()
}

/** Where the rosette stamp sits round its centre. */
export const ROSETTE_RECT = { x: -34, y: -32, width: 68, height: 92 } as const

/** The prize rosette: blue petals, a gold heart and two red ribbon tails. Centred on its heart. */
export function paintRosette(ctx: CanvasRenderingContext2D): void {
  sketchPolygon(ctx, [-8, 14, -20, 56, -10, 48, -2, 58, 0, 18], {
    fill: palette.red,
    width: 2,
    seed: 191
  })
  sketchPolygon(ctx, [8, 14, 20, 56, 10, 48, 2, 58, 0, 18], {
    fill: '#a61e1e',
    width: 2,
    seed: 192
  })
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2
    sketchCircle(ctx, Math.cos(a) * 18, Math.sin(a) * 18, 10, {
      fill: palette.blue,
      width: 1.5,
      seed: 193 + k
    })
  }
  sketchCircle(ctx, 0, 0, 13, { fill: palette.yellow, width: 2, seed: 205 })
}

/** Where Brenda's plastic lawn is painted, in design units. */
export const PLASTIC_RECT = { x: 40, y: 330, width: 600, height: 420 } as const

/**
 * Brenda's own lawn: impossibly even stripes under a plastic shine, with a corner peeled
 * up to show the backing.
 */
export function paintPlasticLawn(ctx: CanvasRenderingContext2D): void {
  const { x, y, width, height } = PLASTIC_RECT
  for (let k = 0; k < 12; k++) {
    ctx.fillStyle = k % 2 ? '#3fd15b' : '#57e070'
    ctx.fillRect(x + k * 50, y, 50.5, height)
  }
  // A plastic shine: pale diagonal streaks, kept inside the lawn.
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, width, height)
  ctx.clip()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.lineWidth = 10
  ctx.beginPath()
  for (let k = -2; k < 8; k++) {
    ctx.moveTo(x + k * 110, y + height)
    ctx.lineTo(x + k * 110 + 180, y)
  }
  ctx.stroke()
  ctx.restore()
  sketchRect(ctx, x, y, width, height, { width: 3, wobble: 1, seed: 211 })
  // The peeled-up corner shows the backing and its label.
  sketchPolygon(
    ctx,
    [
      x + width,
      y + height - 90,
      x + width,
      y + height,
      x + width - 110,
      y + height
    ],
    { fill: '#e9ecef', width: 2.5, seed: 212 }
  )
  sketchText(ctx, '100% plastic', x + width - 40, y + height - 22, {
    size: 15,
    rotate: -0.68,
    color: palette.inkSoft
  })
}
