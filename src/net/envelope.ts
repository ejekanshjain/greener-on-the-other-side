import { THROW_WINDOW_MS } from '../game/tuning'
import { randomId } from './ids'
import { isMsg, type Msg, type MsgKind } from './protocol'

/** One Pusher event: a header plus every message the outbox had pending. */
export interface Bundle {
  v: 1
  /** Sender's session id; it grows over time. */
  s: string
  /** Match id, or "" outside a match. */
  m: string
  /** Round index 0 to 2, or -1 outside a round. */
  r: number
  /** Sequence number per session. */
  q: number
  /** Shared-clock time when the bundle left the outbox. */
  t: number
  x: Msg[]
}

/** A session id: the page-load time in base36 plus 4 random characters. */
export function newSessionId(now = Date.now()): string {
  return `${now.toString(36)}-${randomId(4)}`
}

/** Orders session ids by their time part, then by the whole string. */
export function compareSessions(a: string, b: string): number {
  const ta = parseInt(a.split('-')[0] ?? '', 36)
  const tb = parseInt(b.split('-')[0] ?? '', 36)
  if (ta !== tb) return (ta || 0) - (tb || 0)
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Validates a received bundle. Returns null when the header is malformed. Malformed
 * messages inside a good header are dropped one by one.
 */
export function decodeBundle(raw: unknown): Bundle | null {
  if (typeof raw !== 'object' || raw === null) return null
  const b = raw as Record<string, unknown>
  if (
    b.v !== 1 ||
    typeof b.s !== 'string' ||
    !/^[0-9a-z]{6,12}-[0-9a-z]{4}$/.test(b.s) ||
    typeof b.m !== 'string' ||
    !/^([a-z0-9]{6})?$/.test(b.m) ||
    !Number.isInteger(b.r) ||
    (b.r as number) < -1 ||
    (b.r as number) > 2 ||
    !Number.isInteger(b.q) ||
    (b.q as number) < 0 ||
    !Number.isFinite(b.t) ||
    !Array.isArray(b.x) ||
    b.x.length > 64
  )
    return null
  return {
    v: 1,
    s: b.s,
    m: b.m,
    r: b.r as number,
    q: b.q as number,
    t: b.t as number,
    x: b.x.filter(isMsg)
  }
}

/** What the receiver currently expects. */
export interface FilterContext {
  /** The current match id, or "" outside a match. */
  matchId: string
  /** The round now in play or being revealed, or -1. */
  round: number
  /** Shared-clock time now. */
  now: number
}

/** Why the filter dropped something. */
export type DropReason = 'session' | 'match' | 'round' | 'old' | 'seen' | 'late'

/** Kinds that belong to the room, not a match, so they pass any match id. */
const LOBBY_KINDS: ReadonlySet<MsgKind> = new Set([
  'hello',
  'sync',
  'start',
  'leave'
])
/** Kinds that belong to one round. */
const ROUND_KINDS: ReadonlySet<MsgKind> = new Set(['throw', 'lawn', 'fist'])
/** Kinds where only the newest by sequence matters. */
const NEWEST_KINDS: ReadonlySet<MsgKind> = new Set(['sync', 'lawn'])
const SEEN_LIMIT = 512

/**
 * Drops stale messages: bundles from a sender's older sessions, other matches and
 * finished rounds, `sync` older than one already applied, and throws seen before or
 * that crossed the fence more than 6s ago.
 */
export class StaleFilter {
  private readonly sessions = new Map<string, string>()
  private readonly newest = new Map<string, Map<MsgKind, number>>()
  private readonly seenThrows = new Set<string>()
  readonly drops: Record<DropReason, number> = {
    session: 0,
    match: 0,
    round: 0,
    old: 0,
    seen: 0,
    late: 0
  }

  /** The messages in `bundle` that should apply, in order. */
  accept(from: string, bundle: Bundle, ctx: FilterContext): Msg[] {
    const out: Msg[] = []
    this.each(
      from,
      bundle,
      () => ctx,
      msg => out.push(msg)
    )
    return out
  }

  /**
   * Hands each message in `bundle` that should apply to `apply`, in order. `ctx` is read
   * again before each message, so a message can count on the ones before it applying
   * first: a `sync` that puts a reloaded page back in its match lets that match's
   * `result` and `final` through.
   */
  each(
    from: string,
    bundle: Bundle,
    ctx: () => FilterContext,
    apply: (msg: Msg) => void
  ): void {
    const known = this.sessions.get(from)
    if (known !== undefined) {
      const order = compareSessions(bundle.s, known)
      if (order < 0) {
        this.drops.session += bundle.x.length
        return
      }
      if (order > 0) this.newest.delete(from)
    }
    this.sessions.set(from, bundle.s)
    let seqs = this.newest.get(from)
    if (!seqs) {
      seqs = new Map()
      this.newest.set(from, seqs)
    }
    for (const msg of bundle.x) {
      const now = ctx()
      if (!LOBBY_KINDS.has(msg.k) && bundle.m !== now.matchId) {
        this.drops.match++
        continue
      }
      if (ROUND_KINDS.has(msg.k) && bundle.r !== now.round) {
        this.drops.round++
        continue
      }
      if (NEWEST_KINDS.has(msg.k)) {
        if (bundle.q <= (seqs.get(msg.k) ?? -1)) {
          this.drops.old++
          continue
        }
        seqs.set(msg.k, bundle.q)
      }
      if (msg.k === 'throw') {
        const fresh = this.freshThrow(msg, now.now)
        if (fresh) apply(fresh)
        continue
      }
      apply(msg)
    }
  }

  /**
   * Keeps the throw items and clips seen for the first time and sent within the last 6s.
   * Each is judged by its own crossing or clip time, so time spent waiting in the
   * thrower's outbox and time on the wire share one 6s window.
   */
  private freshThrow(
    msg: Extract<Msg, { k: 'throw' }>,
    now: number
  ): Extract<Msg, { k: 'throw' }> | null {
    const fresh = (entry: { id: string; c: number }) => {
      if (now - entry.c > THROW_WINDOW_MS) {
        this.drops.late++
        return false
      }
      return this.firstSight(entry.id)
    }
    const items = msg.items.filter(fresh)
    const clips = msg.clips.filter(fresh)
    if (items.length === 0 && clips.length === 0) return null
    return { k: 'throw', items, clips }
  }

  private firstSight(id: string): boolean {
    if (this.seenThrows.has(id)) {
      this.drops.seen++
      return false
    }
    this.seenThrows.add(id)
    if (this.seenThrows.size > SEEN_LIMIT) {
      const oldest = this.seenThrows.values().next().value
      if (oldest !== undefined) this.seenThrows.delete(oldest)
    }
    return true
  }
}
