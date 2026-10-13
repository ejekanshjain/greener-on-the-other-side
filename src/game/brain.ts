import { hash01 } from '../shared/math'
import { armBlock, armLevel } from './arm'
import type { Garden } from './garden'
import { patchCenter } from './grid'
import type { Profile } from './profiles'
import {
  ARM_SHORTEN,
  BAG_CUTS,
  BAG_POS,
  CAN_MS,
  COLS,
  FENCE_MARGIN,
  HEALTH_MAX,
  HEAVY_DISTANCE,
  LAWN_D,
  LAWN_W,
  PATCH_D,
  PATCH_W,
  PATCHES,
  POUR_STEP_MS,
  ROWS,
  THROW_MAX_PX,
  THROW_UNITS_PER_PX
} from './tuning'
import { pourPatches } from './water'
import { windPower } from './wind'
import { isHeavy, type GardenEvent, type Item } from './types'

/** Hand time per action in ms (PLAN.md 2.9). The bot can't start another until it's up. */
export const HAND_TIME = {
  yank: 1100,
  throw: 800,
  mow: 1200,
  water: 1000,
  tap: 300,
  compost: 2200,
  pat: 400,
  heavy: 2900,
  carry: 800
} as const

/** What the hand time went on, for the balance runs' time shares. */
export interface Shares {
  /** Throwing things over: weeds, snails, gnomes and throw-backs. */
  throws: number
  /** Watering, the tap, mowing and the bag. */
  upkeep: number
  /** Tapping Biscuit. */
  dog: number
  /** Crate gnomes and heavy junk after the shed opens. */
  finale: number
}

/** One timed part of an action, run once the garden reaches `at`. */
interface Step {
  at: number
  run: (g: Garden) => void
}

/** Bag cuts at which the bot empties it at the compost. */
const COMPOST_AT = 80
/** Water debt, in health, that's worth a pour. */
const POUR_DEBT = 3
/** How far into the neighbour's lawn an aimed throw lands, min and spread. */
const AIM_DEPTH = 120
const AIM_SPREAD = 360
/** An aimed clip lands its flight just past the fence, inside the clip band. */
const CLIP_SHARE = 0.92
/** The widest a bot's throw strays from straight at the fence, in degrees. */
const AIM_ANGLE = { aimed: 6, sampled: 12 } as const
/** Where the bag sits over the compost bin, within the 100-unit hold clamp. */
const COMPOST_SPOT = { lx: 300, ly: 728 } as const
/** Heavy junk gets dragged to this depth before the lift. */
const HEAVY_DRAG_LY = 280
/** A player throws heavy junk only with the arm this fresh at the throw. */
const HEAVY_ARM_MAX = 0.1
/** When the heavy throw leaves the hand, from the start of the action. */
const HEAVY_THROW_AT = 1800
const CARRY_STEP = 95
const TAP_OFF_MS = 5000

/**
 * A bot's hands on a garden: Mr Pemberton, autopilot and the headless balance runs all use
 * it. It sends the same commands as the input layer, through one virtual hand whose
 * actions each cost time (`HAND_TIME`), so throws go through the real throw maths and
 * clips, shorts and wind emerge. Call `observe` with each update's garden events and
 * `step` every frame or every few ticks. A new garden (a new round) starts it fresh.
 */
export class Brain {
  readonly shares: Shares = { throws: 0, upkeep: 0, dog: 0, finale: 0 }
  private garden: Garden | null = null
  private n = 0
  private steps: Step[] = []
  private busyUntil = 0
  /** Their throws here, by item id, with when to throw each back. */
  private readonly returns = new Map<number, number>()
  /** Items decided on: caught or not, and weeds the bot dropped on purpose. */
  private readonly decided = new Set<number>()
  private readonly kept = new Set<number>()
  /** First time each snail was seen, by id. */
  private readonly snailSeen = new Map<number, number>()
  private waterDebt = 0
  private nextMowAt = 0
  private nextSendAt = Infinity
  private lastFinaleAt = -Infinity
  private wantPat = false
  private mowCol = 0

