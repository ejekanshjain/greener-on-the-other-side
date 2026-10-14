import type { Garden } from '../game/garden'
import { patchCenter } from '../game/grid'
import { ITEM_LIFT, ITEM_RADIUS } from '../game/items'
import type { TipSpot, TipTarget } from '../game/tipQueue'
import { FENCE_TOP_H, LAWN_D, PATCH_D, PATCH_W, TAP_POS } from '../game/tuning'
import { palette } from '../shared/palette'
import { DESIGN_W, designX, designY, LAWN } from './layout'

/** A column's outline starts at this row, so the front rows stay clear. */
export const OUTLINE_ROW = 2
/**
 * How far above the lawn's top edge the tip line reaches, in design units. On a 375 px
 * phone its 18 px line is about 29 px tall, which is 55 design units.
 */
export const TIP_BAND_H = 56
/** Where the vane's arm turns, in design units. */
const VANE_Y = designY(0, FENCE_TOP_H) - 30
/** The arrow bobs this far, over this period, unless Reduced Motion is on. */
const BOB = 6
const BOB_MS = 900
/** The arrow's length, point to tail. */
const ARROW_H = 32

/** The design point an arrow points down at, and the object's own middle. */
export interface PointerSpot {
  x: number
  /** Where the arrow's tip sits: just above the object. */
  y: number
  /** The object's drawn middle, which decides whether the tip line covers it. */
  midY: number
}

/**
 * Where a tip's arrow points: just above its object. Null when the object is gone, or
 * sits in your hand, where the finger, the lift ring or the compost ring already shows.
 */
export function pointerSpot(
  garden: Garden,
  target: TipTarget
): PointerSpot | null {
  switch (target.kind) {
    case 'item': {
      const item = garden.item(target.id)
      if (!item || item.state === 'held' || item.state === 'sunk') return null
      const mid = designY(item.ly, item.h + ITEM_LIFT[item.kind])
      return {
        x: designX(item.lx),
        y: mid - ITEM_RADIUS[item.kind] - 4,
        midY: mid
      }
    }
    case 'weed': {
      const weed = garden.weeds.find(w => w.id === target.id)
      if (!weed) return null
      const mid = designY(weed.ly, ITEM_LIFT[weed.kind])
      return { x: designX(weed.lx), y: mid - ITEM_RADIUS.weed, midY: mid }
    }
    case 'snail': {
      const snail = garden.snails.find(s => s.id === target.id)
      if (!snail || snail.patch < 0) return null
      const mid = designY(snail.ly, 6)
      return { x: designX(snail.lx), y: mid - 14, midY: mid }
    }
    case 'patch': {
      const c = patchCenter(target.patch)
      return {
        x: designX(c.lx),
        y: designY(c.ly - PATCH_D / 2),
        midY: designY(c.ly)
      }
    }
    case 'column': {
      const top = designY(OUTLINE_ROW * PATCH_D)
      return {
        x: designX((target.col + 0.5) * PATCH_W),
        y: top,
        midY: top
      }
    }
    case 'tap': {
      const mid = designY(TAP_POS.ly) - 12
      return { x: designX(TAP_POS.lx) + 4, y: mid - 26, midY: mid }
    }
    case 'bag': {
      const spot = garden.bagSpot()
      if (!spot || garden.heldBag()) return null
      const mid = designY(spot.ly, ITEM_LIFT.bag)
      return { x: designX(spot.lx), y: mid - ITEM_RADIUS.bag, midY: mid }
    }
    case 'vane':
      return { x: DESIGN_W / 2, y: VANE_Y - 22, midY: VANE_Y }
  }
}

/**
 * Where a tip shows, fixed when it shows: the line over the fence, unless that line
 * would cover any of its object, such as a gnome in the front row whose hat pokes above
 * the lawn's edge, which sends it to the patio strip.
 */
export function tipSpotFor(
  garden: Garden,
  target: TipTarget | undefined
): TipSpot {
  if (!target) return 'fence'
  const spot = pointerSpot(garden, target)
  if (!spot) return 'fence'
  // The arrow's point sits 4 units above the object; 4 more cover a gnome's hat tip. A
  // thing whose middle sits a little above the band still hides half under it.
  const top = spot.y - 4
  return spot.midY >= LAWN.y - TIP_BAND_H - 8 && top < LAWN.y
    ? 'patio'
    : 'fence'
}

/**
 * Draws a tip's marker-yellow arrow bobbing above its object, still under Reduced
 * Motion. A column also gets a thin outline from row 2 to the patio.
 */
export function drawTipPointer(
  ctx: CanvasRenderingContext2D,
  garden: Garden,
  target: TipTarget,
  timeMs: number,
  still: boolean
): void {
  const spot = pointerSpot(garden, target)
  if (!spot) return
  if (target.kind === 'column') {
    const x = designX(target.col * PATCH_W)
    const top = designY(OUTLINE_ROW * PATCH_D)
    ctx.strokeStyle = palette.yellow
    ctx.lineWidth = 3
    ctx.strokeRect(x + 2, top, PATCH_W - 4, designY(LAWN_D) - top - 2)
  }
  const bob = still ? 0 : (Math.sin((timeMs / BOB_MS) * Math.PI * 2) - 1) * BOB
  // Over the front rows the arrow would reach under the tip line, so it points up from below.
  if (target.kind !== 'vane' && spot.y - 4 - ARROW_H < LAWN.y)
    drawArrow(ctx, spot.x, 2 * spot.midY - spot.y + 4 - bob, -1)
  else drawArrow(ctx, spot.x, spot.y - 4 + bob, 1)
}

/** A short arrow whose point sits at (x, y), pointing down (`dir` 1) or up (-1). */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: 1 | -1
): void {
  const head = 14 * dir
  const tail = ARROW_H * dir
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x - 13, y - head)
  ctx.lineTo(x - 5, y - head)
  ctx.lineTo(x - 5, y - tail)
  ctx.lineTo(x + 5, y - tail)
  ctx.lineTo(x + 5, y - head)
  ctx.lineTo(x + 13, y - head)
  ctx.closePath()
  ctx.lineJoin = 'round'
  ctx.fillStyle = palette.yellow
  ctx.strokeStyle = palette.ink
  ctx.lineWidth = 3
  ctx.fill()
  ctx.stroke()
  ctx.lineJoin = 'miter'
}
