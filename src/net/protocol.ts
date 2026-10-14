/**
 * Message types for the room channel, each with a hand-written validator. Receivers
 * validate everything, because any browser in the room can send anything.
 */

import { countedFromWire } from '../game/counts'
import type { Blame } from '../game/garden'
import { BLAME_KEYS } from '../game/report'
import type { Winner } from '../game/score'
import { FINAL_MAX_CHARS } from './finalCodec'

/** A score's four lines: Green, Stripes, Tidy and Junk. The total is their sum. */
export type ScoreLines = [number, number, number, number]

/** The match timeline the host picks. Every round's times follow from it. */
export interface MatchInfo {
  /** 6 random characters, new for each match. */
  id: string
  seed: number
  /** Shared-clock time when round 1's play starts. */
  at: number
  roundMs: number
  revealMs: number
  lastRevealMs: number
  countdownMs: number
}

/** The room flow's coarse phase. Round, play and reveal derive from `match` and the clock. */
export type RoomPhase = 'lobby' | 'match' | 'over'

/** How a match ended, as a `sync` reports it to a neighbour who missed it. */
export interface OverMsg {
  /** `score`: Brenda decided it. `walkover`: one player never came back. `noContest`: the line went dead. */
  r: 'score' | 'walkover' | 'noContest'
  /** The winner's player id, or '' for nobody. */
  w: string
  /** The match id. */
  m: string
}

/** One item crossing the fence. Lengths are whole lawn units; see PLAN.md 2.6. */
export interface ThrowItemMsg {
  /** Session id plus a counter. */
  id: string
  /** Item code. */
  ty: number
  /** Crossing point from the thrower's left hedge. */
  x: number
  /** Crossing time on the shared clock. */
  c: number
  /** Depth still to fly past the fence. */
  d: number
  /** Sideways distance still to fly, in the thrower's frame. */
  dx: number
  /** Crossing fraction of the flight, times 1,000. */
  tau: number
  /** Flight ms. */
  T: number
  /** Peak height. */
  H: number
  /** Spin in hundredths of a radian per second. */
  sp: number
  /** Flags: 1 heavy, 2 bounced off a trampoline, 4 coming back to its thrower; bits 3 and 4 hold the litter look. */
  f: number
  /** Ms until a yanked weed wilts, or -1. */
  w: number
}

/** A throw that clipped the fence top, so the receiver can draw the teeter. */
export interface ClipMsg {
  id: string
  ty: number
  /** Clip point from the thrower's left hedge. */
  x: number
  /** When the teeter started, on the shared clock. */
  c: number
}

export type Msg =
  | { k: 'hello'; name: string }
  | {
      k: 'sync'
      name: string
      seats: string[]
      ready: boolean
      rematch: boolean
      phase: RoomPhase
      /** The current match, outside the lobby. A reloaded host takes it back from the guest's. */
      match?: MatchInfo
      /** With `match`: round wins and points so far (host first), and how many verdicts are in. */
      tally?: [number, number]
      totals?: [number, number]
      done?: number
      /** At the match end: how it ended, for a neighbour who missed it. */
      over?: OverMsg
      /** During a match: the sender's last copy of your lawn (a lawn pack), for a reload rebuild. */
      copy?: string
      /** Shared time that copy arrived. */
      copyAt?: number
      /** The guest, during a match: the round whose verdict it still waits for. */
      wait?: number
      /** With `wait`: the guest's last copy of the host's lawn in that round, and when it arrived. */
      waitCopy?: string
      waitCopyAt?: number
      /**
       * The host, during a match: the rounds it lacks a verdict for after a reload, as bits
       * (round 1 is 1). The guest answers with its `result` for each.
       */
      need?: number
      /** Outside rounds: the sender is a new player, so the neighbour's lobby shows First Match. */
      first?: boolean
      /** In the lobby: the yard step the sender is on, 1 to 3, while their yard is open. */
      yard?: number
    }
  | ({ k: 'start' } & MatchInfo)
  | { k: 'throw'; items: ThrowItemMsg[]; clips: ClipMsg[] }
  /** Your lawn for the neighbour's peek strip, every 1s in a round: a base64 lawn pack. */
  | { k: 'lawn'; g: string }
  /** Your true lawn at 0:00: a base64 final pack. The guest repeats it until the result comes. */
  | { k: 'final'; g: string }
  /**
   * The host's verdict on a round; `hf` is the host's final pack. When the guest's final
   * never came, `gf` is the guest's lawn the host rebuilt and judged, so both screens draw
   * it. A guest hands a verdict back to a host that lost it in a reload, with the final
   * Brenda judged as `gf`.
   */
  | {
      k: 'result'
      round: number
      /** The host's lines, then the guest's. */
      sc: [ScoreLines, ScoreLines]
      w: Winner
      tally: [number, number]
      totals: [number, number]
      /** What Brenda counted on each lawn, host first, as `countedToWire` packs it. */
      ct: [number[], number[]]
      /** The own fault Brenda names under the loser's score, or ''. */
      bl: keyof Blame | ''
      over: boolean
      hf: string
      gf?: string
    }
  | { k: 'leave' }
  /** A shaken fist over the fence at `x`, in the sender's frame. */
  | { k: 'fist'; x: number }

