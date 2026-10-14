/** Every kind of loose item a garden can hold. */
export type ItemKind =
  | 'weed'
  | 'dandelion'
  | 'seedClock'
  | 'snailShell'
  | 'gnome'
  | 'litter'
  | 'bag'
  | 'bin'
  | 'mower'
  | 'trampoline'
  /** A dandelion seed blown over the fence; it roots as a weed where it lands. */
  | 'seed'

/** Item kinds by wire code. The index is the code, so never reorder this list. */
export const ITEM_CODES: readonly ItemKind[] = [
  'weed',
  'dandelion',
  'seedClock',
  'snailShell',
  'gnome',
  'litter',
  'bag',
  'bin',
  'mower',
  'trampoline',
  'seed'
]

/** The wire code for an item kind. */
export function itemCode(kind: ItemKind): number {
  return ITEM_CODES.indexOf(kind)
}

/** The item kind for a wire code, or null for an unknown code. */
export function itemFromCode(code: number): ItemKind | null {
  return ITEM_CODES[code] ?? null
}

/** Heavy junk lifts slowly, flies short and sinks where it lands. */
export function isHeavy(kind: ItemKind): boolean {
  return kind === 'bin' || kind === 'mower' || kind === 'trampoline'
}

/** Mess marks a patch can carry. Mowing clears them. */
export const Mess = {
  none: 0,
  slime: 1,
  trample: 2,
  scuff: 3,
  clippings: 4,
  wilt: 5,
  scalp: 6,
  puddle: 7,
  /** A clippings heap from a grass bag. It smothers like a loose item until mown. */
  heap: 8,
  /** Ruts from dragging heavy junk across the patch. */
  flat: 9
} as const
export type MessKind = (typeof Mess)[keyof typeof Mess]

/**
 * Where a loose item is in its life. `carried` means it's in Biscuit's mouth, and `sunk`
 * is heavy junk that landed: it stays put and nobody can lift it again.
 */
export type ItemState =
  'rest' | 'slide' | 'air' | 'fall' | 'held' | 'teeter' | 'carried' | 'sunk'

/**
 * An analytic flight. Ground position runs from (x0, y0) at tau 0 to (x1, y1) at tau 1,
 * and height is `4 H tau (1 - tau)`. Time `t0` is the garden time at tau 0.
 */
export interface Flight {
  x0: number
  y0: number
  x1: number
  y1: number
  H: number
  T: number
  t0: number
  /**
   * What happens when tau reaches `endTau`. `settle` puts the item down softly, with no
   * crush and no landing report, for things the game tips out (crate gnomes, bin litter).
   */
  outcome: 'land' | 'cross' | 'clip' | 'wide' | 'settle'
  endTau: number
  /** True for a flight off a trampoline. */
  bounced?: boolean
}

/** A loose item on (or above) your garden. */
export interface Item {
  id: number
  kind: ItemKind
  /** Ground position in lawn units. */
  lx: number
  ly: number
  /** Height above the ground in units, for drawing. */
  h: number
  /** Slide velocity in units per second, or fall speed in `vh`. */
  vx: number
  vy: number
  vh: number
  state: ItemState
  flight: Flight | null
  /** Drawn rotation in radians, and spin while flying. */
  angle: number
  spin: number
  /** Garden time when a yanked weed wilts, or -1. */
  wiltAt: number
  /** Garden time when a teeter ends. */
  teeterUntil: number
  /** Garden time it came to rest, or -1 while it moves or is held. */
  restSince: number
  /** Garden time it next takes 1 health from the patch it lies on, or -1. */
  nextDamageAt: number
  /** True when it came over the fence from the neighbour. */
  fromNeighbour: boolean
  /** True for your own throw that bounced off a trampoline next door and came back. */
  back: boolean
  /** Which of the 4 litter looks it has: crisp packet, pizza box, banana skin or sock. */
  look: number
}

/** A weed growing in a patch. A dandelion turns into a seed clock 40s after it sprouts. */
export interface RootedWeed {
  id: number
  patch: number
  lx: number
  ly: number
  kind: 'weed' | 'dandelion' | 'seedClock'
  bornAt: number
  /** Garden time a dandelion turns into a seed clock, or Infinity. */
  clockAt: number
  /** Garden time it next takes 1 health from its patch. */
  nextDrainAt: number
  /** Garden time it next spreads to a neighbouring patch. */
  nextSpreadAt: number
  /** Times it has spread, for the seeded pick of a neighbour. */
  spreads: number
}

