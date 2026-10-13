import { armLevel } from './arm'
import type { Blame, Garden } from './garden'
import { healthSum, patchAt } from './grid'
import {
  COLS,
  LANDING_CAP,
  PATCHES,
  PEEK_MARKER_CAP,
  PEEK_ROW_COUNT,
  SHORT_MAX,
  STRIPE_MIN
} from './tuning'
import { isHeavy, Mess, type Item, type ItemKind } from './types'

/** What sits on top of a patch, highest priority last. A patch is clean only at 0. */
export const Top = {
  clean: 0,
  mess: 1,
  puddle: 2,
  weed: 3,
  item: 4,
  heap: 5,
  hole: 6,
  heavy: 7
} as const

/** Per-type counts of what lies on the lawn, so a lawn report scores like a final. */
export interface Counts {
  weeds: number
  snails: number
  gnomes: number
  litter: number
  heaps: number
  bins: number
  mowers: number
  trampolines: number
}

/** The order the counts travel in. Never reorder it. */
export const COUNT_KEYS: readonly (keyof Counts)[] = [
  'weeds',
  'snails',
  'gnomes',
  'litter',
  'heaps',
  'bins',
  'mowers',
  'trampolines'
]

/** Own-fault counts in the order they travel. Never reorder it. */
export const BLAME_KEYS: readonly (keyof Blame)[] = [
  'drowned',
  'scalped',
  'clips',
  'flattened',
  'bounces',
  'digs'
]

/** A thing on a patch: an item in the peek rows, heavy junk anywhere, or a landing. */
export interface Marker {
  patch: number
  kind: ItemKind
}

/** The patio's state, for the reload rebuild. */
export interface Patio {
  /** Heavy junk thrown so far, 0 to 7. */
  heaviesThrown: number
  mowerThrown: boolean
  /** Crate gnomes still on the patio, 0 to 15. */
  crateLeft: number
}

/** Your chores mid-round, so a reload rebuild never empties the bag or stops a running tap. */
export interface Chores {
  /** Cuts in the grass bag, 0 to 96. */
  bag: number
  /** Ms of pouring left in the can. */
  can: number
  tapOn: boolean
  /** Ms the tap has run toward its next flood. */
  tapRunMs: number
  /** The arm meter's level, 0 to 1. */
  arm: number
}

/** One garden's lawn as its neighbour sees it, once a second. */
export interface LawnReport {
  round: number
  /** One byte per patch: health (3 bits), length (2 bits) and top state (3 bits). */
  patches: Uint8Array
  counts: Counts
  patio: Patio
  /** Round wins for the host and the guest; only the host fills it in. */
  tally: [number, number]
  /** Your own faults so far, for Brenda's blame line after a rebuild. */
  blame: Blame
  chores: Chores
  /** Items in rows 0 to 3, at most 24, then every piece of heavy junk. */
  markers: Marker[]
  /** The neighbour's throws that landed here since the last report, at most 8. */
  landings: Marker[]
}

/** No own faults yet. */
export function noBlame(): Blame {
  return {
    drowned: 0,
    scalped: 0,
    clips: 0,
    flattened: 0,
    bounces: 0,
    digs: 0
  }
}

/** Packs a patch byte. */
export function packPatch(health: number, length: number, top: number): number {
  return ((health & 7) << 5) | ((length & 3) << 3) | (top & 7)
}

export const patchHealth = (byte: number): number => (byte >> 5) & 7
export const patchLength = (byte: number): number => (byte >> 3) & 3
export const patchTop = (byte: number): number => byte & 7

/** An empty set of counts. */
export function noCounts(): Counts {
  return {
    weeds: 0,
    snails: 0,
    gnomes: 0,
    litter: 0,
    heaps: 0,
    bins: 0,
    mowers: 0,
    trampolines: 0
  }
}

/**
 * True for an item that lies on the lawn and counts: not in the air or on the fence. One
 * in Biscuit's mouth still counts, since he only moves it around your lawn, and so does
 * sunk heavy junk.
 */
function lying(item: Item): boolean {
  return (
    item.state === 'rest' ||
    item.state === 'slide' ||
    item.state === 'held' ||
    item.state === 'carried' ||
    item.state === 'sunk'
  )
}

const COUNT_OF: Partial<Record<ItemKind, keyof Counts>> = {
  weed: 'weeds',
  dandelion: 'weeds',
  seedClock: 'weeds',
  snailShell: 'snails',
  gnome: 'gnomes',
  litter: 'litter',
  bin: 'bins',
  mower: 'mowers',
  trampoline: 'trampolines'
}

/**
 * Builds the lawn report for a garden right now. Only things lying on lawn patches count;
 * the patio and anything in the air don't. Crawling snails count and mark like shells.
 */