  constructor(
    public profile: Profile,
    private readonly seed: number
  ) {}

  /** Takes a garden's events: drying adds to the water debt, and Biscuit's circle asks for a tap. */
  observe(events: readonly GardenEvent[]): void {
    for (const event of events) {
      if (event.type === 'dry') this.waterDebt += this.profile.upkeep
      else if (event.type === 'circle')
        this.wantPat = this.roll() < this.profile.patBiscuit
    }
  }

  /** Runs due steps of the current action, or starts the next one when the hand is free. */
  step(g: Garden): void {
    if (g !== this.garden) this.reset(g)
    while (this.steps.length > 0 && (this.steps[0] as Step).at <= g.t)
      this.steps.shift()?.run(g)
    if (g.t < this.busyUntil || this.steps.length > 0) return
    if (g.t >= g.endMs - 100) return
    this.next(g)
  }

  private reset(g: Garden): void {
    this.garden = g
    this.steps = []
    this.busyUntil = 0
    this.returns.clear()
    this.decided.clear()
    this.kept.clear()
    this.snailSeen.clear()
    this.waterDebt = 0
    this.wantPat = false
    this.nextMowAt = g.t + this.profile.mowEveryMs * this.roll()
    const send = this.profile.sendMs
    this.nextSendAt = send ? g.t + this.between(send) : Infinity
    this.lastFinaleAt = -Infinity
    this.shares.throws = this.shares.upkeep = this.shares.dog = 0
    this.shares.finale = 0
  }

  /** A seeded number in [0, 1); the same seed gives the same choices. */
  private roll(): number {
    return hash01(this.seed, this.n++)
  }

  private between([lo, hi]: readonly [number, number]): number {
    return lo + (hi - lo) * this.roll()
  }

  /** Starts an action: its steps run on the garden clock, and the hand stays busy `ms`. */
  private act(
    g: Garden,
    ms: number,
    share: keyof Shares,
    steps: [number, (g: Garden) => void][]
  ): void {
    this.busyUntil = g.t + ms
    this.shares[share] += Math.min(ms, g.endMs - g.t)
    for (const [delay, run] of steps) this.steps.push({ at: g.t + delay, run })
  }

  /**
   * Picks the next action, most urgent first: Biscuit, the tap, catches, the finale, weeds,
   * snails, watering and mowing, then throw-backs with the time left over. Mr Pemberton
   * throws back before any of his chores.
   */
  private next(g: Garden): void {
    const p = this.profile
    // Biscuit circles for only 2s.
    if (this.wantPat && g.biscuit.state === 'circle') {
      this.wantPat = false
      return this.act(g, HAND_TIME.pat, 'dog', [
        [0, h => h.command({ type: 'pat' })]
      ])
    }
    if (this.tapStep(g)) return
    if (this.catchStep(g)) return
    const armFree = armBlock(g.arm, g.t + 200) === null
    this.noteArrivals(g)
    // A neighbour busy carrying his crate gnomes home has no hand free to throw back.
    const carrying = g.shedOpen && p.finale.gnomes === 'carry'
    const sendDue = g.t >= this.nextSendAt
    if (p.spiteFirst && armFree && !carrying && this.returnStep(g)) return
    if (g.shedOpen && this.finaleStep(g, armFree)) return
    const canThrow = armFree && !this.savingArm(g)
    if (this.weedStep(g, canThrow, sendDue)) return
    if (canThrow && this.snailStep(g, sendDue)) return
    if (this.waterStep(g)) return
    if (this.mowStep(g)) return
    if (canThrow && !carrying && this.returnStep(g)) return
    if (g.mower.bag >= COMPOST_AT && g.bagHit(BAG_POS.lx, BAG_POS.ly, 1))
      return this.compost(g)
    if (canThrow && this.ownItemStep(g, sendDue)) return
  }

