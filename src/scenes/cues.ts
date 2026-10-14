import type { Garden } from '../game/garden'
import { ITEM_LIFT, ITEM_RADIUS } from '../game/items'
import type { GardenEvent } from '../game/types'
import { palette } from '../shared/palette'
import { sketchText } from '../shared/sketch'
import { DESIGN_W, designX, designY } from './layout'

/**
 * What a cue shows: a blocked throw, a weed left rooted, a flick that missed, or the
 * start of a rooted weed's pull ring, which shows as long as you pull.
 */
export type CueKind = 'hand' | 'tired' | 'rooted' | 'miss' | 'pull'
/** The cues that show for a fixed time. */
type TimedKind = Exclude<CueKind, 'pull'>

/** One failure cue, kept for its time on screen and for the dev check. */
export interface Cue {
  kind: CueKind
  /** The item or weed it's about, or 0 for a miss. */
  id: number
  /** Where it happened in lawn units, and a miss's direction. */
  lx: number
  ly: number
  dirX: number
  dirY: number
  /** Scene time it started. */
  at: number
  /** `performance.now()` when the scene heard of it, and when it first drew, or 0. */
  heardAt: number
  shownAt: number
}

/** A cue that shows for its fixed time. */
type TimedCue = Cue & { kind: TimedKind }

/** How long each timed cue shows, in ms. */
export const CUE_MS: Record<TimedKind, number> = {
  hand: 800,
  tired: 800,
  rooted: 500,
  miss: 450
}

/** The blocked throw's words beside the item. */
const BLOCKED_LABEL = { hand: 'Too soon', tired: "Arm's tired" } as const
/** A missed flick's swish, in design units. */
const SWISH_LENGTH = 96
/** The swish's dashes: grey and broken, unlike anything a throw draws. */
const SWISH_DASH = [9, 7]
const SWISH_COLOR = 'rgb(72, 72, 72)'
/** Finished cues kept for the dev check. */
const RECENT_CAP = 16

/**
 * The failure cues every player sees in their own garden: a blocked throw's words and red
 * ring, a rooted weed's shake, and a missed flick's swish. Make one per scene, pass it
 * the garden's events, and draw it after the items. The scene draws the pull ring and
 * tells it when a pull starts, for the dev check.
 */
export class FailureCues {
  private readonly live: TimedCue[] = []
  /** The last few cues that showed, newest last, for the dev `cues()` hook. */
  readonly recent: Cue[] = []
  /** The rooted weed whose pull ring shows, or 0. */
  private pulling = 0

  /** Starts the cues for your garden's events at scene time `time`. */
  onEvents(events: readonly GardenEvent[], time: number): void {
    for (const e of events) {
      if (e.type === 'tired') this.add(e.reason, e.id, e.lx, e.ly, 0, 0, time)
      else if (e.type === 'rooted')
        this.add('rooted', e.id, e.lx, e.ly, 0, 0, time)
      else if (e.type === 'miss')
        this.add('miss', 0, e.lx, e.ly, e.dirX, e.dirY, time)
    }
  }

  /**
   * How far weed `id` leans this frame while its rooted cue plays: a quick shake that
   * dies away, or none under Reduced Motion.
   */
  weedLean(id: number, time: number, still: boolean): number {
    if (still) return 0
    for (const cue of this.live) {
      if (cue.kind !== 'rooted' || cue.id !== id) continue
      const k = (time - cue.at) / CUE_MS.rooted
      return Math.sin((time - cue.at) / 22) * 0.3 * (1 - k)
    }
    return 0
  }

  /**
   * Notes the rooted weed whose pull ring the scene draws this frame, or 0 for none. Each
   * new pull goes on the dev list as it first draws.
   */
  notePull(id: number): void {
    if (id === this.pulling) return
    this.pulling = id
    if (id === 0) return
    const now = performance.now()
    this.remember({
      kind: 'pull',
      id,
      lx: 0,
      ly: 0,
      dirX: 0,
      dirY: 0,
      at: 0,
      heardAt: now,
      shownAt: now
    })
  }

