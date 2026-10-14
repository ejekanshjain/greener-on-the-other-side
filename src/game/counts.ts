import { patchTop, reportStripes, Top, type FinalMarker } from './report'
import { JUNK_POINTS, type Scorable, type Score } from './score'
import { COLS, PATCHES } from './tuning'
import type { ItemKind } from './types'

/**
 * What Brenda counted on one lawn when she judged it. The host counts both lawns and the
 * verdict carries them, so both screens show the same counts, even after a reload.
 */
export interface Counted {
  /** Striped columns, 0 to 12. */
  stripes: number
  weeds: number
  snails: number
  holes: number
  litter: number
  /** Clippings patches. */
  clippings: number
  gnomes: number
  bins: number
  mowers: number
  trampolines: number
  /** Junk points from heavy junk that came from next door and sank here. */
  theirJunk: number
}

/** The order the counts travel in. Never reorder it. */
export const COUNTED_KEYS: readonly (keyof Counted)[] = [
  'stripes',
  'weeds',
  'snails',
  'holes',
  'litter',
  'clippings',
  'gnomes',
  'bins',
  'mowers',
  'trampolines',
  'theirJunk'
]

/** The largest count the wire takes. */
const COUNT_MAX = 999

/** Counts a lawn the way Brenda scores it. Markers flag heavy junk from next door. */
export function countLawn(
  lawn: Scorable & { markers?: readonly FinalMarker[] }
): Counted {
  let holes = 0
  for (let i = 0; i < PATCHES; i++)
    if (patchTop(lawn.patches[i] as number) === Top.hole) holes++
  const mask = reportStripes(lawn.patches)
  let stripes = 0
  for (let col = 0; col < COLS; col++) if ((mask >> col) & 1) stripes++
  let theirJunk = 0
  for (const m of lawn.markers ?? [])
    if (m.theirs) theirJunk += junkPoints(m.kind)
  const c = lawn.counts
  return {
    stripes,
    weeds: c.weeds,
    snails: c.snails,
    holes,
    litter: c.litter,
    clippings: c.heaps,
    gnomes: c.gnomes,
    bins: c.bins,
    mowers: c.mowers,
    trampolines: c.trampolines,
    theirJunk
  }
}

/** Nothing counted, for a verdict whose counts never read. */
export function zeroCounts(): Counted {
  return {
    stripes: 0,
    weeds: 0,
    snails: 0,
    holes: 0,
    litter: 0,
    clippings: 0,
    gnomes: 0,
    bins: 0,
    mowers: 0,
    trampolines: 0,
    theirJunk: 0
  }
}

/** Counts as the verdict carries them: one whole number per key, in order. */
export function countedToWire(c: Counted): number[] {
  return COUNTED_KEYS.map(key => Math.min(COUNT_MAX, c[key]))
}

/** Counts from the wire, or null when they're malformed. */
export function countedFromWire(v: unknown): Counted | null {
  if (!Array.isArray(v) || v.length !== COUNTED_KEYS.length) return null
  const out = {} as Counted
  for (let i = 0; i < COUNTED_KEYS.length; i++) {
    const n: unknown = v[i]
    if (typeof n !== 'number' || !Number.isInteger(n)) return null
    if (n < 0 || n > COUNT_MAX) return null
    out[COUNTED_KEYS[i] as keyof Counted] = n
  }
  return out
}

/** Junk points one item kind costs, or 0 for things that aren't junk. */
function junkPoints(kind: ItemKind): number {
  return kind in JUNK_POINTS ? JUNK_POINTS[kind as keyof typeof JUNK_POINTS] : 0
}

/** A score line the reveal shows a count beside. */
export type CountLine = 'green' | 'stripes' | 'tidy' | 'junk'

