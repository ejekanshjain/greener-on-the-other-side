import type { TipId } from './tips'

/** Where a tip shows: the line over the fence, or the strip under the patio props. */
export type TipSpot = 'fence' | 'patio'

/** What a tip's arrow points at: an item, weed or snail by id, a patch, a column or a prop. */
export type TipTarget =
  | { kind: 'item' | 'weed' | 'snail'; id: number }
  | { kind: 'patch'; patch: number }
  | { kind: 'column'; col: number }
  | { kind: 'tap' | 'bag' | 'vane' }

/** A tip raised by something that just happened. */
export interface TipRequest {
  id: TipId
  text: string
  /** Urgent tips jump the line and can cut in on a tip shown for under 3s. */
  urgent?: boolean
  /** Failure tips answer your own mistakes: they wait at most 2s, one at a time. */
  failure?: boolean
  /** Shows once a round, like a failure tip, but waits like any other tip. */
  eachRound?: boolean
  /** The moment the tip is about; `end(moment)` sends it away if it's still waiting. */
  moment?: string
  /** Its spot, or a function that picks the spot when the tip shows. Defaults to the fence. */
  spot?: TipSpot | (() => TipSpot)
  /** What its arrow points at, if anything. */
  target?: TipTarget
}

/** The tip on show. `key` changes with every showing. */
export interface ShownTip {
  key: number
  id: TipId
  text: string
  spot: TipSpot
  urgent: boolean
  target: TipTarget | null
}

/** How long tips show and wait, in ms of tip time. */
export const TIP_TIMING = {
  /** Every tip shows at least this long, and counts as seen once it has. */
  minMs: 3000,
  /** A tip stays up to this long while nothing waits. */
  maxMs: 6000,
  /** The pause between one tip and the next. Urgent tips skip it. */
  gapMs: 400,
  /** A staged tip leaves after waiting this long. */
  stagedWaitMs: 10_000,
  /** A failure tip leaves after waiting this long. */
  failureWaitMs: 2000
} as const

interface Waiting {
  req: TipRequest
  waitedMs: number
  /** True once a tip step has passed with it still waiting, so it missed part of its moment. */
  held: boolean
}

/** What holds tip time still: everything, or only a patio tip under a toast. */
export interface TipPause {
  all?: boolean
  patio?: boolean
}

/**
 * A new player's tip queue: one tip at a time, each shown at least 3s, in the order they
 * happened, with urgent tips first. It's pure: the caller passes the clock to `step`, and
 * paused time never counts toward a tip's showing or waiting.
 */
export class TipQueue {
  private readonly waiting: Waiting[] = []
  private current:
    | (ShownTip & {
        shownMs: number
        req: TipRequest
        over: boolean
        /** It showed as soon as it was raised, so it covers its whole moment. */
        whole: boolean
      })
    | null = null
  /** Gap left before the next tip may show. */
  private gapLeft = 0
  private last = -1
  private keys = 0
  /** Tips seen this match; failure and once-a-round tips go in `seenRound` instead. */
  private readonly seen = new Set<TipId>()
  private readonly seenRound = new Set<TipId>()
  /**
   * Called when a tip leaves the screen, with how long it showed and why: its time was up,
   * an urgent tip cut in, or the line cleared.
   */
  onEnd:
    | ((tip: ShownTip, shownMs: number, why: 'done' | 'cut' | 'clear') => void)
    | null = null

  constructor(private readonly timing = TIP_TIMING) {}

  /** The tip on show, or null. */
  get shown(): ShownTip | null {
    return this.current
  }

  /**
   * True once `id` has shown for 3s, or through its whole moment: this match for staged
   * tips, this round for failure and once-a-round tips.
   */
  hasSeen(id: TipId, eachRound = false): boolean {
    return eachRound ? this.seenRound.has(id) : this.seen.has(id)
  }

  /** Raises a tip. A seen, waiting or showing tip is ignored. */
  raise(req: TipRequest): void {
    if (this.hasSeen(req.id, req.failure || req.eachRound)) return
    if (this.current?.id === req.id) return
    if (this.waiting.some(w => w.req.id === req.id)) return
    if (req.failure) {
      // Only one failure tip waits: a newer one replaces it.
      const old = this.waiting.findIndex(w => w.req.failure)
      if (old >= 0) this.waiting.splice(old, 1)
    }
    const entry = { req, waitedMs: 0, held: false }
    if (req.urgent) {
      const after = this.waiting.findIndex(w => !w.req.urgent)
      this.waiting.splice(after < 0 ? this.waiting.length : after, 0, entry)
    } else this.waiting.push(entry)
  }

