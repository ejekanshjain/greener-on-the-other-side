import { markDirty, patchAt, patchCenter, setMess, type Grid } from './grid'
import { digSpot } from './seed'
import {
  BARK_MS,
  BED_POS,
  BISCUIT_HIT,
  CIRCLE_LAPS,
  CIRCLE_MS,
  CIRCLE_R,
  COLS,
  DIG_MS,
  DROP_LY,
  FETCH_COOLDOWN_MS,
  FETCH_MS,
  LAWN_D,
  LAWN_W,
  MOUTH_DX,
  MOUTH_H,
  PATIO_D,
  ROWS,
  SIT_MS,
  TRAMPLE_MAX,
  TROT_SPEED
} from './tuning'
import { isHeavy, Mess, type GardenEvent, type Item } from './types'

/**
 * What Biscuit is doing. He sleeps until 2:20 left, then rests in his bed (`idle`), eyes
 * an item and trots to it (`eye`), carries it to the back row (`carry`), trots to a dig
 * (`toDig`), circles the patch (`circle`), sits after a tap (`sit`) or digs (`dig`).
 */
export type DogState =
  'sleep' | 'idle' | 'eye' | 'carry' | 'toDig' | 'circle' | 'sit' | 'dig'

/** Biscuit, your dog. Positions are lawn units, times are garden ms. */
export interface Biscuit {
  state: DogState
  x: number
  y: number
  /** 1 faces right, -1 faces left. */
  face: 1 | -1
  /** Garden time the current state began. */
  since: number
  /** The item he's eyeing or carrying, or -1. */
  item: number
  /** When the eyed item's untouched count started. */
  watchFrom: number
  /** The patch he's trotting to, circling, sitting by or digging, or -1. */
  patch: number
  /** Index of the next scheduled dig. */
  nextDig: number
  /** No pickups before this garden time. */
  fetchReadyAt: number
  /** Garden time he last became free to eye items. */
  freeSince: number
  /** Patches trampled on this carry, and the patch he last stood on. */
  trampled: number
  lastPatch: number
  /** Where he's heading while eyeing or carrying. */
  goalX: number
  goalY: number
  /** Where and when the trot to a dig started. */
  fromX: number
  fromY: number
  leftAt: number
}

/** A carried item tilts this far, in radians, so it lies sideways in his mouth. */
const CARRY_TILT = 1.2

/** Biscuit's drawn body centre sits this far above his ground point. */
export const DOG_LIFT = 20

/** Biscuit asleep in his bed. */
export function createBiscuit(): Biscuit {
  return {
    state: 'sleep',
    x: BED_POS.lx,
    y: BED_POS.ly,
    face: -1,
    since: 0,
    item: -1,
    watchFrom: 0,
    patch: -1,
    nextDig: 0,
    fetchReadyAt: 0,
    freeSince: 0,
    trampled: 0,
    lastPatch: -1,
    goalX: 0,
    goalY: 0,
    fromX: 0,
    fromY: 0,
    leftAt: 0
  }
}

/** What Biscuit's garden shows him each tick. */
export interface Yard {
  /** Garden time now. */
  t: number
  /** Garden time he wakes (2:20 left). */
  wakeAt: number
  /** When each of the round's digs starts its circle. */
  digAt: readonly number[]
  seed: number
  items: readonly Item[]
  grid: Grid
  emit(event: GardenEvent): void
}

/**
 * True for an item Biscuit will fetch: a light item lying still on your lawn, off the
 * back row. A snail shell opens before he'd reach it, and a bag never lies on the lawn.
 */
export function fetchable(item: Item): boolean {
  if (item.state !== 'rest' || item.restSince < 0) return false
  if (isHeavy(item.kind) || item.kind === 'bag' || item.kind === 'snailShell')
    return false
  const patch = patchAt(item.lx, item.ly)
  return patch >= 0 && patch < (ROWS - 1) * COLS
}

/** True when a press at (lx, ly) within `reach` units taps Biscuit as he circles a patch. */
export function biscuitHit(
  dog: Biscuit,
  lx: number,
  ly: number,
  reach: number
): boolean {
  if (dog.state !== 'circle') return false
  const c = patchCenter(dog.patch)
  return (
    Math.hypot(lx - c.lx, ly - (c.ly - DOG_LIFT)) <=
    Math.max(reach, BISCUIT_HIT)
  )
}

/** A tap while he circles sits him for 10s and calls the dig off. Returns true when it did. */
export function patBiscuit(dog: Biscuit, yard: Yard): boolean {
  if (dog.state !== 'circle') return false
  dog.state = 'sit'
  dog.since = yard.t
  dog.nextDig++
  yard.emit({ type: 'sit', patch: dog.patch })
  return true
}

