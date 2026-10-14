import { clamp, hash01 } from '../shared/math'
import { armBlock, armLevel, createArm, spendThrow, type Arm } from './arm'
import { heapPatches, onBag, overCompost } from './bag'
import {
  biscuitHit,
  createBiscuit,
  patBiscuit,
  stepBiscuit,
  type Biscuit,
  type Yard
} from './biscuit'
import {
  arrivalFlight,
  bounceFlight,
  crossingOf,
  entryFastForward,
  flightPoint,
  flightTau,
  groundSpeed,
  planThrow
} from './flight'
import {
  createGrid,
  crush,
  lawnClock,
  markDirty,
  patchAt,
  patchCenter,
  runTimers,
  setMess,
  stripeMask,
  type Grid
} from './grid'
import {
  footprintPatches,
  footprintRect,
  inRect,
  litterSpill,
  mowerRun,
  rollSpeed,
  type HeavyKind
} from './heavy'
import { ITEM_LIFT, ITEM_RADIUS } from './items'
import { createMower, mowTo, parkMower, type Mower, type MowEvent } from './mow'
import { towardFence, type Release } from './press'
import { lying } from './report'
import {
  isDandelion,
  newWeed,
  seedPatches,
  spreadPatch,
  sproutPatch,
  stepWeeds
} from './weeds'
import {
  createWater,
  pourAt,
  stepWater,
  stopPour,
  toggleTap,
  type Water,
  type WaterEvent
} from './water'
import {
  biscuitWakeAt,
  crateSpots,
  digTimes,
  gnomeSpots,
  patchJitter,
  shedAt,
  snailSpot,
  snailTimes,
  weedTimes
} from './seed'
import { crawl, newSnail, snailFromShell } from './snails'
import {
  blownByWind,
  gustDir,
  gustsFor,
  windAt,
  windPower,
  type Gust,
  type Wind
} from './wind'
import {
  BAG_LIFT_MIN,
  BAG_POS,
  BLOCKED_CUTS,
  BIN_POS,
  BIN_ROLL,
  CATCH_RADIUS_SCALE,
  CRATE_FLIGHT_MS,
  CRATE_STAGGER_MS,
  CRUSH_HEAVY,
  FLATTEN,
  LIFT_H,
  MOWER_POS,
  MOWER_RUN_STEP_MS,
  SHED_DOOR,
  TRAMPOLINE_POS,
  DANDELION_FROM_ROUND,
  DANDELION_SHARE,
  CLIP_DROP_MAX,
  CLIP_DROP_MIN,
  CLIP_TEETER_MS,
  COLS,
  COMPOST_MS,
  CRUSH_GNOME,
  CRUSH_LIGHT,
  FALL_GRAVITY,
  FENCE_TOP_H,
  HOLD_CLAMP,
  LAWN_D,
  LAWN_W,
  LENGTH_MAX,
  LOOSE_CAP,
  PATCHES,
  PATIO_D,
  REST_DAMAGE_MS,
  ROUND_MS,
  SEED_FLY_PAST,
  SEED_FLY_SPREAD,
  SEED_ROOT_MS,
  SHELL_MS,
  SHORT_MAX,
  SKID_SHARE,
  SLIDE_DECAY,
  SLIDE_STOP,
  SNAIL_CAP,
  THROW_UNITS_PER_PX,
  TICK_MS,
  VANE_LEAD_MS,
  WEED_CAP,
  WILT_MS,
  WIND_SLIDE,
  YANK_PULL
} from './tuning'
import {
  isHeavy,
  Mess,
  type Crossing,
  type Flight,
  type GardenEvent,
  type HitTarget,
  type Item,
  type ItemKind,
  type RootedWeed,
  type Snail
} from './types'

/** A throw arriving from the neighbour, already in the thrower's frame. */
export type Arrival = Pick<
  Crossing,
  'kind' | 'x' | 'd' | 'dx' | 'tau' | 'T' | 'H' | 'spin' | 'wiltIn'
> &
  Partial<Pick<Crossing, 'bounced' | 'back' | 'look'>>

/** Everything that can change a garden. Commands queue and apply at the next tick. */
export type GardenCommand =
  | { type: 'grab'; target: HitTarget; lx: number; ly: number }
  | { type: 'grabBag'; lx: number; ly: number }
  | { type: 'hold'; lx: number; ly: number }
  | { type: 'release'; release: Release }
  /**
   * A fast flick that started on grass at (lx, ly), with the finger now at (toX, toY): it
   * grabs the nearest light thing within `reach` units, or misses. `near` is the reach
   * the miss reports a thing within, in lawn units.
   */
  | {
      type: 'snap'
      lx: number
      ly: number
      toX: number
      toY: number
      reach: number
      near: number
    }
  | { type: 'arrive'; arrival: Arrival; ffMs: number }
  | { type: 'spawn'; kind: ItemKind; lx: number; ly: number }
  | { type: 'tap' }
  | { type: 'pour'; lx: number; ly: number }
  | { type: 'pourEnd' }
  | { type: 'mow'; lx: number; ly: number; speedPx: number }
  | { type: 'mowEnd' }
  | { type: 'sprout'; patch: number }
  /** Tap Biscuit: while he circles a patch, he sits and the dig is off. */
  | { type: 'pat' }
  /** The heavy junk in your hand has been held still long enough to lift. */
  | { type: 'lift' }
  /** A press on the parked mower before the finale. */
  | { type: 'pokeMower' }

/** What your hand holds: a rooted weed you're pulling, or a loose item. */
interface Held {
  target: 'item' | 'weed'
  id: number
  /** The point the item must stay near: where you grabbed it, or the weed's root. */
  anchorX: number
  anchorY: number
  /** Offset from your finger to the item's ground point. */
  offX: number
  offY: number
  /** Where the press started; a weed comes out once the finger is 60 units from here. */
  pressX: number
  pressY: number
  /** Where the finger is now, for a rooted weed's pull. */
  fingerX: number
  fingerY: number
  /**
   * For heavy junk: waiting to see whether you drag or lift it, dragging it along, or
   * lifted, when only a throw works. Undefined for light things.
   */
  grip?: 'wait' | 'drag' | 'lift'
  /** Garden time you took hold of heavy junk, for the lift ring. */
  gripAt?: number
}

/** A thrown mower's crooked run after it lands. */
export interface MowerRun {
  id: number
  /** The patches it drives, in order; each gets scalped as it arrives. */
  path: number[]
  /** Where it landed. */
  fromX: number
  fromY: number
  startAt: number
  /** Patches reached so far. */
  done: number
}

const MAX_EVENTS = 64
const SPIN_MAX = 9

/** The set bits in a 16-bit mask. */
function popcount16(bits: number): number {
  let n = 0
  for (let b = bits; b; b &= b - 1) n++
  return n
}

/** A dandelion seed lying on a patch, waiting to root as a weed at garden time `at`. */
export interface Seed {
  patch: number
  lx: number
  ly: number
  at: number
}

/** Damage you did to your own lawn, for Brenda's blame line. */
export interface Blame {
  drowned: number
  scalped: number
  clips: number
  flattened: number
  bounces: number
  digs: number
}

/** Options for a new garden. */
export interface GardenOptions {
  /** The round seed; both gardens of a round share it. */
  seed: number
  /** The round index, 0 to 2. Round 1's second weed sprouts on the back row. */
  round?: number
  /** The round's play length, which scales the lawn's timers for `?fast`. */
  roundMs?: number
  /** Play stops at this garden time. Defaults to `roundMs`; the lobby preview uses 0. */
  endMs?: number
  /** Round 3 dries `HEATWAVE_DRY` times as fast. */
  heatwave?: boolean
  /** True for the host's garden. Gusts are set in the host's frame; the guest feels them reversed. */
  host?: boolean
  /** Dev and tests only: no gusts, and Biscuit sleeps all round. */
  calm?: boolean
  /**
   * The lobby's yard: no gnomes to start, no schedules (weeds, snails, Biscuit, wind, the
   * shed), no drying, growth, weed spread, wilting or damage from lying items, and no end.
   */
  yard?: boolean
}

