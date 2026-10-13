import {
  ARC_H_PER_D,
  ARC_MIN_H,
  ARM_SHORTEN,
  BOUNCE_MIN,
  BOUNCE_SHARE,
  FENCE_MARGIN,
  FENCE_TOP_H,
  FLIGHT_BASE_MS,
  FLIGHT_MS_PER_UNIT,
  HEAVY_DISTANCE,
  LAWN_D,
  LAWN_W,
  THROW_MAX_PX,
  THROW_UNITS_PER_PX,
  TICK_MS
} from './tuning'
import type { Crossing, Flight } from './types'
import { windDrift } from './wind'

/** A release that throws: where it leaves the hand, and how hard and which way the swipe went. */
export interface ThrowSpec {
  /** Launch point in lawn units. */
  lx: number
  ly: number
  /** Peak swipe speed in screen pixels per second. */
  speedPx: number
  /** Swipe direction on screen; y grows downward, so the fence is at negative y. */
  dirX: number
  dirY: number
  /** Arm tiredness from 0 to 1. */
  arm?: number
  /** Wind multiplier on distance; 1 is calm. */
  wind?: number
  /** Along-fence wind: 1 pushes toward the right hedge, -1 toward the left, 0 is calm. */
  side?: number
  heavy?: boolean
}

/** How far a throw flies along the ground, in units. */
export function throwDistance(
  speedPx: number,
  arm = 0,
  wind = 1,
  heavy = false
): number {
  const base = THROW_UNITS_PER_PX * Math.min(Math.max(speedPx, 0), THROW_MAX_PX)
  return base * (1 - ARM_SHORTEN * arm) * wind * (heavy ? HEAVY_DISTANCE : 1)
}

/** Arc peak height for a throw of ground distance `D`. */
export function arcPeak(D: number): number {
  return Math.max(ARC_MIN_H, ARC_H_PER_D * D)
}

/** Flight time in ms for a throw of ground distance `D`. */
export function flightMs(D: number): number {
  return FLIGHT_BASE_MS + FLIGHT_MS_PER_UNIT * D
}

/**
 * The slowest straight throw, in px/s, that clears the fence with its margin from a launch
 * depth `ly`, with a fresh arm and no wind.
 */
export function requiredSpeed(ly: number): number {
  return ly / (1 - FENCE_MARGIN) / THROW_UNITS_PER_PX
}

/**
 * Plans a throw's flight from garden time `t0`. The outcome says what happens when the
 * flight reaches `endTau`: it lands short, goes wide into a hedge, clips the fence top,
 * or crosses the fence and changes hands. An along-fence gust bends the whole path
 * sideways, so a throw aimed near a hedge can end up in it.
 */
export function planThrow(spec: ThrowSpec, t0: number): Flight {
  const len = Math.hypot(spec.dirX, spec.dirY) || 1
  const power = Math.max(
    1,
    throwDistance(spec.speedPx, spec.arm, spec.wind, spec.heavy)
  )
  const vx = (spec.dirX / len) * power + windDrift(spec.side ?? 0, power)
  const vy = (spec.dirY / len) * power
  return planPath(spec.lx, spec.ly, vx, vy, t0)
}

/**
 * Plans a flight from (lx, ly) along the ground vector (vx, vy), starting at garden time
 * `t0`. Hedges and the back wall stop it as `wide`; the fence clips or passes it.
 */
export function planPath(
  lx: number,
  ly: number,
  vx: number,
  vy: number,
  t0: number
): Flight {
  const D = Math.max(1e-6, Math.hypot(vx, vy))
  const ux = vx / D
  const uy = vy / D
  const toFence = uy < 0 ? ly / -uy : Infinity
  const toHedge = ux > 0 ? (LAWN_W - lx) / ux : ux < 0 ? lx / -ux : Infinity
  // Only bounces fly away from the fence; the back wall stops them like a hedge.
  const toBack = uy > 0 && ly < LAWN_D ? (LAWN_D - ly) / uy : Infinity
  const toWall = Math.min(toHedge, toBack)
  let outcome: Flight['outcome']
  let endTau: number
  if (toWall < Math.min(toFence, D)) {
    outcome = 'wide'
    endTau = toWall / D
  } else if (toFence > D) {
    outcome = 'land'
    endTau = 1
  } else {
    outcome = toFence > (1 - FENCE_MARGIN) * D ? 'clip' : 'cross'
    endTau = toFence / D
  }
  return {
    x0: lx,
    y0: ly,
    x1: lx + ux * D,
    y1: ly + uy * D,
    H: arcPeak(D),
    T: flightMs(D),
    t0,
    outcome,
    endTau
  }
}