/** A snail crawling across the lawn along one row, from hedge to hedge. */
export interface Snail {
  id: number
  lx: number
  ly: number
  /** 1 crawls toward your right hedge, -1 toward your left. */
  dir: 1 | -1
  /** The patch it sits on, or -1 off the lawn. */
  patch: number
  /** Garden time it next eats 1 health from its patch. */
  nextEatAt: number
}

/** What a hit test found under a press. */
export type HitTarget =
  | { type: 'item'; id: number; distance: number }
  | { type: 'weed'; id: number; distance: number }
  | { type: 'snail'; id: number; distance: number }

/** One item leaving over the fence, in the thrower's frame. */
export interface Crossing {
  kind: ItemKind
  /** Crossing point in units from the thrower's left hedge. */
  x: number
  /** Garden time of the crossing. */
  at: number
  /** Depth still to fly past the fence. */
  d: number
  /** Sideways distance still to fly, in the thrower's frame. */
  dx: number
  /** Share of the flight already flown at the crossing. */
  tau: number
  T: number
  H: number
  spin: number
  /** Ms until a yanked weed wilts, or -1. */
  wiltIn: number
  /** True when it bounced off a trampoline rather than leaving a hand. */
  bounced: boolean
  /** True when it flies back to the garden that threw it, after a bounce. */
  back: boolean
  /** The litter look, 0 to 3. */
  look: number
}

/** A throw that clipped the fence top, so the neighbour can draw the teeter. */
export interface ClipRecord {
  kind: ItemKind
  x: number
  at: number
}

/** A landing on your lawn, reported to the neighbour in the next lawn update. */
export interface Landing {
  patch: number
  kind: ItemKind
  at: number
}

/** Why a release put an item down instead of throwing it. */
export type PutDownReason = 'slow' | 'angle' | 'still' | 'bag' | 'cancel'