/**
 * One player's garden: the grid, rooted weeds, loose items and your hand. It is pure and
 * deterministic. Time runs in fixed ticks from the round's play start, and commands
 * apply at the next tick, so a big `advanceTo` jump and many small ones end in the same
 * state when nobody acts.
 */
export class Garden {
  readonly seed: number
  readonly grid: Grid
  readonly blame: Blame = {
    drowned: 0,
    scalped: 0,
    clips: 0,
    flattened: 0,
    bounces: 0,
    digs: 0
  }
  readonly water: Water
  readonly mower: Mower = createMower()
  readonly arm: Arm = createArm()
  readonly round: number
  readonly items: Item[] = []
  readonly weeds: RootedWeed[] = []
  readonly snails: Snail[] = []
  /** Dandelion seeds waiting to root, oldest first. */
  readonly seeds: Seed[] = []
  readonly biscuit: Biscuit = createBiscuit()
  /** The round's gusts in the host's frame, and the wind this garden feels now. */
  readonly gusts: readonly Gust[]
  readonly wind: Wind = { over: 0, side: 0 }
  readonly host: boolean
  /** Garden time in ms since play started. */
  t = 0
  /** A full round's length here, which `?fast` shortens; schedules scale with it. */
  readonly roundMs: number
  /** True for the lobby's yard lawn (see `GardenOptions.yard`). */
  readonly yardLawn: boolean
  /** Play stops at this garden time; later ticks do nothing. */
  readonly endMs: number
  held: Held | null = null
  private ticks = 0
  private nextId = 1
  private readonly queue: GardenCommand[] = []
  private readonly pending: GardenEvent[] = []
  private readonly point = { x: 0, y: 0, h: 0 }
  private readonly occupied = new Uint8Array(PATCHES)
  private readonly stuck = new Uint8Array(COLS)
  /** The rows of each column this mowing press has cut, one bit a row. */
  private readonly pressCuts = new Uint16Array(COLS)
  /** Garden times of the round's scheduled weeds and snails, and the next of each. */
  private readonly weedAt: number[]
  private readonly snailAt: number[]
  private nextWeed = 0
  private nextSnail = 0
  /** Patches under a clippings heap, and when each next smothers its patch. */
  private readonly heaps: number[] = []
  private readonly heapDamageAt = new Float64Array(PATCHES)
  /** Garden time the held bag started resting on the compost bin, or -1. */
  compostSince = -1
  /** What Biscuit sees of the garden; its time follows every tick. */
  private readonly yard: Yard
  /** The next gust whose vane swing, start and end haven't been announced yet. */
  private nextVane = 0
  private nextGust = 0
  private nextCalm = 0
  /** Garden time the shed bangs open (0:40 left), and whether it has. */
  shedAt: number
  shedOpen = false
  /** The mower's item id once the finale makes it junk, or -1. */
  mowerId = -1
  /** True once you threw your mower: no more mowing this round. */
  mowerGone = false
  /** Heavy junk you threw this round. */
  heaviesThrown = 0
  /** Thrown mowers driving their crooked runs. */
  readonly runs: MowerRun[] = []
  /** Patches the current drag already flattened, so each counts once per drag. */
  private readonly flattened = new Uint8Array(PATCHES)
  private readonly patches: number[] = []
  /** True once this press heard that the mower is gone, so it says so once. */
  private noMowerSaid = false

  constructor({
    seed,
    round = 0,
    roundMs = ROUND_MS,
    endMs = roundMs,
    heatwave = false,
    host = true,
    calm = false,
    yard = false
  }: GardenOptions) {
    this.seed = seed
    this.round = round
    this.roundMs = roundMs
    this.endMs = yard ? Infinity : endMs
    this.host = host
    this.yardLawn = yard
    // The yard keeps only what you do: nothing happens to it on a timetable.
    const quiet = calm || yard
    this.gusts = quiet ? [] : gustsFor(seed, roundMs)
    this.weedAt = yard ? [] : weedTimes(seed, round, roundMs)
    this.snailAt = yard ? [] : snailTimes(seed, roundMs)
    this.grid = createGrid(seed, lawnClock(roundMs, heatwave))
    this.water = createWater(heatwave)
    this.shedAt = yard ? Infinity : shedAt(roundMs)
    this.yard = {
      t: 0,
      wakeAt: quiet ? Infinity : biscuitWakeAt(roundMs),
      digAt: quiet ? [] : digTimes(seed, roundMs),
      seed,
      items: this.items,
      grid: this.grid,
      emit: this.dogEvent
    }
    if (!yard)
      gnomeSpots(seed).forEach((patch, k) => {
        const { lx, ly } = patchCenter(patch)
        const j = patchJitter(seed, k)
        this.addItem('gnome', lx + j.dx, ly + j.dy)
      })
  }

  /** Queues a command for the next tick. */
  command(cmd: GardenCommand): void {
    this.queue.push(cmd)
  }

  /** Runs every fixed tick up to garden time `t`, stopping at the end of play. */
  advanceTo(t: number): void {
    const target = Math.min(t, this.endMs)
    while ((this.ticks + 1) * TICK_MS <= target + 1e-6) {
      this.ticks++
      this.t = this.ticks * TICK_MS
      this.step()
    }
  }

  /** Hands over the events since the last call. */
  drainEvents(): GardenEvent[] {
    return this.pending.splice(0, this.pending.length)
  }

  /** The item with this id, or undefined. */
  item(id: number): Item | undefined {
    return this.items.find(item => item.id === id)
  }

  /**
   * The nearest grabbable thing within `reach` units of a lawn point. Loose items,
   * catchable throws and the item in Biscuit's mouth come before rooted weeds and crawling
   * snails; a target counts within its drawn radius when that is larger, and a falling
   * throw or a carried item within 1.5 times it.
   */
  hitTest(lx: number, ly: number, reach: number): HitTarget | null {
    let best: HitTarget | null = null
    for (const item of this.items) {
      if (isHeavy(item.kind)) continue
      // Falling throws and the item bobbing in Biscuit's mouth get extra reach.
      const moving = this.catchable(item) || item.state === 'carried'
      if (item.state !== 'rest' && item.state !== 'slide' && !moving) continue
      const d = Math.hypot(
        item.lx - lx,
        item.ly - item.h - ITEM_LIFT[item.kind] - ly
      )
      const radius = ITEM_RADIUS[item.kind] * (moving ? CATCH_RADIUS_SCALE : 1)
      if (d > Math.max(reach, radius)) continue
      if (!best || d < best.distance)
        best = { type: 'item', id: item.id, distance: d }
    }
    if (best) return best
    for (const weed of this.weeds) {
      const d = Math.hypot(weed.lx - lx, weed.ly - ITEM_LIFT[weed.kind] - ly)
      if (d > Math.max(reach, ITEM_RADIUS[weed.kind])) continue
      if (!best || d < best.distance)
        best = { type: 'weed', id: weed.id, distance: d }
    }
    for (const snail of this.snails) {
      const d = Math.hypot(snail.lx - lx, snail.ly - ITEM_LIFT.snailShell - ly)
      if (d > Math.max(reach, ITEM_RADIUS.snailShell)) continue
      if (!best || d < best.distance)
        best = { type: 'snail', id: snail.id, distance: d }
    }
    if (best) return best
    // Heavy junk comes last, so a gnome lying by the bin is still easy to grab.
    for (const item of this.items) {
      if (!isHeavy(item.kind)) continue
      if (item.state !== 'rest' && item.state !== 'slide') continue
      const d = Math.hypot(item.lx - lx, item.ly - ITEM_LIFT[item.kind] - ly)
      if (d > Math.max(reach, ITEM_RADIUS[item.kind])) continue
      if (!best || d < best.distance)
        best = { type: 'item', id: item.id, distance: d }
    }
    return best
  }

