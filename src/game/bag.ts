import { BAG_POS, COLS, COMPOST_RECT, PATCH_D, PATCH_W, ROWS } from './tuning'
import { ITEM_RADIUS } from './items'

/**
 * True when a lawn point lies within `reach` units of the bag on the parked mower, whose
 * bag sits at (bx, by): its patio spot unless you moved the mower in the finale.
 */
export function onBag(
  lx: number,
  ly: number,
  reach: number,
  bx: number = BAG_POS.lx,
  by: number = BAG_POS.ly
): boolean {
  return Math.hypot(lx - bx, ly - by) <= Math.max(reach, ITEM_RADIUS.bag)
}

/** True when a bag centred at (lx, ly) overlaps the compost bin. */
export function overCompost(lx: number, ly: number): boolean {
  const r = ITEM_RADIUS.bag
  const { lx: x, ly: y, w, h } = COMPOST_RECT
  return lx > x - r && lx < x + w + r && ly > y - r && ly < y + h + r
}

/**
 * The 4 patches a bag bursts over when it lands at (lx, ly): its own patch and the
 * neighbours on the sides nearest the landing point, kept on the lawn.
 */
export function heapPatches(lx: number, ly: number): number[] {
  const col = Math.min(COLS - 1, Math.max(0, Math.floor(lx / PATCH_W)))
  const row = Math.min(ROWS - 1, Math.max(0, Math.floor(ly / PATCH_D)))
  const leftHalf = lx - col * PATCH_W < PATCH_W / 2
  const topHalf = ly - row * PATCH_D < PATCH_D / 2
  let col2 = leftHalf ? col - 1 : col + 1
  if (col2 < 0 || col2 >= COLS) col2 = col + (leftHalf ? 1 : -1)
  let row2 = topHalf ? row - 1 : row + 1
  if (row2 < 0 || row2 >= ROWS) row2 = row + (topHalf ? 1 : -1)
  const cols = [Math.min(col, col2), Math.max(col, col2)]
  const rows = [Math.min(row, row2), Math.max(row, row2)]
  return rows.flatMap(r => cols.map(c => r * COLS + c))
}