  /** Mows a column when one is due, faster once a mowing finale's gnomes are gone. */
  private mowStep(g: Garden): boolean {
    const p = this.profile
    if (g.t < this.nextMowAt || g.mowerGone || g.mower.bag >= BAG_CUTS - 6)
      return false
    const every =
      g.shedOpen && p.finale.mowAfter && !this.ownGnome(g)
        ? p.mowEveryMs / 2
        : p.mowEveryMs
    this.nextMowAt = g.t + every
    this.mow(g)
    return true
  }

  /** Turns the tap on when the can runs low, and off once it's full, before it floods. */
  private tapStep(g: Garden): boolean {
    const w = g.water
    const full = w.can >= CAN_MS - 1
    // Off by 5s of running at the latest: the longest action ends before the 8s flood.
    const turn = w.tapOn
      ? full || w.tapRunMs >= TAP_OFF_MS
      : w.can < POUR_STEP_MS * 3
    if (!turn) return false
    this.act(g, HAND_TIME.tap, 'upkeep', [[0, h => h.command({ type: 'tap' })]])
    return true
  }

  /** Remembers each throw from next door when first seen, with when to send it back. */
  private noteArrivals(g: Garden): void {
    for (const item of g.items)
      if (item.fromNeighbour && !this.returns.has(item.id))
        this.returns.set(item.id, g.t + this.between(this.profile.returnMs))
  }

  /** Catches a throw coming down over this lawn, at the profile's rate, and sends it back. */
  private catchStep(g: Garden): boolean {
    if (this.profile.catchChance <= 0) return false
    for (const item of g.items) {
      if (
        !item.fromNeighbour ||
        this.decided.has(item.id) ||
        !g.catchable(item)
      )
        continue
      this.decided.add(item.id)
      if (this.roll() >= this.profile.catchChance) continue
      this.throwItem(g, item, 'throws')
      return true
    }
    return false
  }

  /** Throws back their throws once each one's delay has passed. */
  private returnStep(g: Garden): boolean {
    for (const [id, due] of this.returns) {
      const item = g.item(id)
      if (!item) {
        this.returns.delete(id)
        continue
      }
      if (due > g.t || !lying(item) || isHeavy(item.kind)) continue
      this.throwItem(g, item, 'throws')
      return true
    }
    return false
  }

  /**
   * After the shed opens: its own gnomes carried home, or heavy junk thrown while the arm is
   * fresh, then gnomes thrown over, theirs too once due back, since every gnome counts.
   */
  private finaleStep(g: Garden, canThrow: boolean): boolean {
    const plan = this.profile.finale
    const own = this.ownGnome(g)
    if (own && plan.gnomes === 'carry') {
      this.carry(g, own)
      return true
    }
    if (plan.gnomes !== 'throw') return false
    const junk = this.junk(g)
    if (junk) {
      if (!canThrow || !this.junkReady(g)) return false
      this.heavy(g, junk)
      return true
    }
    const gnome = own ?? this.dueGnome(g)
    if (!gnome || !canThrow || g.t - this.lastFinaleAt < plan.gapMs)
      return false
    this.lastFinaleAt = g.t
    this.throwItem(g, gnome, 'finale')
    return true
  }

  /** Heavy junk it means to throw, lying where a hand can grab it. */
  private junk(g: Garden): Item | undefined {
    if (!this.profile.finale.junk) return undefined
    return g.items.find(
      i => isHeavy(i.kind) && lying(i) && !this.returns.has(i.id)
    )
  }

  /** A player throws heavy junk only with a fresh arm and no headwind, or it clips and sinks at home. */
  private junkReady(g: Garden): boolean {
    return (
      !this.profile.speed ||
      (armLevel(g.arm, g.t + HEAVY_THROW_AT) <= HEAVY_ARM_MAX &&
        windPower(g.wind) >= 1)
    )
  }

