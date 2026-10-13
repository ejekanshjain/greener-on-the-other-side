import { redirect } from 'next/navigation'

import { isRoomCode } from '@/net/roomCode'
import { BadLink } from '@/ui/BadLink'
import { RoomClient } from '@/ui/RoomClient'

/** A room page. Codes with capitals switch to lowercase; anything else invalid shows the bad-link screen. */
export default async function RoomPage({
  params,
  searchParams
}: {
  params: Promise<{ code: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { code } = await params
  const lower = code.toLowerCase()
  if (lower !== code && isRoomCode(lower)) {
    // Keep the query as typed, so flags like `?local` stay bare.
    const parts: string[] = []
    for (const [key, value] of Object.entries(await searchParams))
      for (const v of Array.isArray(value) ? value : [value ?? ''])
        parts.push(
          v === ''
            ? encodeURIComponent(key)
            : `${encodeURIComponent(key)}=${encodeURIComponent(v)}`
        )
    const search = parts.join('&')
    redirect(`/r/${lower}${search ? `?${search}` : ''}`)
  }
  if (!isRoomCode(code)) return <BadLink />
  return <RoomClient code={code} />
}
