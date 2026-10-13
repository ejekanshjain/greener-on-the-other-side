import '@fontsource/patrick-hand'
import '@fontsource/permanent-marker'
import './globals.css'

import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Greener on the Other Side',
  description:
    'Grow a better lawn than your neighbour in 3 minutes. Throw every weed, snail and gnome over the fence.'
}

// Pinch zoom stays on for menus and the lobby; the game canvas blocks it with touch-action.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#fdf6e3'
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