/** Things the garden tells the scene and the session about. */
export type GardenEvent =
  /** You pulled a rooted weed out of (lx, ly); it's loose item `id` now. */
  | { type: 'yank'; id: number; lx: number; ly: number }
  /** You grabbed a crawling snail, and it hid in its shell. */
  | { type: 'shell'; id: number }
  /** You threw an item: its swipe speed and how far it flies along the ground, wind and arm included. */
  | { type: 'throw'; id: number; speedPx: number; distance: number }
  /**
   * You let go without throwing: too slow, aimed off the fence, held still, the bag off
   * the compost, or a press the browser cancelled.
   */
  | { type: 'putDown'; id: number; reason: PutDownReason }
  /**
   * A throw that couldn't go: the hand needs 0.4s, or the arm meter is full. The item
   * dropped at (lx, ly).
   */
  | {
      type: 'tired'
      id: number
      reason: 'hand' | 'tired'
      lx: number
      ly: number
    }
  /** You let go of weed `id` before pulling it out, so it stays rooted at (lx, ly). */
  | { type: 'rooted'; id: number; lx: number; ly: number }
  /**
   * A fast flick on grass grabbed nothing. It started at (lx, ly) and headed along
   * (dirX, dirY). `near` is the thing within 88 px of the press when the flick aimed
   * within 60 degrees of the fence, or null.
   */
  | {
      type: 'miss'
      lx: number
      ly: number
      dirX: number
      dirY: number
      near: HitTarget | null
    }
  /** You caught something falling over the fence. */
  | { type: 'catch'; id: number }
  /** Your throw, item `id`, crossed the fence and left your garden. */
  | { type: 'cross'; id: number; crossing: Crossing; flight: Flight }
  /** Your throw `id` clipped the fence and teeters on top. */
  | { type: 'clip'; id: number; clip: ClipRecord }
  /** Item `id` landed on your lawn. */
  | { type: 'land'; id: number; landing: Landing; fromNeighbour: boolean }
  /** Throw `id` arrived from the neighbour, entering at ground point (x, ly) and height h. */
  | {
      type: 'arrive'
      id: number
      kind: ItemKind
      x: number
      ly: number
      h: number
    }
  | { type: 'dry'; patch: number; health: number }
  | { type: 'tap'; on: boolean }
  | { type: 'pourStart'; patch: number }
  /** You stopped pouring. */
  | { type: 'pourStop' }
  | { type: 'sparkle'; patch: number }
  | { type: 'drown'; patch: number }
  | { type: 'flood'; patches: number[] }
  | { type: 'canEmpty' }
  | { type: 'tapFull' }
  | { type: 'cut'; patch: number }
  | { type: 'scalp'; patch: number }
  | { type: 'bagFull' }
  /** The bag reached 80 cuts. */
  | { type: 'bagHigh' }
  /** Mowing cleared a heap patch into the bag. */
  | { type: 'unheap'; patch: number }
  /** A grass bag burst into a clippings heap over these patches. */
  | { type: 'heap'; patches: number[]; fromNeighbour: boolean }
  /** The bag emptied into the compost bin. */
  | { type: 'compost'; cuts: number }
  /** The bag went back on the mower without emptying. */
  | { type: 'bagBack' }
  | { type: 'shaggy'; col: number }
  /**
   * A new weed came up at (lx, ly) on `patch`: on its schedule, or spread from another
   * weed or rooted from a seed when `spread`.
   */
  | {
      type: 'sprout'
      id: number
      patch: number
      spread: boolean
      lx: number
      ly: number
    }
  | { type: 'snail'; id: number; row: number; dir: 1 | -1 }
  | { type: 'wilt'; patch: number }
  /** Biscuit started circling a patch; a tap in the next 2s stops the dig. */
  | { type: 'circle'; patch: number }
  /** A tap during the circle sat Biscuit down. */
  | { type: 'sit'; patch: number }
  /** Biscuit dug a hole you didn't stop. */
  | { type: 'dig'; patch: number }
  /** Biscuit barked at an item he's about to fetch. */
  | { type: 'bark'; id: number }
  /** Biscuit picked item `id`, of `kind`, up in his mouth. */
  | { type: 'fetch'; id: number; kind: ItemKind }
  /** Biscuit dropped the item he carried, on `patch` (-1 off the lawn). */
  | { type: 'drop'; id: number; patch: number }
  /** You took the item back out of Biscuit's mouth. */
  | { type: 'takeBack'; id: number }
  /**
   * The weathervane swings: a gust arrives in 2s. In your frame, an `over` gust with
   * `dir` 1 is a tailwind and an `along` gust with `dir` 1 blows toward your right hedge.
   */
  | { type: 'vane'; kind: 'over' | 'along'; dir: 1 | -1 }
  /** A gust starts blowing, in your frame like `vane`. */
  | { type: 'gust'; kind: 'over' | 'along'; dir: 1 | -1 }
  /** A gust dies down. */
  | { type: 'calm' }
  /** A rooted dandelion turned into a seed clock. */
  | { type: 'clock'; id: number; patch: number }
  /** A seed clock burst at `patch`: its seeds land nearby, or blow over the fence when `over`. */
  | { type: 'burst'; patch: number; over: boolean }
  /** The shed banged open: the crate's gnomes fly out and the heavy junk rolls onto the patio. */
  | { type: 'shed' }
  /** You pressed heavy junk; `patio` is true while it still stands on the patio. */
  | { type: 'grip'; id: number; patio: boolean }
  /** You held heavy junk still long enough to lift it. */
  | { type: 'lift'; id: number }
  /** You let go of heavy junk without throwing it; `fast` when a drag ended in a swipe. */
  | { type: 'setDown'; id: number; fast: boolean }
  /** Dragging heavy junk flattened a patch. */
  | { type: 'flatten'; patch: number }
  /** Heavy junk landed and sank in at `patch`. */
  | {
      type: 'sink'
      id: number
      kind: ItemKind
      patch: number
      fromNeighbour: boolean
    }
  /** A thrown mower scalped a patch on its crooked run. */
  | { type: 'run'; patch: number }
  /** Something bounced off a trampoline at `patch`; `own` when it was your throw. */
  | { type: 'bounce'; patch: number; own: boolean }
  /** A mowing press ended. */
  | { type: 'mowEnd' }
  /** The yard put item `id` back at (lx, ly), where its step began. */
  | { type: 'putBack'; id: number; lx: number; ly: number }
  /** You tried to mow after throwing your mower. */
  | { type: 'noMower' }
  /** You pressed the parked mower before the finale. */
  | { type: 'mowerPoke' }
  /**
   * A mowing press cut 12 or more of column `col`'s 16 patches and it still doesn't
   * stripe: `patches` are the ones that block it.
   */
  | { type: 'blocked'; col: number; patches: number[] }
