import { describe, expect, it, vi } from 'vitest'

import { createStore, shallowEqual } from './store'

describe('createStore', () => {
  it('merges patches and updaters and notifies listeners', () => {
    const store = createStore({ coins: 1, name: 'jelly' })
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.set({ coins: 2 })
    store.set(s => ({ coins: s.coins + 3 }))
    expect(store.get()).toEqual({ coins: 5, name: 'jelly' })
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    store.set({ coins: 9 })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('keeps the same state reference when nothing changes', () => {
    const store = createStore({ coins: 1 })
    const listener = vi.fn()
    store.subscribe(listener)
    const before = store.get()
    store.set({ coins: 1 })
    expect(store.get()).toBe(before)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('shallowEqual', () => {
  it('compares top-level values only', () => {
    const shared = { a: 1 }
    expect(shallowEqual({ x: 1, y: shared }, { x: 1, y: shared })).toBe(true)
    expect(shallowEqual({ x: 1, y: { a: 1 } }, { x: 1, y: { a: 1 } })).toBe(
      false
    )
    expect(shallowEqual([1, 2], [1, 2])).toBe(true)
    expect(shallowEqual([1, 2], { 0: 1, 1: 2 })).toBe(false)
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })
})
