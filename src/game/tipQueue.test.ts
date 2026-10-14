import { describe, expect, it } from 'vitest'

import { freshRound, liveStep, TipQueue, type TipRequest } from './tipQueue'
import { tipKind, type TipId } from './tips'

/** A queue driven by a fake clock in 100 ms frames, recording each showing's length. */
function harness() {
  const queue = new TipQueue()
  const shows: { id: TipId; at: number; ms: number }[] = []
  let now = 0
  let showing: { id: TipId; at: number } | null = null
  queue.onEnd = (tip, ms) => shows.push({ id: tip.id, at: now, ms })
  const run = (ms: number, pause = {}) => {
    for (let t = 0; t < ms; t += 100) {
      now += 100
      const tip = queue.step(now, pause)
      if (tip && tip.id !== showing?.id) showing = { id: tip.id, at: now }
      if (!tip) showing = null
    }
  }
  queue.step(0)
  return {
    queue,
    shows,
    run,
    raise: (id: TipId, extra: Partial<TipRequest> = {}) =>
      queue.raise({ id, text: id, ...extra }),
    started: (id: TipId) => (showing?.id === id ? showing.at : null),
    get now() {
      return now
    },
    current: () => queue.step(now)?.id ?? null
  }
}

describe('TipQueue', () => {
  // A 5th tip in the burst would wait 12.8s and leave unseen: see the next test.
  it('shows 4 tips raised within 1s in order, each for at least 3s', () => {
    const h = harness()
    const ids = ['start', 'weed', 'snail', 'back'] as const
    for (const id of ids) {
      h.raise(id)
      h.run(200)
    }
    h.run(25_000)
    expect(h.shows.map(s => s.id)).toEqual([...ids])
    for (const s of h.shows) expect(s.ms).toBeGreaterThanOrEqual(3000)
    expect(h.shows.at(-1)?.ms).toBe(6000)
  })

  it('lets a staged tip go after 10s of waiting, and shows it on its next trigger', () => {
    const h = harness()
    for (const id of ['start', 'weed', 'snail', 'back', 'water'] as const)
      h.raise(id)
    h.run(30_000)
    expect(h.shows.map(s => s.id)).not.toContain('water')
    expect(h.queue.hasSeen('water')).toBe(false)
    h.raise('water')
    h.run(500)
    expect(h.current()).toBe('water')
  })

  it('lets an urgent tip cut in on one shown for 1s, which shows next', () => {
    const h = harness()
    h.raise('weed')
    h.run(1000)
    h.raise('biscuit', { urgent: true })
    h.run(100)
    expect(h.current()).toBe('biscuit')
    h.run(12_000)
    expect(h.shows.map(s => s.id)).toEqual(['weed', 'biscuit', 'weed'])
    expect(h.shows[2]?.ms).toBeGreaterThanOrEqual(3000)
    expect(h.queue.hasSeen('weed')).toBe(true)
  })

  it('keeps a staged tip waiting through urgent tips that cut in', () => {
    const h = harness()
    h.raise('water')
    h.run(1000)
    h.raise('bag')
    h.run(1000)
    // Biscuit barks, then fetches: 6s of urgent tips while the bag tip waits, which
    // would push its wait past 10s if urgent tips counted.
    h.raise('bark', { urgent: true, moment: 'bark' })
    h.run(3000)
    h.queue.end('bark')
    h.raise('fetch', { urgent: true })
    h.run(20_000)
    expect(h.shows.map(s => s.id)).toEqual([
      'water',
      'bark',
      'fetch',
      'water',
      'bag'
    ])
  })

  it('shows the wind tip within its 2s warning, cutting in on a staged tip', () => {
    const h = harness()
    h.raise('weed')
    h.run(1300)
    h.raise('wind', { ...tipKind('wind'), moment: 'gust' })
    h.run(200)
    expect(h.current()).toBe('wind')
    // The weed tip comes back once the wind tip has had its 3s.
    h.run(3500)
    expect(h.current()).toBe('weed')
  })

  it('lets an urgent tip cut in on an urgent one whose moment has passed', () => {
    const h = harness()
    h.raise('patio', { urgent: true, moment: 'item:7' })
    h.run(1000)
    h.raise('lift', { urgent: true, moment: 'item:7b' })
    h.run(500)
    expect(h.current()).toBe('patio')
    h.queue.end('item:7')
    h.run(100)
    expect(h.current()).toBe('lift')
    h.run(10_000)
    expect(h.shows.map(s => s.id)).toEqual(['patio', 'lift'])
  })

  it('counts the wind tip seen once its 2s warning ends on show, though bark cuts in', () => {
    const h = harness()
    h.raise('wind', { ...tipKind('wind'), moment: 'gust' })
    h.run(1000)
    h.raise('bark', { ...tipKind('bark'), moment: 'bark:3' })
    h.run(1000)
    expect(h.current()).toBe('wind')
    h.queue.end('gust')
    h.run(100)
    expect(h.current()).toBe('bark')
    expect(h.shows[0]).toMatchObject({ id: 'wind', ms: 2000 })
    expect(h.queue.hasSeen('wind')).toBe(true)
  })

  it('counts nothing seen for a moment it missed the start of, or that ended out of sight', () => {
    const h = harness()
    h.raise('tap', { ...tipKind('tap'), moment: 'tap' })
    h.run(500)
    h.raise('sparkle', { ...tipKind('sparkle'), moment: 'pour' })
    h.run(500)
    // The tap goes off: the sparkle tip cuts in, but it waited for 0.5s of its pour.
    h.queue.end('tap', false)
    h.run(100)
    expect(h.current()).toBe('sparkle')
    expect(h.queue.hasSeen('tap')).toBe(false)
    h.queue.end('pour')
    h.run(100)
    expect(h.queue.hasSeen('sparkle')).toBe(false)
  })

  it('never shows an urgent tip whose moment ended in catch-up while it waited', () => {
    const h = harness()
    h.raise('tap', { ...tipKind('tap'), moment: 'tap' })
    h.run(1000)
    h.raise('biscuit', { ...tipKind('biscuit'), moment: 'circle:40' })
    h.run(200)
    // Hidden for 6s: tip time stands still, and Biscuit digs during catch-up.
    h.run(3000, { all: true })
    h.queue.end('circle:40', false)
    h.run(3000, { all: true })
    h.run(10_000)
    expect(h.shows.map(s => s.id)).toEqual(['tap'])
    expect(h.queue.hasSeen('biscuit')).toBe(false)
  })

  it('drops a dig tip whose circle ended while it waited, then shows it next circle', () => {
    const h = harness()
    h.raise('weed')
    h.run(100)
    h.raise('snail')
    h.run(100)
    h.raise('biscuit', { moment: 'circle' })
    h.run(1000)
    h.queue.end('circle')
    h.run(15_000)
    expect(h.shows.map(s => s.id)).toEqual(['weed', 'snail'])
    h.raise('biscuit', { urgent: true, moment: 'circle' })
    h.run(100)
    expect(h.current()).toBe('biscuit')
  })

  it('shows staged tips within 7s through a burst of failures, holding one failure', () => {
    const h = harness()
    h.raise('slow', { failure: true })
    h.run(400)
    h.raise('weed')
    const weedAt = h.now
    h.run(400)
    h.raise('clip', { failure: true })
    h.run(400)
    h.raise('snail')
    const snailAt = h.now
    h.run(400)
    h.raise('hand', { failure: true })
    let weedShown = -1
    let snailShown = -1
    for (let t = 0; t < 12_000; t += 100) {
      h.run(100)
      if (h.current() === 'weed' && weedShown < 0) weedShown = h.now
      if (h.current() === 'snail' && snailShown < 0) snailShown = h.now
    }
    expect(weedShown - weedAt).toBeLessThanOrEqual(7000)
    expect(snailShown - snailAt).toBeLessThanOrEqual(7000)
    // 'clip' was replaced by 'hand', which waited over 2s and left.
    expect(h.shows.map(s => s.id)).toEqual(['slow', 'weed', 'snail'])
  })

  it('holds tip time still while paused', () => {
    const h = harness()
    h.raise('weed')
    h.run(1000)
    h.run(10_000, { all: true })
    expect(h.current()).toBe('weed')
    h.run(1900)
    expect(h.queue.hasSeen('weed')).toBe(false)
    h.run(200)
    expect(h.queue.hasSeen('weed')).toBe(true)
  })

  it('holds a patio tip under a toast, but not a fence tip', () => {
    const h = harness()
    h.raise('back', { spot: 'patio' })
    h.run(2000, { patio: true })
    expect(h.queue.hasSeen('back')).toBe(false)
    h.run(3000)
    expect(h.queue.hasSeen('back')).toBe(true)
    h.raise('weed', { spot: () => 'fence' })
    h.run(3500, { patio: true })
    expect(h.queue.hasSeen('weed')).toBe(true)
  })

  it('shows a failure tip once a round, and a staged tip once a match', () => {
    const h = harness()
    h.raise('clip', { failure: true })
    h.raise('weed')
    h.run(10_000)
    h.raise('clip', { failure: true })
    h.raise('weed')
    h.run(10_000)
    expect(h.shows.map(s => s.id)).toEqual(['clip', 'weed'])
    h.queue.newRound()
    h.raise('clip', { failure: true })
    h.raise('weed')
    h.run(10_000)
    expect(h.shows.map(s => s.id)).toEqual(['clip', 'weed', 'clip'])
  })

  it('shows a once-a-round tip again next round, with no 2s wait', () => {
    const h = harness()
    h.raise('weed')
    h.raise('coach', { eachRound: true })
    h.run(10_000)
    h.raise('coach', { eachRound: true })
    h.run(10_000)
    expect(h.shows.map(s => s.id)).toEqual(['weed', 'coach'])
    expect(h.queue.hasSeen('coach', true)).toBe(true)
    h.queue.newRound()
    h.raise('coach', { eachRound: true })
    h.run(10_000)
    expect(h.shows.map(s => s.id)).toEqual(['weed', 'coach', 'coach'])
  })

  it('clears the line at 0:00, and waiting tips leave unseen', () => {
    const h = harness()
    h.raise('weed')
    h.raise('snail')
    h.run(1000)
    h.queue.clear()
    h.run(10_000)
    expect(h.current()).toBeNull()
    expect(h.queue.hasSeen('weed')).toBe(false)
    expect(h.queue.hasSeen('snail')).toBe(false)
  })
})

describe('catch-up and fresh rounds', () => {
  it('treats a 60s catch-up and any hidden step as no time for tips', () => {
    expect(liveStep(17, false)).toBe(true)
    expect(liveStep(500, false)).toBe(true)
    expect(liveStep(60_000, false)).toBe(false)
    expect(liveStep(17, true)).toBe(false)
  })

  it('lets countdown tips show only from a round watched from its start', () => {
    expect(freshRound('countdown', 0)).toBe(true)
    expect(freshRound('play', 1500)).toBe(true)
    expect(freshRound('play', 90_000)).toBe(false)
    expect(freshRound('reveal', 0)).toBe(false)
  })
})
