import { authorizeRoom } from '@/server/pusherAuth'

/** pusher-js posts the socket id and channel here as a form when a player joins a room. */
export async function POST(req: Request) {
  // A JSON or empty body can't be read as a form, so it gets a refusal, not a crash.
  const form = await req.formData().catch(() => null)
  if (!form)
    return Response.json(
      { error: 'The join request is not a form post, so nothing was signed.' },
      { status: 400 }
    )
  const result = authorizeRoom({
    socketId: String(form.get('socket_id') ?? ''),
    channel: String(form.get('channel_name') ?? ''),
    playerId: String(form.get('player_id') ?? ''),
    name: String(form.get('name') ?? '')
  })
  if (!result.ok)
    return Response.json({ error: result.error }, { status: result.status })
  return Response.json(result.body)
}