  /**
   * The moment a tip was about has passed: a waiting one leaves unseen, and the one on
   * show gives way to the next urgent tip. The one on show counts as seen if it showed
   * through the whole moment and you `watched` it end, which catch-up after a hidden tab
   * doesn't.
   */
  end(moment: string, watched = true): void {
    const cur = this.current
    if (cur?.req.moment === moment) {
      cur.over = true
      if (watched && cur.whole) this.markSeen(cur.req)
    }
    for (let i = this.waiting.length - 1; i >= 0; i--)
      if (this.waiting[i]?.req.moment === moment) this.waiting.splice(i, 1)
  }

  /** Moves tip time on to `now` and returns the tip to show, or null. */
  step(now: number, pause: TipPause = {}): ShownTip | null {
    const dt = this.last < 0 ? 0 : Math.max(0, now - this.last)
    this.last = now
    if (pause.all) return this.current
    this.age(dt)
    const cur = this.current
    if (cur && !(pause.patio && cur.spot === 'patio')) {
      cur.shownMs += dt
      if (cur.shownMs >= this.timing.minMs) this.markSeen(cur.req)
    }
    const next = this.waiting[0]
    if (cur) {
      // An urgent tip cuts in, unless the tip on show is urgent and its moment is still on.
      const cut =
        next?.req.urgent &&
        (!cur.urgent || cur.over) &&
        cur.shownMs < this.timing.minMs
      const done =
        cur.shownMs >= this.timing.maxMs ||
        (next !== undefined && cur.shownMs >= this.timing.minMs)
      if (cut) {
        // The cut tip goes back to the front, behind the urgent one, while its moment lasts.
        if (!cur.over)
          this.waiting.splice(1, 0, { req: cur.req, waitedMs: 0, held: true })
        this.finish(0, 'cut')
      } else if (done)
        this.finish(next?.req.urgent ? 0 : this.timing.gapMs, 'done')
    }
    if (!this.current) {
      const ready = this.waiting[0]
      if (ready && (ready.req.urgent || this.gapLeft <= 0)) {
        this.waiting.shift()
        this.show(ready.req, !ready.held)
      }
    }
    for (const w of this.waiting) w.held = true
    return this.current
  }

  /** Clears the line at 0:00: the tip on show goes, and waiting tips leave unseen. */
  clear(): void {
    this.waiting.length = 0
    if (this.current) this.finish(0, 'clear')
    this.gapLeft = 0
  }

  /**
   * Marks a staged tip seen for this match without showing it, as when a yard step already
   * taught its move. `newMatch` forgets it like any other seen tip.
   */
  learn(id: TipId): void {
    this.seen.add(id)
  }

  /** A new round: failure tips may show once more. */
  newRound(): void {
    this.seenRound.clear()
  }

  /** A new match: every tip may show again. */
  newMatch(): void {
    this.clear()
    this.seen.clear()
    this.seenRound.clear()
  }

  private age(dt: number): void {
    this.gapLeft = Math.max(0, this.gapLeft - dt)
    // An urgent tip interrupts: staged tips don't run out of waiting time behind it.
    const urgentOn = this.current?.urgent === true
    for (let i = this.waiting.length - 1; i >= 0; i--) {
      const w = this.waiting[i]
      if (!w) continue
      if (w.req.failure || !urgentOn) w.waitedMs += dt
      const limit = w.req.failure
        ? this.timing.failureWaitMs
        : this.timing.stagedWaitMs
      if (w.waitedMs > limit) this.waiting.splice(i, 1)
    }
  }

  private show(req: TipRequest, whole: boolean): void {
    const spot = typeof req.spot === 'function' ? req.spot() : req.spot
    this.current = {
      key: ++this.keys,
      id: req.id,
      text: req.text,
      spot: spot ?? 'fence',
      urgent: req.urgent === true,
      target: req.target ?? null,
      shownMs: 0,
      req,
      over: false,
      whole
    }
  }

  private finish(gap: number, why: 'done' | 'cut' | 'clear'): void {
    const cur = this.current
    if (!cur) return
    this.current = null
    this.gapLeft = gap
    this.onEnd?.(cur, cur.shownMs, why)
  }

  private markSeen(req: TipRequest): void {
    if (req.failure || req.eachRound) this.seenRound.add(req.id)
    else this.seen.add(req.id)
  }
}

/** A garden step that jumps further than this is catch-up, and raises no tips. */
export const CATCH_UP_MS = 500
/** A round's countdown tips need its first live frame within this much play. */
export const FRESH_PLAY_MS = 2000

/**
 * True when a garden step is live play a new player is watching: the page shows, and the
 * step jumped no more than 500 ms. Catch-up after a hidden tab or a reload is not.
 */
export function liveStep(behindMs: number, hidden: boolean): boolean {
  return !hidden && behindMs <= CATCH_UP_MS
}

/**
 * True when a round's first live frame falls in its countdown or its first 2s of play,
 * so its countdown tips, ghost finger and coach tip may show. A reload mid-round fails it.
 */
export function freshRound(kind: string, playedMs: number): boolean {
  return kind === 'countdown' || (kind === 'play' && playedMs <= FRESH_PLAY_MS)
}