export function lawnReport(
  garden: Garden,
  landings: readonly Marker[],
  tally: [number, number] = [0, 0]
): LawnReport {
  const grid = garden.grid
  const top = new Uint8Array(PATCHES)
  const counts = noCounts()
  for (let i = 0; i < PATCHES; i++) {
    const mess = grid.mess[i] as number
    if (mess === Mess.heap) counts.heaps++
    top[i] =
      grid.hole[i] === 1
        ? Top.hole
        : mess === Mess.heap
          ? Top.heap
          : mess === Mess.puddle
            ? Top.puddle
            : mess !== Mess.none
              ? Top.mess
              : Top.clean
  }
  const raise = (patch: number, value: number) => {
    if ((top[patch] as number) < value) top[patch] = value
  }
  const markers: Marker[] = []
  const heavies: Marker[] = []
  const mark = (patch: number, kind: ItemKind) => {
    if (isHeavy(kind)) heavies.push({ patch, kind })
    else if (patch < PEEK_ROW_COUNT * COLS && markers.length < PEEK_MARKER_CAP)
      markers.push({ patch, kind })
  }
  for (const weed of garden.weeds) {
    counts.weeds++
    raise(weed.patch, Top.weed)
  }
  for (const snail of garden.snails) {
    if (snail.patch < 0) continue
    counts.snails++
    raise(snail.patch, Top.item)
    mark(snail.patch, 'snailShell')
  }
  for (const item of garden.items) {
    if (!lying(item)) continue
    const patch = patchAt(item.lx, item.ly)
    if (patch < 0) continue
    const key = COUNT_OF[item.kind]
    if (key) counts[key]++
    if (item.state === 'sunk')
      for (const p of garden.footprintOf(item)) raise(p, Top.heavy)
    raise(patch, isHeavy(item.kind) ? Top.heavy : Top.item)
    mark(patch, item.kind)
  }
  const patches = new Uint8Array(PATCHES)
  for (let i = 0; i < PATCHES; i++)
    patches[i] = packPatch(
      grid.health[i] as number,
      grid.length[i] as number,
      top[i] as number
    )
  return {
    round: garden.round,
    patches,
    counts,
    patio: {
      heaviesThrown: Math.min(7, garden.heaviesThrown),
      mowerThrown: garden.mowerGone,
      crateLeft: 0
    },
    tally,
    blame: { ...garden.blame },
    chores: {
      bag: garden.mower.bag,
      can: garden.water.can,
      tapOn: garden.water.tapOn,
      tapRunMs: garden.water.tapRunMs,
      arm: armLevel(garden.arm, garden.t)
    },
    markers: markers.concat(heavies),
    landings: landings.slice(-LANDING_CAP)
  }
}

/**
 * The striped columns of a reported lawn, as a 12-bit mask: 14 of a column's 16 patches
 * short and clean, the same rule as a live lawn.
 */
export function reportStripes(patches: Uint8Array): number {
  let mask = 0
  for (let c = 0; c < COLS; c++) {
    let good = 0
    for (let i = c; i < PATCHES; i += COLS) {
      const byte = patches[i] as number
      if (patchLength(byte) <= SHORT_MAX && patchTop(byte) === Top.clean) good++
    }
    if (good >= STRIPE_MIN) mask |= 1 << c
  }
  return mask
}

/** A thing lying on the lawn in a final: what it is, its look, and whether it sank in. */
export interface FinalMarker {
  patch: number
  kind: ItemKind
  look: number
  sunk: boolean
}

/** One garden's true lawn at 0:00, for Brenda: what she scores, the blame, and every item. */
export interface FinalReport {
  round: number
  patches: Uint8Array
  counts: Counts
  /** The exact sum of every patch's health, for the tie-break. */
  healthSum: number
  blame: Blame
  markers: FinalMarker[]
}

/**
 * Builds a garden's final: its lawn report's patches and counts, its own-fault counts,
 * the exact health sum and a marker for every item lying on the lawn, crawling snails
 * included. Call it once the garden has caught up to the end of play.
 */
export function finalReport(garden: Garden): FinalReport {
  const report = lawnReport(garden, [])
  const markers: FinalMarker[] = []
  for (const snail of garden.snails)
    if (snail.patch >= 0)
      markers.push({
        patch: snail.patch,
        kind: 'snailShell',
        look: 0,
        sunk: false
      })
  for (const item of garden.items) {
    if (!lying(item)) continue
    const patch = patchAt(item.lx, item.ly)
    if (patch < 0) continue
    markers.push({
      patch,
      kind: item.kind,
      look: item.look,
      sunk: item.state === 'sunk'
    })
  }
  return {
    round: garden.round,
    patches: report.patches,
    counts: report.counts,
    healthSum: healthSum(garden.grid),
    blame: { ...garden.blame },
    markers
  }
}
