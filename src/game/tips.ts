import { COACH_LINES } from './counts'
import { HEATWAVE_DRY, HEATWAVE_FILL_MS } from './tuning'
import type { ItemKind } from './types'

/** A new player's tips, one line each. `DESIGN.md`'s Onboarding section owns their words. */
export const TIPS = {
  // Staged tips, in the order a first match meets them.
  start: 'Throw the gnomes over the fence.',
  weed: 'Drag the weed out first, then swipe it up.',
  snail: 'Grab the snail before it slimes your grass.',
  back: 'That came from next door. Throw it back.',
  water: 'Hold still on brown grass until it sparkles.',
  sparkle: 'Sparkling means full. Stop pouring.',
  tap: 'Press the tap again within 8s, or it floods.',
  biscuit: 'Press Biscuit now, or he digs a hole.',
  mow: 'Mow slowly up and down a whole column.',
  stripe: 'Stripe! It scores if it lasts until 0:00.',
  broken: 'Stripe broken. Clear it and mow again.',
  shed: 'Gnomes first. Then big junk, if you dare.',
  patio: 'Slide it halfway up the lawn, then let go.',
  lift: 'Now hold it still until it lifts, then swipe up.',
  stripes: 'Mow columns now. Stripes count at 0:00.',
  bark: "Biscuit's eyeing that. Throw it first.",
  // The fetch tip names what Biscuit carries; see `fetchTip`.
  fetch: 'Biscuit has your gnome. Press it.',
  bag: 'Bag nearly full. Compost it or swipe it over.',
  clock: 'Seed clock. Drag it out and throw it over.',
  heat: 'The can fills slowly. Turn the tap on early.',
  catch: 'Press it while it falls to catch it.',
  // Failure tips, which answer your own mistakes.
  slow: "Let go while you're still moving.",
  still: 'Swipe it up to throw it. Water bare grass.',
  angle: 'Swipe up toward the fence.',
  bagOff: 'Hold the bag on the compost to empty it.',
  clip: 'Too soft. It clipped the fence.',
  hand: 'Too soon. Wait half a second.',
  tired: "Arm's tired. Throw once a second.",
  rooted: "It's rooted. Drag it until it pops out.",
  missed: 'Missed. Press on it first, then swipe.',
  tooFast: 'Too fast to mow. Press, then drag slowly.',
  blocked: 'Weeds or junk block this stripe. Clear them.',
  heavyFast: 'Let go first, then hold it until it lifts.',
  drown: 'Mud. Stop pouring at the sparkle.',
  flood: 'Flooded. Press the tap to turn it off.',
  bagFull: "The bag's full. Hold it on the compost.",
  scalp: 'Too fast. Mow slower or you scalp it.',
  hole: 'Hole. Press Biscuit while he circles.'
} as const

/** What the fetch tip calls each thing Biscuit can carry. */
const FETCH_NAMES = {
  weed: 'weed',
  dandelion: 'dandelion',
  seedClock: 'seed clock',
  seed: 'seed',
  gnome: 'gnome',
  litter: 'litter'
} as const satisfies Partial<Record<ItemKind, string>>

/** The fetch tip for an item Biscuit picked up, such as "Biscuit has your gnome. Press it." */
export function fetchTip(kind: ItemKind): string {
  const name =
    kind in FETCH_NAMES
      ? FETCH_NAMES[kind as keyof typeof FETCH_NAMES]
      : 'thing'
  return `Biscuit has your ${name}. Press it.`
}

/** Every fetch tip line, one per kind Biscuit can carry, for the width check. */
export const FETCH_TIPS: readonly string[] = (
  Object.keys(FETCH_NAMES) as ItemKind[]
).map(fetchTip)

/** The wind tip's line for the coming gust, in your garden's frame. It shows once a match. */
export const WIND_TIPS = {
  tail: 'Wind in 2s. It carries your throws further.',
  head: 'Wind in 2s. It pushes your throws back.',
  side: 'Wind in 2s. It pushes throws sideways.'
} as const

/** Every tip: the fixed lines, the wind tip, and the coach tip, whose words vary. */
export type TipId = keyof typeof TIPS | 'wind' | 'coach' | 'yard'

/**
 * The banner over the peek strip when the shed opens in round 1 of a first match: one
 * line on screen, and the full rule for screen readers.
 */
export const SHED_BANNER = {
  line: "The shed's open. Every gnome costs a point.",
  spoken:
    "The shed's open. Every gnome left on your grass at 0:00 costs a point."
} as const

/** Tips that answer your own mistakes: they wait at most 2s, and show once a round. */
const FAILURE_TIPS: ReadonlySet<TipId> = new Set([
  'slow',
  'still',
  'angle',
  'bagOff',
  'clip',
  'hand',
  'tired',
  'rooted',
  'missed',
  'tooFast',
  'blocked',
  'heavyFast',
  'drown',
  'flood',
  'bagFull',
  'scalp',
  'hole'
])
/**
 * Tips whose moment is happening now: they jump the queue. The wind tip's moment is the
 * vane's 2s warning, as short as Biscuit's dig circle.
 */
const URGENT_TIPS: ReadonlySet<TipId> = new Set([
  'sparkle',
  'tap',
  'biscuit',
  'wind',
  'patio',
  'lift',
  'bark',
  'fetch',
  'catch'
])
/** The first round (from 0) each tip may show in. Tips not listed show from round 1. */
const FROM_ROUND: Partial<Record<TipId, number>> = {
  coach: 1,
  wind: 1,
  bark: 1,
  fetch: 1,
  bag: 1,
  clock: 1,
  heat: 2,
  catch: 2
}

/**
 * How the queue treats a tip: urgent, a failure tip, once a round (the coach tip in
 * rounds 2 and 3), or none of these.
 */
export function tipKind(id: TipId): {
  urgent: boolean
  failure: boolean
  eachRound: boolean
} {
  return {
    urgent: URGENT_TIPS.has(id),
    failure: FAILURE_TIPS.has(id),
    eachRound: id === 'coach'
  }
}

/** True when tip `id` may show in `round` (from 0): wind and fetching wait for round 2. */
export function tipInRound(id: TipId, round: number): boolean {
  return round >= (FROM_ROUND[id] ?? 0)
}

/** Toasts that show every time, in any round, for every player. */
export const TOASTS = {
  canEmpty: "The can's empty. Press the tap to fill it.",
  noMower: 'You threw your mower. No mowing this round.',
  mowerPoke: 'Mow slowly up and down a whole column.'
} as const

/** What's new in rounds 2 and 3, shown over the countdown and the first moments of play. */
export const ROUND_BANNERS: readonly ({
  title: string
  line: string
} | null)[] = [
  null,
  {
    title: 'Round 2: Dandelions',
    line: '1 weed in 4 is a dandelion. Its seed clock bursts where it lands.'
  },
  {
    title: 'Round 3: Heatwave',
    line: `Grass dries ${HEATWAVE_DRY} times as fast, and the can takes ${HEATWAVE_FILL_MS / 1000}s to fill.`
  }
]

/**
 * Every line the tip line, the toast strip and the shed banner can show, for the dev
 * width check: each must fit 295 px at 18 px in the hand font.
 */
export const ALL_LINES: readonly string[] = [
  ...Object.values(TIPS),
  ...FETCH_TIPS,
  ...Object.values(WIND_TIPS),
  ...COACH_LINES,
  ...Object.values(TOASTS),
  SHED_BANNER.line
]
