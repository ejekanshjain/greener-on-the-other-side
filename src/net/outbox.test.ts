import { describe, expect, it } from 'vitest'

import type { Bundle } from './envelope'
import { Limiter } from './limiter'
import { Outbox, SPLIT_BYTES } from './outbox'
import type { Msg, ThrowItemMsg } from './protocol'

function setup(connected = () => true) {
  const sent: Bundle[] = []
  const limiter = new Limiter()
  const outbox = new Outbox({
    send: bundle => {
      sent.push(bundle)
      return 'sent'
    },
    connected,
    header: () => ({ s: 'mgn3x7q2-k4z1', m: '', r: -1 }),
    limiter
  })
  return { sent, outbox, limiter }
}

const throwMsg = (id: string): Msg => ({
  k: 'throw',
  items: [
    {
      id,
      ty: 0,
      x: 1,
      c: 0,
      d: 1,
      dx: 0,
      tau: 1,
      T: 1,
      H: 1,
      sp: 0,
      f: 0,
      w: -1
    } satisfies ThrowItemMsg
  ],
  clips: []
})
const sync = (ready: boolean): Msg => ({
  k: 'sync',
  name: 'A',
  seats: [],
  ready,
  rematch: false,
  phase: 'lobby'
})

describe('Outbox', () => {
  it('never sends more than 6 bundles a second under a burst', () => {
    const { sent, outbox } = setup()
    for (let t = 0; t < 1000; t += 10) {
      outbox.push(throwMsg(`s.${t}`), t)
      outbox.pump(t)
    }
    expect(sent.filter(b => b.t < 1000).length).toBeLessThanOrEqual(6)
    // Throws never coalesce away: every one goes out eventually.
    for (let t = 1000; t < 3000; t += 50) outbox.pump(t)
    expect(sent.flatMap(b => b.x).length).toBe(100)
    // The peak counts bundles in any rolling second, not per calendar second.
    expect(outbox.stats.peakPerSecond).toBe(6)
  })

  it('replaces a pending sync with the newer one, after what queued since', () => {
    const { sent, outbox } = setup()
    outbox.push(sync(false), 0)
    outbox.push({ k: 'hello', name: 'A' }, 1)
    outbox.push(sync(true), 1)
    outbox.pump(200)
    expect(sent[0]?.x).toEqual([{ k: 'hello', name: 'A' }, sync(true)])
  })

  it('splits bundles over 3.5 KB, each with its own sequence number', () => {
    const { sent, outbox } = setup()
    for (let i = 0; i < 60; i++) outbox.push(throwMsg(`s.${i}`), 0)
    outbox.pump(200)
    expect(sent.length).toBeGreaterThan(1)
    for (const b of sent)
      expect(JSON.stringify(b).length).toBeLessThanOrEqual(SPLIT_BYTES)
    expect(new Set(sent.map(b => b.q)).size).toBe(sent.length)
  })

  it('holds messages while offline and drops throws older than 6s', () => {
    let online = false
    const { sent, outbox } = setup(() => online)
    outbox.push(throwMsg('s.old'), 0)
    outbox.push(sync(true), 0)
    outbox.pump(3000)
    expect(sent).toHaveLength(0)
    outbox.push(throwMsg('s.new'), 5000)
    online = true
    outbox.pump(7000)
    const kinds = sent
      .flatMap(b => b.x)
      .map(m => (m.k === 'throw' ? m.items[0]?.id : m.k))
    expect(kinds).toEqual(['sync', 's.new'])
    expect(outbox.stats.expired).toBe(1)
  })
})

describe('Limiter', () => {
  it('allows 9 sends in any 1,000 ms', () => {
    const limiter = new Limiter()
    const allowed = Array.from({ length: 12 }, (_, i) =>
      limiter.tryTake(i * 10)
    ).filter(Boolean)
    expect(allowed).toHaveLength(9)
    expect(limiter.tryTake(999)).toBe(false)
    expect(limiter.tryTake(1001)).toBe(true)
  })
})