export type MsgKind = Msg['k']

/** A clock ping or its answer. Pings skip the outbox and travel as payload kind `p`. */
export type ClockMsg =
  | { k: 'ping'; id: number; t0: number }
  | { k: 'pong'; id: number; t0: number; th: number }

// ---------------------------------------------------------------- Validators

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)
const isInt = (v: unknown, min = -Infinity, max = Infinity): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max
const isStr = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length <= max
const isId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-z0-9]{8,24}$/.test(v)
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'

const MAX_ITEMS = 8
/** The largest lawn pack, 284 bytes, is 380 base64 characters. */
const LAWN_MAX_CHARS = 400

function isMatch(v: Obj): boolean {
  return (
    isStr(v.id, 6) &&
    /^[a-z0-9]{6}$/.test(v.id) &&
    isInt(v.seed, 0, 0x7fffffff) &&
    isInt(v.at, 0) &&
    isInt(v.roundMs, 1000, 600_000) &&
    isInt(v.revealMs, 1000, 120_000) &&
    isInt(v.lastRevealMs, 1000, 120_000) &&
    isInt(v.countdownMs, 0, 10_000)
  )
}

function isThrowItem(v: unknown): v is ThrowItemMsg {
  return (
    isObj(v) &&
    isStr(v.id, 40) &&
    isInt(v.ty, 0, 15) &&
    isNum(v.x) &&
    Math.abs(v.x) < 2000 &&
    isInt(v.c, 0) &&
    isNum(v.d) &&
    v.d >= 0 &&
    v.d < 2000 &&
    isNum(v.dx) &&
    Math.abs(v.dx) < 2000 &&
    isInt(v.tau, 0, 999) &&
    isInt(v.T, 1, 10_000) &&
    isInt(v.H, 1, 5000) &&
    isInt(v.sp, -10_000, 10_000) &&
    isInt(v.f, 0, 255) &&
    isInt(v.w, -1, 60_000)
  )
}

const isPair = (v: unknown, min: number, max: number): v is [number, number] =>
  Array.isArray(v) &&
  v.length === 2 &&
  isInt(v[0], min, max) &&
  isInt(v[1], min, max)

/** Green 0 to 50, Stripes 0 to 30, Tidy 0 to 20, Junk 0 or less. */
function isLines(v: unknown): v is ScoreLines {
  return (
    Array.isArray(v) &&
    v.length === 4 &&
    isInt(v[0], 0, 50) &&
    isInt(v[1], 0, 30) &&
    isInt(v[2], 0, 20) &&
    isInt(v[3], -2000, 0)
  )
}

