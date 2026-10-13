'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'

import { newRoomCode } from '../net/roomCode'
import { COPY } from './copy'

// The game touches window, canvas and the network, so it never renders on the server.
const RoomScreen = dynamic(() => import('./RoomScreen'), {
  ssr: false,
  loading: () => (
    <main className="grid h-dvh place-items-center bg-paper font-hand text-2xl text-ink">
      <p>{COPY.practiceLoading}</p>
    </main>
  )
})

/** Practice Alone: a room of your own against Mr Pemberton, with no connection at all. */
export function PracticeClient() {
  // A fresh room code per visit keeps each practice match to itself.
  const [code] = useState(newRoomCode)
  return <RoomScreen code={code} practice />
}