  /**
   * Where the mower parks: its patio spot, or wherever you set it down in the finale.
   * Null while it's in your hand, flying or sunk next door.
   */
  mowerHome(): { lx: number; ly: number } | null {
    if (this.mowerId < 0) return MOWER_POS
    const item = this.item(this.mowerId)
    return item && (item.state === 'rest' || item.state === 'slide')
      ? item
      : null
  }

  /**
   * True when a press at (lx, ly) within `reach` lands on the parked mower before the
   * finale. A press on the drawn bag doesn't count, even while the bag is too empty to lift.
   */
  mowerHit(lx: number, ly: number, reach: number): boolean {
    return (
      this.mowerId < 0 &&
      Math.hypot(lx - MOWER_POS.lx, ly - MOWER_POS.ly) <=
        Math.max(reach, ITEM_RADIUS.mower) &&
      (this.mower.bagOff || !onBag(lx, ly, 0))
    )
  }

  /**
   * How far the rooted weed in your hand is pulled, from 0 at the press to 1 at the
   * 60-unit pull that pops it out, in any direction. -1 when you hold no rooted weed.
   */
  pullProgress(): number {
    const held = this.held
    if (held?.target !== 'weed') return -1
    const d = Math.hypot(held.fingerX - held.pressX, held.fingerY - held.pressY)
    return Math.min(1, d / YANK_PULL)
  }

  /**
   * The columns that stripe right now by Brenda's rule, as a 12-bit mask: rooted weeds,
   * snails and anything lying on a patch keep it from counting, an item in your hand or
   * in Biscuit's mouth included.
   */
  stripes(): number {
    return stripeMask(this.grid, this.cover(false))
  }

  /**
   * The stripes as they stand once nothing is carried: like `stripes`, but an item in
   * your hand or Biscuit's mouth covers nothing. Stripe cues follow this mask, so
   * carrying something across a stripe hides it with no cue.
   */
  settledStripes(): number {
    return stripeMask(this.grid, this.cover(true))
  }

  /**
   * Flags the patches something covers, in a buffer the next call reuses: rooted weeds,
   * snails, items lying there (Brenda's `lying`, held and carried too unless `settled`),
   * and the whole footprint of sunk heavy junk.
   */
  private cover(settled: boolean): Uint8Array {
    const occupied = this.occupied
    occupied.fill(0)
    for (const weed of this.weeds) occupied[weed.patch] = 1
    for (const snail of this.snails)
      if (snail.patch >= 0) occupied[snail.patch] = 1
    for (const item of this.items) {
      if (item.state === 'sunk') {
        for (const p of this.footprintOf(item)) occupied[p] = 1
        continue
      }
      if (!lying(item)) continue
      if (settled && (item.state === 'held' || item.state === 'carried'))
        continue
      const patch = patchAt(item.lx, item.ly)
      if (patch >= 0) occupied[patch] = 1
    }
    return occupied
  }

  /**
   * The patches in column `col` that keep it from striping by Brenda's rule: long,
   * marked, holed or covered.
   */
  stripeBlockers(col: number): number[] {
    const occupied = this.cover(false)
    const grid = this.grid
    const out: number[] = []
    for (let i = col; i < PATCHES; i += COLS)
      if (
        (grid.length[i] as number) > SHORT_MAX ||
        grid.mess[i] !== Mess.none ||
        grid.hole[i] === 1 ||
        occupied[i] === 1
      )
        out.push(i)
    return out
  }

  /**
   * How many patches of each column one mowing pass can't clear, in a 12-entry buffer the
   * next call reuses: holes, and whatever covers a patch by Brenda's rule. Bots read it to
   * pick a column worth mowing.
   */
  stuckByColumn(): Uint8Array {
    const occupied = this.cover(false)
    const stuck = this.stuck
    stuck.fill(0)
    for (let i = 0; i < PATCHES; i++)
      if (occupied[i] === 1 || this.grid.hole[i] === 1)
        stuck[i % COLS] = (stuck[i % COLS] as number) + 1
    return stuck
  }

  /** The patches under a sunk piece of heavy junk. The list is reused by the next call. */
  footprintOf(item: Item): readonly number[] {
    return footprintPatches(
      footprintRect(item.kind as HeavyKind, item.lx, item.ly, true),
      this.patches
    )
  }

  /**
   * True when a press at (lx, ly) within `reach` units lifts the grass bag off the parked
   * mower. The bag lifts only with at least 24 cuts in it, so a nearly empty bag stays put.
   */
  bagHit(lx: number, ly: number, reach: number): boolean {
    const bag = this.bagSpot()
    return (
      !this.held &&
      bag !== null &&
      !this.mower.bagOff &&
      this.mower.bag >= BAG_LIFT_MIN &&
      onBag(lx, ly, reach, bag.lx, bag.ly)
    )
  }

  /** The bag's centre on the parked mower, or null while the mower isn't parked. */
  bagSpot(): { lx: number; ly: number } | null {
    const home = this.mowerHome()
    if (!home) return null
    return {
      lx: home.lx + BAG_POS.lx - MOWER_POS.lx,
      ly: home.ly + BAG_POS.ly - MOWER_POS.ly
    }
  }

  /** True when a press at (lx, ly) within `reach` units taps Biscuit as he circles a patch. */
  biscuitHit(lx: number, ly: number, reach: number): boolean {
    return biscuitHit(this.biscuit, lx, ly, reach)
  }

  /** When each of this round's digs starts its circle, in garden ms. */
  get digSchedule(): readonly number[] {
    return this.yard.digAt
  }

  /** The held bag, if your hand holds it. */
  heldBag(): Item | undefined {
    const held = this.held
    if (held?.target !== 'item') return undefined
    const item = this.item(held.id)
    return item?.kind === 'bag' ? item : undefined
  }

  /**
   * True for a throw from the neighbour that is past its peak and drawn at or below the
   * fence top, so a press can catch it before it touches your grass.
   */
  catchable(item: Item): boolean {
    // A grass bag bursts on landing and a seed is too small to catch.
    return (
      item.state === 'air' &&
      item.fromNeighbour &&
      item.kind !== 'bag' &&
      item.kind !== 'seed' &&
      !isHeavy(item.kind) &&
      item.flight !== null &&
      flightTau(item.flight, this.t) >= 0.5 &&
      item.ly - item.h >= -FENCE_TOP_H
    )
  }

  /** Puts an item down at once, lying still, outside the command queue. For the reload rebuild and the yard. */
  place(kind: ItemKind, lx: number, ly: number): Item {
    return this.addItem(kind, lx, ly)
  }

  /**
   * Moves a lying item back to (lx, ly) at once, outside the command queue. For the
   * yard, whose step objects go back to their start.
   */
  putBack(id: number, lx: number, ly: number): void {
    const item = this.item(id)
    if (!item) return
    item.lx = lx
    item.ly = ly
    item.h = 0
    item.vx = item.vy = 0
    item.state = 'rest'
    item.restSince = -1
    this.emit({ type: 'putBack', id, lx, ly })
  }

  /** Roots a plain weed on a patch at once, with no event. For the reload rebuild and the yard. */
  plantWeed(patch: number): RootedWeed {
    const { lx, ly } = patchCenter(patch)
    const j = patchJitter(this.seed, 4000 + patch)
    const weed = newWeed(this.nextId++, patch, lx + j.dx, ly + j.dy, this.t)
    this.weeds.push(weed)
    return weed
  }

  /** Covers a patch with a clippings heap that smothers it from now on. For the reload rebuild. */
  heapOn(patch: number): void {
    if (this.grid.mess[patch] !== Mess.heap) this.heaps.push(patch)
    this.grid.mess[patch] = Mess.heap
    this.heapDamageAt[patch] = this.t + REST_DAMAGE_MS
    markDirty(this.grid, patch)
  }

