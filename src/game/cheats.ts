/**
 * Cheats on a garden's state, for the dev panel, `window.__game` and tests. Only the
 * dev scripting module and tests import this file, so production builds never contain it.
 */

import type { Garden } from './garden'
import { markDirty, setHealth } from './grid'
import { GUST_MS, LENGTH_MAX, PATCHES, VANE_LEAD_MS } from './tuning'
import type { Gust } from './wind'

/** Fields a cheat can set on a patch. */
export interface PatchFields {
  health?: number
  length?: number
  mess?: number
  hole?: number
}

/** Sets fields on one patch at once. */
export function setPatch(
  garden: Garden,
  patch: number,
  fields: PatchFields
): void {
  const grid = garden.grid
  if (patch < 0 || patch >= PATCHES) return
  if (fields.health !== undefined) setHealth(grid, patch, fields.health)
  if (fields.length !== undefined)
    grid.length[patch] = Math.max(0, Math.min(LENGTH_MAX, fields.length))
  if (fields.mess !== undefined) grid.mess[patch] = fields.mess
  if (fields.hole !== undefined) grid.hole[patch] = fields.hole ? 1 : 0
  markDirty(grid, patch)
}

/** Takes `steps` health from every patch at once, like the dev panel's Dry Lawn. */
export function dryAll(garden: Garden, steps: number): void {
  for (let i = 0; i < PATCHES; i++)
    setHealth(garden.grid, i, (garden.grid.health[i] as number) - steps)
}

/**
 * Adds a dig whose circle starts `inMs` from now. 3.5s gives Biscuit time to trot there
 * from anywhere. The other garden keeps its seeded digs.
 */
export function digSoon(garden: Garden, inMs = 3500): void {
  const digAt = garden.digSchedule as number[]
  digAt.splice(garden.biscuit.nextDig, 0, garden.t + inMs)
}

/**
 * Keeps Biscuit from eyeing, fetching or setting off for another dig for the rest of the
 * round, so a check can watch other tips. A dig he has already set off for still happens.
 */
export function quietDog(garden: Garden): void {
  const dog = garden.biscuit
  const digging =
    dog.state === 'toDig' || dog.state === 'circle' || dog.state === 'dig'
  ;(garden.digSchedule as number[]).length = dog.nextDig + (digging ? 1 : 0)
  dog.fetchReadyAt = Infinity
}

/**
 * A gust in the garden's own frame whose vane swings at the next tick and which blows 2s
 * later. Returns false while another gust is on its way or blowing.
 */
export function gustSoon(
  garden: Garden,
  kind: Gust['kind'] = 'over',
  dir: 1 | -1 = 1
): boolean {
  const t = garden.t
  const gusts = garden.gusts as Gust[]
  // Gusts run in order, so these counts are the garden's next vane and next calm.
  const swung = gusts.filter(g => t >= g.at - VANE_LEAD_MS).length
  const calmed = gusts.filter(g => t >= g.end).length
  if (swung !== calmed) return false
  const at = t + VANE_LEAD_MS
  const hostDir = garden.host ? dir : dir > 0 ? -1 : 1
  gusts.splice(swung, 0, { kind, dir: hostDir, at, end: at + GUST_MS })
  return true
}
