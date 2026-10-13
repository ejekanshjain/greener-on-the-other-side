import { HEATWAVE_DRY, HEATWAVE_FILL_MS } from './tuning'
import type { GardenEvent } from './types'

/** First-time tips for round 1 of every match, one line each. */
export const TIPS = {
  start: 'Throw the gnome over the fence.',
  slow: "Let go while you're still moving.",
  clip: 'Too soft. It clipped the fence.',
  water: 'Hold still on brown grass to water it.',
  sparkle: 'Sparkling means full. Stop pouring.',
  tapFull: 'Turn the tap off before it floods.',
  mow: 'Rub the grass to mow a stripe.',
  weed: 'Pull the weed out, then flick it at the fence.',
  snail: 'Grab the snail before it slimes your stripes.',
  back: 'Throw it back.',
  hand: 'Too quick. Your hand needs a moment.',
  bag: 'Drag the bag to the compost, or over the fence.',
  tired: "Your arm's worn out. Rest it a second.",
  biscuit: 'Tap Biscuit before he digs.',
  bark: "Biscuit's eyeing that. Throw it first.",
  wind: "Wind's coming. Throw with it.",
  shed: "The shed's open. Hold heavy junk to lift it.",
  patio: "Drag it forward first. It won't clear from the patio."
} as const
export type TipId = keyof typeof TIPS

/** Health at which a patch first earns the watering tip. */
const WATER_TIP_HEALTH = 3

/** The tip a garden event earns, if any. Each tip shows once per match. */
export function tipFor(event: GardenEvent): TipId | null {
  switch (event.type) {
    case 'putDown':
      return 'slow'
    case 'clip':
      return 'clip'
    case 'tired':
      return event.reason
    case 'dry':
      return event.health <= WATER_TIP_HEALTH ? 'water' : null
    case 'sparkle':
      return 'sparkle'
    case 'tapFull':
      return 'tapFull'
    case 'shaggy':
      return 'mow'
    case 'bagHigh':
      return 'bag'
    case 'sprout':
      return event.spread ? null : 'weed'
    case 'snail':
      return 'snail'
    case 'arrive':
      return 'back'
    case 'circle':
      return 'biscuit'
    case 'bark':
      return 'bark'
    case 'vane':
      return 'wind'
    case 'shed':
      return 'shed'
    case 'grip':
      return event.patio ? 'patio' : null
    default:
      return null
  }
}

/** Toasts that show every time, in any round. */
export const TOASTS = {
  canEmpty: "The can's empty. Turn on the tap.",
  noMower: 'You threw your mower. No more mowing this round.',
  mowerPoke: 'Rub the grass to mow a stripe.'
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
