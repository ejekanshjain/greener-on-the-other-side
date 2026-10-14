import { afterEach, describe, expect, it, vi } from 'vitest'

import { hasFinishedMatch, isNewPlayer, saveFinishedMatch } from './identity'

/** A bare `localStorage` for the node test environment. */
function stubStorage(): Map<string, string> {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value)
  })
  return data
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the finished-match fact', () => {
  it('makes an empty browser new until it saves the fact, as one yes/no key', () => {
    const data = stubStorage()
    expect(hasFinishedMatch()).toBe(false)
    expect(isNewPlayer(null)).toBe(true)
    saveFinishedMatch()
    expect(isNewPlayer(null)).toBe(false)
    expect([...data]).toEqual([['greener-finished', '1']])
  })

  it('lets the dev override win both ways', () => {
    stubStorage()
    expect(isNewPlayer(false)).toBe(false)
    saveFinishedMatch()
    expect(isNewPlayer(true)).toBe(true)
  })

  it('treats a browser that refuses storage as new', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      }
    })
    saveFinishedMatch()
    expect(isNewPlayer(null)).toBe(true)
  })
})
