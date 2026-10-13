import { Garden, type GardenOptions } from './garden'
import { ALL_ROWS, patchAt, patchCenter } from './grid'
import { footprintPatches, footprintRect, type HeavyKind } from './heavy'
import {
  patchHealth,
  patchLength,
  patchTop,
  Top,
  type Counts,
  type LawnReport,
  type Marker
} from './report'
import { patchJitter } from './seed'
import { PATCH_D, PATCH_W, PATCHES, WILT_MS } from './tuning'
import { isHeavy, Mess, type Item, type ItemKind } from './types'

/** Which count each item kind adds to, as the lawn report counts them. */
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

/** Light items the counts still owe once the markers are placed, in the order they go down. */
const LEFTOVERS: readonly [keyof Counts, ItemKind][] = [
  ['gnomes', 'gnome'],
  ['litter', 'litter'],
  ['snails', 'snailShell'],
  ['weeds', 'weed']
]

/** Your heavy junk, dropped from the patio in this order when the copy says it's gone. */
const PATIO_ORDER: readonly HeavyKind[] = ['bin', 'trampoline', 'mower']

/**
 * Rebuilds your garden after a reload from your neighbour's last copy of it, a lawn
 * report taken at garden time `copyT`. A fresh garden first runs to `copyT` with nobody
 * touching it, so every seeded schedule (weeds, snails, Biscuit, gusts, the shed) stands
 * where live play left it. The lawn then takes the copy's health, length, holes, heaps,
 * puddles, mess, rooted weeds and lying items. Patio junk can't show in a copy, so it
 * stays as the idle run left it, minus what the copy says you moved or threw. Your own
 * faults, the bag, the can, the tap and the arm meter come back as the copy had them.
 * Catch up from there with `advanceTo`.
 */
export function rebuildGarden(
  options: GardenOptions,
  copy: LawnReport,
  copyT: number
): Garden {
  const garden = new Garden(options)
  garden.advanceTo(copyT)
  restoreLawn(garden, copy)
  restoreChores(garden, copy)
  garden.drainEvents()
  return garden
}

/** Your own faults and chores from the copy, so a reload never empties a bag or rests an arm. */
function restoreChores(garden: Garden, copy: LawnReport): void {
  Object.assign(garden.blame, copy.blame)
  const { bag, can, tapOn, tapRunMs, arm } = copy.chores
  garden.mower.bag = bag
  garden.water.can = can
  garden.water.tapOn = tapOn
  garden.water.tapRunMs = tapOn ? tapRunMs : 0
  garden.arm.level = arm
  garden.arm.at = garden.t
}

function restoreLawn(garden: Garden, copy: LawnReport): void {
  const grid = garden.grid
  const tops = new Uint8Array(PATCHES)
  for (let i = 0; i < PATCHES; i++) {
    const byte = copy.patches[i] as number
    const top = patchTop(byte)
    tops[i] = top
    grid.health[i] = patchHealth(byte)
    grid.length[i] = patchLength(byte)
    grid.hole[i] = top === Top.hole ? 1 : 0
    // A copy shows mess only as "some mess", so every mark comes back as a scuff.
    grid.mess[i] =
      top === Top.puddle
        ? Mess.puddle
        : top === Top.mess
          ? Mess.scuff
          : Mess.none
  }
  grid.dirtyRows = ALL_ROWS
  for (let i = 0; i < PATCHES; i++) if (tops[i] === Top.heap) garden.heapOn(i)

  // Rooted weeds: the idle run's weed where it had one, so its kind and timers carry on.
  // A weed under an item or a heap can't show, so the idle run's stays while the count
  // still has room for it, after the weeds the markers name as lying loose.
  const idleWeeds = garden.weeds.splice(0, garden.weeds.length)
  let weedsLeft = copy.counts.weeds
  for (const marker of copy.markers)
    if (COUNT_OF[marker.kind] === 'weeds') weedsLeft--
  for (let i = 0; i < PATCHES; i++) {
    if (tops[i] !== Top.weed) continue
    weedsLeft--
    const idle = idleWeeds.find(w => w.patch === i)
    if (idle) garden.weeds.push(idle)
    else garden.plantWeed(i)
  }
  for (const weed of idleWeeds)
    if (weedsLeft > 0 && (tops[weed.patch] as number) >= Top.item) {
      garden.weeds.push(weed)
      weedsLeft--
    }
  // The copy says what crawls and lies on the lawn; the idle run's patio and air stay.
  for (let i = garden.snails.length - 1; i >= 0; i--)
    if ((garden.snails[i]?.patch ?? -1) >= 0) garden.snails.splice(i, 1)
  const patio: Item[] = []
  for (let i = garden.items.length - 1; i >= 0; i--) {
    const item = garden.items[i] as Item
    if (!lying(item)) continue
    if (patchAt(item.lx, item.ly) >= 0) garden.items.splice(i, 1)
    else if (isHeavy(item.kind)) patio.push(item)
  }

  // The markers below take their own weeds off the count again.
  const left: Counts = {
    ...copy.counts,
    weeds: copy.counts.weeds - garden.weeds.length
  }
  const marked = new Uint8Array(PATCHES)
  const parked: HeavyKind[] = []
  let k = 0
  for (const marker of copy.markers) {
    const key = COUNT_OF[marker.kind]
    if (key) left[key] = Math.max(0, left[key] - 1)
    if (isHeavy(marker.kind)) {
      const item = placeHeavy(garden, marker, tops)
      if (item.state === 'rest') parked.push(marker.kind as HeavyKind)
      if (item.state === 'rest' && marker.kind === 'mower')
        garden.mowerId = item.id
      continue
    }
    placeLight(garden, marker.kind, marker.patch, k++)
    marked[marker.patch] = 1
  }
  // Items past the markers' reach go on the item patches no marker filled. Items under a
  // heap, a hole or heavy junk can't show, so those patches take any still left over.
  let spots: number[] = []
  for (let i = 0; i < PATCHES; i++)
    if (tops[i] === Top.item && !marked[i]) spots.push(i)
  if (spots.length === 0)
    for (let i = 0; i < PATCHES; i++)
      if ((tops[i] as number) >= Top.heap) spots.push(i)
  let n = 0
  for (const [key, kind] of LEFTOVERS)
    for (let j = 0; j < left[key] && spots.length > 0; j++)
      placeLight(garden, kind, spots[n++ % spots.length] as number, k++)

  restorePatio(garden, copy, patio, parked)
}

