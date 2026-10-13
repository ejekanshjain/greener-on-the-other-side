import { Listeners } from './listeners'
import type {
  ConnStatus,
  MemberEvent,
  MemberInfo,
  PayloadKind,
  SendResult,
  Transport
} from './types'

/**
 * One end of an in-process pipe. Practice and tests use it: presence works like Pusher's
 * (an open end lists itself and the other end if it's open, and the other end hears it
 * join and leave), nothing leaves the page, and nothing costs Pusher quota.
 */
class MemoryTransport implements Transport {
  readonly kind = 'memory'
  peer: MemoryTransport | null = null
  private opened = false
  private readonly messages = new Listeners<[string, PayloadKind, unknown]>()
  private readonly members = new Listeners<[MemberEvent]>()
  private readonly statuses = new Listeners<[ConnStatus, string?]>()

  constructor(
    readonly me: MemberInfo,
    private readonly lagMs: number
  ) {}

  get selfId(): string {
    return this.me.id
  }

  open(): void {
    if (this.opened) return
    this.opened = true
    // Like Pusher, the status and the member snapshot come after open returns.
    queueMicrotask(() => {
      if (!this.opened) return
      const peer = this.peer?.opened ? this.peer : null
      this.statuses.emit('connected')
      this.members.emit({
        type: 'snapshot',
        members: peer ? [this.me, peer.me] : [this.me]
      })
      peer?.members.emit({ type: 'added', member: this.me })
    })
  }

  close(): void {
    if (!this.opened) return
    this.opened = false
    if (this.peer?.opened)
      this.peer.members.emit({ type: 'removed', id: this.me.id })
  }

  status(): ConnStatus {
    return this.opened ? 'connected' : 'connecting'
  }

  send(kind: PayloadKind, payload: object): SendResult {
    const peer = this.peer
    if (!this.opened || !peer) return 'offline'
    // A copy, so the receiver never shares objects with the sender.
    const copy: unknown = JSON.parse(JSON.stringify(payload))
    const deliver = () => {
      if (peer.opened) peer.messages.emit(this.me.id, kind, copy)
    }
    if (this.lagMs > 0) setTimeout(deliver, this.lagMs)
    else queueMicrotask(deliver)
    return 'sent'
  }

  onMessage(
    fn: (from: string, kind: PayloadKind, payload: unknown) => void
  ): () => void {
    return this.messages.add(fn)
  }

  onMembers(fn: (event: MemberEvent) => void): () => void {
    return this.members.add(fn)
  }

  onStatus(fn: (status: ConnStatus, reason?: string) => void): () => void {
    return this.statuses.add(fn)
  }
}

/**
 * Two linked transports for players `a` and `b`. Each delivers to the other after
 * `lagMs`, or on the next microtask at 0, and never back to itself.
 */
export function createMemoryPair(
  a: MemberInfo,
  b: MemberInfo,
  { lagMs = 0 }: { lagMs?: number } = {}
): [Transport, Transport] {
  const one = new MemoryTransport(a, lagMs)
  const two = new MemoryTransport(b, lagMs)
  one.peer = two
  two.peer = one
  return [one, two]
}
