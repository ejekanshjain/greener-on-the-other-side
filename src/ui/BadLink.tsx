import Link from 'next/link'

import { COPY } from './copy'

/** The screen for a room link whose code can't be a room. */
export function BadLink() {
  return (
    <main className="grid h-dvh place-items-center bg-paper p-6 font-hand text-ink">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <h1 className="font-marker text-3xl">{COPY.badLink}</h1>
        <Link
          href="/"
          className="inline-flex min-h-12 items-center rounded-sketch border-[3px] border-ink bg-marker-yellow px-5 font-marker text-lg shadow-[3px_4px_0_var(--color-ink)]"
        >
          Start a Room
        </Link>
      </div>
    </main>
  )
}
