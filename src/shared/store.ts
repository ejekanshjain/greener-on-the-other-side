import { useRef, useSyncExternalStore } from 'react'

/** A partial patch, or a function that builds one from the current state. */
export type StoreUpdate<T> = Partial<T> | ((state: T) => Partial<T>)

/** A tiny observable state container. State is replaced, never mutated, on each change. */
export interface Store<T extends object> {
  /** Returns the current state. The reference only changes when a value changes. */
  get(): T
  /** Shallow-merges a patch. Listeners run only when at least one value changes. */
  set(update: StoreUpdate<T>): void
  /** Calls `listener` after every change. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void
}

/**
 * Creates a store holding `initial`. Read it from React with `useStore`.
 *
 * @example
 * const hud = createStore({ coins: 0, scene: 'kitchen' })
 * hud.set(s => ({ coins: s.coins + 5 }))
 */
export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(update) {
      const patch = typeof update === 'function' ? update(state) : update
      let changed = false
      for (const key in patch) {
        if (!Object.is(patch[key], state[key])) {
          changed = true
          break
        }
      }
      if (!changed) return
      state = { ...state, ...patch }
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}

/** True when two values are equal, or are objects/arrays whose own top-level values are all `Object.is` equal. */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    a === null ||
    b === null
  )
    return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const aRecord = a as Record<string, unknown>
  const bRecord = b as Record<string, unknown>
  const keys = Object.keys(aRecord)
  if (keys.length !== Object.keys(bRecord).length) return false
  for (const key of keys) {
    if (!Object.hasOwn(bRecord, key) || !Object.is(aRecord[key], bRecord[key]))
      return false
  }
  return true
}

/**
 * Subscribes a component to a store and re-renders when the selected value changes.
 * Selectors should return primitives or references already held in state. If a selector
 * builds a new object or array, pass `shallowEqual` as `isEqual` so it doesn't re-render forever.
 *
 * @example
 * const coins = useStore(wallet.store, s => s.coins)
 * const pos = useStore(hud, s => ({ x: s.x, y: s.y }), shallowEqual)
 */
export function useStore<T extends object, S = T>(
  store: Store<T>,
  selector: (state: T) => S = identity as (state: T) => S,
  isEqual: (a: S, b: S) => boolean = Object.is
): S {
  const cache = useRef<{
    state: T
    selector: (state: T) => S
    value: S
  } | null>(null)
  const getSnapshot = (): S => {
    const state = store.get()
    const last = cache.current
    if (last && last.state === state && last.selector === selector)
      return last.value
    const value = selector(state)
    // Keep the old reference when equal so useSyncExternalStore sees a stable snapshot.
    if (last && isEqual(last.value, value)) {
      cache.current = { state, selector, value: last.value }
      return last.value
    }
    cache.current = { state, selector, value }
    return value
  }
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}

function identity<T>(value: T): T {
  return value
}
