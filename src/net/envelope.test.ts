import { describe, expect, it } from 'vitest'

import {
  compareSessions,
  decodeBundle,
  StaleFilter,
  type Bundle
} from './envelope'
import type { Msg, ThrowItemMsg } from './protocol'

const item = (id: string): ThrowItemMsg => ({
  id,
  ty: 0,
  x: 120,
  c: 1000,
  d: 200,
  dx: 10,
  tau: 400,
  T: 1100,
  H: 300,
  sp: 0,
  f: 0,
  w: 15000
})

function bundle(over: Partial<Bundle> & { x: Msg[] }): Bundle {
  return { v: 1, s: 'mgn3x7q2-k4z1', m: '', r: -1, q: 0, t: 1000, ...over }
}

const ctx = { matchId: '', round: -1, now: 1500 }
const sync = (ready: boolean): Msg => ({
  k: 'sync',
  name: 'B',
  seats: [],
  ready,
  rematch: false,
  phase: 'lobby'
})

describe('session ids', () => {
  it('order by time, so a reload is newer', () => {
    expect(compareSessions('mgn3x7q2-zzzz', 'mgn3x7q3-aaaa')).toBeLessThan(0)
    expect(compareSessions('mgn3x7q3-aaaa', 'mgn3x7q2-zzzz')).toBeGreaterThan(0)
  })
})

describe('decodeBundle', () => {
  it('refuses a bad header and drops bad messages inside a good one', () => {
    expect(decodeBundle({ v: 2 })).toBeNull()
    const b = decodeBundle({
      ...bundle({ x: [] }),
      x: [{ k: 'hello', name: 'A' }, { k: 'nope' }]
    })
    expect(b?.x).toEqual([{ k: 'hello', name: 'A' }])
  })
})

describe('StaleFilter', () => {
  it('drops bundles from an older session once a newer one is seen', () => {
    const f = new StaleFilter()
    const hello: Msg = { k: 'hello', name: 'B' }
    expect(
      f.accept('b', bundle({ s: 'mgn3x7q3-aaaa', x: [hello] }), ctx)
    ).toHaveLength(1)
    expect(
      f.accept('b', bundle({ s: 'mgn3x7q2-aaaa', x: [hello] }), ctx)
    ).toHaveLength(0)
    expect(f.drops.session).toBe(1)
  })

  it('keeps only the newest sync by sequence, even when shuffled', () => {
    const f = new StaleFilter()
    const order = [3, 1, 4, 2, 5]
    const applied = order.filter(
      q => f.accept('b', bundle({ q, x: [sync(q % 2 === 0)] }), ctx).length > 0
    )
    expect(applied).toEqual([3, 4, 5])
  })

  it('drops round kinds from another match or round', () => {
    const f = new StaleFilter()
    const t: Msg = { k: 'throw', items: [item('s.1')], clips: [] }
    expect(
      f.accept('b', bundle({ m: 'aaaaaa', r: 0, x: [t] }), {
        ...ctx,
        matchId: 'bbbbbb',
        round: 0
      })
    ).toHaveLength(0)
    expect(
      f.accept('b', bundle({ m: 'bbbbbb', r: 1, x: [t] }), {
        ...ctx,
        matchId: 'bbbbbb',
        round: 0
      })
    ).toHaveLength(0)
    expect(f.drops.match + f.drops.round).toBe(2)
  })

  it('judges each message against the room the earlier ones left', () => {
    const f = new StaleFilter()
    let matchId = ''
    const final: Msg = { k: 'final', g: 'AQAB' }
    const applied: string[] = []
    f.each(
      'b',
      bundle({ m: 'aaaaaa', x: [final, sync(false), final] }),
      () => ({ ...ctx, matchId }),
      msg => {
        applied.push(msg.k)
        // The sync puts this page back in the sender's match.
        if (msg.k === 'sync') matchId = 'aaaaaa'
      }
    )
    expect(applied).toEqual(['sync', 'final'])
    expect(f.drops.match).toBe(1)
  })

  it('drops repeated throw ids and throws sent over 6s ago', () => {
    const f = new StaleFilter()
    const t = (ids: string[]): Msg => ({
      k: 'throw',
      items: ids.map(item),
      clips: []
    })
    const first = f.accept('b', bundle({ q: 1, x: [t(['s.1', 's.2'])] }), ctx)
    expect(first).toHaveLength(1)
    const again = f.accept('b', bundle({ q: 2, x: [t(['s.2', 's.3'])] }), ctx)
    expect(again[0]?.k === 'throw' && again[0].items.map(i => i.id)).toEqual([
      's.3'
    ])
    // Judged by the crossing time, so a throw that waited in the outbox counts that wait.
    expect(
      f.accept('b', bundle({ q: 3, t: 6500, x: [t(['s.4'])] }), {
        ...ctx,
        now: 7001
      })
    ).toHaveLength(0)
    expect(f.drops.late).toBe(1)
  })

  it('drops repeated and stale clip records the same way', () => {
    const f = new StaleFilter()
    const clip = (id: string, c: number): Msg => ({
      k: 'throw',
      items: [],
      clips: [{ id, ty: 4, x: 300, c }]
    })
    expect(
      f.accept('b', bundle({ q: 1, x: [clip('s.1', 1000)] }), ctx)
    ).toHaveLength(1)
    expect(
      f.accept('b', bundle({ q: 2, x: [clip('s.1', 1000)] }), ctx)
    ).toHaveLength(0)
    expect(
      f.accept('b', bundle({ q: 3, x: [clip('s.2', 1000)] }), {
        ...ctx,
        now: 7500
      })
    ).toHaveLength(0)
  })
})
