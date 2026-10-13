import { useEffect, useState } from 'react'

/** Dev-only switches read from the URL. Every flag is false in production builds. */
export interface DevFlags {
  /** True in dev builds. */
  enabled: boolean
  /** `?fast`: shrinks real-time waits to 3 seconds. */
  fast: boolean
  /** `?debug`: draws physics bodies and extra overlays. */
  debug: boolean
}

/** A button in the dev panel. */
export interface DevAction {
  label: string
  run: () => void
}

declare global {
  interface Window {
    /** Dev-only scripting API, filled by `exposeDev`. */
    __game?: Record<string, unknown>
  }
}

/** Parses `?fast` and `?debug` from a query string. Exported for tests; use `devFlags` in game code. */
export function parseDevFlags(search: string): DevFlags {
  const params = new URLSearchParams(search)
  return { enabled: true, fast: params.has('fast'), debug: params.has('debug') }
}

/** The dev flags for this page load. Read once at startup. */
export const devFlags: DevFlags =
  process.env.NODE_ENV !== 'production'
    ? parseDevFlags(typeof location === 'undefined' ? '' : location.search)
    : { enabled: false, fast: false, debug: false }

/**
 * Publishes a scripting API at `window.__game[name]` in dev builds so browser automation
 * can inspect and drive the game. Does nothing in production. Returns a function that
 * removes it again.
 *
 * @example exposeDev('jelly', { state, addCoins: (n: number) => wallet.earn(n, 'dev') })
 */
export function exposeDev(name: string, api: unknown): () => void {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined')
    return noop
  const game = (window.__game ??= {})
  game[name] = api
  return () => {
    if (game[name] === api) delete game[name]
  }
}

function noop(): void {}

function toggleQueryFlag(flag: 'fast' | 'debug'): void {
  const url = new URL(location.href)
  if (url.searchParams.has(flag)) url.searchParams.delete(flag)
  else url.searchParams.set(flag, '')
  location.href = url.toString()
}

function DevPanelImpl({ actions = [] }: { actions?: readonly DevAction[] }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Backquote' && !event.repeat) setOpen(value => !value)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!open) return null
  return (
    <div
      role="region"
      aria-label="Dev panel"
      className="pointer-events-auto fixed top-2 left-2 z-[100] flex max-h-[80vh] w-56 flex-col gap-1 overflow-y-auto rounded-md border-2 border-ink bg-white/95 p-2 font-mono text-xs text-ink shadow-lg"
    >
      <p className="font-bold">Dev panel (` to close)</p>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={devFlags.fast}
          onChange={() => toggleQueryFlag('fast')}
        />
        ?fast (3s waits, reloads)
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={devFlags.debug}
          onChange={() => toggleQueryFlag('debug')}
        />
        ?debug (reloads)
      </label>
      {actions.map(action => (
        <button
          key={action.label}
          type="button"
          onClick={action.run}
          className="rounded border border-ink px-2 py-1 text-left hover:bg-yellow-100"
        >
          {action.label}
        </button>
      ))}
    </div>
  )
}

function DevPanelProd(_props: { actions?: readonly DevAction[] }) {
  return null
}

/**
 * Cheat panel toggled with the backquote key. Renders nothing in production, and the
 * implementation is dropped from production bundles.
 *
 * @example <DevPanel actions={[{ label: 'Add 100 coins', run: () => wallet.earn(100, 'dev') }]} />
 */
export const DevPanel =
  process.env.NODE_ENV !== 'production' ? DevPanelImpl : DevPanelProd
