// A scripted pair of hands for one page: it reads its own garden through the dev API and
// plays like a regular with real input (the mouse, or touch pointer events on phones).
import { dev, dragHold, hold, mouseFlick, sleep, touchFlick } from './lib.mjs'

/** Patio spots in lawn units (tuning.ts). */
const TAP = { lx: 40, ly: 672 }
const BAG = { lx: 220, ly: 744 }
const COMPOST = { lx: 360, ly: 706 }
const LIGHT = [
  'weed',
  'dandelion',
  'seedClock',
  'snailShell',
  'gnome',
  'litter'
]
const HEAVY = ['bin', 'trampoline', 'mower']
/** Mows a column this often, like a regular. */
const MOW_EVERY_MS = 12_000

const near = (a, b, r) => Math.hypot(a.lx - b.lx, a.ly - b.ly) < r
const lying = i => i.state === 'rest' || i.state === 'slide'

/** Swipe speed in px/s that carries a throw from depth `ly` about 180 units past the fence. */
function speedFor(ly, arm, heavy = false) {
  const perPx = 0.4 * (1 - 0.4 * arm) * (heavy ? 0.6 : 1)
  return Math.min(2400, Math.max(700, (Math.max(ly, 60) + 180) / perPx))
}

/** One player's hands on one page. `touch` plays with touch pointer events. */
export function hand(page, label, touch = false) {
  const TOUCH = touch
  const counts = {}
  let nextMowAt = 0
  let lastWeedTry = { id: -1, n: 0 }
  /** Drags and throws tried per piece of heavy junk; it gives up after 4. */
  const junkTries = new Map()
  const did = what => (counts[what] = (counts[what] ?? 0) + 1)
  const at = (lx, ly, h = 0) =>
    dev(page, (g, p) => g.toClient(...p), [lx, ly, h])
  const target = id => dev(page, (g, i) => g.targetClient(i), id)
  const flick = (from, distancePx, speedPx, holdMs = 60) => {
    const to = { x: from.x, y: from.y - distancePx }
    return TOUCH
      ? touchFlick(page, from, to, speedPx, { holdMs })
      : mouseFlick(page, from, to, speedPx, { holdMs })
  }

  /** Points no press should start on: everything a press would grab first. */
  const things = g => [
    ...g.items.filter(i => i.state !== 'air'),
    ...g.weeds,
    ...g.snails
  ]

  async function throwFrom(id, ly, arm, scale, heavy = false) {
    const from = await target(id)
    if (!from) return false
    await flick(from, 280 * scale, speedFor(ly, arm, heavy), heavy ? 750 : 60)
    return true
  }

  async function step(g, scale) {
    const junk = g.shed.open
      ? g.items.find(
          i =>
            HEAVY.includes(i.kind) && lying(i) && (junkTries.get(i.id) ?? 0) < 4
        )
      : undefined
    // While heavy junk waits for a fresh arm, light things wait too.
    const armFree = g.arm.block === null && g.arm.level <= 0.8 && !junk
    if (g.biscuit.state === 'circle') {
      await hold(page, await dev(page, g => g.biscuitClient()), 60, TOUCH)
      return did('biscuit')
    }
    const w = g.water
    if (
      (!w.tapOn && w.can < 3000) ||
      (w.tapOn && (w.can >= 9900 || w.tapRunMs > 5000))
    ) {
      await hold(page, await at(TAP.lx, TAP.ly), 60, TOUCH)
      return did('tap')
    }
    if (g.mower.bag >= 80 && !g.mower.gone && !g.mower.at) {
      await dragHold(
        page,
        await at(BAG.lx, BAG.ly),
        await at(COMPOST.lx, COMPOST.ly),
        300,
        1800,
        TOUCH
      )
      return did('compost')
    }
    const busy = things(g)
    if (junk && junk.ly > 260) {
      // Drag it forward to a clear spot first: it can't clear the fence from the patio.
      const spot = [100, 200, 300, 400, 500]
        .flatMap(lx => [200, 240].map(ly => ({ lx, ly })))
        .find(s => busy.every(t => t.id === junk.id || !near(t, s, 60)))
      // A drag with nowhere clear to go counts as a try, so junk never blocks the hand.
      junkTries.set(junk.id, (junkTries.get(junk.id) ?? 0) + 1)
      if (spot) {
        await dragHold(
          page,
          await target(junk.id),
          await at(spot.lx, spot.ly - 38),
          350,
          80,
          TOUCH
        )
        return did('drag')
      }
    } else if (junk && g.arm.level < 0.25 && g.arm.block === null) {
      await throwFrom(junk.id, junk.ly, g.arm.level, scale, true)
      junkTries.set(junk.id, (junkTries.get(junk.id) ?? 0) + 1)
      return did('heavy')
    }
    if (armFree) {
      const weed = g.weeds.find(
        w =>
          g.t - w.bornAt > 1500 &&
          !(lastWeedTry.id === w.id && lastWeedTry.n > 2)
      )
      if (weed) {
        lastWeedTry =
          lastWeedTry.id === weed.id
            ? { id: weed.id, n: lastWeedTry.n + 1 }
            : { id: weed.id, n: 1 }
        await throwFrom(weed.id, weed.ly - 100, g.arm.level, scale)
        return did('weed')
      }
      const snail = g.snails[0]
      if (snail) {
        await throwFrom(snail.id, snail.ly, g.arm.level, scale)
        return did('snail')
      }
    }
    // Water the driest 5-patch spot that's clear of anything a press would grab.
    if (w.can >= 1500) {
      let best = null
      for (let p = 0; p < 192; p++) {
        const c = { lx: (p % 12) * 50 + 25, ly: Math.floor(p / 12) * 40 + 20 }
        if (busy.some(t => near(t, c, 55))) continue
        const around = [p, p - 1, p + 1, p - 12, p + 12].filter(
          q => q >= 0 && q < 192 && Math.abs((q % 12) - (p % 12)) <= 1
        )
        const avg = around.reduce((s, q) => s + g.health[q], 0) / around.length
        if (!best || avg < best.avg) best = { c, avg }
      }
      if (best && best.avg <= 3.5) {
        const ms = Math.min(2400, (7 - best.avg) * 400 + 200)
        await hold(page, await at(best.c.lx, best.c.ly), ms, TOUCH)
        return did('water')
      }
    }
    if (armFree) {
      const item = g.items.find(
        i => LIGHT.includes(i.kind) && lying(i) && i.ly < 640
      )
      if (item) {
        await throwFrom(item.id, item.ly, g.arm.level, scale)
        return did(item.fromNeighbour ? 'throwBack' : 'throwOwn')
      }
    }
    if (!g.mower.gone && g.mower.bag < 88 && Date.now() >= nextMowAt) {
      let col = -1
      let longest = -1
      for (let c = 0; c < 12; c++) {
        const start = { lx: c * 50 + 25, ly: 45 }
        if (busy.some(t => near(t, start, 50))) continue
        let sum = 0
        for (let r = 0; r < 16; r++) sum += g.length[r * 12 + c]
        if (sum > longest) {
          longest = sum
          col = c
        }
      }
      if (col >= 0) {
        nextMowAt = Date.now() + MOW_EVERY_MS
        const top = await at(col * 50 + 25, 45)
        const bottom = await at(col * 50 + 25, 610)
        if (TOUCH) await touchFlick(page, top, bottom, 600, { holdMs: 0 })
        else await mouseFlick(page, top, bottom, 600, { holdMs: 0 })
        return did('mow')
      }
    }
    await sleep(150)
    return false
  }

  return {
    counts,
    async play() {
      const a = await at(0, 0)
      const b = await at(100, 0)
      const scale = (b.x - a.x) / 100
      for (;;) {
        const s = await dev(page, g => ({
          phase: g.state().phase,
          kind: g.state().matchPhase?.kind
        }))
        if (s.phase === 'over') return
        if (s.kind !== 'play') {
          await sleep(300)
          continue
        }
        const g = await dev(page, g => g.garden())
        await step(g, scale).catch(err => {
          throw new Error(`${label}: ${err.message}`)
        })
      }
    }
  }
}
