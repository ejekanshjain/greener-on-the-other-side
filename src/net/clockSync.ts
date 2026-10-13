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
 */
export class ClockSync {
  offset = 0
  bestRtt = Infinity
  /** True once an offset has been set from a sample. */
  synced = false
  /** True when the clock had to use a slow sample. */
  rough = false
  private batch: ClockSample[] = []

  constructor(private readonly localNow: () => number) {}

  /** Shared-clock time now. */
  now(): number {
    return this.localNow() + this.offset
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
