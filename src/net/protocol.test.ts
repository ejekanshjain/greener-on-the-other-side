import { describe, expect, it } from 'vitest'

import { planThrow, crossingOf } from '../game/flight'
import { isMsg } from './protocol'
import { newSessionId } from './envelope'
import {
  decodeThrowItem,
  encodeClip,
  encodeCrossing,
  throwId
} from './throwCodec'

describe('protocol validators', () => {
  it('refuse bad shapes and unknown kinds', () => {
    expect(isMsg({ k: 'hello', name: 'Ekansh' })).toBe(true)
    expect(isMsg({ k: 'hello', name: 7 })).toBe(false)
    expect(
      isMsg({
        k: 'sync',
        name: 'A',
        seats: ['short'],
        ready: true,
        rematch: false,
        phase: 'lobby'
      })
    ).toBe(false)
    expect(
      isMsg({
        k: 'start',
        id: 'abcdef',
        seed: 1,
        at: 5,
        roundMs: 10,
        revealMs: 2000,
        lastRevealMs: 2000,
        countdownMs: 0
      })
    ).toBe(false)
    expect(
      isMsg({
        k: 'throw',
        items: Array.from({ length: 9 }, () => ({})),
        clips: []
      })
    ).toBe(false)
    expect(isMsg({ k: 'fist', x: 120 })).toBe(true)
    expect(isMsg({ k: 'fist', x: 'left' })).toBe(false)
    expect(isMsg({ k: 'fist', x: 1e9 })).toBe(false)
    expect(isMsg({ k: 'mystery' })).toBe(false)
    expect(isMsg(null)).toBe(false)
  })

  it("take a sync's match end and lawn copy, and keep the worst case under 1 KB", () => {
    const sync = {
      k: 'sync',
      name: 'N'.repeat(64),
      seats: ['a'.repeat(24), 'z'.repeat(24)],
      ready: false,
      rematch: true,
      phase: 'match',
      match: {
        id: 'abc123',
        seed: 0x7fffffff,
        at: 1_760_250_000_000,
        roundMs: 180_000,
        revealMs: 20_000,
        lastRevealMs: 30_000,
        countdownMs: 3000
      },
      tally: [1, 1],
      totals: [-120, 95],
      done: 2,
      over: { r: 'walkover', w: 'a'.repeat(24), m: 'abc123' },
      copy: 'A'.repeat(380),
      copyAt: 1_760_250_000_000
    }
    expect(isMsg(sync)).toBe(true)
    expect(JSON.stringify(sync).length).toBeLessThan(1024)
    expect(isMsg({ ...sync, over: { r: 'forfeit', w: '', m: 'abc123' } })).toBe(
      false
    )
    expect(isMsg({ ...sync, over: { r: 'noContest', w: '', m: 'x' } })).toBe(
      false
    )
    expect(isMsg({ ...sync, first: true })).toBe(true)
    expect(isMsg({ ...sync, first: 'yes' })).toBe(false)
    for (const yard of [1, 2, 3]) expect(isMsg({ ...sync, yard })).toBe(true)
    for (const yard of [0, 4, 1.5, '2', null])
      expect(isMsg({ ...sync, yard })).toBe(false)
    expect(isMsg({ ...sync, copy: 'A'.repeat(401) })).toBe(false)
    expect(isMsg({ ...sync, copyAt: -1 })).toBe(false)
  })

  it("take a guest sync's waiting round with its copy, under 1.5 KB at worst", () => {
    const sync = {
      k: 'sync',
      name: 'N'.repeat(64),
      seats: ['a'.repeat(24), 'z'.repeat(24)],
      ready: false,
      rematch: false,
      phase: 'match',
      copy: 'A'.repeat(380),
      copyAt: 1_760_250_000_000,
      wait: 1,
      waitCopy: 'B'.repeat(380),
      waitCopyAt: 1_760_250_000_000,
      need: 3
    }
    expect(isMsg(sync)).toBe(true)
    expect(JSON.stringify(sync).length).toBeLessThan(1536)
    expect(isMsg({ ...sync, wait: 3 })).toBe(false)
    expect(isMsg({ ...sync, need: 0 })).toBe(false)
    expect(isMsg({ ...sync, need: 8 })).toBe(false)
    expect(isMsg({ ...sync, waitCopy: 'B'.repeat(401) })).toBe(false)
  })
})

describe('throw codec', () => {
  it('round-trips a crossing within a unit and stays small', () => {
    const flight = planThrow(
      { lx: 210, ly: 300, speedPx: 1400, dirX: 0.2, dirY: -1 },
      0
    )
    const crossing = crossingOf(flight, 'gnome', 1.37, 12_345)
    const msg = encodeCrossing(crossing, 'mgn3x7q2-k4z1.12', 1_760_250_000_000)
    expect(isMsg({ k: 'throw', items: [msg], clips: [] })).toBe(true)
    expect(JSON.stringify(msg).length).toBeLessThan(160)
    const back = decodeThrowItem(msg)
    expect(back?.kind).toBe('gnome')
    expect(back?.x).toBeCloseTo(crossing.x, -0.5)
    expect(back?.tau).toBeCloseTo(crossing.tau, 2)
    expect(back?.spin).toBeCloseTo(1.37)
    expect(back?.wiltIn).toBe(12_345)
  })

  it('carries the bounce, coming-home and litter-look flags', () => {
    const flight = planThrow(
      { lx: 300, ly: 200, speedPx: 1400, dirX: 0, dirY: -1 },
      0
    )
    for (const flags of [
      { bounced: true, back: true, look: 3 },
      { bounced: true, back: false, look: 0 },
      { bounced: false, back: false, look: 2 }
    ]) {
      const crossing = crossingOf(flight, 'litter', 0, -1, flags)
      const msg = encodeCrossing(crossing, 'mgn3x7q2-k4z1.3', 1_000)
      expect(isMsg({ k: 'throw', items: [msg], clips: [] })).toBe(true)
      expect(decodeThrowItem(msg)).toMatchObject(flags)
    }
    const bin = encodeCrossing(crossingOf(flight, 'bin', 0, -1), 'a.1', 1_000)
    expect(bin.f & 1).toBe(1)
  })

  it('packs a clip record with its teeter time', () => {
    const msg = encodeClip(
      { kind: 'snailShell', x: 123.4, at: 900 },
      'mgn3x7q2-k4z1.3',
      1_760_250_000_900.6
    )
    expect(msg).toEqual({
      id: 'mgn3x7q2-k4z1.3',
      ty: 3,
      x: 123,
      c: 1_760_250_000_901
    })
    expect(isMsg({ k: 'throw', items: [], clips: [msg] })).toBe(true)
    expect(isMsg({ k: 'throw', items: [], clips: [{ ...msg, c: -1 }] })).toBe(
      false
    )
  })

  it('gives every throw an id that a reload never repeats', () => {
    const before = newSessionId(1_760_250_000_000)
    const after = newSessionId(1_760_250_004_000)
    const ids = [1, 2, 3].flatMap(n => [throwId(before, n), throwId(after, n)])
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids)
      expect(
        isMsg({ k: 'throw', items: [], clips: [{ id, ty: 0, x: 0, c: 0 }] })
      ).toBe(true)
  })
})