/**
 * The flight off a trampoline for something that landed on it at (lx, ly) at garden time
 * `t0`: back the way `flight` came, at 90% of its distance. A bounce that reaches the
 * fence always goes over. Returns null when the bounce would be too short to matter.
 */
export function bounceFlight(
  flight: Flight,
  lx: number,
  ly: number,
  t0: number
): Flight | null {
  const vx = -(flight.x1 - flight.x0) * BOUNCE_SHARE
  const vy = -(flight.y1 - flight.y0) * BOUNCE_SHARE
  if (Math.hypot(vx, vy) < BOUNCE_MIN) return null
  const next = planPath(lx, ly, vx, vy, t0)
  if (next.outcome === 'clip') next.outcome = 'cross'
  return next
}

/** Flight progress at garden time `t`, from 0 at launch to 1 at the end of the full arc. */
export function flightTau(flight: Flight, t: number): number {
  return (t - flight.t0) / flight.T
}

/** Ground position and height of a flight at `tau`, written into `out`. */
export function flightPoint(
  flight: Flight,
  tau: number,
  out: { x: number; y: number; h: number }
): { x: number; y: number; h: number } {
  out.x = flight.x0 + (flight.x1 - flight.x0) * tau
  out.y = flight.y0 + (flight.y1 - flight.y0) * tau
  out.h = 4 * flight.H * tau * (1 - tau)
  return out
}

/** Ground speed of a flight in units per second. */
export function groundSpeed(flight: Flight): number {
  return (
    (Math.hypot(flight.x1 - flight.x0, flight.y1 - flight.y0) / flight.T) * 1000
  )
}

/** Crossing flags for a plain throw from your hand. */
const HAND_THROW = { bounced: false, back: false, look: 0 } as const

/** The hand-off record for a flight that reached the fence line, in the thrower's frame. */
export function crossingOf(
  flight: Flight,
  kind: Crossing['kind'],
  spin: number,
  wiltIn: number,
  flags: Pick<Crossing, 'bounced' | 'back' | 'look'> = HAND_THROW
): Crossing {
  const tau = flight.endTau
  const x = flight.x0 + (flight.x1 - flight.x0) * tau
  return {
    kind,
    x,
    at: flight.t0 + tau * flight.T,
    d: -flight.y1,
    dx: flight.x1 - x,
    tau,
    T: flight.T,
    H: flight.H,
    spin,
    wiltIn,
    ...flags
  }
}

/**
 * The receiver's flight for an item that crossed the fence, mirrored left to right. It
 * starts at the fence and flies the rest of the arc onto the receiver's lawn. `t0` is set
 * so the item sits at the crossing at garden time `crossAt`. A flight that would leave
 * the lawn past a hedge or the back edge ends there as `wide` and drops back.
 */
export function arrivalFlight(crossing: ArcRest, crossAt: number): Flight {
  const { tau, T, H } = crossing
  const rest = Math.max(1e-3, 1 - tau)
  const cx = LAWN_W - crossing.x
  // The whole arc's ground vector, mirrored: the receiver's x runs the other way.
  const fx = -crossing.dx / rest
  const fy = crossing.d / rest
  const x0 = cx - fx * tau
  const y0 = -fy * tau
  const flight: Flight = {
    x0,
    y0,
    x1: x0 + fx,
    y1: y0 + fy,
    H,
    T,
    t0: crossAt - tau * T,
    outcome: 'land',
    endTau: 1
  }
  let exitTau = 1
  if (flight.y1 > LAWN_D) exitTau = (LAWN_D - y0) / fy
  if (flight.x1 < 0) exitTau = Math.min(exitTau, -x0 / fx)
  if (flight.x1 > LAWN_W) exitTau = Math.min(exitTau, (LAWN_W - x0) / fx)
  if (exitTau < 1) {
    flight.outcome = 'wide'
    flight.endTau = Math.max(tau, exitTau)
  }
  return flight
}

/** The part of a crossing the receiver needs to fly the rest of the arc. */
export type ArcRest = Pick<Crossing, 'x' | 'd' | 'dx' | 'tau' | 'T' | 'H'>

/**
 * How far to fast-forward an arriving flight, up to `wantMs`, so it still enters at or
 * above the fence top on the receiver's screen. A late arrival then lands late but never
 * pops into view on the lawn.
 */
export function entryFastForward(arrival: ArcRest, wantMs: number): number {
  const flight = arrivalFlight(arrival, 0)
  const p = { x: 0, y: 0, h: 0 }
  for (let ff = wantMs; ff > 0; ff -= TICK_MS) {
    const tau = flightTau(flight, ff)
    if (tau > flight.endTau) continue
    flightPoint(flight, tau, p)
    if (p.y - p.h <= -FENCE_TOP_H) return ff
  }
  return 0
}
