import {
  FAST_PRESS_MS,
  FAST_PRESS_PX,
  JOB_WAIT_MS,
  MOW_START_PX,
  POUR_TO_MOW_MS,
  POUR_TO_MOW_PX,
  RELEASE_PAIR_MIN_MS,
  THROW_MAX_ANGLE_DEG,
  THROW_MIN_PX
} from './tuning'

/** Peak swipe speed and direction at the moment you let go, in screen pixels. */
export interface ReleaseSample {
  speedPx: number
  dirX: number
  dirY: number
}

/** What letting go of a held item does. */
export type Release =
  | { type: 'throw'; speedPx: number; dirX: number; dirY: number }
  | { type: 'putDown' }

const MIN_COS = Math.cos((THROW_MAX_ANGLE_DEG * Math.PI) / 180)

/**
 * The one release rule: let go at 400 px/s or faster, aimed within 60 degrees of straight
 * at the fence, and you throw. Anything slower or further off, or a press the browser
 * cancelled, puts the item down.
 */
export function releaseRule(sample: ReleaseSample, cancelled = false): Release {
  if (cancelled || sample.speedPx < THROW_MIN_PX) return { type: 'putDown' }
  const len = Math.hypot(sample.dirX, sample.dirY)
  // The fence is straight up the screen, at negative y.
  if (len === 0 || -sample.dirY / len < MIN_COS - 1e-9)
    return { type: 'putDown' }
  return {
    type: 'throw',
    speedPx: sample.speedPx,
    dirX: sample.dirX / len,
    dirY: sample.dirY / len
  }
}

/** What a press on grass turns into. `snap` means a fast flick that missed an item. */
export type GrassJob = 'wait' | 'water' | 'mow' | 'snap'

/**
 * Decides what a press on grass does from its first moments, in screen pixels and ms.
 * Move 12 px within 150 ms and you mow; stay put and you water. A press faster than
 * 1,000 px/s in its first 100 ms never mows: it becomes `snap`, and the caller grabs the
 * nearest item. So a moving press commits to mowing only once 100 ms have passed. A pour
 * turns into mowing once the finger moves faster than 200 px/s for 100 ms, and mowing
 * never turns back into watering.
 */
export class JobPicker {
  job: GrassJob = 'wait'
  private x0 = 0
  private y0 = 0
  private t0 = 0
  /** True once the finger has moved 12 px from the press during the wait. */
  private moved = false
  /** The last sample used for speed, at least 8 ms before the next one. */
  private rx = 0
  private ry = 0
  private rt = 0
  private fastSince = -1

  /** Starts a press at client pixels (x, y) and event time `t`. */
  start(x: number, y: number, t: number): void {
    this.job = 'wait'
    this.moved = false
    this.x0 = this.rx = x
    this.y0 = this.ry = y
    this.t0 = this.rt = t
    this.fastSince = -1
  }

  /** Feeds a pointer sample and returns the job after it. */
  move(x: number, y: number, t: number): GrassJob {
    if (this.job === 'mow' || this.job === 'snap') return this.job
    const dt = t - this.rt
    // Samples under 8 ms apart give a noisy speed, so they only count once the finger
    // has clearly moved; the reference sample stays put until a pair is far enough apart.
    const paired = dt >= RELEASE_PAIR_MIN_MS
    const speed =
      (Math.hypot(x - this.rx, y - this.ry) / Math.max(dt, 1)) * 1000
    const from = this.rt
    if (paired) {
      this.rx = x
      this.ry = y
      this.rt = t
    }
    if (this.job === 'wait' && t - this.t0 <= JOB_WAIT_MS) {
      if (Math.hypot(x - this.x0, y - this.y0) > MOW_START_PX) this.moved = true
      if (
        t - this.t0 <= FAST_PRESS_MS &&
        speed > FAST_PRESS_PX &&
        (paired || this.moved)
      )
        return (this.job = 'snap')
      return this.tick(t)
    }
    this.tick(t)
    if (this.job === 'water' && paired) {
      if (speed <= POUR_TO_MOW_PX) this.fastSince = -1
      else {
        if (this.fastSince < 0) this.fastSince = from
        if (t - this.fastSince >= POUR_TO_MOW_MS) this.job = 'mow'
      }
    }
    return this.job
  }

  /**
   * Moves the job on with time alone: a press that moved commits to mowing at 100 ms,
   * and one that stayed put starts watering at 150 ms.
   */
  tick(t: number): GrassJob {
    if (this.job !== 'wait') return this.job
    if (this.moved && t - this.t0 >= FAST_PRESS_MS) this.job = 'mow'
    else if (t - this.t0 >= JOB_WAIT_MS) this.job = 'water'
    return this.job
  }
}
