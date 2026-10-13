/**
 * A sliding-window send limiter: at most `max` sends in any `windowMs`. Pusher rejects
 * an 11th client event in a second, so the room allows 9, pings included.
 */
export class Limiter {
  private readonly times: number[] = []

  constructor(
    readonly max = 9,
    readonly windowMs = 1000
  ) {}

  /** Records a send at `now` and returns true, or returns false when the window is full. */
  tryTake(now: number): boolean {
    this.prune(now)
    if (this.times.length >= this.max) return false
    this.times.push(now)
    return true
  }

  /** Sends counted in the window ending at `now`. */
  count(now: number): number {
    this.prune(now)
    return this.times.length
  }

  private prune(now: number): void {
    while (this.times.length && (this.times[0] ?? 0) <= now - this.windowMs)
      this.times.shift()
  }
}
