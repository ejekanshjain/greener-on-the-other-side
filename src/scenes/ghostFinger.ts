import type { Garden } from '../game/garden'
import { ITEM_LIFT, ITEM_RADIUS } from '../game/items'
import { FENCE_TOP_H, PATCH_W } from '../game/tuning'
import type { ItemKind } from '../game/types'
import type { CachedLayer } from '../shared/layer'
import { clamp } from '../shared/math'
import { palette } from '../shared/palette'
import { designX, designY } from './layout'

/** One play of the ghost finger, start to end, in ms. */
export const GHOST_MS = 2400

/** The move a ghost finger shows: throwing a loose thing, pulling a weed, or mowing. */
export type GhostMove = 'throw' | 'pull' | 'mow'

/**
 * One play of the ghost finger: on an item (a throw), a rooted weed (a pull), or a column
 * (a mowing rub), when it began (real ms), and whether a press stops it.
 */
export interface FingerPlay {
  /** The item or rooted weed it shows the move on; 0 for a column. */
  id: number
  startAt: number
  stoppable: boolean
  /** The move it shows; a throw when unset. */
  move?: GhostMove
  /** The column a mowing rub runs down. */
  col?: number
}

const PRESS_AT = 300
const SWIPE_AT = 600
const LET_GO_AT = 1000
const FLOWN_AT = 1800
/** How far the finger drags the item before letting go, in design units. */
const SWIPE = 110
/** A pull drags the weed out this far, down and to the side, then swipes up from there. */
const PULL_DX = 26
const PULL_DY = 56
const PULLED_AT = 900
const PULL_LET_GO_AT = 1350
const PULL_FLOWN_AT = 2050
/** A mowing rub runs from row 1 to row 14 and back. */
const RUB_TOP = 60
const RUB_BOTTOM = 580
const RUB_TURN_AT = 1350

const ease = (t: number): number => t * t * (3 - 2 * t)

/**
 * Draws the see-through ghost finger showing a move, without touching the garden.
 * - A throw presses the item, swipes it up and lets go mid-swipe, and a ghost of the item
 *   flies on over the fence.
 * - A pull presses the rooted weed, drags it out, then swipes it up the same way.
 * - A mowing rub runs slowly down the column and back up.
 *
 * `stampOf` gives the stamp of an item kind. Under Reduced Motion it's a still arrow: up
 * from the item or weed to the fence, or along the column. Returns false once the play
 * is over or its object is gone.
 */
export function drawGhostFinger(
  ctx: CanvasRenderingContext2D,
  garden: Garden,
  ghost: FingerPlay,
  nowMs: number,
  still: boolean,
  stampOf: (kind: ItemKind) => CachedLayer
): boolean {
  const t = nowMs - ghost.startAt
  if (t < 0 || t > GHOST_MS) return false
  switch (ghost.move ?? 'throw') {
    case 'mow':
      return drawRub(ctx, ghost.col ?? -1, t, still)
    case 'pull':
      return drawPull(ctx, garden, ghost.id, t, still, stampOf)
    default:
      return drawThrow(ctx, garden, ghost.id, t, still, stampOf)
  }
}

/** The throw: press, swipe up, let go mid-swipe, and the ghost item flies on. */
function drawThrow(
  ctx: CanvasRenderingContext2D,
  garden: Garden,
  id: number,
  t: number,
  still: boolean,
  stampOf: (kind: ItemKind) => CachedLayer
): boolean {
  const item = garden.item(id)
  if (!item || item.state !== 'rest') return false
  const kind = item.kind
  const x = designX(item.lx)
  const top = designY(item.ly, ITEM_LIFT[kind] + ITEM_RADIUS[kind])
  if (still) {
    // Its head stops at the lawn's top edge, just under the tip line.
    drawStillArrow(ctx, x, top - 6, designY(0) + 6)
    return true
  }
  const pull = ease(clamp((t - SWIPE_AT) / (LET_GO_AT - SWIPE_AT), 0, 1))
  // The ghost item rides the finger, then flies on over the fence once let go.
  const mid = designY(item.ly, ITEM_LIFT[kind])
  let gy = mid - pull * SWIPE
  let alpha = 0.45
  if (t > LET_GO_AT) {
    const fly = ease(clamp((t - LET_GO_AT) / (FLOWN_AT - LET_GO_AT), 0, 1))
    const fence = designY(0, FENCE_TOP_H + 60)
    gy += (fence - gy) * fly
    alpha = 0.45 * (1 - fly)
  }
  if (t >= SWIPE_AT && alpha > 0.01) {
    ctx.globalAlpha = alpha
    stampOf(kind).stamp(ctx, x, gy, 0)
    ctx.globalAlpha = 1
  }
  // The finger comes down onto the item, drags it up, and lifts away mid-swipe.
  const down = ease(clamp(t / PRESS_AT, 0, 1))
  const lift = ease(clamp((t - LET_GO_AT) / 300, 0, 1))
  const fingerAlpha = 0.6 * down * (1 - lift)
  if (fingerAlpha <= 0.01) return true
  const tipY = top + 6 - (1 - down) * 30 - pull * SWIPE - lift * 40
  drawFinger(ctx, x + 4, tipY, fingerAlpha)
  return true
}