  private step(): void {
    if (this.queue.length > 0)
      for (const cmd of this.queue.splice(0, this.queue.length)) this.apply(cmd)
    if (!this.shedOpen && this.t >= this.shedAt) this.openShed()
    if (!this.yardLawn) runTimers(this.grid, this.t, this.onDry, this.onGrow)
    this.stepCompost()
    for (const patch of this.heaps)
      while ((this.heapDamageAt[patch] as number) <= this.t) {
        crush(this.grid, patch, 1)
        this.heapDamageAt[patch] =
          (this.heapDamageAt[patch] as number) + REST_DAMAGE_MS
      }
    stepWater(this.water, this.grid, TICK_MS, this.onWater)
    const dt = TICK_MS / 1000
    this.stepWind(dt)
    this.runSchedules()
    this.rootSeeds()
    if (!this.yardLawn)
      stepWeeds(
        this.weeds,
        this.t,
        this.drainWeed,
        this.spreadWeed,
        this.onClock
      )
    for (let i = this.snails.length - 1; i >= 0; i--)
      if (!crawl(this.snails[i] as Snail, this.t, dt, this.slime, this.eat))
        this.snails.splice(i, 1)
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i] as Item
      if (item.state !== 'rest') item.restSince = item.nextDamageAt = -1
      if (
        item.wiltAt >= 0 &&
        this.t >= item.wiltAt &&
        (item.state === 'rest' ||
          item.state === 'slide' ||
          item.state === 'held' ||
          item.state === 'carried')
      ) {
        this.wilt(i)
        continue
      }
      switch (item.state) {
        case 'rest':
          this.stepRest(item, i)
          break
        case 'air':
          this.stepFlight(item, i, dt)
          break
        case 'teeter':
          if (this.t >= item.teeterUntil) this.dropFromFence(item)
          break
        case 'fall':
          item.vh += FALL_GRAVITY * dt
          item.h -= item.vh * dt
          if (item.h <= 0) this.land(item, 0, 0)
          break
        case 'slide':
          this.stepSlide(item, dt)
          break
        default:
          break
      }
    }
    this.stepRuns()
    this.yard.t = this.t
    stepBiscuit(this.biscuit, this.yard, dt)
  }

  private apply(cmd: GardenCommand): void {
    switch (cmd.type) {
      case 'grab':
        return this.grab(cmd.target, cmd.lx, cmd.ly)
      case 'grabBag':
        return this.grabBag(cmd.lx, cmd.ly)
      case 'hold':
        return this.hold(cmd.lx, cmd.ly)
      case 'release':
        return this.release(cmd.release)
      case 'snap':
        return this.snap(cmd)
      case 'arrive':
        return this.arrive(cmd.arrival, cmd.ffMs)
      case 'spawn':
        this.addItem(cmd.kind, cmd.lx, cmd.ly)
        return
      case 'tap':
        toggleTap(this.water)
        this.emit({ type: 'tap', on: this.water.tapOn })
        return
      case 'pour':
        if (!this.water.pour)
          this.emit({ type: 'pourStart', patch: patchAt(cmd.lx, cmd.ly) })
        pourAt(this.water, cmd.lx, cmd.ly)
        return
      case 'pourEnd':
        if (this.water.pour) this.emit({ type: 'pourStop' })
        stopPour(this.water)
        return
      case 'mow':
        if (this.mowerGone) {
          if (!this.noMowerSaid) this.emit({ type: 'noMower' })
          this.noMowerSaid = true
          return
        }
        mowTo(
          this.mower,
          this.grid,
          cmd.lx,
          cmd.ly,
          cmd.speedPx,
          this.t,
          this.onMow
        )
        return
      case 'mowEnd':
        this.noMowerSaid = false
        parkMower(this.mower)
        this.endMowPress()
        this.emit({ type: 'mowEnd' })
        return
      case 'sprout':
        if (!this.weeds.some(w => w.patch === cmd.patch))
          this.rootWeed(cmd.patch, this.t, 300 + this.nextId, false)
        return
      case 'pat':
        this.yard.t = this.t
        patBiscuit(this.biscuit, this.yard)
        return
      case 'lift':
        return this.lift()
      case 'pokeMower':
        this.emit({ type: 'mowerPoke' })
        return
    }
  }

  private grab(target: HitTarget, lx: number, ly: number): void {
    if (this.held) return
    if (target.type === 'snail') {
      // A grabbed snail hides in its shell, which you then hold like any item.
      const index = this.snails.findIndex(s => s.id === target.id)
      const snail = this.snails[index]
      if (!snail) return
      this.snails.splice(index, 1)
      const shell = this.addItem('snailShell', snail.lx, snail.ly)
      this.emit({ type: 'shell', id: shell.id })
      target = { type: 'item', id: shell.id, distance: 0 }
    }
    if (target.type === 'weed') {
      const weed = this.weeds.find(w => w.id === target.id)
      if (!weed) return
      this.held = {
        target: 'weed',
        id: weed.id,
        anchorX: weed.lx,
        anchorY: weed.ly,
        offX: 0,
        offY: ITEM_LIFT[weed.kind],
        pressX: lx,
        pressY: ly,
        fingerX: lx,
        fingerY: ly
      }
      return
    }
    const item = this.item(target.id)
    if (!item) return
    if (isHeavy(item.kind)) return this.gripHeavy(item, lx, ly)
    if (this.catchable(item)) {
      // A catch takes the item where you see it: its drawn point becomes its ground point.
      item.ly = Math.max(4, item.ly - item.h)
      item.h = 0
      item.flight = null
      this.emit({ type: 'catch', id: item.id })
    } else if (item.state === 'carried') {
      // Out of Biscuit's mouth; he notices on his next step and trots home.
      item.h = 0
      item.angle = 0
      this.emit({ type: 'takeBack', id: item.id })
    } else if (item.state !== 'rest' && item.state !== 'slide') return
    item.state = 'held'
    item.vx = item.vy = 0
    // Once you pick it up it's yours: if it lands here again, it isn't their landing.
    item.fromNeighbour = false
    item.back = false
    this.held = {
      target: 'item',
      id: item.id,
      anchorX: item.lx,
      anchorY: item.ly,
      offX: item.lx - lx,
      offY: item.ly - ly,
      pressX: lx,
      pressY: ly,
      fingerX: lx,
      fingerY: ly
    }
  }

  /**
   * A fast flick on grass grabs the nearest light thing within `reach` of the press and
   * follows the finger. When there's none, it reports the miss with the thing within
   * `near` of the press, if the flick aimed at the fence.
   */
  private snap(cmd: Extract<GardenCommand, { type: 'snap' }>): void {
    if (this.held) return
    const light = (target: HitTarget | null): HitTarget | null => {
      if (target?.type !== 'item') return target
      const item = this.item(target.id)
      // Heavy junk never snaps: it needs a lift, and a flick would only drag it.
      return item && !isHeavy(item.kind) ? target : null
    }
    const target = light(this.hitTest(cmd.lx, cmd.ly, cmd.reach))
    if (target) {
      this.grab(target, cmd.lx, cmd.ly)
      this.hold(cmd.toX, cmd.toY)
      return
    }
    const dx = cmd.toX - cmd.lx
    const dy = cmd.toY - cmd.ly
    const len = Math.hypot(dx, dy) || 1
    this.emit({
      type: 'miss',
      lx: cmd.lx,
      ly: cmd.ly,
      dirX: dx / len,
      dirY: dy / len,
      near: towardFence(dx, dy)
        ? light(this.hitTest(cmd.lx, cmd.ly, cmd.near))
        : null
    })
  }

  /**
   * Takes hold of heavy junk. It waits to see what you do: slide at once to drag it, or
   * hold still to lift it.
   */
  private gripHeavy(item: Item, lx: number, ly: number): void {
    if (item.state !== 'rest' && item.state !== 'slide') return
    item.state = 'held'
    item.vx = item.vy = 0
    this.flattened.fill(0)
    this.held = {
      target: 'item',
      id: item.id,
      anchorX: item.lx,
      anchorY: item.ly,
      offX: item.lx - lx,
      offY: item.ly - ly,
      pressX: lx,
      pressY: ly,
      fingerX: lx,
      fingerY: ly,
      grip: 'wait',
      gripAt: this.t
    }
    this.emit({ type: 'grip', id: item.id, patio: item.ly >= LAWN_D })
  }

  /** Lifts the heavy junk in your hand off the ground; from now on only a throw works. */
  private lift(): void {
    const held = this.held
    if (held?.grip !== 'wait') return
    const item = this.item(held.id)
    if (!item) return
    held.grip = 'lift'
    item.h = LIFT_H
    this.emit({ type: 'lift', id: item.id })
  }

  /**
   * Drags heavy junk after your finger, anywhere on the lawn or patio. Each patch its
   * footprint crosses loses 1 health, once per drag, and counts against you.
   */
  private dragHeavy(held: Held, item: Item, lx: number, ly: number): void {
    if (held.grip === 'lift') return
    if (held.grip === 'wait') {
      held.grip = 'drag'
      this.flattenUnder(item, item.lx, item.ly)
    }
    const x = clamp(lx + held.offX, 20, LAWN_W - 20)
    const y = clamp(ly + held.offY, 10, LAWN_D + PATIO_D - 20)
    const steps = Math.ceil(Math.hypot(x - item.lx, y - item.ly) / 10)
    for (let k = 1; k <= steps; k++)
      this.flattenUnder(
        item,
        item.lx + ((x - item.lx) * k) / steps,
        item.ly + ((y - item.ly) * k) / steps
      )
    item.lx = x
    item.ly = y
  }

  private flattenUnder(item: Item, lx: number, ly: number): void {
    const rect = footprintRect(item.kind as HeavyKind, lx, ly, false)
    for (const patch of footprintPatches(rect, this.patches)) {
      if (this.flattened[patch]) continue
      this.flattened[patch] = 1
      crush(this.grid, patch, FLATTEN)
      setMess(this.grid, patch, Mess.flat)
      this.blame.flattened++
      this.emit({ type: 'flatten', patch })
    }
  }

  /** Lifts the grass bag off the mower into your hand, if it has enough in it. */
  private grabBag(lx: number, ly: number): void {
    const spot = this.bagSpot()
    if (!spot || this.held || this.mower.bagOff) return
    if (this.mower.bag < BAG_LIFT_MIN) return
    const bag = this.addItem('bag', spot.lx, spot.ly)
    bag.state = 'held'
    this.mower.bagOff = true
    this.compostSince = -1
    this.held = {
      target: 'item',
      id: bag.id,
      anchorX: spot.lx,
      anchorY: spot.ly,
      offX: spot.lx - lx,
      offY: spot.ly - ly,
      pressX: lx,
      pressY: ly,
      fingerX: lx,
      fingerY: ly
    }
  }

  /** Holding the bag on the compost bin for 1.5s empties it back onto the mower. */
  private stepCompost(): void {
    const bag = this.heldBag()
    if (!bag || !overCompost(bag.lx, bag.ly)) {
      this.compostSince = -1
      return
    }
    if (this.compostSince < 0) this.compostSince = this.t
    if (this.t - this.compostSince < COMPOST_MS) return
    const cuts = this.mower.bag
    this.returnBag(bag)
    this.mower.bag = 0
    this.emit({ type: 'compost', cuts })
  }

  /** Puts the held bag back on the mower, cuts and all. */
  private returnBag(bag: Item): void {
    const index = this.items.indexOf(bag)
    if (index >= 0) this.items.splice(index, 1)
    if (this.held?.id === bag.id) this.held = null
    this.mower.bagOff = false
    this.compostSince = -1
  }

  private hold(lx: number, ly: number): void {
    const held = this.held
    if (!held) return
    held.fingerX = lx
    held.fingerY = ly
    if (held.target === 'weed') {
      if (Math.hypot(lx - held.pressX, ly - held.pressY) < YANK_PULL) return
      const index = this.weeds.findIndex(w => w.id === held.id)
      const weed = this.weeds[index]
      if (!weed) {
        this.held = null
        return
      }
      this.weeds.splice(index, 1)
      const item = this.addItem(weed.kind, weed.lx, weed.ly)
      item.state = 'held'
      item.wiltAt = this.yardLawn ? -1 : this.t + WILT_MS
      held.target = 'item'
      held.id = item.id
      this.emit({ type: 'yank', id: item.id, lx: weed.lx, ly: weed.ly })
    }
    const item = this.item(held.id)
    if (!item) {
      this.held = null
      return
    }
    if (held.grip) return this.dragHeavy(held, item, lx, ly)
    // The item follows your finger but stays within the clamp of its anchor.
    let x = lx + held.offX
    let y = ly + held.offY
    const dx = x - held.anchorX
    const dy = y - held.anchorY
    const d = Math.hypot(dx, dy)
    if (d > HOLD_CLAMP) {
      x = held.anchorX + (dx / d) * HOLD_CLAMP
      y = held.anchorY + (dy / d) * HOLD_CLAMP
    }
    item.lx = clamp(x, 4, LAWN_W - 4)
    item.ly = clamp(y, 4, LAWN_D + PATIO_D - 4)
  }

  private release(release: Release): void {
    const held = this.held
    this.held = null
    if (!held) return
    if (held.target === 'weed') {
      // Letting go before the 60-unit pull leaves the weed in the ground.
      const weed = this.weeds.find(w => w.id === held.id)
      const cancelled =
        release.type === 'putDown' && release.reason === 'cancel'
      if (weed && !cancelled)
        this.emit({ type: 'rooted', id: weed.id, lx: weed.lx, ly: weed.ly })
      return
    }
    const item = this.item(held.id)
    if (!item) return
    // Heavy junk throws only after a lift; any other letting go sets it down.
    if (held.grip && (held.grip !== 'lift' || release.type === 'putDown')) {
      item.state = 'rest'
      item.h = 0
      // A drag that ends in a swipe is the classic mistake: a drag can never lift.
      const fast = held.grip === 'drag' && release.type !== 'putDown'
      this.emit({ type: 'setDown', id: item.id, fast })
      return
    }
    const bag = item.kind === 'bag'
    // Letting go of the bag on the compost bin, even with a swipe, puts it back.
    if (bag && overCompost(item.lx, item.ly)) {
      this.returnBag(item)
      this.emit({ type: 'bagBack' })
      return
    }
    if (release.type === 'putDown') {
      if (bag) this.returnBag(item)
      else item.state = 'rest'
      const reason = bag && release.reason !== 'cancel' ? 'bag' : release.reason
      this.emit({ type: 'putDown', id: item.id, reason })
      if (item.kind === 'seedClock') this.burstClock(item)
      return
    }
    // A throw too soon after the last one, or with a full arm meter, puts the item down.
    const block = armBlock(this.arm, this.t)
    if (block) {
      if (bag) this.returnBag(item)
      else item.state = 'rest'
      item.h = 0
      this.emit({
        type: 'tired',
        id: item.id,
        reason: block,
        lx: item.lx,
        ly: item.ly
      })
      if (item.kind === 'seedClock') this.burstClock(item)
      return
    }
    if (bag) {
      // The clippings fly in the bag; an empty bag goes back on the mower.
      this.mower.bag = 0
      this.mower.bagOff = false
    }
    const heavy = isHeavy(item.kind)
    if (heavy) this.heaviesThrown++
    if (item.kind === 'mower') {
      // The mower goes, and the cuts in its bag go with it.
      this.mowerGone = true
      this.mower.bag = 0
      parkMower(this.mower)
    }
    item.state = 'air'
    item.spin = (hash01(this.seed, item.id) - 0.5) * 2 * SPIN_MAX
    item.flight = planThrow(
      {
        lx: item.lx,
        ly: item.ly,
        speedPx: release.speedPx,
        dirX: release.dirX,
        dirY: release.dirY,
        arm: armLevel(this.arm, this.t),
        wind: windPower(this.wind),
        side: this.wind.side,
        heavy
      },
      this.t
    )
    spendThrow(this.arm, this.t, heavy)
    const f = item.flight
    this.emit({
      type: 'throw',
      id: item.id,
      speedPx: release.speedPx,
      distance: Math.hypot(f.x1 - f.x0, f.y1 - f.y0)
    })
  }

  /**
   * Spawns a throw from the neighbour, fast-forwarded by up to `ffMs` for the time it spent
   * on the way, but never so far that it enters below the fence top.
   */
  private arrive(arrival: Arrival, ffMs: number): void {
    const ff = entryFastForward(arrival, ffMs)
    const item = this.addItem(arrival.kind, 0, 0)
    item.flight = arrivalFlight(arrival, this.t - ff)
    item.state = 'air'
    item.spin = -arrival.spin
    item.fromNeighbour = true
    item.back = arrival.back === true
    item.look = arrival.look ?? 0
    // Your own throw bounced off a trampoline next door and came back.
    if (item.back) this.blame.bounces++
    item.wiltAt = arrival.wiltIn >= 0 ? this.t - ff + arrival.wiltIn : -1
    this.placeOnFlight(item, item.flight)
    // Seeds blow over on the wind; nobody threw them.
    if (arrival.kind === 'seed') return
    this.emit({
      type: 'arrive',
      id: item.id,
      kind: arrival.kind,
      x: LAWN_W - arrival.x,
      ly: item.ly,
      h: item.h
    })
  }

  private stepFlight(item: Item, index: number, dt: number): void {
    const flight = item.flight
    if (!flight) {
      item.state = 'rest'
      return
    }
    item.angle += item.spin * dt
    const tau = flightTau(flight, this.t)
    if (tau < flight.endTau) {
      this.placeOnFlight(item, flight, tau)
      return
    }
    this.placeOnFlight(item, flight, flight.endTau)
    switch (flight.outcome) {
      case 'land':
        if (this.bounce(item, flight)) return
        this.land(
          item,
          groundSpeed(flight),
          Math.atan2(flight.y1 - flight.y0, flight.x1 - flight.x0)
        )
        return
      case 'settle':
        item.flight = null
        item.h = 0
        item.angle = 0
        item.state = 'rest'
        return
      case 'cross': {
        const wiltIn = item.wiltAt >= 0 ? item.wiltAt - this.t : -1
        const bounced = flight.bounced === true
        this.items.splice(index, 1)
        if (this.held?.id === item.id) this.held = null
        this.emit({
          type: 'cross',
          id: item.id,
          crossing: crossingOf(flight, item.kind, item.spin, wiltIn, {
            bounced,
            back: bounced && !this.ownThrow(item),
            look: item.look
          }),
          flight
        })
        return
      }
      case 'clip':
        item.state = 'teeter'
        item.flight = null
        item.ly = 0
        item.h = FENCE_TOP_H
        item.teeterUntil = this.t + CLIP_TEETER_MS
        this.blame.clips++
        this.emit({
          type: 'clip',
          id: item.id,
          clip: { kind: item.kind, x: item.lx, at: this.t }
        })
        return
      case 'wide':
        // It hit a hedge or the back wall: drop straight down inside the lawn.
        item.flight = null
        item.lx = clamp(item.lx, 8, LAWN_W - 8)
        item.ly = clamp(item.ly, 8, LAWN_D - 20)
        item.state = 'fall'
        item.vh = 0
        return
    }
  }

  private dropFromFence(item: Item): void {
    const depth =
      CLIP_DROP_MIN +
      hash01(this.seed ^ 0x5bd1e995, item.id) * (CLIP_DROP_MAX - CLIP_DROP_MIN)
    // Keep its screen position while it drops: ground moves forward, height grows to match.
    item.ly = depth
    item.h = FENCE_TOP_H + depth
    item.state = 'fall'
    item.vh = 0
  }

  private land(item: Item, speed: number, heading: number): void {
    item.h = 0
    item.flight = null
    if (item.kind === 'bag') return this.burst(item)
    if (item.kind === 'seed') return this.plantSeed(item)
    if (isHeavy(item.kind)) return this.sink(item, heading)
    const patch = patchAt(item.lx, item.ly)
    if (patch >= 0) {
      crush(this.grid, patch, item.kind === 'gnome' ? CRUSH_GNOME : CRUSH_LIGHT)
      setMess(this.grid, patch, Mess.scuff)
      this.emit({
        type: 'land',
        id: item.id,
        landing: { patch, kind: item.kind, at: this.t },
        fromNeighbour: item.fromNeighbour
      })
    }
    if (item.kind === 'seedClock') return this.burstClock(item)
    const skid = speed * SKID_SHARE
    if (skid > SLIDE_STOP) {
      item.state = 'slide'
      item.vx = Math.cos(heading) * skid
      item.vy = Math.sin(heading) * skid
    } else {
      item.state = 'rest'
      item.vx = item.vy = 0
    }
  }

  /** True when this garden's player threw the item: it never came over the fence, or came back. */
  private ownThrow(item: Item): boolean {
    return !item.fromNeighbour || item.back
  }

  /**
   * A light thing landing on a sunk trampoline flies back the way it came at 90% of its
   * distance. When your own throw bounces and stays on your lawn, it counts against you.
   */
  private bounce(item: Item, flight: Flight): boolean {
    if (isHeavy(item.kind) || item.kind === 'bag' || item.kind === 'seed')
      return false
    const trampoline = this.items.find(
      t =>
        t.kind === 'trampoline' &&
        t.state === 'sunk' &&
        inRect(footprintRect('trampoline', t.lx, t.ly, true), item.lx, item.ly)
    )
    if (!trampoline) return false
    const next = bounceFlight(flight, item.lx, item.ly, this.t)
    if (!next) return false
    next.bounced = true
    const own = this.ownThrow(item)
    if (own && next.outcome !== 'cross') this.blame.bounces++
    item.flight = next
    item.spin = -item.spin
    this.emit({ type: 'bounce', patch: patchAt(item.lx, item.ly), own })
    return true
  }

  /**
   * Heavy junk sinks where it lands and crushes every patch of its footprint by 2. A bin
   * spills its 4 pieces of litter, and a mower drives off on its crooked run.
   */
  private sink(item: Item, heading: number): void {
    const kind = item.kind as HeavyKind
    const rect = footprintRect(kind, item.lx, item.ly, true)
    item.lx = (rect.x0 + rect.x1) / 2
    item.ly = (rect.y0 + rect.y1) / 2
    item.state = 'sunk'
    item.vx = item.vy = 0
    item.angle = item.spin = 0
    for (const patch of footprintPatches(rect, this.patches))
      crush(this.grid, patch, CRUSH_HEAVY)
    const patch = patchAt(item.lx, item.ly)
    this.emit({
      type: 'land',
      id: item.id,
      landing: { patch, kind, at: this.t },
      fromNeighbour: item.fromNeighbour
    })
    this.emit({
      type: 'sink',
      id: item.id,
      kind,
      patch,
      fromNeighbour: item.fromNeighbour
    })
    if (kind === 'bin')
      for (const spill of litterSpill(this.seed, item.id, item.lx, item.ly)) {
        const litter = this.addItem('litter', item.lx, item.ly)
        litter.look = spill.look
        this.tipOut(litter, spill.lx, spill.ly, 70, 420 + spill.look * 50)
      }
    if (kind === 'mower')
      this.runs.push({
        id: item.id,
        path: mowerRun(
          this.seed,
          item.id,
          patch,
          Math.cos(heading),
          Math.sin(heading)
        ),
        fromX: item.lx,
        fromY: item.ly,
        startAt: this.t,
        done: 0
      })
  }

  /** Sends an item on a soft arc to (lx, ly), where it settles without crushing anything. */
  private tipOut(
    item: Item,
    lx: number,
    ly: number,
    H: number,
    T: number
  ): void {
    item.state = 'air'
    item.spin = (hash01(this.seed ^ 0x1f123bb5, item.id) - 0.5) * 8
    item.flight = {
      x0: item.lx,
      y0: item.ly,
      x1: lx,
      y1: ly,
      H,
      T,
      t0: this.t,
      outcome: 'settle',
      endTau: 1
    }
  }

  /** Drives each thrown mower along its run, scalping every patch it reaches. */
  private stepRuns(): void {
    for (let i = this.runs.length - 1; i >= 0; i--) {
      const run = this.runs[i] as MowerRun
      const mower = this.item(run.id)
      if (!mower) {
        this.runs.splice(i, 1)
        continue
      }
      const steps = (this.t - run.startAt) / MOWER_RUN_STEP_MS
      const reached = Math.min(run.path.length, Math.floor(steps))
      while (run.done < reached) {
        const patch = run.path[run.done++] as number
        crush(this.grid, patch, 1)
        setMess(this.grid, patch, Mess.scalp)
        this.emit({ type: 'run', patch })
      }
      if (reached >= run.path.length) {
        const end = patchCenter(run.path[run.path.length - 1] as number)
        mower.lx = end.lx
        mower.ly = end.ly
        this.runs.splice(i, 1)
        continue
      }
      const from =
        reached === 0
          ? { lx: run.fromX, ly: run.fromY }
          : patchCenter(run.path[reached - 1] as number)
      const to = patchCenter(run.path[reached] as number)
      const f = steps - reached
      mower.lx = from.lx + (to.lx - from.lx) * f
      mower.ly = from.ly + (to.ly - from.ly) * f
    }
  }

  /**
   * At 0:40 the shed bangs open. The crate's 12 gnomes fly out onto the back half of the
   * lawn, the bin and the trampoline roll onto the patio, and the mower becomes junk too.
   * Dev tools can open it early.
   */
  openShed(): void {
    if (this.shedOpen) return
    this.shedOpen = true
    crateSpots(this.seed).forEach((patch, k) => {
      const c = patchCenter(patch)
      const j = patchJitter(this.seed, 700 + k)
      const gnome = this.addItem('gnome', SHED_DOOR.lx, SHED_DOOR.ly)
      this.tipOut(
        gnome,
        c.lx + j.dx,
        c.ly + j.dy,
        200,
        CRATE_FLIGHT_MS + k * CRATE_STAGGER_MS
      )
    })
    this.roll('bin', BIN_POS.lx + BIN_ROLL, BIN_POS.lx, BIN_POS.ly)
    this.roll('trampoline', SHED_DOOR.lx, TRAMPOLINE_POS.lx, TRAMPOLINE_POS.ly)
    this.mowerId = this.addItem('mower', MOWER_POS.lx, MOWER_POS.ly).id
    this.emit({ type: 'shed' })
  }

  /** Rolls heavy junk left from `fromX` so it comes to rest at (lx, ly). */
  private roll(kind: ItemKind, fromX: number, lx: number, ly: number): void {
    const item = this.addItem(kind, fromX, ly)
    item.state = 'slide'
    item.vx = -rollSpeed(fromX - lx)
  }

  /**
   * A grass bag bursts where it lands into a clippings heap over 4 patches. Each heap
   * patch takes 1 health every 10s, like a loose item, until it is mown.
   */
  private burst(bag: Item): void {
    const index = this.items.indexOf(bag)
    if (index >= 0) this.items.splice(index, 1)
    const lx = clamp(bag.lx, 0, LAWN_W - 1)
    const ly = clamp(bag.ly, 0, LAWN_D - 1)
    const patches = heapPatches(lx, ly)
    for (const patch of patches) {
      if (this.grid.mess[patch] !== Mess.heap) this.heaps.push(patch)
      this.grid.mess[patch] = Mess.heap
      this.heapDamageAt[patch] = this.t + REST_DAMAGE_MS
      markDirty(this.grid, patch)
    }
    this.emit({
      type: 'land',
      id: bag.id,
      landing: { patch: patchAt(lx, ly), kind: 'bag', at: this.t },
      fromNeighbour: bag.fromNeighbour
    })
    this.emit({ type: 'heap', patches, fromNeighbour: bag.fromNeighbour })
  }

  private stepSlide(item: Item, dt: number): void {
    const decay = Math.exp(-SLIDE_DECAY * dt)
    item.vx *= decay
    item.vy *= decay
    item.lx += item.vx * dt
    item.ly += item.vy * dt
    // Hedges, the fence and the back wall stop a slide on that axis.
    if (item.lx < 4 || item.lx > LAWN_W - 4) {
      item.lx = clamp(item.lx, 4, LAWN_W - 4)
      item.vx = 0
    }
    if (item.ly < 4 || item.ly > LAWN_D + PATIO_D - 4) {
      item.ly = clamp(item.ly, 4, LAWN_D + PATIO_D - 4)
      item.vy = 0
    }
    if (Math.hypot(item.vx, item.vy) < SLIDE_STOP) {
      item.state = 'rest'
      item.vx = item.vy = 0
    }
  }

  private placeOnFlight(
    item: Item,
    flight: Flight,
    tau = flightTau(flight, this.t)
  ): void {
    const p = flightPoint(flight, tau, this.point)
    item.lx = p.x
    item.ly = p.y
    item.h = p.h
  }

  private addItem(kind: ItemKind, lx: number, ly: number): Item {
    const item: Item = {
      id: this.nextId++,
      kind,
      lx,
      ly,
      h: 0,
      vx: 0,
      vy: 0,
      vh: 0,
      state: 'rest',
      flight: null,
      angle: 0,
      spin: 0,
      wiltAt: -1,
      teeterUntil: 0,
      restSince: -1,
      nextDamageAt: -1,
      fromNeighbour: false,
      back: false,
      look: 0
    }
    this.items.push(item)
    if (this.items.length > LOOSE_CAP) this.wiltOldestWeed()
    return item
  }

  /**
   * Announces the vane swing 2s before each gust, then the gust and the calm after it,
   * and sets the wind this garden feels. A gust slides light things lying on the lawn.
   */
  private stepWind(dt: number): void {
    const gusts = this.gusts
    for (let g = gusts[this.nextVane]; g && this.t >= g.at - VANE_LEAD_MS;) {
      this.emit({ type: 'vane', kind: g.kind, dir: gustDir(g, this.host) })
      g = gusts[++this.nextVane]
    }
    for (let g = gusts[this.nextGust]; g && this.t >= g.at;) {
      this.emit({ type: 'gust', kind: g.kind, dir: gustDir(g, this.host) })
      g = gusts[++this.nextGust]
    }
    for (let g = gusts[this.nextCalm]; g && this.t >= g.end;) {
      this.emit({ type: 'calm' })
      g = gusts[++this.nextCalm]
    }
    const wind = windAt(gusts, this.t, this.host, this.wind)
    if (wind.over === 0 && wind.side === 0) return
    // A tailwind blows toward the fence, at lower ly.
    const dx = wind.side * WIND_SLIDE * dt
    const dy = -wind.over * WIND_SLIDE * dt
    for (const item of this.items) {
      if (item.state !== 'rest' && item.state !== 'slide') continue
      if (!blownByWind(item.kind)) continue
      item.lx = clamp(item.lx + dx, 4, LAWN_W - 4)
      item.ly = clamp(item.ly + dy, 4, LAWN_D + PATIO_D - 4)
    }
  }

  /** Sprouts the weeds and lets in the snails whose scheduled time has come. */
  private runSchedules(): void {
    while (
      this.nextWeed < this.weedAt.length &&
      (this.weedAt[this.nextWeed] as number) <= this.t
    ) {
      const k = this.nextWeed++
      const patch = sproutPatch(this.seed, this.round, k, this.weeds, this.grid)
      const kind = isDandelion(
        this.seed,
        this.round,
        k,
        DANDELION_FROM_ROUND,
        DANDELION_SHARE
      )
        ? 'dandelion'
        : 'weed'
      if (patch >= 0)
        this.rootWeed(patch, this.weedAt[k] as number, k, false, kind)
    }
    while (
      this.nextSnail < this.snailAt.length &&
      (this.snailAt[this.nextSnail] as number) <= this.t
    ) {
      const k = this.nextSnail++
      if (this.snails.length >= SNAIL_CAP) continue
      const { dir, row } = snailSpot(this.seed, k)
      const jitter = patchJitter(this.seed, 500 + k).dy * 0.5
      const id = this.nextId++
      this.snails.push(
        newSnail(id, dir, row, jitter, this.snailAt[k] as number)
      )
      this.emit({ type: 'snail', id, row, dir })
    }
  }

  /** Roots a weed on `patch`, offset inside it by jitter draw `k`. */
  private rootWeed(
    patch: number,
    at: number,
    k: number,
    spread: boolean,
    kind: 'weed' | 'dandelion' = 'weed'
  ): void {
    if (patch < 0 || patch >= PATCHES) return
    const { lx, ly } = patchCenter(patch)
    const j = patchJitter(this.seed, 100 + k)
    const id = this.nextId++
    const weed = newWeed(id, patch, lx + j.dx, ly + j.dy, at, kind)
    this.weeds.push(weed)
    this.emit({ type: 'sprout', id, patch, spread, lx: weed.lx, ly: weed.ly })
  }

  private readonly drainWeed = (weed: RootedWeed) =>
    crush(this.grid, weed.patch, 1)

  private readonly spreadWeed = (weed: RootedWeed, at: number) => {
    const patch = spreadPatch(this.seed, weed, this.weeds, this.grid)
    if (patch >= 0)
      this.rootWeed(patch, at, 1000 + weed.id * 8 + weed.spreads, true)
  }

  private readonly onClock = (weed: RootedWeed) =>
    this.emit({ type: 'clock', id: weed.id, patch: weed.patch })

  /**
   * A seed clock bursts where it touches the ground. Its 3 seeds land on patches around
   * it and root as weeds 10s later. During your tailwind they blow over the fence
   * instead, flying on to your neighbour's lawn.
   */
  private burstClock(item: Item): void {
    const index = this.items.indexOf(item)
    if (index >= 0) this.items.splice(index, 1)
    if (this.held?.id === item.id) this.held = null
    const lx = clamp(item.lx, 1, LAWN_W - 1)
    const ly = clamp(item.ly, 1, LAWN_D - 1)
    const patch = patchAt(lx, ly)
    const over = this.wind.over > 0
    this.emit({ type: 'burst', patch, over })
    if (over) return this.blowSeeds(lx, ly, item.id)
    for (const p of seedPatches(this.seed, item.id, patch)) {
      const c = patchCenter(p)
      const j = patchJitter(this.seed, 3000 + item.id * 4 + this.seeds.length)
      this.seeds.push({
        patch: p,
        lx: c.lx + j.dx,
        ly: c.ly + j.dy,
        at: this.t + SEED_ROOT_MS
      })
    }
  }

  /** Launches a burst clock's seeds over the fence on the wind, each on its own arc. */
  private blowSeeds(lx: number, ly: number, id: number): void {
    for (let k = 0; k < 3; k++) {
      const seed = this.addItem('seed', lx, ly)
      const far =
        ly + SEED_FLY_PAST + hash01(this.seed ^ id, k * 2) * SEED_FLY_SPREAD
      seed.state = 'air'
      seed.spin = (hash01(this.seed ^ id, k * 2 + 1) - 0.5) * 4
      seed.flight = planThrow(
        {
          lx,
          ly,
          speedPx: far / THROW_UNITS_PER_PX,
          dirX: (hash01(this.seed ^ id, k * 2 + 7) - 0.5) * 0.3,
          dirY: -1
        },
        this.t
      )
    }
  }

  /** A seed that lands on the lawn lies there and roots as a weed 10s later. */
  private plantSeed(item: Item): void {
    const index = this.items.indexOf(item)
    if (index >= 0) this.items.splice(index, 1)
    const patch = patchAt(item.lx, item.ly)
    if (patch >= 0)
      this.seeds.push({
        patch,
        lx: item.lx,
        ly: item.ly,
        at: this.t + SEED_ROOT_MS
      })
  }

  /** Roots each seed whose 10s are up, unless its patch holds a weed or a hole. */
  private rootSeeds(): void {
    while (this.seeds.length > 0 && (this.seeds[0] as Seed).at <= this.t) {
      const seed = this.seeds.shift() as Seed
      const p = seed.patch
      if (
        this.weeds.length < WEED_CAP &&
        this.grid.hole[p] === 0 &&
        !this.weeds.some(w => w.patch === p)
      )
        this.rootWeed(p, seed.at, 2000 + this.nextId, true)
    }
  }

  private readonly slime = (patch: number) =>
    setMess(this.grid, patch, Mess.slime)

  private readonly eat = (patch: number) => crush(this.grid, patch, 1)

  /**
   * An item lying still takes 1 health from its patch every 10s. A snail shell lying still
   * for 3s lets its snail out, heading for the nearer hedge.
   */
  private stepRest(item: Item, index: number): void {
    if (item.restSince < 0) {
      item.restSince = this.t
      item.nextDamageAt = this.t + REST_DAMAGE_MS
    }
    if (item.kind === 'snailShell' && this.t - item.restSince >= SHELL_MS) {
      this.items.splice(index, 1)
      this.snails.push(snailFromShell(this.nextId++, item.lx, item.ly, this.t))
      return
    }
    // The yard's lawn takes no damage from what lies on it.
    while (!this.yardLawn && item.nextDamageAt <= this.t) {
      const patch = patchAt(item.lx, item.ly)
      if (patch >= 0) crush(this.grid, patch, 1)
      item.nextDamageAt += REST_DAMAGE_MS
    }
  }

  /** A yanked weed wilts where it lies into a mess mark, and never roots again. */
  private wilt(index: number): void {
    const item = this.items[index] as Item
    // A seed clock dries out and drops its seeds instead.
    if (item.kind === 'seedClock') return this.burstClock(item)
    this.items.splice(index, 1)
    if (this.held?.id === item.id) this.held = null
    const patch = patchAt(item.lx, item.ly)
    if (patch >= 0) setMess(this.grid, patch, Mess.wilt)
    this.emit({ type: 'wilt', patch })
  }

  /** Past the loose-item cap, the oldest loose weed wilts at once. */
  private wiltOldestWeed(): void {
    const index = this.items.findIndex(
      i =>
        (i.kind === 'weed' || i.kind === 'dandelion') &&
        (i.state === 'rest' || i.state === 'slide')
    )
    if (index >= 0) this.wilt(index)
  }

  private readonly onDry = (patch: number, health: number) =>
    this.emit({ type: 'dry', patch, health })

  private readonly onGrow = (patch: number, length: number) => {
    if (length < LENGTH_MAX) return
    const col = patch % COLS
    for (let i = col; i < PATCHES; i += COLS)
      if ((this.grid.length[i] as number) < LENGTH_MAX) return
    this.emit({ type: 'shaggy', col })
  }

  /**
   * A mowing press ended: each column it cut 12 or more patches of that still doesn't
   * stripe reports what blocks it.
   */
  private endMowPress(): void {
    const mask = this.stripes()
    for (let col = 0; col < COLS; col++) {
      const cut = popcount16(this.pressCuts[col] as number)
      this.pressCuts[col] = 0
      if (cut < BLOCKED_CUTS || (mask >> col) & 1) continue
      this.emit({ type: 'blocked', col, patches: this.stripeBlockers(col) })
    }
  }

  private readonly onMow = (event: MowEvent) => {
    if (event.type === 'cut') {
      const col = event.patch % COLS
      this.pressCuts[col] =
        (this.pressCuts[col] as number) | (1 << Math.floor(event.patch / COLS))
    }
    if (event.type === 'scalp') this.blame.scalped++
    if (event.type === 'unheap') {
      const index = this.heaps.indexOf(event.patch)
      if (index >= 0) this.heaps.splice(index, 1)
    }
    this.emit(event)
  }

  private readonly onWater = (event: WaterEvent) => {
    if (event.type === 'drown') this.blame.drowned++
    if (event.type === 'flood') this.blame.drowned += event.patches.length
    this.emit(event)
  }

  /** Biscuit's events, with his holes counted against you. */
  private readonly dogEvent = (event: GardenEvent) => {
    if (event.type === 'dig') this.blame.digs++
    this.emit(event)
  }

  private emit(event: GardenEvent): void {
    if (this.pending.length >= MAX_EVENTS) this.pending.shift()
    this.pending.push(event)
  }
}
