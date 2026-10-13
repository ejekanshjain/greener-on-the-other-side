import { randomId } from './ids'
import { Listeners } from './listeners'
import type {
  ConnStatus,
  Faults,
  MemberEvent,
  MemberInfo,
  PayloadKind,
  SendResult,
  Transport
} from './types'

type Frame =
  | { f: 'join' | 'beat'; from: string; name: string }
  | { f: 'leave'; from: string }
  | { f: 'event'; from: string; kind: PayloadKind; payload: unknown }

const BEAT_MS = 1000
/**
 * A member that stops beating without saying leave (offline, frozen) stays listed this
 * long, like Pusher, which notices a dropped connection only when its own timeout runs
 * out. A closed tab says leave and goes at once.
 */
const EXPIRE_MS = 30_000
const SNAPSHOT_MS = 300
const CONNECT_MS = 60
/** Pusher refuses more than 10 client events in any second. */
const RATE_MAX = 10
const RATE_WINDOW_MS = 1000

/**
 * A dev-only transport over `BroadcastChannel`, so two tabs of one browser can play
 * without Pusher. It fakes Pusher's presence list with joins, 1s heartbeats and 30s
 * expiry, refuses more than 10 events a second like Pusher's 4301 error, and can add
 * lag, jitter, loss, reordering and an offline state.
 */
export class LocalTransport implements Transport {
  readonly kind = 'local'
  private channel: BroadcastChannel | null = null
  private state: ConnStatus = 'connecting'
  private readonly members = new Map<string, { name: string; seenAt: number }>()
  private snapshotSent = false
  private readonly timers = new Set<ReturnType<typeof setTimeout>>()
  private beatTimer: ReturnType<typeof setInterval> | null = null
  private readonly sentAt: number[] = []
  private readonly messages = new Listeners<[string, PayloadKind, unknown]>()
  private readonly memberEvents = new Listeners<[MemberEvent]>()
  private readonly statuses = new Listeners<[ConnStatus, string | undefined]>()

  constructor(
    private readonly code: string,
    readonly selfId: string,
    private readonly name: string,
    readonly faults: Faults
  ) {}

  open(): void {
    if (this.channel) return
    const channel = new BroadcastChannel(`greener-local-${this.code}`)
    this.channel = channel
    channel.onmessage = event => this.receive(event.data as Frame)
    window.addEventListener('pagehide', this.onPageHide)
    this.later(CONNECT_MS, () => {
      this.setStatus(this.faults.offline ? 'reconnecting' : 'connected')
      this.post({ f: 'join', from: this.selfId, name: this.name })
      this.later(SNAPSHOT_MS, () => this.emitSnapshot())
    })
    this.beatTimer = setInterval(() => this.beat(), BEAT_MS)
  }

  close(): void {
    if (!this.channel) return
    this.post({ f: 'leave', from: this.selfId })
    this.channel.close()
    this.channel = null
    window.removeEventListener('pagehide', this.onPageHide)
    if (this.beatTimer) clearInterval(this.beatTimer)
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
    this.members.clear()
    // Closing is our own choice, so nobody needs to hear about it.
    this.state = 'failed'
  }

  status(): ConnStatus {
    return this.state
  }

  send(kind: PayloadKind, payload: object): SendResult {
    if (this.state !== 'connected' || this.faults.offline) return 'offline'
    const now = performance.now()
    while (this.sentAt.length && (this.sentAt[0] ?? 0) <= now - RATE_WINDOW_MS)
      this.sentAt.shift()
    if (this.sentAt.length >= RATE_MAX) return 'limited'
    this.sentAt.push(now)
    this.post({ f: 'event', from: this.selfId, kind, payload })
    return 'sent'
  }

  onMessage(
    fn: (from: string, kind: PayloadKind, payload: unknown) => void
  ): () => void {
    return this.messages.add(fn)
  }

  onMembers(fn: (event: MemberEvent) => void): () => void {
    return this.memberEvents.add(fn)
  }