/** The pull: press the rooted weed, drag it out, swipe it up, and the ghost weed flies on. */
function drawPull(
  ctx: CanvasRenderingContext2D,
  garden: Garden,
  id: number,
  t: number,
  still: boolean,
  stampOf: (kind: ItemKind) => CachedLayer
): boolean {
  const weed = garden.weeds.find(w => w.id === id)
  if (!weed) return false
  const kind = weed.kind
  const x = designX(weed.lx)
  const mid = designY(weed.ly, ITEM_LIFT[kind])
  const top = mid - ITEM_RADIUS[kind]
  if (still) {
    drawStillArrow(ctx, x, top - 6, designY(0) + 6)
    return true
  }
  const out = ease(clamp((t - PRESS_AT) / (PULLED_AT - PRESS_AT), 0, 1))
  const up = ease(clamp((t - PULLED_AT) / (PULL_LET_GO_AT - PULLED_AT), 0, 1))
  const fx = x + out * PULL_DX
  const fy = mid + out * PULL_DY - up * (PULL_DY + SWIPE)
  // The ghost weed leans out with the drag, then rides the swipe and flies on.
  let gy = fy
  let alpha = 0.45
  if (t > PULL_LET_GO_AT) {
    const fly = ease(
      clamp((t - PULL_LET_GO_AT) / (PULL_FLOWN_AT - PULL_LET_GO_AT), 0, 1)
    )
    gy += (designY(0, FENCE_TOP_H + 60) - gy) * fly
    alpha = 0.45 * (1 - fly)
  }
  if (t >= PRESS_AT && alpha > 0.01) {
    ctx.globalAlpha = alpha
    stampOf(kind).stamp(ctx, fx, gy, out * (1 - up) * 0.4)
    ctx.globalAlpha = 1
  }
  const down = ease(clamp(t / PRESS_AT, 0, 1))
  const lift = ease(clamp((t - PULL_LET_GO_AT) / 300, 0, 1))
  const fingerAlpha = 0.6 * down * (1 - lift)
  if (fingerAlpha <= 0.01) return true
  const tipY = fy - mid + top + 6 - (1 - down) * 30 - lift * 40
  drawFinger(ctx, fx + 4, tipY, fingerAlpha)
  return true
}

/** The mowing rub: slowly down the column from row 1 to row 14, then back up. */
function drawRub(
  ctx: CanvasRenderingContext2D,
  col: number,
  t: number,
  still: boolean
): boolean {
  if (col < 0) return false
  const x = designX(col * PATCH_W + PATCH_W / 2)
  if (still) {
    drawStillArrow(ctx, x, designY(RUB_BOTTOM), designY(RUB_TOP), true)
    return true
  }
  const downK = ease(clamp((t - PRESS_AT) / (RUB_TURN_AT - PRESS_AT), 0, 1))
  const backK = ease(
    clamp((t - RUB_TURN_AT) / (GHOST_MS - 300 - RUB_TURN_AT), 0, 1)
  )
  const ly = RUB_TOP + (RUB_BOTTOM - RUB_TOP) * (downK - backK)
  const down = ease(clamp(t / PRESS_AT, 0, 1))
  const lift = ease(clamp((t - (GHOST_MS - 300)) / 300, 0, 1))
  const fingerAlpha = 0.6 * down * (1 - lift)
  if (fingerAlpha <= 0.01) return true
  drawFinger(ctx, x + 4, designY(ly) - (1 - down) * 30, fingerAlpha)
  return true
}

/** A see-through hand pointing down, its fingertip at (x, y). */
function drawFinger(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  alpha: number
): void {
  ctx.globalAlpha = alpha
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = palette.ink
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.roundRect(x - 8, y - 46, 16, 48, 8)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.roundRect(x - 10, y - 74, 34, 34, 12)
  ctx.fill()
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.lineJoin = 'miter'
}

/**
 * A still marker-yellow arrow from `from` up to `to` at x, pointing at `to`, or at both
 * ends when `both`, for a rub up and down a column.
 */
function drawStillArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  from: number,
  to: number,
  both = false
): void {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = palette.ink
  ctx.lineWidth = 9
  ctx.beginPath()
  ctx.moveTo(x, from - (both ? 10 : 0))
  ctx.lineTo(x, to + 10)
  ctx.stroke()
  ctx.strokeStyle = palette.yellow
  ctx.lineWidth = 5
  ctx.stroke()
  drawHead(ctx, x, to, 1)
  if (both) drawHead(ctx, x, from, -1)
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'
}

/** An arrowhead with its point at (x, y), pointing up, or down when `dir` is -1. */
function drawHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: 1 | -1
): void {
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x - 14, y + 18 * dir)
  ctx.lineTo(x + 14, y + 18 * dir)
  ctx.closePath()
  ctx.fillStyle = palette.yellow
  ctx.lineWidth = 3
  ctx.fill()
  ctx.strokeStyle = palette.ink
  ctx.stroke()
}
