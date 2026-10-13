import type { Garden } from '../game/garden'
import type { GardenEvent } from '../game/types'
import { WorstWindow } from '../game/worst'
import { DESIGN_W, REPLAY_H } from './layout'
import {
  ReplayRecorder,
  type CropRect,
  type ReplayClip
} from '../shared/replay'

/** The match's worst moment: its slow-motion clip, its caption and the health it cost. */
export interface WorstMoment {
  clip: ReplayClip
  label: string
  loss: number
  round: number
}

/** The clip is taken this long after a new worst window starts, so it shows what follows. */
const CLIP_DELAY_MS = 1000
/** A moment must cost at least this much health to count. */
const MIN_LOSS = 1
/** Replay frames, shaped like the recorded band: small, so two rings of 3s take about 20 MB. */
const FRAME_W = 192
const FRAME_H = Math.round((FRAME_W * REPLAY_H) / DESIGN_W)
const FPS = 20

/**
 * Records your peek strip, fence and lawn during play and keeps the match's worst moment: the 3s that
 * cost your lawn the most health (see `WorstWindow`), clipped a second after it began.
 */
export class WorstReplay {
  private recorder: ReplayRecorder | null = null
  private readonly window = new WorstWindow()
  private pending: { at: number; loss: number; round: number } | null = null
  /** The match's worst moment so far, or null. */
  best: WorstMoment | null = null

  /** Forgets the last match's worst moment. */
  reset(): void {
    this.best = null
    this.pending = null
  }

  /**
   * Follows your garden after an update during play, with the update's events, at real
   * time `now`. Takes the clip once a new worst window has had its second.
   */
  track(
    garden: Garden,
    events: readonly GardenEvent[],
    round: number,
    now: number
  ): void {
    const window = this.window
    window.step(garden, events, now)
    const worst = Math.max(this.best?.loss ?? 0, this.pending?.loss ?? 0)
    if (window.loss >= MIN_LOSS && window.loss > worst)
      this.pending = {
        at: this.pending?.at ?? now + CLIP_DELAY_MS,
        loss: window.loss,
        round
      }
    const pending = this.pending
    if (!pending || now < pending.at) return
    this.pending = null
    const clip = this.recorder?.clip()
    if (clip)
      this.best = { clip, label: window.label, loss: pending.loss, round }
  }

  /** Copies this frame of the design area, if one is due. Call after drawing. Returns true when it copied. */
  capture(canvas: HTMLCanvasElement, crop: CropRect, timeMs: number): boolean {
    this.recorder ??= new ReplayRecorder({
      width: FRAME_W,
      height: FRAME_H,
      fps: FPS,
      stillSize: 720
    })
    return this.recorder.capture(canvas, crop, timeMs)
  }
}