  /** Draws every cue still on show, and drops the finished ones. */
  draw(ctx: CanvasRenderingContext2D, garden: Garden, time: number): void {
    const live = this.live
    for (let i = live.length - 1; i >= 0; i--) {
      const cue = live[i] as TimedCue
      if (time - cue.at > CUE_MS[cue.kind]) live.splice(i, 1)
    }
    for (const cue of live) {
      if (cue.shownAt === 0) {
        cue.shownAt = performance.now()
        this.remember(cue)
      }
      const k = (time - cue.at) / CUE_MS[cue.kind]
      if (cue.kind === 'miss') drawSwish(ctx, cue, k)
      else if (cue.kind !== 'rooted') drawBlocked(ctx, garden, cue, k, time)
    }
  }

  private remember(cue: Cue): void {
    this.recent.push(cue)
    if (this.recent.length > RECENT_CAP) this.recent.shift()
  }

  private add(
    kind: TimedKind,
    id: number,
    lx: number,
    ly: number,
    dirX: number,
    dirY: number,
    time: number
  ): void {
    // A newer cue about the same thing replaces the old one.
    const old = this.live.findIndex(c => c.kind === kind && c.id === id)
    if (old >= 0) this.live.splice(old, 1)
    this.live.push({
      kind,
      id,
      lx,
      ly,
      dirX,
      dirY,
      at: time,
      heardAt: performance.now(),
      shownAt: 0
    })
  }
}

/**
 * A blocked throw: a red ring flashing round the dropped item, and "Too soon" or "Arm's
 * tired" beside it, fading over its last quarter.
 */
function drawBlocked(
  ctx: CanvasRenderingContext2D,
  garden: Garden,
  cue: Cue,
  k: number,
  time: number
): void {
  const item = garden.item(cue.id)
  const kind = item?.kind ?? 'gnome'
  const lx = item?.lx ?? cue.lx
  const ly = item?.ly ?? cue.ly
  const x = designX(lx)
  const y = designY(ly, (item?.h ?? 0) + ITEM_LIFT[kind])
  const r = ITEM_RADIUS[kind] + 10
  const fade = Math.min(1, 4 * (1 - k))
  // Two flashes over 0.8s, like the locked arm ring.
  ctx.globalAlpha = fade * (0.55 + 0.45 * Math.cos(time / 70))
  ctx.lineWidth = 6
  ctx.strokeStyle = palette.red
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 1
  const label = BLOCKED_LABEL[cue.kind as 'hand' | 'tired']
  // Beside the item, on whichever side has room.
  const right = x + r + 150 < DESIGN_W
  sketchText(ctx, label, right ? x + r + 6 : x - r - 6, y - 4, {
    font: 'marker',
    size: 24,
    color: '#ffffff',
    outline: palette.red,
    align: right ? 'left' : 'right',
    alpha: fade
  })
}

/**
 * A missed flick's swish: three short grey dashed strokes along the flick from where it
 * began, where the effects add a dust puff. A throw draws no lines at all in flight, so
 * the two can't be confused.
 */
function drawSwish(ctx: CanvasRenderingContext2D, cue: Cue, k: number): void {
  const x = designX(cue.lx)
  const y = designY(cue.ly)
  // Across the flick, so the strokes sit side by side.
  const nx = -cue.dirY
  const ny = cue.dirX
  ctx.lineCap = 'round'
  ctx.strokeStyle = SWISH_COLOR
  ctx.setLineDash(SWISH_DASH)
  ctx.globalAlpha = 0.9 * (1 - k * k)
  for (let s = -1; s <= 1; s++) {
    const len = SWISH_LENGTH * (s === 0 ? 1 : 0.7)
    const ox = nx * s * 10
    const oy = ny * s * 10
    ctx.lineWidth = s === 0 ? 6 : 4
    ctx.beginPath()
    ctx.moveTo(x + ox, y + oy)
    // A slight bow, like a hand-drawn motion line.
    ctx.quadraticCurveTo(
      x + ox + cue.dirX * len * 0.5 + nx * 6,
      y + oy + cue.dirY * len * 0.5 + ny * 6,
      x + ox + cue.dirX * len,
      y + oy + cue.dirY * len
    )
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.setLineDash([])
  ctx.lineCap = 'butt'
}
