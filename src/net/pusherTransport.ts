import Pusher from 'pusher-js'
import type { PresenceChannel } from 'pusher-js'

import { Listeners } from './listeners'
import { roomChannel } from './roomCode'
import type {
  ConnStatus,
  MemberEvent,
  MemberInfo,
  PayloadKind,
  SendResult,
  Transport
} from './types'

/** Counts Pusher refused, for the `?debug` overlay. */
export interface PusherStats {
  /** Error 4301: more than 10 client events in a second. */
  limited: number
  /** Events dropped because they arrived without a sender. */
  anonymous: number
}

/**
 * The real transport: one Pusher presence channel per room. The auth route signs the
 * join with your player id and name. Senders come from Pusher's own `user_id`, so a
 * browser can't pretend to be someone else.
 */
export class PusherTransport implements Transport {
  readonly kind = 'pusher'
  readonly stats: PusherStats = { limited: 0, anonymous: 0 }
  private client: Pusher | null = null
  private channel: PresenceChannel | null = null
  /** pusher-js's own connection state. */
  private socket = 'initialized'
  /** True while the room channel is subscribed on the current socket. */
  private subscribed = false
  /** True once the room channel has subscribed, so any later gap is a reconnect. */
  private joined = false
  private state: ConnStatus = 'connecting'
  private readonly messages = new Listeners<[string, PayloadKind, unknown]>()
  private readonly memberEvents = new Listeners<[MemberEvent]>()
  private readonly statuses = new Listeners<[ConnStatus, string | undefined]>()

  constructor(
    private readonly code: string,
    readonly selfId: string,
    private readonly name: string,
    private readonly key: string,
    private readonly cluster: string
  ) {}

  open(): void {
    if (this.client) return
    const client = new Pusher(this.key, {
      cluster: this.cluster,
      forceTLS: true,
      channelAuthorization: {
        endpoint: '/api/pusher/auth',
        transport: 'ajax',
        params: { player_id: this.selfId, name: this.name }
      }
    })
    this.client = client
    client.connection.bind('state_change', (change: { current: string }) => {
      this.socket = change.current
      // pusher-js subscribes again after every reconnect; until then sends would be lost.
      if (change.current !== 'connected') this.subscribed = false
      this.follow()
    })
    client.connection.bind('error', (error: { data?: { code?: number } }) => {
      const code = error?.data?.code
      if (code === 4301) this.stats.limited++
      // 4004: the account is over its connection quota for now.
      else if (code === 4004) this.fail('quota')
    })
    const channel = client.subscribe(roomChannel(this.code)) as PresenceChannel
    this.channel = channel
    channel.bind('pusher:subscription_succeeded', () => {
      this.subscribed = true
      this.joined = true
      this.follow()
      const members: MemberInfo[] = []
      channel.members.each(
        (member: { id: string; info?: { name?: string } }) => {
          members.push({ id: member.id, name: String(member.info?.name ?? '') })
        }
      )
      this.memberEvents.emit({ type: 'snapshot', members })
    })
    channel.bind('pusher:subscription_error', (error: { status?: number }) => {
      this.fail(
        error?.status === 403 || error?.status === 400 ? 'refused' : 'auth'
      )
    })
    channel.bind(
      'pusher:member_added',
      (member: { id: string; info?: { name?: string } }) => {
        this.memberEvents.emit({
          type: 'added',
          member: { id: member.id, name: String(member.info?.name ?? '') }
        })
      }
    )
    channel.bind('pusher:member_removed', (member: { id: string }) => {
      this.memberEvents.emit({ type: 'removed', id: member.id })
    })
    for (const kind of ['b', 'p'] as const) {
      channel.bind(
        `client-${kind}`,
        (payload: unknown, metadata?: { user_id?: string }) => {
          const from = metadata?.user_id
          if (!from) {
            this.stats.anonymous++
            return
          }
          this.messages.emit(from, kind, payload)
        }
      )
    }
  }

  close(): void {
    const client = this.client
    if (!client) return
    this.client = null
    this.channel = null
    this.subscribed = false
    this.joined = false
    // Closing the socket also ends the presence membership. An unsubscribe first would go
    // out a tick later, after the socket closed.
    client.disconnect()
    // Closing is our own choice, so nobody needs to hear about it.
    this.state = 'failed'
  }

  status(): ConnStatus {
    return this.state
  }

  send(kind: PayloadKind, payload: object): SendResult {
    if (!this.channel || this.state !== 'connected') return 'offline'
    return this.channel.trigger(`client-${kind}`, payload) ? 'sent' : 'offline'
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

  private fail(reason: string): void {
    this.state = 'failed'
    this.statuses.emit('failed', reason)
  }

  /** Works out the room's status from the socket and the channel, and reports a change. */
  private follow(): void {
    const status = roomStatus(this.socket, this.subscribed, this.joined)
    if (this.state === status || this.state === 'failed') return
    this.state = status
    this.statuses.emit(status, undefined)
  }
}

/**
 * The room's connection status from pusher-js's connection state, whether the room channel
 * is subscribed on the current socket, and whether it ever was. The room counts as
 * connected only once its channel subscribes, since client events sent before that are
 * lost. pusher-js reports `connecting` while it retries a dropped socket, so once the room
 * has joined, every gap counts as reconnecting.
 */
export function roomStatus(
  socket: string,
  subscribed: boolean,
  joined: boolean
): ConnStatus {
  if (socket === 'failed') return 'failed'
  if (socket === 'connected' && subscribed) return 'connected'
  return joined ? 'reconnecting' : 'connecting'
}