/** True for an item lying on the ground, as the lawn report counts it. */
function lying(item: Item): boolean {
  return (
    item.state === 'rest' ||
    item.state === 'slide' ||
    item.state === 'held' ||
    item.state === 'carried' ||
    item.state === 'sunk'
  )
}

/** A light item lying on a patch, spread a little so several on one patch don't stack. */
function placeLight(
  garden: Garden,
  kind: ItemKind,
  patch: number,
  k: number
): void {
  const c = patchCenter(patch)
  const j = patchJitter(garden.seed, 5000 + k)
  const item = garden.place(kind, c.lx + j.dx * 0.8, c.ly + j.dy * 0.8)
  item.look = k % 4
  // How long a thrown weed had left is unknown, so it gets half its wilt time.
  if (kind === 'weed' || kind === 'dandelion')
    item.wiltAt = garden.t + WILT_MS / 2
}

/**
 * Heavy junk from a marker. When every patch of its footprint shows heavy junk it had
 * landed and sunk; otherwise it was set down after a drag and still stands there.
 */
function placeHeavy(garden: Garden, marker: Marker, tops: Uint8Array): Item {
  const kind = marker.kind as HeavyKind
  const c = patchCenter(marker.patch)
  // A sunk 2 by 2 sits on the corner its marker patch shares with the 3 patches above
  // and to its left; a sunk 3 by 3 sits in its marker patch's middle.
  const corner = kind !== 'trampoline'
  const x = corner ? c.lx - PATCH_W / 2 : c.lx
  const y = corner ? c.ly - PATCH_D / 2 : c.ly
  const rect = footprintRect(kind, x, y, true)
  const under = footprintPatches(rect)
  const sunk =
    under.length > 0 &&
    under.includes(marker.patch) &&
    under.every(p => tops[p] === Top.heavy)
  if (!sunk) return garden.place(kind, c.lx, c.ly)
  const item = garden.place(
    kind,
    (rect.x0 + rect.x1) / 2,
    (rect.y0 + rect.y1) / 2
  )
  item.state = 'sunk'
  return item
}

/**
 * Your own heavy junk on the patio: the idle run rolled all 3 out, but the copy knows how
 * many you threw and which ones stand on your lawn after a drag. Those leave the patio.
 */
function restorePatio(
  garden: Garden,
  copy: LawnReport,
  patio: Item[],
  parked: HeavyKind[]
): void {
  garden.heaviesThrown = copy.patio.heaviesThrown
  garden.mowerGone = copy.patio.mowerThrown
  const drop = (kind: HeavyKind): boolean => {
    const index = patio.findIndex(item => item.kind === kind)
    if (index < 0) return false
    const [item] = patio.splice(index, 1)
    const at = item ? garden.items.indexOf(item) : -1
    if (at >= 0) garden.items.splice(at, 1)
    return true
  }
  for (const kind of parked) drop(kind)
  if (copy.patio.mowerThrown) drop('mower')
  const keep = Math.max(
    0,
    PATIO_ORDER.length - copy.patio.heaviesThrown - parked.length
  )
  for (const kind of PATIO_ORDER) if (patio.length > keep) drop(kind)
}
