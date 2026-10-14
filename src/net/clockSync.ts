/** Round trips longer than this never set the clock at join. */
export const MAX_RTT_MS = 400
/** A later resample counts only within this multiple of the best round trip. */
export const RESAMPLE_FACTOR = 1.5
/** Pings sent per join batch, and the gap between them. */
export const JOIN_PINGS = 5
export const PING_GAP_MS = 150

/** One ping's result. */
export interface ClockSample {
  rtt: number
  offset: number
}

/**
 * Turns a pong into a sample. The guest sent at `t0` and heard back at `t1` on its own
 * clock; the host stamped `th` on its clock. The host's clock reads `th + rtt / 2` at `t1`.
 */
export function sampleOf(t0: number, th: number, t1: number): ClockSample {
  const rtt = t1 - t0
  return { rtt, offset: th + rtt / 2 - t1 }
}

/**
 * The shared clock. The host's own clock is the reference, so its offset stays 0. The
 * guest keeps the sample with the shortest round trip, ignoring any over 400 ms. When a
 * whole join batch is too slow, the next batch is kept anyway and `rough` flags it.
 *
 * Dev playtests can pause it: game time stands still from one shared moment to another,
 * then runs on behind the shared clock by every span it stood still. Pages that pause at
 * the same moments keep agreeing, and pongs carry the unpaused time.
 */
export class ClockSync {
  offset = 0
  bestRtt = Infinity
  /** True once an offset has been set from a sample. */
  synced = false
  /** True when the clock had to use a slow sample. */
  rough = false
  private batch: ClockSample[] = []
  /** Shared time the current pause starts and ends, or Infinity. */
  private stopAt = Infinity
  private goAt = Infinity
  /** Ms the clock stood still in finished pauses. */
  private held = 0

  constructor(private readonly localNow: () => number) {}

  /** Game time now: the shared clock, standing still through a pause. */
  now(): number {
    const shared = this.shared()
    if (shared < this.stopAt) return shared - this.held
    if (shared < this.goAt) return this.stopAt - this.held
    return shared - this.held - (this.goAt - this.stopAt)
  }

  /** The shared clock as it really runs, pauses ignored: what pongs carry. */
  shared(): number {
    return this.localNow() + this.offset
  }

  /** True while a pause holds the clock still. */
  get paused(): boolean {
    const shared = this.shared()
    return shared >= this.stopAt && shared < this.goAt
  }

  /** Ms the clock has stood still in pauses so far. */
  get heldMs(): number {
    this.settle()
    const shared = this.shared()
    return this.held + Math.max(0, Math.min(shared, this.goAt) - this.stopAt)
  }

  /**
   * Stops game time at shared time `at`. Before the pause begins, the earliest time asked
   * for wins, so two tabs pausing at once agree; once it has begun, it stays.
   */
  pause(at: number): void {
    this.settle()
    const shared = this.shared()
    if (shared >= this.stopAt) return
    this.stopAt = Math.min(this.stopAt, Math.max(at, shared))
  }

  /**
   * Runs game time again from shared time `at`, or as the pause begins if that's later.
   * The earliest time asked for wins, as for `pause`.
   */
  resume(at: number): void {
    this.settle()
    if (this.stopAt === Infinity) return
    this.goAt = Math.min(this.goAt, Math.max(at, this.stopAt))
  }

  /** The pause as a page that joins late should copy it. */
  pauseState(): { stopAt: number; goAt: number; held: number } {
    this.settle()
    return { stopAt: this.stopAt, goAt: this.goAt, held: this.held }
  }

  /** Copies another page's pauses, so a reloaded page keeps the same game time. */
  copyPause(state: { stopAt: number; goAt: number; held: number }): void {
    this.stopAt = state.stopAt
    this.goAt = state.goAt
    this.held = state.held
  }

  /** Folds a finished pause into `held`. */
  private settle(): void {
    if (this.goAt === Infinity || this.shared() < this.goAt) return
    this.held += this.goAt - this.stopAt
    this.stopAt = Infinity
    this.goAt = Infinity
  }

  /** This tab's own clock, with any dev skew. */
  local(): number {
    return this.localNow()
  }

  /** Becomes the reference clock: offset 0, no sampling. */
  becomeHost(): void {
    this.offset = 0
    this.bestRtt = 0
    this.synced = true
    this.rough = false
  }

  /** Forgets the offset, for a new host. */
  reset(): void {
    this.offset = 0
    this.bestRtt = Infinity
    this.synced = false
    this.rough = false
    this.batch = []
  }

  /** Adds a sample from a join batch, applying it at once when it beats the best so far. */
  addJoinSample(sample: ClockSample): void {
    this.batch.push(sample)
    if (sample.rtt <= MAX_RTT_MS && sample.rtt < this.bestRtt)
      this.apply(sample)
  }

  /**
   * Ends a join batch. Returns true when the clock is set. After a batch where every
   * sample was too slow, pass `final: true` on the retry to keep its best sample anyway.
   */
  endJoinBatch(final: boolean): boolean {
    const batch = this.batch
    this.batch = []
    if (this.synced) return true
    if (!final || batch.length === 0) return false
    const best = batch.reduce((a, b) => (b.rtt < a.rtt ? b : a))
    this.apply(best)
    this.rough = true
    return true
  }

  /** A single later ping, such as at each reveal. It counts only when nearly as quick as the best. */
  addResample(sample: ClockSample): boolean {
    if (!this.synced || sample.rtt > this.bestRtt * RESAMPLE_FACTOR)
      return false
    this.apply(sample)
    return true
  }

  private apply(sample: ClockSample): void {
    this.offset = sample.offset
    this.bestRtt = Math.min(this.bestRtt, sample.rtt)
    this.synced = true
  }
}
