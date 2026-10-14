import type { Garden } from './garden'
import { patchAt } from './grid'
import { lying } from './report'
import type { TipRequest, TipSpot, TipTarget } from './tipQueue'
import {
  fetchTip,
  TIPS,
  tipInRound,
  tipKind,
  WIND_TIPS,
  type TipId
} from './tips'
import {
  COLS,
  HEALTH_MAX,
  LAWN_D,
  LAWN_W,
  PATCHES,
  ROUND_MS,
  SHORT_MAX,
  STRIPE_MIN
} from './tuning'
import { Mess, type GardenEvent, type Item, type ItemKind } from './types'

/** The watering tip waits until this far into a full round (2:35), scaled for `?fast`. */
export const WATER_TIP_AT_MS = 25_000
/** A patch this dry or drier earns the watering tip. */
export const WATER_TIP_HEALTH = 4
/** From round 2, the stripes tip shows with this much of a full round left at the latest. */
export const STRIPES_TIP_LEFT_MS = 15_000
/** Lawn checks for the time triggers run this often, in garden ms. */
const CHECK_MS = 250

/** Things that land from next door and can be thrown back: not junk that sinks, or a bag. */
const THROWN_BACK: ReadonlySet<ItemKind> = new Set([
  'gnome',
  'weed',
  'dandelion',
  'snailShell',
  'litter'
])

/** The shed banner shows this long, and the shed tip waits for it, in ms. */
export const SHED_BANNER_MS = 3000

/** Where the triggers send their tips: the session's queue, behind its Show Tips check. */
export interface TipSink {
  raise(req: TipRequest): void
  /**
   * A moment passed: a waiting tip about it leaves unseen. `watched` is false when it
   * passed during catch-up, out of your sight.
   */
  end(moment: string, watched: boolean): void
  /** The shed opened in round 1: show its banner for 3s. */
  shedBanner(): void
}

/**
 * Turns one round garden's live events and frames into a new player's tips: the staged
 * table by round, and the failure tips. Make one per round garden. Feed live play to
 * `event` and `frame`, and catch-up to `ends` and `quiet`, which raise nothing.
 */
export class TipTriggers {
  /** Your throws that clipped the fence, waiting to drop back. */
  private readonly clipped = new Set<number>()
  /** The stripe mask at the last frame, or -1 before the first. */
  private stripes = -1
  private checkAt = 0
  /** Garden time the shed tip shows, once the banner has had its 3s, or -1. */
  private shedTipAt = -1
  private readonly scale: number

  constructor(
    readonly garden: Garden,
    private readonly sink: TipSink
  ) {
    this.scale = garden.roundMs / ROUND_MS
  }

  /**
   * The round's countdown tips, for a page that watched it from the start. From round 2,
   * `coach` is the coach tip for your last round, which shows first, or null for none.
   */
  countdown(coach: string | null = null): void {
    const round = this.garden.round
    const gnome = nearestGnome(this.garden)
    if (round === 0)
      this.raise('start', gnome ? { target: { kind: 'item', id: gnome } } : {})
    if (coach) this.raise('coach', { text: coach })
    this.raise('heat', { target: { kind: 'tap' } })
  }

  /** The tips one live garden event earns, and the moments it ends. */
  event(e: GardenEvent): void {
    this.raiseFor(e)
    this.ends(e, true)
  }

  /**
   * The moments one garden event ends, raising no tip: Biscuit sits or digs, an item
   * lands or is caught, the pour or the tap stops, the gust arrives, you let go of heavy
   * junk, or Biscuit's item is thrown, dropped or taken back. Feed it the events catch-up
   * replays, with `watched` false, so a tip that waited through a hidden spell leaves.
   */
  ends(e: GardenEvent, watched = false): void {
    const end = (moment: string) => this.sink.end(moment, watched)
    switch (e.type) {
      case 'catch':
        return end(`fall:${e.id}`)
      case 'land':
        this.clipped.delete(e.id)
        return end(`fall:${e.id}`)
      case 'sink':
        this.clipped.delete(e.id)
        return
      case 'pourStop':
      case 'drown':
        return end('pour')
      case 'tap':
        if (!e.on) end('tap')
        return
      case 'flood':
        return end('tap')
      case 'sit':
      case 'dig':
        return end(`circle:${e.patch}`)
      case 'setDown':
        return end(`grip:${e.id}`)
      case 'throw':
        end(`grip:${e.id}`)
        return end(`bark:${e.id}`)
      case 'gust':
        return end('gust')
      case 'fetch':
        return end(`bark:${e.id}`)
      case 'drop':
      case 'takeBack':
        return end(`mouth:${e.id}`)
      default:
        return
    }
  }

