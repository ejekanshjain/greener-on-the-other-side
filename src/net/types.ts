/** A transport's connection state. */
export type ConnStatus = 'connecting' | 'connected' | 'reconnecting' | 'failed'

/** One member of the room's presence list. */
export interface MemberInfo {
  id: string
  name: string
}

/** Changes to the room's member list. A snapshot lists everyone, you included. */
export type MemberEvent =
  | { type: 'snapshot'; members: MemberInfo[] }
  | { type: 'added'; member: MemberInfo }
  | { type: 'removed'; id: string }

/** What happened to one send: it went out, the connection is down, or the rate cap refused it. */
export type SendResult = 'sent' | 'offline' | 'limited'

/** `b` carries message bundles; `p` carries clock pings, which skip the outbox. */
export type PayloadKind = 'b' | 'p'

/**
 * A room's message pipe between the two browsers. `from` is always the transport's own
 * sender identity, never a field inside the payload, and `send` never echoes to the sender.
 */
export interface Transport {
  readonly kind: 'pusher' | 'local' | 'memory'
  readonly selfId: string
  open(): void
  close(): void
  status(): ConnStatus
  send(kind: PayloadKind, payload: object): SendResult
  onMessage(
    fn: (from: string, kind: PayloadKind, payload: unknown) => void
  ): () => void
  onMembers(fn: (event: MemberEvent) => void): () => void
  onStatus(fn: (status: ConnStatus, reason?: string) => void): () => void
  /** Rejoins after the page comes back from the back-forward cache, where needed. */
  resume?(): void
}

/** Runtime fault injection for the local transport. */
export interface Faults {
  /** Extra delivery delay in ms. */
  lag: number
  /** Random extra delay up to this many ms. */
  jitter: number
  /** Share of messages lost, 0 to 1. */
  drop: number
  /** Share of messages delayed by an extra 2 to 4 times `lag`, 0 to 1. */
  reorder: number
  /** No sends, receives or heartbeats while true. */
  offline: boolean
}