/** Runs Biscuit for one tick of `dt` seconds. Digs always win over whatever he's doing. */
export function stepBiscuit(dog: Biscuit, yard: Yard, dt: number): void {
  const t = yard.t
  leaveForDig(dog, yard)
  switch (dog.state) {
    case 'sleep':
      if (t >= yard.wakeAt) free(dog, t)
      return
    case 'idle':
      trot(dog, BED_POS.lx, BED_POS.ly, dt)
      eye(dog, yard)
      return
    case 'eye':
      return stepEye(dog, yard, dt)
    case 'carry':
      return stepCarry(dog, yard, dt)
    case 'toDig':
      return stepToDig(dog, yard)
    case 'circle':
      return stepCircle(dog, yard)
    case 'sit':
      if (t - dog.since >= SIT_MS) free(dog, t)
      return
    case 'dig':
      if (t - dog.since >= DIG_MS) free(dog, t)
      return
  }
}

/** The patch the next dig takes: the first seeded spot without a hole, or -1. */
function nextDigPatch(dog: Biscuit, yard: Yard): number {
  for (let j = 0; j < 8; j++) {
    const patch = digSpot(yard.seed, dog.nextDig, j)
    if (yard.grid.hole[patch] === 0) return patch
  }
  return -1
}

/** The longest trot to any dig spot, from anywhere on the lawn or patio, in ms. */
const MAX_TROT_MS =
  (Math.hypot(LAWN_W + CIRCLE_R, LAWN_D + PATIO_D) / TROT_SPEED) * 1000

/**
 * Sets off for the next dig once trotting there takes all the time left before it. A
 * carried item drops where he stands, and a sit ends early.
 */
function leaveForDig(dog: Biscuit, yard: Yard): void {
  if (dog.state === 'toDig' || dog.state === 'circle' || dog.state === 'dig')
    return
  const at = yard.digAt[dog.nextDig]
  // Until even the longest trot would be late, there's nothing to work out.
  if (at === undefined || yard.t + MAX_TROT_MS < at) return
  const patch = nextDigPatch(dog, yard)
  if (patch < 0) {
    dog.nextDig++
    return
  }
  const c = patchCenter(patch)
  const travelMs =
    (Math.hypot(c.lx + CIRCLE_R - dog.x, c.ly - dog.y) / TROT_SPEED) * 1000
  if (yard.t + travelMs < at) return
  if (dog.state === 'carry') dropCarried(dog, yard)
  dog.state = 'toDig'
  dog.since = yard.t
  dog.item = -1
  dog.patch = patch
  dog.fromX = dog.x
  dog.fromY = dog.y
  dog.leftAt = yard.t
}

/** Starts eyeing the item that has lain untouched longest, once that's 1.5s. */
function eye(dog: Biscuit, yard: Yard): void {
  if (yard.t < dog.fetchReadyAt) return
  let best: Item | null = null
  let from = Infinity
  for (const item of yard.items) {
    if (!fetchable(item)) continue
    const watched = Math.max(item.restSince, dog.freeSince)
    if (watched < from) {
      from = watched
      best = item
    }
  }
  if (!best || yard.t - from < BARK_MS) return
  dog.state = 'eye'
  dog.since = yard.t
  dog.item = best.id
  dog.watchFrom = from
  // Stand on the side he comes from, mouth toward the item, unless a hedge is in the way.
  dog.face = best.lx >= dog.x ? 1 : -1
  const standX = best.lx - dog.face * MOUTH_DX
  if (standX < 10 || standX > LAWN_W - 10) dog.face = -dog.face as 1 | -1
  dog.goalX = best.lx - dog.face * MOUTH_DX
  dog.goalY = best.ly
  yard.emit({ type: 'bark', id: best.id })
}

/** Trots to the eyed item and picks it up once it has lain untouched for 3s. */
function stepEye(dog: Biscuit, yard: Yard, dt: number): void {
  const item = findItem(yard.items, dog.item)
  if (!item || !fetchable(item)) return free(dog, yard.t)
  const face = dog.face
  dog.goalX = item.lx - face * MOUTH_DX
  dog.goalY = item.ly
  const there = trot(dog, dog.goalX, dog.goalY, dt)
  dog.face = face
  if (!there || yard.t - dog.watchFrom < FETCH_MS) return
  item.state = 'carried'
  item.vx = item.vy = 0
  dog.state = 'carry'
  dog.since = yard.t
  dog.fetchReadyAt = yard.t + FETCH_COOLDOWN_MS
  dog.trampled = 0
  dog.lastPatch = patchAt(dog.x, dog.y)
  // Straight back toward the house, to the back row in the item's own column.
  const dropX = Math.min(LAWN_W - 25, Math.max(25, item.lx))
  dog.goalX = dropX - face * MOUTH_DX
  dog.goalY = DROP_LY
  yard.emit({ type: 'fetch', id: item.id })
}

