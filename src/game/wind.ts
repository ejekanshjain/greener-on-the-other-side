import { hash01 } from '../shared/math'
import {
  GUST_JITTER_MS,
  GUST_LEFT_MS,
  GUST_MS,
  ROUND_MS,
  VANE_LEAD_MS,
  WIND_POWER,
  WIND_SIDE_MAX,
  WIND_SIDE_SHARE
} from './tuning'
import type { ItemKind } from './types'

/** Keeps the wind's draws independent of every other schedule. */
const WIND_SALT = 0x9b05688c

/**
 * One gust in the host's frame. An `over` gust with `dir` 1 blows over the fence toward
 * the guest, a tailwind for the host. An `along` gust with `dir` 1 blows toward the host's
 * right hedge. Times are garden ms.
 */
export interface Gust {
  kind: 'over' | 'along'
  dir: 1 | -1
  at: number
  end: number
}

/** The wind one garden feels, in its own frame. */
export interface Wind {
  /** 1 for a tailwind (blowing toward your neighbour), -1 for a headwind, 0 for none. */
  over: number
  /** 1 pushes toward your right hedge, -1 toward your left, 0 for none. */
  side: number
}

/**
 * The round's 6 gusts in the host's frame, the same for both gardens. They come in this
 * order: over A, along L, over B, along R, over A, over B. A coin flip picks who gets the
 * first tailwind and which way the first along gust blows, so each player gets 2
 * tailwinds, 1 of them in the last 40s. Slot times scale with `?fast` rounds.
 */
export function gustsFor(seed: number, roundMs: number): Gust[] {
  const s = seed ^ WIND_SALT
  const a = hash01(s, 0) < 0.5 ? 1 : -1
  const l = hash01(s, 1) < 0.5 ? 1 : -1
  const order: [Gust['kind'], number][] = [
    ['over', a],
    ['along', l],
    ['over', -a],
    ['along', -l],
    ['over', a],
    ['over', -a]
  ]
  const scale = roundMs / ROUND_MS
  return GUST_LEFT_MS.map((left, k) => {
    const [kind, dir] = order[k] as [Gust['kind'], number]
    const jitter = (2 * hash01(s, 2 + k) - 1) * GUST_JITTER_MS
    const at = roundMs - (left + jitter) * scale
    return { kind, dir: dir > 0 ? 1 : -1, at, end: at + GUST_MS }
  })
}

/** A gust's direction in one garden's frame: the guest feels both kinds reversed. */
export function gustDir(gust: Gust, host: boolean): 1 | -1 {
  return host ? gust.dir : gust.dir > 0 ? -1 : 1
}

/**
 * The gust blowing at garden time `t`, or the one the vane already shows because it
 * arrives within 2s, or null when calm. A later gust wins if two overlap.
 */
export function gustNear(gusts: readonly Gust[], t: number): Gust | null {
  for (let k = gusts.length - 1; k >= 0; k--) {
    const gust = gusts[k] as Gust
    if (t >= gust.at - VANE_LEAD_MS && t < gust.end) return gust
  }
  return null
}

/** The wind one garden feels at garden time `t`, written into `out`. */
export function windAt(
  gusts: readonly Gust[],
  t: number,
  host: boolean,
  out: Wind
): Wind {
  out.over = 0
  out.side = 0
  let gust: Gust | null = null
  for (let k = gusts.length - 1; k >= 0 && !gust; k--) {
    const g = gusts[k] as Gust
    if (t >= g.at && t < g.end) gust = g
  }
  if (!gust) return out
  const dir = gustDir(gust, host)
  if (gust.kind === 'over') out.over = dir
  else out.side = dir
  return out
}

/** A throw's distance multiplier under this wind: 1.3 with a tailwind, 0.7 into a headwind. */
export function windPower(wind: Wind): number {
  return 1 + WIND_POWER * wind.over
}

/** How far an along gust pushes a throw of ground distance `D` sideways, signed by lawn x. */
export function windDrift(side: number, D: number): number {
  return side * Math.min(WIND_SIDE_MAX, WIND_SIDE_SHARE * D)
}

/** Light things a gust slides across the lawn. */
export function blownByWind(kind: ItemKind): boolean {
  return kind === 'seedClock' || kind === 'litter' || kind === 'snailShell'
}
