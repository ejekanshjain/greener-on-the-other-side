import type { ReleaseSample } from '../game/press'
import {
  MOW_SPEED_WINDOW_MS,
  RELEASE_PAIR_MIN_MS,
  RELEASE_WINDOW_MS
} from '../game/tuning'

const CAPACITY = 64

/**
 * Keeps one press's recent pointer samples in client pixels and reports the peak swipe
 * speed in the last 100 ms before release. Speed comes from sample pairs at least 8 ms
 * apart, and the direction from the same pair. It allocates nothing per sample.
 */
export class ReleaseSampler {
  private readonly xs = new Float64Array(CAPACITY)
  private readonly ys = new Float64Array(CAPACITY)
  private readonly ts = new Float64Array(CAPACITY)
  private head = 0
  private count = 0
  private readonly result: ReleaseSample = { speedPx: 0, dirX: 0, dirY: 0 }

  /** Forgets every sample, for a fresh press. */
  reset(): void {
    this.head = 0
    this.count = 0
  }

  /** Adds a sample at client pixels (x, y) and event time `t` in ms. */
  add(x: number, y: number, t: number): void {
    this.xs[this.head] = x
    this.ys[this.head] = y
    this.ts[this.head] = t
    this.head = (this.head + 1) % CAPACITY
    if (this.count < CAPACITY) this.count++
  }

  /**
   * The peak speed and its direction over samples in the last 100 ms before `releaseAt`.
   * A pointer that sat still for longer than that reports 0. The returned object is reused.
   */
  peak(releaseAt: number): ReleaseSample {
    const out = this.result
    out.speedPx = 0
    out.dirX = 0
    out.dirY = 0
    const from = releaseAt - RELEASE_WINDOW_MS
    // Walk newest to oldest; for each sample, pair it with the newest older sample that sits
    // at least RELEASE_PAIR_MIN_MS earlier, still inside the window.
    for (let i = 0; i < this.count; i++) {
      const a = this.index(i)
      const ta = this.ts[a] ?? 0
      if (ta < from) break
      for (let j = i + 1; j < this.count; j++) {
        const b = this.index(j)
        const tb = this.ts[b] ?? 0
        if (tb < from) break
        const dt = ta - tb
        if (dt < RELEASE_PAIR_MIN_MS) continue
        const dx = (this.xs[a] ?? 0) - (this.xs[b] ?? 0)
        const dy = (this.ys[a] ?? 0) - (this.ys[b] ?? 0)
        const speed = (Math.hypot(dx, dy) / dt) * 1000
        if (speed > out.speedPx) {
          out.speedPx = speed
          out.dirX = dx
          out.dirY = dy
        }
        break
      }
    }
    return out
  }

  /**
   * The distance the finger travelled over the last 100 ms before `now`, per second, in
   * client pixels. Rubbing back and forth counts every stroke, so it suits the mower.
   */
  pathSpeed(now: number): number {
    const from = now - MOW_SPEED_WINDOW_MS
    let path = 0
    let oldest = now
    for (let i = 0; i + 1 < this.count; i++) {
      const a = this.index(i)
      const b = this.index(i + 1)
      const tb = this.ts[b] ?? 0
      if (tb < from) break
      path += Math.hypot(
        (this.xs[a] ?? 0) - (this.xs[b] ?? 0),
        (this.ys[a] ?? 0) - (this.ys[b] ?? 0)
      )
      oldest = tb
    }
    const span = now - oldest
    return span >= RELEASE_PAIR_MIN_MS ? (path / span) * 1000 : 0
  }

  /** Ring index of the `back`-th newest sample. */
  private index(back: number): number {
    return (this.head - 1 - back + CAPACITY * 2) % CAPACITY
  }
}