/** Carries the item to the back row, trampling the first 4 patches he enters on the way. */
function stepCarry(dog: Biscuit, yard: Yard, dt: number): void {
  const item = findItem(yard.items, dog.item)
  // Taken back, or it wilted in his mouth.
  if (!item || item.state !== 'carried') return free(dog, yard.t)
  const face = dog.face
  const there = trot(dog, dog.goalX, dog.goalY, dt)
  dog.face = face
  item.lx = dog.x + face * MOUTH_DX
  item.ly = dog.y + 1
  item.h = MOUTH_H
  // Held sideways in his jaws.
  item.angle = face * CARRY_TILT
  const patch = patchAt(dog.x, dog.y)
  if (patch !== dog.lastPatch) {
    dog.lastPatch = patch
    if (patch >= 0 && dog.trampled < TRAMPLE_MAX) {
      setMess(yard.grid, patch, Mess.trample)
      dog.trampled++
    }
  }
  if (!there) return
  dropCarried(dog, yard)
  free(dog, yard.t)
}

/** Trots to the dig so he reaches the circle's start exactly when the circle begins. */
function stepToDig(dog: Biscuit, yard: Yard): void {
  const at = yard.digAt[dog.nextDig] ?? yard.t
  const c = patchCenter(dog.patch)
  const tx = c.lx + CIRCLE_R
  const span = at - dog.leftAt
  const f =
    span > 0 ? Math.min(1, Math.max(0, (yard.t - dog.leftAt) / span)) : 1
  dog.x = dog.fromX + (tx - dog.fromX) * f
  dog.y = dog.fromY + (c.ly - dog.fromY) * f
  if (Math.abs(tx - dog.fromX) > 1) dog.face = tx > dog.fromX ? 1 : -1
  if (yard.t < at) return
  dog.state = 'circle'
  dog.since = at
  yard.emit({ type: 'circle', patch: dog.patch })
}

/** Circles the patch 3 times in 2s, then digs a hole unless a tap sat him first. */
function stepCircle(dog: Biscuit, yard: Yard): void {
  const c = patchCenter(dog.patch)
  const k = (yard.t - dog.since) / CIRCLE_MS
  if (k >= 1) {
    dog.state = 'dig'
    dog.since = yard.t
    dog.nextDig++
    yard.grid.hole[dog.patch] = 1
    markDirty(yard.grid, dog.patch)
    yard.emit({ type: 'dig', patch: dog.patch })
    return
  }
  const a = Math.PI * 2 * CIRCLE_LAPS * k
  dog.x = c.lx + Math.cos(a) * CIRCLE_R
  dog.y = c.ly + Math.sin(a) * CIRCLE_R * 0.6
  // The way he's running: the circle's x velocity is -sin(a).
  dog.face = Math.sin(a) > 0 ? -1 : 1
}

/** Puts down whatever he carries where it is now. */
function dropCarried(dog: Biscuit, yard: Yard): void {
  const item = findItem(yard.items, dog.item)
  dog.item = -1
  if (!item || item.state !== 'carried') return
  item.state = 'rest'
  item.h = 0
  item.angle = 0
  item.lx = Math.min(LAWN_W - 4, Math.max(4, item.lx))
  item.ly = Math.min(LAWN_D - 4, Math.max(4, item.ly))
  yard.emit({ type: 'drop', id: item.id, patch: patchAt(item.lx, item.ly) })
}

/** Back to idle: he heads for his bed and starts watching for things to fetch. */
function free(dog: Biscuit, t: number): void {
  dog.state = 'idle'
  dog.since = t
  dog.freeSince = t
  dog.item = -1
  dog.patch = -1
}

/** Moves him toward (x, y) at trotting speed. Returns true once he's there. */
function trot(dog: Biscuit, x: number, y: number, dt: number): boolean {
  const dx = x - dog.x
  const dy = y - dog.y
  const d = Math.hypot(dx, dy)
  const step = TROT_SPEED * dt
  if (Math.abs(dx) > 0.5) dog.face = dx > 0 ? 1 : -1
  if (d <= step) {
    dog.x = x
    dog.y = y
    return true
  }
  dog.x += (dx / d) * step
  dog.y += (dy / d) * step
  return false
}

function findItem(items: readonly Item[], id: number): Item | undefined {
  if (id < 0) return undefined
  return items.find(item => item.id === id)
}
