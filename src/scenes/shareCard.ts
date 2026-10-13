import { LAWN_D, LAWN_W } from '../game/tuning'
import { palette } from '../shared/palette'
import { setSketchScale, sketchRect, sketchText } from '../shared/sketch'
import { paintTrueLawn, readPack } from './trueLawn'

/** Each lawn's scale on the picture, and the gaps round it, in pixels. */
const K = 0.6
const GAP = 36
const NAME_H = 76

/**
 * The share card's picture: both true lawns from the deciding round side by side, yours
 * on the left, with both names under them. A lawn whose final never arrived shows as a
 * blank board with a question mark.
 */
export function lawnsPicture(
  mine: string | null,
  theirs: string | null,
  names: readonly [string, string]
): HTMLCanvasElement {
  const w = LAWN_W * K
  const h = LAWN_D * K
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * 2 + GAP * 3)
  canvas.height = Math.round(h + GAP * 2 + NAME_H)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  setSketchScale(ctx, 1)
  ctx.fillStyle = palette.paper
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ;[mine, theirs].forEach((pack, side) => {
    const x = GAP + side * (w + GAP)
    const lawn = pack ? readPack(pack) : null
    if (lawn) paintTrueLawn(ctx, x, GAP, K, lawn)
    else
      sketchText(ctx, '?', x + w / 2, GAP + h / 2, {
        font: 'marker',
        size: 140,
        color: palette.inkSoft
      })
    sketchRect(ctx, x - 4, GAP - 4, w + 8, h + 8, { width: 5, seed: side + 3 })
    sketchText(ctx, names[side] ?? '', x + w / 2, GAP + h + NAME_H / 2 + 8, {
      font: 'marker',
      size: 40,
      seed: side + 7
    })
  })
  return canvas
}
