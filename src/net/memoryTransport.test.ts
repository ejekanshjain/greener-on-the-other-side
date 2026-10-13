import { describe, expect, it } from 'vitest'

import { createMemoryPair } from './memoryTransport'
import type { MemberEvent } from './types'

const A = { id: 'aaaaaaaa', name: 'A' }
const B = { id: 'bbbbbbbb', name: 'B' }
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

describe('memory transport', () => {
  it('delivers to the other end only, as a copy', async () => {
    const [a, b] = createMemoryPair(A, B)
    const got: [string, string, unknown][] = []
    a.onMessage((from, _kind, payload) => got.push(['a', from, payload]))
    b.onMessage((from, _kind, payload) => got.push(['b', from, payload]))
    a.open()
    b.open()
    await tick()
    const payload = { k: 'hello', name: 'A' }
    expect(a.send('b', payload)).toBe('sent')
    await tick()
    expect(got).toEqual([['b', 'aaaaaaaa', payload]])
    expect(got[0]?.[2]).not.toBe(payload)
  })

  it('lists members like presence: a later joiner is added, a closer removed', async () => {
    const [a, b] = createMemoryPair(A, B)
    const seen: MemberEvent[] = []
    a.onMembers(event => seen.push(event))
    a.open()
    await tick()
    b.open()
    await tick()
    b.close()
    expect(seen).toEqual([
      { type: 'snapshot', members: [A] },
      { type: 'added', member: B },
      { type: 'removed', id: 'bbbbbbbb' }
    ])
    expect(b.send('b', {})).toBe('offline')
  })
})
