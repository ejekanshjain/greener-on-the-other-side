import type { Garden } from './garden'
import { markDirty, patchAt } from './grid'
import { lying } from './report'
import type { TipTarget } from './tipQueue'
import type { TipId } from './tips'
import {
  COLS,
  LAWN_D,
  LAWN_W,
  LENGTH_MAX,
  PATCHES,
  YARD_GNOME_SPOT,
  YARD_HEDGE_GAP,
  YARD_RETURN_MS,
  YARD_WEED_PATCH
} from './tuning'
import { Mess, type GardenEvent } from './types'

/** The yard's lines, one per step and stage. `DESIGN.md`'s The Yard owns their words. */
export const YARD_LINES = {
  throw: 'Throw the gnome over the fence.',
  pull: 'Drag the weed until it pops out.',
  swipe: 'Now swipe it up hard at the fence.',
  mow: 'Mow slowly up and down this column.',
  done: "That's a stripe. Yard done."
} as const

/** The round 1 tip each finished step makes unneeded: step 2 the weed tip, step 3 the mow tip. */
export const YARD_TIPS: readonly (TipId | null)[] = [null, 'weed', 'mow']

/** The move each of the yard's 3 steps teaches. */
export type YardMove = 'throw' | 'pull' | 'mow'
export const YARD_MOVES: readonly YardMove[] = ['throw', 'pull', 'mow']

/**
 * What a garden event or a lawn check did to the step: finished it, counted a failed try,
 * pulled step 2's weed out, or put its object back at its start.
 */
export type YardChange = 'done' | 'failed' | 'pulled' | 'returned' | null

/** Columns from the middle out; step 3 grows the first clear one. */
const MIDDLE_OUT = [6, 5, 7, 4, 8, 3, 9, 2, 10, 1, 11, 0] as const

/**
 * The yard's 3 steps on a yard garden (see `GardenOptions.yard`): throw a gnome, pull and
 * throw a back-row weed, then mow a shaggy column into a stripe. Each step puts its object
 * on the lawn, finishes on its own event, and counts failed tries in a row so the ghost
 * finger can show the move again. The session feeds it every garden event and checks it
 * after every step; it never touches the network.
 */
export class YardSteps {
  /** The current step, 0 to 2, or 3 once every step is done. */
  step = 0
  /** The step's object: the gnome, the weed (rooted, then the pulled item), or 0. */
  id = 0
  /** True once step 2's weed is out of the ground. */
  pulled = false
  /** Step 3's column, or -1. */
  col = -1
  /** Failed tries in a row on this step. */
  failures = 0
  /** What the step's pointer marks: its object, or its column. A new object on each change. */
  target: TipTarget | null = null
  private startX = 0
  private startY = 0
  /** Garden time the object came to rest on the patio or by a hedge, or -1. */
  private outSince = -1

  constructor(readonly garden: Garden) {}

  /** The move the current step teaches, or null once the yard is done. */
  get move(): YardMove | null {
    return YARD_MOVES[this.step] ?? null
  }

  /** The current step's line. */
  get line(): string {
    const move = this.move
    if (!move) return YARD_LINES.done
    if (move === 'pull' && this.pulled) return YARD_LINES.swipe
    return YARD_LINES[move]
  }

  /** Starts step `step`, putting its object on the lawn. */
  begin(step: number): void {
    this.step = step
    this.id = 0
    this.pulled = false
    this.col = -1
    this.failures = 0
    this.outSince = -1
    this.target = null
    const garden = this.garden
    switch (this.move) {
      case 'throw': {
        const gnome = garden.place(
          'gnome',
          YARD_GNOME_SPOT.lx,
          YARD_GNOME_SPOT.ly
        )
        this.id = gnome.id
        this.target = { kind: 'item', id: gnome.id }
        this.startX = gnome.lx
        this.startY = gnome.ly
        return
      }
      case 'pull': {
        const weed = garden.plantWeed(YARD_WEED_PATCH)
        this.id = weed.id
        this.target = { kind: 'weed', id: weed.id }
        this.startX = weed.lx
        this.startY = weed.ly
        return
      }
      case 'mow': {
        this.col = clearColumn(garden)
        this.target = { kind: 'column', col: this.col }
        for (let i = this.col; i < PATCHES; i += COLS) {
          garden.grid.length[i] = LENGTH_MAX
          garden.grid.mess[i] = Mess.none
          markDirty(garden.grid, i)
        }
        return
      }
      default:
        return
    }
  }

  /** Follows one garden event. */
  event(e: GardenEvent): YardChange {
    const move = this.move
    if (move === 'throw' || move === 'pull') {
      if (move === 'pull' && e.type === 'yank' && !this.pulled) {
        this.id = e.id
        this.pulled = true
        this.target = { kind: 'item', id: e.id }
        return 'pulled'
      }
      if (e.type === 'cross' && e.id === this.id) return this.finish()
      // A short, clipped or wide throw comes back down on your own lawn.
      if (e.type === 'land' && e.id === this.id && !e.fromNeighbour)
        return this.fail()
      if (
        (e.type === 'putDown' && e.reason !== 'cancel') ||
        e.type === 'tired' ||
        e.type === 'rooted' ||
        e.type === 'miss'
      )
        return this.fail()
      return null
    }
    if (move === 'mow') {
      // The stripe finishes the step in `check`; a press that ends without it is a try.
      if (e.type === 'mowEnd' && !this.striped()) return this.fail()
      if (e.type === 'miss') return this.fail()
    }
    return null
  }

  /**
   * Looks at the lawn after a step: step 3 finishes once its column stripes, and an object
   * resting on the patio or against a hedge goes back to its start after 1s.
   */
  check(): YardChange {
    const move = this.move
    if (move === 'mow') return this.striped() ? this.finish() : null
    if (!move) return null
    const item = this.garden.item(this.id)
    const out =
      item?.state === 'rest' &&
      (item.ly >= LAWN_D ||
        item.lx < YARD_HEDGE_GAP ||
        item.lx > LAWN_W - YARD_HEDGE_GAP)
    if (!item || !out) {
      this.outSince = -1
      return null
    }
    const t = this.garden.t
    if (this.outSince < 0) this.outSince = t
    if (t - this.outSince < YARD_RETURN_MS) return null
    this.outSince = -1
    this.garden.putBack(item.id, this.startX, this.startY)
    return 'returned'
  }

  private striped(): boolean {
    return this.col >= 0 && ((this.garden.stripes() >> this.col) & 1) === 1
  }

  private finish(): YardChange {
    this.step++
    this.failures = 0
    this.target = null
    return 'done'
  }

  private fail(): YardChange {
    this.failures++
    return 'failed'
  }
}

/**
 * The column step 3 grows: the clear one nearest the middle, with no mark, hole, weed,
 * snail or item on any patch. With none clear, the middle column, whose marks the step
 * then clears.
 */
export function clearColumn(garden: Garden): number {
  const grid = garden.grid
  const covered = new Uint8Array(PATCHES)
  for (const weed of garden.weeds) covered[weed.patch] = 1
  for (const snail of garden.snails)
    if (snail.patch >= 0) covered[snail.patch] = 1
  for (const item of garden.items) {
    const patch = patchAt(item.lx, item.ly)
    if (patch >= 0 && lying(item)) covered[patch] = 1
  }
  for (const col of MIDDLE_OUT) {
    let clear = true
    for (let i = col; i < PATCHES && clear; i += COLS)
      clear =
        grid.mess[i] === Mess.none && grid.hole[i] === 0 && covered[i] === 0
    if (clear) return col
  }
  return MIDDLE_OUT[0]
}
