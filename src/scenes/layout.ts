import { LAWN_D, LAWN_W, PATIO_D } from '../game/tuning'

/** The portrait design every screen fits, in design units. */
export const DESIGN_W = 680
export const DESIGN_H = 1060

/** Vertical bands of the design, top to bottom. */
export const TOP_BAR = { y: 0, h: 96 } as const
export const PEEK = { y: 96, h: 100 } as const
export const FENCE = { y: 196, h: 40 } as const
export const LAWN = { x: 40, y: 236, w: LAWN_W, h: LAWN_D } as const
export const PATIO = { y: 236 + LAWN_D, h: PATIO_D } as const
/** The yard's panel covers the patio from here down, leaving the stripe ticks on its edge. */
export const YARD_PANEL_Y = PATIO.y + 32

/** The peek strip's rows from the horizon down: their rows 3, 2, 1 and 0, squashed with distance. */
export const PEEK_ROWS: readonly { row: number; y: number; h: number }[] = [
  { row: 3, y: 96, h: 19 },
  { row: 2, y: 115, h: 23 },
  { row: 1, y: 138, h: 27 },
  { row: 0, y: 165, h: 31 }
]

/** Touch presses this close to the screen's side edges belong to the browser's back swipe. */
export const EDGE_GUARD_PX = 20

/** Design x for a lawn x. */
export function designX(lx: number): number {
  return LAWN.x + lx
}

/** Design y for a lawn depth and height above the ground. */
export function designY(ly: number, h = 0): number {
  return LAWN.y + ly - h
}

/** Converts a design point to lawn units, written into `out`. */
export function toLawn(
  x: number,
  y: number,
  out: { x: number; y: number }
): { x: number; y: number } {
  out.x = x - LAWN.x
  out.y = y - LAWN.y
  return out
}

/** True when a touch at `clientX` sits in the side edge strip of a screen `width` px wide. */
export function inEdgeGuard(clientX: number, width: number): boolean {
  return clientX < EDGE_GUARD_PX || clientX > width - EDGE_GUARD_PX
}

/** The worst-moment replay records from the peek strip's top to the lawn's back edge. */
export const REPLAY_TOP = 96
export const REPLAY_H = 236 + LAWN_D - REPLAY_TOP
