import { THROW_WINDOW_MS } from '../game/tuning'
import type { Bundle } from './envelope'
import type { Limiter } from './limiter'
import type { Msg, MsgKind } from './protocol'
import type { SendResult } from './types'

/** Kinds where a newer message replaces a pending one of the same kind. */
const KEEP_NEWEST: ReadonlySet<MsgKind> = new Set(['sync', 'lawn', 'final'])
/** The outbox flushes at most this often, so at most 6 events a second. */
export const FLUSH_GAP_MS = 167
/** Bundles larger than this split into several. */
export const SPLIT_BYTES = 3500
/** Bytes the bundle header adds around its messages. */
const HEADER_BYTES = 90

export interface OutboxDeps {
  /** Sends one bundle. The outbox has already taken a limiter slot for it. */
  send(bundle: Bundle): SendResult
  /** True while the transport can send. */
  connected(): boolean
  /** The current session, match and round for the bundle header. */
  header(): { s: string; m: string; r: number }
  limiter: Limiter
}

/** Running totals for the `?debug` overlay. */
export interface OutboxStats {
  bundles: number
  bytes: number
  largest: number
  /** Throws dropped because they waited more than 6s. */
  expired: number
  /** Send times, for events per second. */
  recent: number[]
  /** The most bundles sent in any 1s, the number Pusher's 10 a second limit counts. */
  peakPerSecond: number
  /** Messages queued so far, by kind. */
  pushed: Partial<Record<MsgKind, number>>
}

/**
 * Coalesces everything the room wants to send into at most 6 bundles a second. Keep-newest
 * kinds replace a pending copy, the rest queue. It holds messages while the connection is
 * down, but throws older than 6s vanish. Bundles over 3.5 KB split, each with its own
 * sequence number.
 */
export class Outbox {
  private pending: { msg: Msg; at: number; bytes: number }[] = []
  private seq = 0
  private lastFlushAt = -Infinity
  readonly stats: OutboxStats = {
    bundles: 0,
    bytes: 0,
    largest: 0,
    expired: 0,
    recent: [],
    peakPerSecond: 0,
    pushed: {}
  }

  constructor(private readonly deps: OutboxDeps) {}

  /** Queues a message at shared time `now`. */
  push(msg: Msg, now: number): void {
    const entry = { msg, at: now, bytes: utf8Length(JSON.stringify(msg)) }
    this.stats.pushed[msg.k] = (this.stats.pushed[msg.k] ?? 0) + 1
    // A newer copy replaces the pending one and moves behind everything queued since, so
    // a sync after a hello still arrives after it.
    if (KEEP_NEWEST.has(msg.k)) {
      const index = this.pending.findIndex(p => p.msg.k === msg.k)
      if (index >= 0) this.pending.splice(index, 1)
    }
    this.pending.push(entry)
  }

  /** Number of messages waiting. */
  get size(): number {
    return this.pending.length
  }

  /** Drops everything waiting, for example when leaving the room. */
  clear(): void {
    this.pending = []
  }

  /** Sends what is pending when a flush is due. Call it often, for example every 50 ms. */
  pump(now: number): void {
    if (now - this.lastFlushAt < FLUSH_GAP_MS) {
      this.expireThrows(now)
      return
    }
    this.flush(now)
  }

  /**
   * Sends everything pending now, ignoring the flush gap but not the limiter. Use it
   * before closing the connection, so a final `leave` goes out.
   */
  flush(now: number): void {
    this.expireThrows(now)
    if (this.pending.length === 0 || !this.deps.connected()) return
    this.lastFlushAt = now
    for (const chunk of this.chunks()) {
      if (!this.deps.limiter.tryTake(now)) return
      const bundle: Bundle = {
        v: 1,
        ...this.deps.header(),
        q: this.seq++,
        t: Math.round(now),
        x: chunk.map(entry => entry.msg)
      }
      if (this.deps.send(bundle) !== 'sent') return
      this.pending = this.pending.filter(entry => !chunk.includes(entry))
      const bytes = chunk.reduce(
        (sum, entry) => sum + entry.bytes,
        HEADER_BYTES
      )
      this.stats.bundles++
      this.stats.bytes += bytes
      this.stats.largest = Math.max(this.stats.largest, bytes)
      const recent = this.stats.recent
      recent.push(now)
      while (recent.length > 60) recent.shift()
      let inSecond = 0
      for (
        let i = recent.length - 1;
        i >= 0 && now - (recent[i] ?? 0) < 1000;
        i--
      )
        inSecond++
      this.stats.peakPerSecond = Math.max(this.stats.peakPerSecond, inSecond)
    }
  }

  private expireThrows(now: number): void {
    const before = this.pending.length
    this.pending = this.pending.filter(
      entry => entry.msg.k !== 'throw' || now - entry.at <= THROW_WINDOW_MS
    )
    this.stats.expired += before - this.pending.length
  }

  private chunks(): { msg: Msg; at: number; bytes: number }[][] {
    const out: { msg: Msg; at: number; bytes: number }[][] = []
    let current: { msg: Msg; at: number; bytes: number }[] = []
    let size = HEADER_BYTES
    for (const entry of this.pending) {
      if (current.length > 0 && size + entry.bytes + 1 > SPLIT_BYTES) {
        out.push(current)
        current = []
        size = HEADER_BYTES
      }
      current.push(entry)
      size += entry.bytes + 1
    }
    if (current.length > 0) out.push(current)
    return out
  }
}

/** UTF-8 byte length of a string, without allocating. */
export function utf8Length(text: string): number {
  let bytes = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      // A surrogate pair is one 4-byte character.
      bytes += 4
      i++
    } else bytes += 3
  }
  return bytes
}
