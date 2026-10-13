import { patchCenter } from '../game/grid'
import type { LawnReport } from '../game/report'
import { COLS, LAWN_W } from '../game/tuning'
import { isHeavy, type ItemKind } from '../game/types'

/** Their throw clipping the fence top, seen from your side. `x` is in your frame. */
export interface FenceClip {
  kind: ItemKind
  x: number
  /** Shared-clock time the teeter started. */
  at: number
}

/** Their head popping up over the fence at `x`, in your frame. Angry after your hits. */
export interface HeadPop {
  x: number
  at: number
  angry: boolean
  /** When it drops back down, if later than the usual pop. */
  until?: number
}

/** Their smug laugh floating over the fence after your clip, at `x` in your frame. */
export interface Laugh {
  x: number
  at: number
}

/** Something they say over the fence at `x` in your frame: Mr Pemberton's bubbles. */
export interface Bubble {
  text: string
  x: number
  at: number
}

/** A dust puff where your throw landed on their lawn: `row` 0 is nearest the fence. */
export interface Puff {
  x: number
  row: number
  kind: ItemKind
  at: number
}

/** How long a head pop stays up, in ms. */
export const HEAD_POP_MS = 1100
/** How long a laugh floats, in ms. */
export const LAUGH_MS = 1600
/** How long a speech bubble and a shaken fist stay up, in ms. */
export const BUBBLE_MS = 1800
/** A clip shows its teeter, then a fall back over the fence this long. */
export const CLIP_FALL_MS = 350
/** How long a landing's dust puff lasts, in ms. */
export const PUFF_MS = 700
const KEEP = 8

/**
 * What you see of your neighbour: their last lawn report, puffs where your throws landed
 * on it, their clips teetering on the fence, their head popping up, and their laugh. The
 * session fills it from messages and your own garden events; the scene draws it on the
 * shared clock. Positions are in your frame: their left is your right.
 */
export class NeighbourView {
  readonly clips: FenceClip[] = []
  readonly heads: HeadPop[] = []
  readonly laughs: Laugh[] = []
  readonly puffs: Puff[] = []
  readonly bubbles: Bubble[] = []
  /** Their shaken fists, at `x` in your frame. */
  readonly fists: Laugh[] = []
  /** True when the neighbour is Mr Pemberton, who is bald with a moustache. */
  pemberton = false
  /** Their last lawn report this round, or null before the first. */
  lawn: LawnReport | null = null
  /** Shared-clock time the last report arrived. */
  lawnAt = 0
  /** Bumps whenever `lawn` changes, so the peek strip knows to repaint. */
  lawnVersion = 0
  /** A seed for their head's colours, from their player id. */
  headSeed = 0

  addClip(clip: FenceClip): void {
    push(this.clips, clip)
  }

  popHead(x: number, at: number, angry = false): void {
    push(this.heads, { x, at, angry })
  }

  laugh(x: number, at: number): void {
    push(this.laughs, { x, at })
  }

  /** Their head pops up at `x` with a speech bubble, cross when `angry`. */
  say(text: string, x: number, at: number, angry = false): void {
    push(this.bubbles, { text, x, at })
    push(this.heads, { x, at, angry, until: at + BUBBLE_MS })
  }

  /** Their head pops up angry at `x`, shaking a fist. */
  fist(x: number, at: number): void {
    push(this.fists, { x, at })
    push(this.heads, { x, at, angry: true, until: at + BUBBLE_MS })
  }

  /**
   * Takes their latest lawn report at shared time `now`. Each landing it reports gets a
   * puff at its column, and a gnome or heavy hit pops their head up, angry.
   */
  applyLawn(report: LawnReport, now: number): void {
    this.lawn = report
    this.lawnAt = now
    this.lawnVersion++
    for (const landing of report.landings) {
      const x = LAWN_W - patchCenter(landing.patch).lx
      push(this.puffs, {
        x,
        row: Math.floor(landing.patch / COLS),
        kind: landing.kind,
        at: now
      })
      if (landing.kind === 'gnome' || isHeavy(landing.kind))
        this.popHead(x, now, true)
    }
  }

  /** Forgets everything, for a new round. */
  clear(): void {
    this.clips.length = 0
    this.heads.length = 0
    this.laughs.length = 0
    this.puffs.length = 0
    this.bubbles.length = 0
    this.fists.length = 0
    this.lawn = null
    this.lawnVersion++
  }
}

function push<T>(list: T[], value: T): void {
  list.push(value)
  if (list.length > KEEP) list.shift()
}
