'use client'

import dynamic from 'next/dynamic'

import { COPY } from './copy'

// The game touches window, canvas and the network, so it never renders on the server.
const RoomScreen = dynamic(() => import('./RoomScreen'), {
  ssr: false,
  loading: () => (
    <main className="grid h-dvh place-items-center bg-paper font-hand text-2xl text-ink">
      <p>{COPY.connecting}</p>
    </main>
  )
})

/** Loads the browser-only room screen for a valid room code. */
export function RoomClient({ code }: { code: string }) {
  return <RoomScreen code={code} />
}
