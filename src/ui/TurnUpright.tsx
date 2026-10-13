'use client'

import { useSyncExternalStore } from 'react'

import { COPY } from './copy'

/** Phones held sideways: landscape, short and touch-driven, so short desktop windows never match. */
const SIDEWAYS =
  '(orientation: landscape) and (max-height: 500px) and (pointer: coarse)'

function subscribe(onChange: () => void): () => void {
  const list = matchMedia(SIDEWAYS)
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

/**
 * Covers the room while a phone is held sideways, which the portrait garden can't fit. It
 * takes every press, so a turned phone never mows by accident. With `playing`, it warns
 * that the round keeps going underneath.
 */
export function TurnUpright({ playing }: { playing: boolean }) {
  const sideways = useSyncExternalStore(
    subscribe,
    () => matchMedia(SIDEWAYS).matches,
    () => false
  )
  if (!sideways) return null
  return (
    <div
      role="alert"
      data-testid="turn-upright"
      className="pointer-events-auto fixed inset-0 z-[70] flex flex-col items-center justify-center gap-3 bg-paper p-6 text-center text-ink"
    >
      <svg viewBox="0 0 48 48" aria-hidden className="size-20">
        <g fill="none" stroke="currentColor" strokeWidth="3">
          <rect x="15" y="6" width="18" height="34" rx="4" />
          <path strokeLinecap="round" d="M22 35h4" />
          <path
            strokeLinecap="round"
            d="M38 14c4 4 5 10 2 15M40 29l0.5-5M40 29l-4.5-2"
          />
        </g>
      </svg>
      <p className="font-marker text-3xl">{COPY.upright}</p>
      {playing && <p className="font-hand text-xl">{COPY.keepsGoing}</p>}
    </div>
  )
}
