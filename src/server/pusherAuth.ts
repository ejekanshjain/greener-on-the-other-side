import Pusher from 'pusher'

import { isValidName, normaliseName } from '../net/names'

/** Room channels look like presence-lawn-abc123: a 6-character room code. */
export const ROOM_CHANNEL = /^presence-lawn-[a-z0-9]{6}$/
const SOCKET_ID = /^\d+\.\d+$/
const PLAYER_ID = /^[a-z0-9]{8,24}$/

let client: Pusher | null = null

/** The server-side Pusher client, or null when PUSHER_SECRET is missing. */
export function pusherServer(): Pusher | null {
  const secret = process.env.PUSHER_SECRET
  if (!secret) return null
  client ??= new Pusher({
    appId: process.env.PUSHER_APP_ID ?? '',
    key: process.env.NEXT_PUBLIC_PUSHER_KEY ?? '',
    secret,
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? 'ap2',
    useTLS: true
  })
  return client
}

export type AuthResult =
  { ok: true; body: unknown } | { ok: false; status: number; error: string }

/**
 * Signs one player's join to a room's presence channel. The browser sends its socket id,
 * the channel, and the player id and name it picked; anything off-pattern is refused.
 */
export function authorizeRoom(form: {
  socketId: string
  channel: string
  playerId: string
  name: string
}): AuthResult {
  const pusher = pusherServer()
  if (!pusher)
    return {
      ok: false,
      status: 503,
      error:
        'PUSHER_SECRET is missing, so online rooms are off. Add it to .env.local.'
    }
  if (!SOCKET_ID.test(form.socketId) || !ROOM_CHANNEL.test(form.channel))
    return {
      ok: false,
      status: 403,
      error: 'That room channel is not allowed.'
    }
  // The same name rule as the name box, so a name that passes there passes here.
  const name = normaliseName(form.name.slice(0, 256))
  if (!PLAYER_ID.test(form.playerId) || !isValidName(name))
    return { ok: false, status: 400, error: 'Player id or name is invalid.' }
  const body = pusher.authorizeChannel(form.socketId, form.channel, {
    user_id: form.playerId,
    user_info: { name }
  })
  return { ok: true, body }
}
