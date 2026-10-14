import { Garden } from '../game/garden'
import type { TipTarget } from '../game/tipQueue'
import { TipTriggers } from '../game/tipTriggers'
import {
  YARD_DONE_MS,
  YARD_FAILURE_MS,
  YARD_REPLAY_FAILS
} from '../game/tuning'
import type { TipId } from '../game/tips'
import type { GardenEvent } from '../game/types'
import { YARD_TIPS, YardSteps, type YardChange } from '../game/yard'
import type { FingerPlay } from '../scenes/ghostFinger'

/** The yard's line on show: a failure tip for its 3s, else the step's own line. */
export interface YardLine {
  /** Changes with every new showing, so the tip line pops in again. */
  key: number
  text: string
  target: TipTarget | null
  failure: boolean
}

/**
 * One visit to the lobby's yard: a yard garden on its own clock (real ms, as from
 * `performance.now()`), its 3 steps, the line each step shows, each failure tip shown
 * every time for 3s, and the ghost finger as each step starts and after 2 failed tries
 * in a row. It never touches the network, the replay or blame: the session draws it,
 * plays its sounds and passes it your presses.
 */
export class YardRun {
  readonly garden: Garden
  readonly steps: YardSteps
  /** The ghost finger on show, or null. */
  ghost: FingerPlay | null = null
  /** Real time the last step finished, or -1. */
  doneAt = -1
  /** Round 1 tips the finished steps made unneeded, for the coming match. */
  readonly learned: TipId[] = []
  private readonly triggers: TipTriggers
  private failure: (YardLine & { until: number }) | null = null
  private line: YardLine = { key: 0, text: '', target: null, failure: false }
  private keys = 0
  /** Real time of the latest update. */
  private now: number

  constructor(
    seed: number,
    private readonly origin: number
  ) {
    this.now = origin
    this.garden = new Garden({ seed, yard: true })
    this.steps = new YardSteps(this.garden)
    // The triggers name each failure; the yard shows every one, and nothing else.
    this.triggers = new TipTriggers(this.garden, {
      raise: req => {
        if (!req.failure) return
        this.failure = {
          key: ++this.keys,
          text: req.text,
          target: req.target ?? null,
          failure: true,
          until: this.now + YARD_FAILURE_MS
        }
      },
      end: () => {},
      shedBanner: () => {}
    })
    this.steps.begin(0)
    this.playGhost(origin)
  }

  /** True once all 3 steps are done. */
  get finished(): boolean {
    return this.steps.move === null
  }

  /** True once "That's a stripe. Yard done." has shown its 2s at real time `now`. */
  over(now: number): boolean {
    return this.doneAt >= 0 && now - this.doneAt >= YARD_DONE_MS
  }

  /** Runs the yard to real time `now` and returns its garden's events. */
  update(now: number): GardenEvent[] {
    this.now = now
    this.garden.advanceTo(now - this.origin)
    const events = this.garden.drainEvents()
    for (const e of events) {
      this.triggers.event(e)
      this.follow(this.steps.event(e), now)
    }
    this.follow(this.steps.check(), now)
    return events
  }

  /** The line on show at real time `now`. The same object comes back until it changes. */
  shown(now: number): YardLine {
    if (this.failure && now >= this.failure.until) this.failure = null
    if (this.failure) return this.failure
    const text = this.steps.line
    const target = this.steps.target
    const line = this.line
    // The steps make a new target object whenever the pointer should move.
    if (line.failure || line.text !== text || line.target !== target)
      this.line = { key: ++this.keys, text, target, failure: false }
    return this.line
  }

  private follow(change: YardChange, now: number): void {
    if (change === 'done') {
      this.failure = null
      const tip = YARD_TIPS[this.steps.step - 1]
      if (tip) this.learned.push(tip)
      if (this.finished) {
        this.doneAt = now
        this.ghost = null
        return
      }
      this.steps.begin(this.steps.step)
      this.playGhost(now)
    } else if (
      change === 'failed' &&
      this.steps.failures >= YARD_REPLAY_FAILS
    ) {
      this.steps.failures = 0
      this.playGhost(now)
    }
  }

  /** Plays the ghost finger for the step's move: a pulled weed shows the throw. */
  private playGhost(now: number): void {
    const move = this.steps.move
    if (!move) return
    this.ghost = {
      id: this.steps.id,
      startAt: now,
      stoppable: true,
      move: move === 'pull' && this.steps.pulled ? 'throw' : move,
      col: this.steps.col
    }
  }
}