  onStatus(fn: (status: ConnStatus, reason?: string) => void): () => void {
    return this.statuses.add(fn)
  }

  /** The page left for the back-forward cache and said leave, so it joins again. */
  resume(): void {
    if (this.channel)
      this.post({ f: 'join', from: this.selfId, name: this.name })
  }

  /** Changes faults at runtime. Going offline and back rejoins like a reconnect. */
  setFaults(next: Partial<Faults>): void {
    const wasOffline = this.faults.offline
    Object.assign(this.faults, next)
    if (!this.channel || wasOffline === this.faults.offline) return
    if (this.faults.offline) {
      this.setStatus('reconnecting')
      return
    }
    // What we heard before going offline is all we know, so nobody expires for our gap.
    const now = performance.now()
    for (const member of this.members.values()) member.seenAt = now
    this.setStatus('connected')
    this.post({ f: 'join', from: this.selfId, name: this.name })
  }

  private readonly onPageHide = () => {
    this.post({ f: 'leave', from: this.selfId })
  }

  private beat(): void {
    if (this.faults.offline) return
    this.post({ f: 'beat', from: this.selfId, name: this.name })
    const now = performance.now()
    for (const [id, member] of this.members) {
      if (now - member.seenAt < EXPIRE_MS) continue
      this.members.delete(id)
      if (this.snapshotSent) this.memberEvents.emit({ type: 'removed', id })
    }
  }

  private receive(frame: Frame): void {
    if (!frame || typeof frame !== 'object' || frame.from === this.selfId)
      return
    if (this.faults.offline || !this.channel) return
    switch (frame.f) {
      case 'join':
      case 'beat':
        this.seen(frame.from, frame.name)
        // Answer a newcomer so it learns about us before its snapshot.
        if (frame.f === 'join')
          this.post({ f: 'beat', from: this.selfId, name: this.name })
        return
      case 'leave':
        if (this.members.delete(frame.from) && this.snapshotSent)
          this.memberEvents.emit({ type: 'removed', id: frame.from })
        return
      case 'event':
        this.deliver(frame)
        return
    }
  }

  private seen(id: string, name: string): void {
    const known = this.members.get(id)
    this.members.set(id, { name, seenAt: performance.now() })
    if (!known && this.snapshotSent)
      this.memberEvents.emit({ type: 'added', member: { id, name } })
  }

  private deliver(frame: Extract<Frame, { f: 'event' }>): void {
    const { lag, jitter, drop, reorder } = this.faults
    if (drop > 0 && Math.random() < drop) return
    let delay = lag + Math.random() * jitter
    if (reorder > 0 && Math.random() < reorder)
      delay += (2 + Math.random() * 2) * Math.max(lag, 20)
    const run = () => {
      if (this.channel && !this.faults.offline)
        this.messages.emit(frame.from, frame.kind, frame.payload)
    }
    if (delay <= 0) run()
    else this.later(delay, run)
  }

  private emitSnapshot(): void {
    this.snapshotSent = true
    const members: MemberInfo[] = [{ id: this.selfId, name: this.name }]
    for (const [id, member] of this.members)
      members.push({ id, name: member.name })
    this.memberEvents.emit({ type: 'snapshot', members })
  }

  private setStatus(status: ConnStatus, reason?: string): void {
    if (this.state === status) return
    this.state = status
    this.statuses.emit(status, reason)
  }

  private post(frame: Frame): void {
    if (this.faults.offline && frame.f !== 'leave') return
    this.channel?.postMessage(frame)
  }

  private later(ms: number, fn: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      fn()
    }, ms)
    this.timers.add(timer)
  }
}

/** A per-tab local player id: `?pid=` when given, else one kept in `sessionStorage`. */
export function localPlayerId(forced: string | null): string {
  if (forced) return forced
  const key = 'greener-local-pid'
  const stored = sessionStorage.getItem(key)
  if (stored && /^[a-z0-9]{8,24}$/.test(stored)) return stored
  const id = randomId(10)
  sessionStorage.setItem(key, id)
  return id
}
