import type { Arrival } from '../game/garden'
import { isHeavy, itemCode, itemFromCode } from '../game/types'
import type { ClipRecord, Crossing } from '../game/types'
import type { ClipMsg, ThrowItemMsg } from './protocol'

/** Throw flag bits: heavy junk, a bounce off a trampoline, and a throw coming back home. */
const FLAG_HEAVY = 1
const FLAG_BOUNCED = 2
const FLAG_BACK = 4
/** The litter look rides in bits 3 and 4. */
const LOOK_SHIFT = 3

/** Packs a crossing's flags into the `f` byte. */
export function throwFlags(crossing: Crossing): number {
  return (
    (isHeavy(crossing.kind) ? FLAG_HEAVY : 0) |
    (crossing.bounced ? FLAG_BOUNCED : 0) |
    (crossing.back ? FLAG_BACK : 0) |
    ((crossing.look & 3) << LOOK_SHIFT)
  )
}

/** Packs a fence crossing for the wire. `crossedAt` is the crossing time on the shared clock. */
export function encodeCrossing(
  crossing: Crossing,
  id: string,
  crossedAt: number
): ThrowItemMsg {
  return {
    id,
    ty: itemCode(crossing.kind),
    x: Math.round(crossing.x),
    c: Math.round(crossedAt),
    d: Math.round(crossing.d),
    dx: Math.round(crossing.dx),
    tau: Math.min(999, Math.max(0, Math.round(crossing.tau * 1000))),
    T: Math.max(1, Math.round(crossing.T)),
    H: Math.max(1, Math.round(crossing.H)),
    sp: Math.round(crossing.spin * 100),
    f: throwFlags(crossing),
    w: crossing.wiltIn < 0 ? -1 : Math.min(60_000, Math.round(crossing.wiltIn))
  }
}

/** Unpacks a wire throw into an arrival for the receiver's garden, or null for an unknown item. */
export function decodeThrowItem(msg: ThrowItemMsg): Arrival | null {
  const kind = itemFromCode(msg.ty)
  if (!kind) return null
  return {
    kind,
    x: msg.x,
    d: msg.d,
    dx: msg.dx,
    tau: msg.tau / 1000,
    T: msg.T,
    H: msg.H,
    spin: msg.sp / 100,
    wiltIn: msg.w,
    bounced: (msg.f & FLAG_BOUNCED) !== 0,
    back: (msg.f & FLAG_BACK) !== 0,
    look: (msg.f >> LOOK_SHIFT) & 3
  }
}

/** Packs a clip record for the wire. `clippedAt` is the teeter's start on the shared clock. */
export function encodeClip(
  clip: ClipRecord,
  id: string,
  clippedAt: number
): ClipMsg {
  return {
    id,
    ty: itemCode(clip.kind),
    x: Math.round(clip.x),
    c: Math.round(clippedAt)
  }
}

/**
 * A throw id: the thrower's session id plus a counter. Session ids grow over time, so a
 * reloaded page never reuses an id the neighbour has already seen.
 */
export function throwId(sessionId: string, n: number): string {
  return `${sessionId}.${n}`
}