  /** True while a player rests its arm for heavy junk it's about to throw. */
  private savingArm(g: Garden): boolean {
    return (
      g.shedOpen && this.profile.speed !== null && this.junk(g) !== undefined
    )
  }

  /** One of their gnomes lying here whose throw-back is due. */
  private dueGnome(g: Garden): Item | undefined {
    return g.items.find(
      i =>
        i.kind === 'gnome' &&
        lying(i) &&
        i.ly < LAWN_D &&
        (this.returns.get(i.id) ?? Infinity) <= g.t
    )
  }

  /**
   * How deep heavy junk gets dragged before the lift: for a player, just close enough that
   * its slowest swipe clears the fence with a fresh arm, since every row dragged flattens.
   */
  private heavyDragLy(): number {
    const speed = this.profile.speed
    if (!speed) return HEAVY_DRAG_LY
    const reach =
      THROW_UNITS_PER_PX *
      (speed.mean - speed.spread) *
      HEAVY_DISTANCE *
      (1 - ARM_SHORTEN * HEAVY_ARM_MAX)
    return Math.min(HEAVY_DRAG_LY, (1 - FENCE_MARGIN) * reach - 10)
  }

  /** A gnome of its own lying on the lawn, not one of theirs waiting to go back. */
  private ownGnome(g: Garden): Item | undefined {
    return g.items.find(
      i =>
        i.kind === 'gnome' &&
        lying(i) &&
        i.ly < LAWN_D &&
        !this.returns.has(i.id) &&
        !this.kept.has(i.id)
    )
  }

  /**
   * Pulls weeds that have grown for the profile's reaction time. Players throw them over.
   * Mr Pemberton throws one only when his next send is due, and otherwise drops it.
   */
  private weedStep(g: Garden, canThrow: boolean, sendDue: boolean): boolean {
    const p = this.profile
    const weed = g.weeds.find(w => g.t - w.bornAt >= p.weedReactMs)
    if (!weed) return false
    // A tired player waters while the arm rests, then pulls the weed and drops it.
    if (p.speed !== null && !canThrow && this.waterStep(g)) return true
    const send = canThrow && (p.speed !== null || sendDue)
    if (send && p.speed === null) this.sent()
    this.act(g, HAND_TIME.yank, 'throws', [
      [
        0,
        h =>
          h.command({
            type: 'grab',
            target: { type: 'weed', id: weed.id, distance: 0 },
            lx: weed.lx,
            ly: weed.ly
          })
      ],
      [100, h => h.command({ type: 'hold', lx: weed.lx, ly: weed.ly - 80 })],
      [
        250,
        h => {
          const held = h.held
          if (send)
            h.command({
              type: 'release',
              release: this.release(h, weed.ly - 80)
            })
          else {
            if (held) this.kept.add(held.id)
            h.command({ type: 'release', release: { type: 'putDown' } })
          }
        }
      ]
    ])
    return true
  }

  /** Grabs a crawling snail and throws it: players once they notice, Mr Pemberton when a send is due. */
  private snailStep(g: Garden, sendDue: boolean): boolean {
    const p = this.profile
    for (const snail of g.snails)
      if (!this.snailSeen.has(snail.id)) this.snailSeen.set(snail.id, g.t)
    const snail = g.snails.find(
      s => g.t - (this.snailSeen.get(s.id) ?? g.t) >= p.weedReactMs
    )
    if (!snail || (p.speed === null && !sendDue)) return false
    if (p.speed === null) this.sent()
    this.act(g, HAND_TIME.throw, 'throws', [
      [
        0,
        h =>
          h.command({
            type: 'grab',
            target: { type: 'snail', id: snail.id, distance: 0 },
            lx: snail.lx,
            ly: snail.ly
          })
      ],
      [
        150,
        h => h.command({ type: 'release', release: this.release(h, snail.ly) })
      ]
    ])
    return true
  }

