import { createPortal } from 'react-dom'

import { createStore, useStore } from '../store'
import { cn } from './cn'

/** Toast colour: neutral, success, failure, or coins. */
export type ToastKind = 'info' | 'good' | 'bad' | 'coin'

export interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

const MAX_TOASTS = 4
const toasts = createStore<{ items: readonly ToastItem[] }>({ items: [] })
let nextToastId = 1

/**
 * Shows a short message at the top of the screen. Needs one `<Toaster />` mounted
 * (`GameLayout` includes it).
 *
 * @example toast('The fridge is full', 'bad')
 */
export function toast(
  message: string,
  kind: ToastKind = 'info',
  durationMs = 2600
): void {
  const id = nextToastId++
  toasts.set(s => ({
    items: [...s.items, { id, message, kind }].slice(-MAX_TOASTS)
  }))
  setTimeout(
    () => toasts.set(s => ({ items: s.items.filter(item => item.id !== id) })),
    durationMs
  )
}

/** Background and text colour per kind, each pair at least 4.5:1 contrast. */
const KIND_CLASSES: Record<ToastKind, string> = {
  info: 'bg-paper text-ink',
  good: 'bg-marker-green text-white',
  bad: 'bg-marker-red text-white',
  coin: 'bg-marker-yellow text-ink'
}

/**
 * Renders queued toasts into `<body>`, above dialogs, and stays announced while a dialog
 * is open. `GameLayout` already mounts one.
 */
export function Toaster() {
  const items = useStore(toasts, s => s.items)
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      // Open dialogs make the rest of the page inert, but skip elements marked live.
      data-dialog-live=""
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[60] flex flex-col items-center gap-2 px-3"
    >
      {items.map((item, i) => (
        <p
          key={item.id}
          className={cn(
            'max-w-sm animate-pop-in rounded-sketch border-[3px] border-ink px-4 py-2 text-center font-hand text-xl shadow-[3px_4px_0_rgb(34_34_34/0.3)]',
            i % 2 === 0 ? 'rotate-1' : '-rotate-1',
            KIND_CLASSES[item.kind]
          )}
        >
          {item.message}
        </p>
      ))}
    </div>,
    document.body
  )
}