  /** The tips one live garden event earns. `ends` sends away the moments it closes. */
  private raiseFor(e: GardenEvent): void {
    switch (e.type) {
      case 'sprout':
        if (!e.spread)
          this.raise('weed', { target: { kind: 'weed', id: e.id } })
        return
      case 'snail':
        return this.raise('snail', { target: { kind: 'snail', id: e.id } })
      case 'arrive':
        // Only light things can be caught; heavy junk and bags can't.
        if (!THROWN_BACK.has(e.kind) && e.kind !== 'seedClock') return
        return this.raise('catch', {
          target: { kind: 'item', id: e.id },
          moment: `fall:${e.id}`,
          spot: 'patio'
        })
      case 'land':
        if (e.fromNeighbour && THROWN_BACK.has(e.landing.kind))
          this.raise('back', { target: { kind: 'item', id: e.id } })
        return this.droppedBack(e.id)
      case 'sink':
        return this.droppedBack(e.id)
      case 'clip':
        this.clipped.add(e.id)
        return
      case 'sparkle':
        return this.raise('sparkle', {
          target: { kind: 'patch', patch: e.patch },
          moment: 'pour'
        })
      case 'drown':
        return this.raise('drown', {
          target: { kind: 'patch', patch: e.patch }
        })
      case 'tap':
        if (e.on) this.raise('tap', { target: { kind: 'tap' }, moment: 'tap' })
        return
      case 'flood':
        return this.raise('flood', { target: { kind: 'tap' } })
      case 'circle':
        return this.raise('biscuit', { moment: `circle:${e.patch}` })
      case 'dig':
        return this.raise('hole', { target: { kind: 'patch', patch: e.patch } })
      case 'shaggy':
        return this.raise('mow', { target: { kind: 'column', col: e.col } })
      case 'shed':
        // Round 1's banner comes first, and the shed tip follows it.
        if (this.garden.round > 0) return this.raise('shed')
        this.sink.shedBanner()
        this.shedTipAt = this.garden.t + SHED_BANNER_MS
        return
      case 'grip':
        return this.raise(e.patio ? 'patio' : 'lift', {
          moment: `grip:${e.id}`
        })
      case 'setDown':
        if (e.fast)
          this.raise('heavyFast', { target: { kind: 'item', id: e.id } })
        return
      case 'putDown':
        // A press the browser cancelled, such as for a call, isn't your mistake.
        if (e.reason === 'cancel') return
        if (e.reason === 'bag')
          return this.raise('bagOff', { target: { kind: 'bag' } })
        return this.raise(e.reason, { target: { kind: 'item', id: e.id } })
      case 'tired':
        return this.raise(e.reason, { target: { kind: 'item', id: e.id } })
      case 'rooted':
        return this.raise('rooted', { target: { kind: 'weed', id: e.id } })
      case 'blocked':
        return this.raise('blocked', { target: { kind: 'column', col: e.col } })
      case 'miss':
        if (!e.near) return this.raise('tooFast')
        return this.raise('missed', {
          target: { kind: e.near.type, id: e.near.id }
        })
      case 'scalp':
        return this.raise('scalp', {
          target: { kind: 'patch', patch: e.patch }
        })
      case 'bagFull':
        return this.raise('bagFull', { target: { kind: 'bag' } })
      case 'bagHigh':
        return this.raise('bag', { target: { kind: 'bag' } })
      case 'vane':
        return this.raise('wind', {
          text:
            e.kind === 'along'
              ? WIND_TIPS.side
              : e.dir === 1
                ? WIND_TIPS.tail
                : WIND_TIPS.head,
          target: { kind: 'vane' },
          moment: 'gust'
        })
      case 'bark':
        return this.raise('bark', { moment: `bark:${e.id}` })
      case 'fetch':
        return this.raise('fetch', {
          text: fetchTip(e.kind),
          target: { kind: 'item', id: e.id },
          moment: `mouth:${e.id}`
        })
      case 'clock':
        return this.raise('clock', { target: { kind: 'weed', id: e.id } })
      default:
        return
    }
  }