  /** Throws its own loose things over: players after noticing, Mr Pemberton as a send. */
  private ownItemStep(g: Garden, sendDue: boolean): boolean {
    const p = this.profile
    if (p.speed === null && !sendDue) return false
    // Before the shed opens, Pemberton keeps his gnomes; they're his, after all.
    const item = g.items.find(
      i =>
        lying(i) &&
        i.ly < LAWN_D &&
        !isHeavy(i.kind) &&
        !this.returns.has(i.id) &&
        !this.kept.has(i.id) &&
        (p.speed !== null
          ? g.t - i.restSince >= p.weedReactMs
          : i.kind !== 'gnome')
    )
    if (!item) return false
    if (p.speed === null) this.sent()
    this.throwItem(g, item, 'throws')
    return true
  }

  private sent(): void {
    const send = this.profile.sendMs
    this.nextSendAt = this.garden
      ? this.garden.t + (send ? this.between(send) : Infinity)
      : Infinity
  }

  /** Waters the driest 5-patch spot once enough drying has built up. */
  private waterStep(g: Garden): boolean {
    if (this.waterDebt < POUR_DEBT || g.water.can < POUR_STEP_MS * 2)
      return false
    let best = -1
    let bestSum = Infinity
    const near: number[] = []
    for (let patch = 0; patch < PATCHES; patch++) {
      const { lx, ly } = patchCenter(patch)
      if (g.grid.health[patch] === HEALTH_MAX) continue
      let sum = 0
      for (const q of pourPatches(lx, ly, near)) sum += g.grid.health[q] ?? 0
      sum /= near.length
      if (sum < bestSum) {
        bestSum = sum
        best = patch
      }
    }
    if (best < 0) {
      this.waterDebt = 0
      return false
    }
    const { lx, ly } = patchCenter(best)
    const centre = g.grid.health[best] ?? 0
    let ms = Math.min(2500, (HEALTH_MAX - centre) * POUR_STEP_MS + 100)
    if (this.roll() < this.profile.overwater) ms += 2000
    let gain = 0
    for (const q of pourPatches(lx, ly, near))
      gain += Math.min(HEALTH_MAX - (g.grid.health[q] ?? 0), ms / POUR_STEP_MS)
    this.waterDebt -= gain
    this.act(g, Math.max(HAND_TIME.water, ms), 'upkeep', [
      [0, h => h.command({ type: 'pour', lx, ly })],
      [ms, h => h.command({ type: 'pourEnd' })]
    ])
    return true
  }

  /** Mows the column with the longest grass, top to bottom at a safe speed. */
  private mow(g: Garden): void {
    let col = this.mowCol
    let longest = -1
    for (let c = 0; c < COLS; c++) {
      let sum = 0
      for (let row = 0; row < ROWS; row++)
        sum += g.grid.length[row * COLS + c] ?? 0
      if (sum > longest) {
        longest = sum
        col = c
      }
    }
    this.mowCol = (col + 1) % COLS
    const lx = col * PATCH_W + PATCH_W / 2
    const steps: [number, (h: Garden) => void][] = []
    for (let row = 0; row < ROWS; row++) {
      const ly = row * PATCH_D + PATCH_D / 2
      steps.push([
        row * 70,
        h => h.command({ type: 'mow', lx, ly, speedPx: 600 })
      ])
    }
    steps.push([ROWS * 70, h => h.command({ type: 'mowEnd' })])
    this.act(g, HAND_TIME.mow, 'upkeep', steps)
  }

  /** Carries the bag onto the compost bin and holds it there until it empties. */
  private compost(g: Garden): void {
    this.act(g, HAND_TIME.compost, 'upkeep', [
      [0, h => h.command({ type: 'grabBag', lx: BAG_POS.lx, ly: BAG_POS.ly })],
      [150, h => h.command({ type: 'hold', ...COMPOST_SPOT })],
      [1900, h => h.command({ type: 'release', release: { type: 'putDown' } })]
    ])
  }

