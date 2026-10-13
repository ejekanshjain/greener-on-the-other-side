import type { ItemKind } from './types'

/** Drawn radius of each item kind in lawn units. Presses within it grab the item. */
export const ITEM_RADIUS: Record<ItemKind, number> = {
  weed: 16,
  dandelion: 16,
  seedClock: 16,
  snailShell: 12,
  gnome: 18,
  litter: 14,
  bag: 26,
  bin: 40,
  mower: 40,
  trampoline: 42,
  seed: 6
}

/**
 * How far above its ground point an item's drawing is centred, in lawn units. Heavy junk
 * stands upright until it lands; sunk junk draws flat on the ground instead.
 */
export const ITEM_LIFT: Record<ItemKind, number> = {
  weed: 10,
  dandelion: 12,
  seedClock: 12,
  snailShell: 6,
  gnome: 16,
  litter: 4,
  bag: 14,
  bin: 38,
  mower: 0,
  trampoline: 44,
  seed: 4
}
