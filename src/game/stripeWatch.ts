import type { Garden } from './garden'

/** Columns that gained and lost a stripe since the last step, as 12-bit masks. */
export interface StripeChange {
  gained: number
  lost: number
}

/**
 * Follows one page's settled stripes (see `Garden.settledStripes`) step by step, for the
 * stripe cues every player sees. A new garden, such as a new round or a rebuild, starts
 * it fresh, and a step that isn't live play updates it without reporting a change.
 */
export class StripeWatch {
  private garden: Garden | null = null
  private mask = 0
  private readonly change: StripeChange = { gained: 0, lost: 0 }

  /** The change since the last step. The returned object is reused by the next call. */
  step(garden: Garden, live: boolean): StripeChange {
    const mask = garden.settledStripes()
    const report = live && garden === this.garden
    this.garden = garden
    const was = this.mask
    this.mask = mask
    this.change.gained = report ? mask & ~was : 0
    this.change.lost = report ? was & ~mask : 0
    return this.change
  }
}