  /** Picks something up and throws it at the fence. */
  private throwItem(g: Garden, item: Item, share: keyof Shares): void {
    const id = item.id
    this.act(g, HAND_TIME.throw, share, [
      [
        0,
        h => {
          const it = h.item(id)
          if (it)
            h.command({
              type: 'grab',
              target: { type: 'item', id, distance: 0 },
              lx: it.lx,
              ly: Math.max(4, it.ly - it.h)
            })
        }
      ],
      [
        120,
        h => {
          const it = h.item(id)
          if (h.held?.id === id && it)
            h.command({ type: 'release', release: this.release(h, it.ly) })
        }
      ]
    ])
  }

  /** Moves one of its own gnomes a hand's reach toward the patio, where it doesn't count. */
  private carry(g: Garden, item: Item): void {
    const id = item.id
    this.act(g, HAND_TIME.carry, 'finale', [
      [
        0,
        h =>
          h.command({
            type: 'grab',
            target: { type: 'item', id, distance: 0 },
            lx: item.lx,
            ly: item.ly
          })
      ],
      [
        150,
        h => h.command({ type: 'hold', lx: item.lx, ly: item.ly + CARRY_STEP })
      ],
      [300, h => h.command({ type: 'release', release: { type: 'putDown' } })]
    ])
  }

  /** Drags heavy junk onto the lawn, sets it down, lifts it and throws it. */
  private heavy(g: Garden, item: Item): void {
    const id = item.id
    const lx = Math.min(LAWN_W - 60, Math.max(60, item.lx))
    const grabAt = (h: Garden) => {
      const it = h.item(id)
      if (it)
        h.command({
          type: 'grab',
          target: { type: 'item', id, distance: 0 },
          lx: it.lx,
          ly: it.ly
        })
    }
    this.act(g, HAND_TIME.heavy, 'finale', [
      [0, grabAt],
      [100, h => h.command({ type: 'hold', lx: item.lx, ly: item.ly - 30 })],
      [400, h => h.command({ type: 'hold', lx, ly: this.heavyDragLy() })],
      [700, h => h.command({ type: 'release', release: { type: 'putDown' } })],
      [900, grabAt],
      [1600, h => h.command({ type: 'lift' })],
      [
        HEAVY_THROW_AT,
        h => {
          const it = h.item(id)
          if (h.held?.id === id && it)
            h.command({
              type: 'release',
              release: this.release(h, it.ly, true)
            })
        }
      ]
    ])
  }

  /**
   * A throw at the fence from depth `ly`. Players swipe at a speed from their profile;
   * Mr Pemberton aims for a spot next door, or a clip when he means to fluff it.
   */
  private release(
    g: Garden,
    ly: number,
    heavy = false
  ): { type: 'throw'; speedPx: number; dirX: number; dirY: number } {
    const p = this.profile
    let speedPx: number
    if (p.speed) {
      speedPx = p.speed.mean + (this.roll() * 2 - 1) * p.speed.spread
    } else {
      const reach =
        THROW_UNITS_PER_PX *
        (1 - ARM_SHORTEN * armLevel(g.arm, g.t)) *
        windPower(g.wind) *
        (heavy ? HEAVY_DISTANCE : 1)
      // His fumbles are light throws; heavy junk always goes over.
      const D =
        !heavy && this.roll() < p.clipChance
          ? ly / CLIP_SHARE
          : ly + AIM_DEPTH + this.roll() * AIM_SPREAD
      speedPx = Math.min(THROW_MAX_PX, D / reach)
    }
    const spread = p.speed ? AIM_ANGLE.sampled : AIM_ANGLE.aimed
    const a = ((this.roll() * 2 - 1) * spread * Math.PI) / 180
    return { type: 'throw', speedPx, dirX: Math.sin(a), dirY: -Math.cos(a) }
  }
}

/** True for an item lying still or sliding, so a hand can pick it up. */
function lying(item: Item): boolean {
  return item.state === 'rest' || item.state === 'slide'
}
