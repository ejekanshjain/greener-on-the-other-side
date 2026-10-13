import type { Garden } from './garden'
import { healthSum } from './grid'
import type { GardenEvent } from './types'

/** What cost your lawn health, in the order the replay's label prefers them. */
export type Cause =
  | 'clip'
  | 'bounce'
  | 'drown'
  | 'scalp'
  | 'flatten'
  | 'dig'
  | 'own'
  | 'junk'
  | 'run'
  | 'heap'
  | 'hit'

const RANK: readonly Cause[] = [
  'clip',
  'bounce',
  'drown',
  'scalp',
  'flatten',
  'dig',
  'own',
  'junk',
  'run',
  'heap',
  'hit'
]

/** The worst-moment replay's caption for each cause. */
export const WORST_LABELS: Record<Cause | 'other', string> = {
  clip: 'Clipped the fence. Again.',
  bounce: 'Bounced off your own trampoline.',
  drown: 'Drowned your own grass.',
  scalp: 'Scalped your own stripes.',
  flatten: 'Dragged junk across your own lawn.',
  dig: 'Biscuit dug a hole. You let him.',
  own: 'Threw it onto your own lawn.',
  junk: 'Their junk landed on you.',
  run: 'Their mower ran you over.',
  heap: 'Buried in their clippings.',
  hit: 'Their throw landed on you.',
  other: 'That cost you.'
}

/** The window the worst moment looks back over, in ms. */
export const WORST_WINDOW_MS = 3000
/** A frame that moved the garden on further than this was a catch-up jump, not a moment. */
const MAX_STEP_MS = 250

/** Which cause a garden event stands for, if any. */
export function causeOf(event: GardenEvent): Cause | null {
  switch (event.type) {
    case 'clip':
      return 'clip'
    case 'bounce':
      return event.own ? 'bounce' : null
    case 'drown':
    case 'flood':
      return 'drown'
    case 'scalp':
      return 'scalp'
    case 'flatten':
      return 'flatten'
    case 'dig':
      return 'dig'
    case 'sink':
      return event.fromNeighbour ? 'junk' : 'own'
    case 'run':
      return 'run'
    case 'heap':
      return event.fromNeighbour ? 'heap' : 'own'
    case 'land':
      return event.fromNeighbour ? 'hit' : 'own'
    default:
      return null
  }
}

/** One frame that had a cause: when, why, and the health it cost beyond drying. */
interface Mark {
  at: number
  cause: Cause
  lost: number
}

/**
 * Finds the moments that cost your lawn the most health. Each frame, the health your lawn
 * lost beyond scheduled drying counts when one of the frame's events explains it (a
 * landing, a drowning, a scalp, a dig); slow losses from weeds, snails and rest damage
 * don't make a moment. `loss` is that health over the last 3s, and `label` names the
 * window's most embarrassing cause.
 */
export class WorstWindow {
  private readonly marks: Mark[] = []
  private garden: Garden | null = null
  private prevSum = 0
  private prevT = 0
  /** Health lost in the window so far. */
  loss = 0
  /** The window's most embarrassing cause, or null when nothing happened. */
  cause: Cause | null = null

  /** Follows `garden` after an update with that update's events, at real time `now`. */
  step(garden: Garden, events: readonly GardenEvent[], now: number): void {
    const sum = healthSum(garden.grid)
    if (garden !== this.garden) {
      this.garden = garden
      this.prevSum = sum
      this.prevT = garden.t
      this.marks.length = 0
    }
    let dries = 0
    let cause: Cause | null = null
    for (const event of events) {
      if (event.type === 'dry') dries++
      const c = causeOf(event)
      if (c && (!cause || RANK.indexOf(c) < RANK.indexOf(cause))) cause = c
    }
    const lost = Math.max(0, this.prevSum - sum - dries)
    const jumped = garden.t - this.prevT > MAX_STEP_MS
    this.prevSum = sum
    this.prevT = garden.t
    if (cause && !jumped) this.marks.push({ at: now, cause, lost })
    while (
      this.marks.length &&
      (this.marks[0] as Mark).at < now - WORST_WINDOW_MS
    )
      this.marks.shift()
    this.loss = 0
    this.cause = null
    for (const mark of this.marks) {
      this.loss += mark.lost
      if (!this.cause || RANK.indexOf(mark.cause) < RANK.indexOf(this.cause))
        this.cause = mark.cause
    }
  }

  /** The caption for the window as it stands. */
  get label(): string {
    return WORST_LABELS[this.cause ?? 'other']
  }
}