/** `n` with its noun, singular for 1. */
function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Tidy's kinds in their tie order: weeds, snails, holes, litter, then clippings. */
const TIDY_KINDS: readonly [keyof Counted, string, string][] = [
  ['weeds', 'weed', 'weeds'],
  ['snails', 'snail', 'snails'],
  ['holes', 'hole', 'holes'],
  ['litter', 'bit of litter', 'bits of litter'],
  ['clippings', 'clippings patch', 'clippings patches']
]
/** Junk's kinds with their points each, ties in this order. */
const JUNK_KINDS: readonly [keyof Counted, string, string, number][] = [
  ['gnomes', 'gnome', 'gnomes', JUNK_POINTS.gnome],
  ['bins', 'bin', 'bins', JUNK_POINTS.bin],
  ['mowers', 'mower', 'mowers', JUNK_POINTS.mower],
  ['trampolines', 'trampoline', 'trampolines', JUNK_POINTS.trampoline]
]

/**
 * What the reveal shows beside one score line, as parts to join with ", ": Green's scale,
 * the striped columns, and the 2 Tidy or Junk kinds that cost most. A Tidy of 20 or a
 * Junk of 0 shows nothing. A count too wide for its row keeps only its first part.
 */
export function countParts(
  line: CountLine,
  score: Score,
  c: Counted
): string[] {
  if (line === 'green') return ['of 50']
  if (line === 'stripes')
    return [
      c.stripes === 0 ? 'no columns' : plural(c.stripes, 'column', 'columns')
    ]
  if (line === 'tidy') {
    if (score.tidy >= COACH_PAR.tidy) return []
    return TIDY_KINDS.map(([key, one, many], order) => ({
      n: c[key],
      order,
      text: plural(c[key], one, many)
    }))
      .filter(k => k.n > 0)
      .sort((a, b) => b.n - a.n || a.order - b.order)
      .slice(0, 2)
      .map(k => k.text)
  }
  if (score.junk >= 0) return []
  return JUNK_KINDS.map(([key, one, many, points], order) => ({
    cost: c[key] * points,
    order,
    text: plural(c[key], one, many)
  }))
    .filter(k => k.cost > 0)
    .sort((a, b) => b.cost - a.cost || a.order - b.order)
    .slice(0, 2)
    .map(k => k.text)
}

/** Where every lawn starts, and the lines the coach tip compares yours with. */
export const COACH_PAR = { green: 36, tidy: 20 } as const
/** A loss under this many points on every line isn't worth a coach tip. */
const COACH_MIN_LOSS = 3

/**
 * The coach tip for your last round: what cost you most that you could have prevented,
 * and the fix. Junk counts every gnome and your own heavy junk, not heavy junk from next
 * door. Ties go Junk, then Tidy, then Green. With no loss of 3 or more, a lawn with no
 * stripes hears about stripes, and one with a stripe gets nothing.
 */
export function coachLine(score: Score, c: Counted): string | null {
  const junk = Math.max(0, -score.junk - c.theirJunk)
  const tidy = Math.max(0, COACH_PAR.tidy - score.tidy)
  const green = Math.max(0, COACH_PAR.green - score.green)
  const worst = Math.max(junk, tidy, green)
  if (worst < COACH_MIN_LOSS)
    return c.stripes === 0 ? 'No stripes. Mow a whole column slowly.' : null
  if (junk === worst)
    return junk > c.gnomes
      ? `Junk cost you ${junk}. Throw it from halfway up.`
      : `Gnomes cost you ${junk}. Throw them all over.`
  if (tidy === worst) {
    const pests = c.weeds + c.snails
    const mess = c.litter + c.clippings
    if (pests >= c.holes && pests >= mess)
      return `Weeds and snails cost you ${tidy}. Throw them.`
    if (c.holes >= mess)
      return `Holes cost you ${tidy}. Press Biscuit as he circles.`
    return `Litter and clippings cost you ${tidy}. Clear them.`
  }
  return `Dry grass cost you ${green}. Water brown grass.`
}

/**
 * Every coach line with a two-digit number, for the width check. A Tidy loss is at most
 * 20, and Junk and Green losses stay under 100.
 */
export const COACH_LINES: readonly string[] = [
  'Gnomes cost you 28. Throw them all over.',
  'Junk cost you 28. Throw it from halfway up.',
  'Weeds and snails cost you 20. Throw them.',
  'Holes cost you 20. Press Biscuit as he circles.',
  'Litter and clippings cost you 20. Clear them.',
  'Dry grass cost you 28. Water brown grass.',
  'No stripes. Mow a whole column slowly.'
]
