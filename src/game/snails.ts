import { patchAt } from './grid'
import { LAWN_W, PATCH_D, SNAIL_EAT_MS, SNAIL_SPEED } from './tuning'
import type { Snail } from './types'

/** A snail just inside a hedge on `row`, crawling away from it. */
export function newSnail(
  id: number,
  dir: 1 | -1,
  row: number,
  jitter: number,
  at: number
): Snail {
  return {
    id,
    lx: dir > 0 ? 0 : LAWN_W,
    ly: row * PATCH_D + PATCH_D / 2 + jitter,
    dir,
    patch: -1,
    nextEatAt: at + SNAIL_EAT_MS
  }
}

/** A snail coming out of its shell at (lx, ly), heading for the nearer hedge. */
export function snailFromShell(
  id: number,
  lx: number,
  ly: number,
  at: number
): Snail {
  return {
    id,
    lx,
    ly,
    dir: lx < LAWN_W / 2 ? -1 : 1,
    patch: -1,
    nextEatAt: at + SNAIL_EAT_MS
  }
}

/**
 * Moves a snail one tick along its row. It slimes each patch it enters and eats 1 health
 * from the patch it sits on every 8s. Returns false once it has crawled out at a hedge.
 */
export function crawl(
  snail: Snail,
  t: number,
  dt: number,
  slime: (patch: number) => void,
  eat: (patch: number) => void
): boolean {
  snail.lx += snail.dir * SNAIL_SPEED * dt
  if (snail.dir > 0 ? snail.lx > LAWN_W : snail.lx < 0) return false
  const patch = patchAt(snail.lx, snail.ly)
  if (patch !== snail.patch) {
    snail.patch = patch
    if (patch >= 0) slime(patch)
  }
  while (snail.nextEatAt <= t) {
    if (patch >= 0) eat(patch)
    snail.nextEatAt += SNAIL_EAT_MS
  }
  return true
}
