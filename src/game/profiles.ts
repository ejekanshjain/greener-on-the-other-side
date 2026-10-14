/**
 * How a bot plays: Mr Pemberton's three moods and the scripted players that drive
 * autopilot and the headless balance runs (PLAN.md 2.9). Every number lives here.
 */

/** What a bot does with the finale's crate gnomes, heavy junk and last seconds. */
export interface FinalePlan {
  /** `carry` moves them onto the patio, `throw` sends them over, `keep` leaves them. */
  gnomes: 'carry' | 'throw' | 'keep'
  /** The least time between two finale throws, in ms. */
  gapMs: number
  /** Throws the bin and trampoline too, before the gnomes while the arm is fresh. */
  junk: boolean
  /**
   * The mower: thrown with the other junk (`junk`), kept all round (`keep`), or kept for
   * mowing and thrown `leftMs` before 0:00.
   */
  mower: 'junk' | 'keep' | { leftMs: number }
  /** Mows at twice its pace instead of throwing once its gnomes are gone. */
  mowAfter: boolean
  /**
   * From this long before 0:00 in a full round, mows columns one pass would stripe, back
   * to back, emptying the bag when it fills; 0 never. A player throws nothing more then.
   */
  closeMs: number
}

/** One bot's habits. Times are real milliseconds; `?fast` rounds keep them. */
export interface Profile {
  name: string
  /** How long a fresh weed grows before the bot pulls it. */
  weedReactMs: number
  /** Throw speed in px/s, uniform within mean ± spread, or null for aimed throws. */
  speed: { mean: number; spread: number } | null
  /** How long after a throw lands here the bot throws it back, min and max. */
  returnMs: [number, number]
  /** Gaps between sends of its own weeds and snails, or null when it never sends any. */
  sendMs: [number, number] | null
  /** Share of aimed light throws that clip the fence on purpose. Heavy junk always goes over. */
  clipChance: number
  /** Watering as a share of the drying, so 1 keeps up exactly. Pours past it count as credit. */
  upkeep: number
  /** Time between mowing columns. */
  mowEveryMs: number
  /** Share of pours that run on until the patches drown. */
  overwater: number
  /** Share of Biscuit's digs it taps him in time for. */
  patBiscuit: number
  /** Share of throws coming over that it catches. */
  catchChance: number
  /**
   * Throws theirs back before any chore, as Mr Pemberton does. Players keep their lawn
   * first and throw back with the time left over.
   */
  spiteFirst: boolean
  finale: FinalePlan
}

/** Mr Pemberton's moods, by round: polite, normal, then petty. */
export const PEMBERTON: readonly [Profile, Profile, Profile] = [
  {
    name: 'polite',
    weedReactMs: 10_000,
    speed: null,
    returnMs: [4000, 8000],
    sendMs: null,
    clipChance: 0,
    upkeep: 0.6,
    mowEveryMs: 12_000,
    overwater: 0,
    patBiscuit: 0.5,
    catchChance: 0,
    spiteFirst: true,
    finale: {
      gnomes: 'carry',
      gapMs: 0,
      junk: false,
      mower: 'keep',
      mowAfter: false,
      closeMs: 0
    }
  },
  {
    name: 'normal',
    weedReactMs: 6000,
    speed: null,
    returnMs: [2000, 6000],
    sendMs: [5000, 9000],
    clipChance: 1 / 5,
    upkeep: 1,
    mowEveryMs: 6000,
    overwater: 0,
    patBiscuit: 0.75,
    catchChance: 0,
    spiteFirst: true,
    finale: {
      gnomes: 'throw',
      gapMs: 2500,
      junk: false,
      mower: 'keep',
      mowAfter: false,
      closeMs: 0
    }
  },
  {
    name: 'petty',
    weedReactMs: 4000,
    speed: null,
    returnMs: [500, 1500],
    sendMs: [4000, 7000],
    clipChance: 1 / 13,
    upkeep: 1.3,
    mowEveryMs: 6000,
    overwater: 0,
    patBiscuit: 0.9,
    catchChance: 0,
    spiteFirst: true,
    // He keeps his mower to re-mow late, then throws it in the last seconds.
    finale: {
      gnomes: 'throw',
      gapMs: 0,
      junk: true,
      mower: { leftMs: 6000 },
      mowAfter: false,
      closeMs: 15_000
    }
  }
]

/** Scripted players for autopilot and balance runs: a first-timer, a regular and an expert. */
export const PLAYERS = {
  learner: {
    name: 'learner',
    weedReactMs: 6000,
    speed: { mean: 950, spread: 350 },
    returnMs: [6000, 6000],
    sendMs: null,
    clipChance: 0,
    upkeep: 0.7,
    mowEveryMs: 20_000,
    overwater: 0.15,
    patBiscuit: 0.5,
    catchChance: 0,
    spiteFirst: false,
    finale: {
      gnomes: 'throw',
      gapMs: 0,
      junk: false,
      mower: 'keep',
      mowAfter: false,
      closeMs: 0
    }
  },
  regular: {
    name: 'regular',
    weedReactMs: 3000,
    speed: { mean: 1250, spread: 300 },
    returnMs: [3000, 3000],
    sendMs: null,
    clipChance: 0,
    upkeep: 1,
    mowEveryMs: 14_000,
    overwater: 0.05,
    patBiscuit: 0.75,
    catchChance: 0.1,
    spiteFirst: false,
    finale: {
      gnomes: 'throw',
      gapMs: 0,
      junk: false,
      mower: 'keep',
      mowAfter: true,
      closeMs: 8000
    }
  },
  expert: {
    name: 'expert',
    weedReactMs: 1500,
    speed: { mean: 1550, spread: 250 },
    returnMs: [1500, 1500],
    sendMs: null,
    clipChance: 0,
    upkeep: 1.1,
    mowEveryMs: 10_000,
    overwater: 0.02,
    patBiscuit: 0.9,
    catchChance: 0.3,
    spiteFirst: false,
    // The closer: its gnomes go over, then it mows for stripes from 0:18 left.
    finale: {
      gnomes: 'throw',
      gapMs: 0,
      junk: false,
      mower: 'keep',
      mowAfter: false,
      closeMs: 18_000
    }
  }
} as const satisfies Record<string, Profile>

/** Every profile by name, for `?bot=` and the dev `autopilot()` hook. */
export const PROFILES: Readonly<Record<string, Profile>> = {
  ...PLAYERS,
  polite: PEMBERTON[0],
  normal: PEMBERTON[1],
  petty: PEMBERTON[2]
}