function isResult(v: Obj): boolean {
  return (
    isInt(v.round, 0, 2) &&
    Array.isArray(v.sc) &&
    v.sc.length === 2 &&
    v.sc.every(isLines) &&
    (v.w === 'h' || v.w === 'g' || v.w === 'd') &&
    isPair(v.tally, 0, 3) &&
    isPair(v.totals, -6000, 6000) &&
    Array.isArray(v.ct) &&
    v.ct.length === 2 &&
    v.ct.every(c => countedFromWire(c) !== null) &&
    (v.bl === '' || BLAME_KEYS.includes(v.bl as keyof Blame)) &&
    isBool(v.over) &&
    isStr(v.hf, FINAL_MAX_CHARS) &&
    (v.gf === undefined || isStr(v.gf, FINAL_MAX_CHARS))
  )
}

function isOver(v: unknown): v is OverMsg {
  return (
    isObj(v) &&
    (v.r === 'score' || v.r === 'walkover' || v.r === 'noContest') &&
    (v.w === '' || isId(v.w)) &&
    typeof v.m === 'string' &&
    /^[a-z0-9]{6}$/.test(v.m)
  )
}

function isClip(v: unknown): v is ClipMsg {
  return (
    isObj(v) &&
    isStr(v.id, 40) &&
    isInt(v.ty, 0, 15) &&
    isNum(v.x) &&
    Math.abs(v.x) < 2000 &&
    isInt(v.c, 0)
  )
}

/** True when `v` is a well-formed message. Unknown kinds are refused. */
export function isMsg(v: unknown): v is Msg {
  if (!isObj(v)) return false
  switch (v.k) {
    case 'hello':
      return isStr(v.name, 64)
    case 'sync':
      return (
        isStr(v.name, 64) &&
        Array.isArray(v.seats) &&
        v.seats.length <= 2 &&
        v.seats.every(isId) &&
        isBool(v.ready) &&
        isBool(v.rematch) &&
        (v.phase === 'lobby' || v.phase === 'match' || v.phase === 'over') &&
        (v.match === undefined || (isObj(v.match) && isMatch(v.match))) &&
        (v.tally === undefined || isPair(v.tally, 0, 3)) &&
        (v.totals === undefined || isPair(v.totals, -6000, 6000)) &&
        (v.done === undefined || isInt(v.done, 0, 3)) &&
        (v.over === undefined || isOver(v.over)) &&
        (v.copy === undefined || isStr(v.copy, LAWN_MAX_CHARS)) &&
        (v.copyAt === undefined || isInt(v.copyAt, 0)) &&
        (v.wait === undefined || isInt(v.wait, 0, 2)) &&
        (v.waitCopy === undefined || isStr(v.waitCopy, LAWN_MAX_CHARS)) &&
        (v.waitCopyAt === undefined || isInt(v.waitCopyAt, 0)) &&
        (v.need === undefined || isInt(v.need, 1, 7)) &&
        (v.first === undefined || isBool(v.first)) &&
        (v.yard === undefined || isInt(v.yard, 1, 3))
      )
    case 'start':
      return isMatch(v)
    case 'throw':
      return (
        Array.isArray(v.items) &&
        v.items.length <= MAX_ITEMS &&
        v.items.every(isThrowItem) &&
        Array.isArray(v.clips) &&
        v.clips.length <= MAX_ITEMS &&
        v.clips.every(isClip)
      )
    case 'lawn':
      return isStr(v.g, LAWN_MAX_CHARS)
    case 'final':
      return isStr(v.g, FINAL_MAX_CHARS)
    case 'result':
      return isResult(v)
    case 'leave':
      return true
    case 'fist':
      return isNum(v.x) && Math.abs(v.x) < 2000
    default:
      return false
  }
}

/** True when `v` is a well-formed ping or pong. */
export function isClockMsg(v: unknown): v is ClockMsg {
  if (!isObj(v) || !isInt(v.id, 0) || !isNum(v.t0)) return false
  if (v.k === 'ping') return true
  return v.k === 'pong' && isNum(v.th)
}