  /**
   * The lawn and time triggers, on a live frame: your first stripe, your first stripe
   * broken by something covering or marking it, the watering tip
   * from 25s in, and the stripes tip once the lawn holds no gnome after 0:40 (or, from
   * round 2, at 0:15 left).
   */
  frame(): void {
    const garden = this.garden
    // Carrying something across a stripe hides it for a moment; that's no new stripe.
    const mask = garden.settledStripes()
    const gained = this.stripes < 0 ? 0 : mask & ~this.stripes
    const lost = this.stripes < 0 ? 0 : this.stripes & ~mask
    this.stripes = mask
    if (gained)
      this.raise('stripe', {
        target: { kind: 'column', col: 31 - Math.clz32(gained & -gained) }
      })
    // A stripe broken by something on it or a mark, not one that grew back.
    for (let col = 0; lost >> col; col++)
      if ((lost >> col) & 1 && !grewBack(garden, col)) {
        this.raise('broken', { target: { kind: 'column', col } })
        break
      }
    if (this.shedTipAt >= 0 && garden.t >= this.shedTipAt) {
      this.shedTipAt = -1
      this.raise('shed')
    }
    if (garden.t < this.checkAt) return
    // Checks fall on whole steps of 250 ms, so a trigger time is never late by a step.
    this.checkAt = (Math.floor(garden.t / CHECK_MS) + 1) * CHECK_MS
    if (garden.t >= WATER_TIP_AT_MS * this.scale) {
      const patch = driestPatch(garden)
      if (patch >= 0) this.raise('water', { target: { kind: 'patch', patch } })
    }
    const late =
      garden.round > 0 &&
      garden.t >= garden.roundMs - STRIPES_TIP_LEFT_MS * this.scale
    if (late || (garden.t >= garden.shedAt && gnomesLeft(garden) === 0))
      this.raise('stripes')
  }

  /** A frame that isn't live: keep the stripe mask current, so catch-up earns nothing. */
  quiet(): void {
    this.stripes = this.garden.settledStripes()
  }

  /** A clipped throw came back down on your lawn: now the clip tip can show. */
  private droppedBack(id: number): void {
    if (this.clipped.has(id))
      this.raise('clip', { target: { kind: 'item', id } })
  }

  private raise(
    id: Exclude<TipId, 'yard'>,
    extra: {
      text?: string
      target?: TipTarget
      moment?: string
      spot?: TipSpot
    } = {}
  ): void {
    if (!tipInRound(id, this.garden.round)) return
    const text =
      extra.text ??
      (id === 'wind' ? WIND_TIPS.tail : id === 'coach' ? '' : TIPS[id])
    this.sink.raise({ id, ...tipKind(id), ...extra, text })
  }
}

/**
 * True when column `col` has too much long grass to stripe, whatever lies on it: a
 * stripe it lost lapsed as its grass grew back.
 */
export function grewBack(garden: Garden, col: number): boolean {
  let short = 0
  for (let i = col; i < PATCHES; i += COLS)
    if ((garden.grid.length[i] as number) <= SHORT_MAX) short++
  return short < STRIPE_MIN
}

/**
 * The patch the watering tip points at: the driest one at health 4 or less with nothing
 * on it and no hole or mud, nearest the patio on a tie. -1 when none is that dry.
 */
export function driestPatch(garden: Garden): number {
  const grid = garden.grid
  let best = -1
  let bestHealth = WATER_TIP_HEALTH + 1
  for (let i = PATCHES - 1; i >= 0; i--) {
    const health = grid.health[i] as number
    if (health >= bestHealth || health >= HEALTH_MAX) continue
    if (grid.hole[i] === 1 || grid.mess[i] === Mess.puddle) continue
    if (covered(garden, i)) continue
    best = i
    bestHealth = health
  }
  return best
}

function covered(garden: Garden, patch: number): boolean {
  for (const weed of garden.weeds) if (weed.patch === patch) return true
  for (const snail of garden.snails) if (snail.patch === patch) return true
  for (const item of garden.items)
    if (lying(item) && patchAt(item.lx, item.ly) === patch) return true
  return false
}

/**
 * The gnome lying on your lawn nearest the middle of the patio edge, where your thumb
 * rests: the start tip and the ghost finger use it. 0 when there's none.
 */
export function nearestGnome(garden: Garden): number {
  let best = 0
  let bestD = Infinity
  for (const item of garden.items) {
    if (item.kind !== 'gnome' || item.state !== 'rest') continue
    if (patchAt(item.lx, item.ly) < 0) continue
    const d = Math.hypot(item.lx - LAWN_W / 2, item.ly - LAWN_D)
    if (d < bestD) {
      best = item.id
      bestD = d
    }
  }
  return best
}

/**
 * Gnomes your lawn holds by Brenda's count, plus any still falling onto it, such as the
 * crate's or a clipped throw. A throw on its way over the fence doesn't count.
 */
export function gnomesLeft(garden: Garden): number {
  let n = 0
  for (const item of garden.items) {
    if (item.kind !== 'gnome') continue
    if (lying(item)) {
      if (patchAt(item.lx, item.ly) >= 0) n++
    } else if (!leaving(item)) n++
  }
  return n
}

const leaving = (item: Item): boolean =>
  item.state === 'air' && item.flight?.outcome === 'cross'
