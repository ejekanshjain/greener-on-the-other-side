// M23 sound, juice and Shake Fist on two ?local&fast pages with fixed player ids, so A
// hosts. Nothing plays before the first tap, even through a countdown. After one real
// click, a round on page A plays every sound in PLAN.md's sound map, each logged through
// events(): throws, landings (on grass, on mud and next door), the clip's creak and their
// laugh, pops, the snail's squish, mowing with a scalp, a new stripe's chime, pouring, an
// empty can, the tap and its flood, a sparkle, Biscuit, the vane and wind, the shed and a
// trampoline that sinks, Shake Fist, the last 10s, Brenda's reveal and the next countdown. A real click on Shake
// Fist pops a fist on page B within 300 ms, and the button rests for 3s. Phone sizes tap
// Shake Fist by touch and take screenshots of the top bar.
//
// Usage: node e2e/sound.mjs [desktop|phone|small]
import {
  BASE,
  dev,
  launch,
  mouseFlick,
  roomCode,
  shot,
  SIZES,
  sleep,
  waitFor,
  watchErrors
} from './lib.mjs'

const ONLY = process.argv[2]

/** Every sound the map names, by its sfx name. */
const MAP = [
  'whoosh',
  'thud',
  'squish',
  'creak',
  'laugh',
  'pop',
  'rumble',
  'rattle',
  'pour',
  'drip',
  'rain',
  'splash',
  'ding',
  'bark',
  'stomp',
  'wind',
  'slam',
  'boing',
  'hammer',
  'tick',
  'doorbell',
  'stripe',
  'scrub',
  'bell'
]

/** Two ?local pages with fixed ids: `a` sorts first, so it hosts. */
async function pair(browser, size, query) {
  const context = await browser.newContext(SIZES[size])
  const code = roomCode()
  const tag = Math.random().toString(36).slice(2, 8).padEnd(6, '0')
  const errors = []
  const open = async (id, label) => {
    const p = await context.newPage()
    errors.push(watchErrors(p, label))
    await p.goto(`${BASE}/r/${code}?local&pid=${id}&${query}`)
    await waitFor(p, s => s.admission === 'seated')
    return p
  }
  const a = await open(`aa${tag}xx`, 'A')
  const b = await open(`bb${tag}xx`, 'B')
  for (const p of [a, b]) await waitFor(p, s => s.seats.length === 2)
  return { context, a, b, check: () => errors.forEach(e => e.check()) }
}

/** Collects the names of every sound a page logs, polling its event log. */
function listen(page) {
  const heard = new Set()
  let since = 0
  let on = true
  const poll = async () => {
    while (on) {
      const events = await dev(page, (g, t) => g.events(200), since).catch(
        () => []
      )
      for (const e of events)
        if (e.type === 'sfx' && e.at >= since) heard.add(e.detail.name)
      if (events.length) since = events[events.length - 1].at
      await sleep(150)
    }
  }
  const done = poll()
  return {
    heard,
    stop: async () => {
      on = false
      await done
    }
  }
}

/** Waits until `page`'s log shows sound `name`. */
async function hear(listener, name, label, timeout = 12_000) {
  const start = Date.now()
  while (!listener.heard.has(name)) {
    if (Date.now() - start > timeout)
      throw new Error(`never heard ${name} (${label})`)
    await sleep(100)
  }
}

/** Throws a fresh gnome from `patch` at `speedPx`, `angleDeg` off straight. */
function throwFrom(page, patch, speedPx, angleDeg = 0) {
  return dev(
    page,
    (g, a) => {
      g.act.setArm(0)
      g.spawn('gnome', a.patch)
      return new Promise(resolve =>
        setTimeout(() => {
          const gnome = g
            .garden()
            .items.filter(i => i.kind === 'gnome' && i.state === 'rest')
            .sort((x, y) => y.id - x.id)[0]
          resolve(g.act.throw(gnome.id, a))
        }, 80)
      )
    },
    { patch, speedPx, angleDeg }
  )
}

async function desktop(browser) {
  const { context, a, b, check } = await pair(browser, 'desktop', 'fast')
  const la = listen(a)
  const lb = listen(b)
  await dev(a, g => g.ready(true))
  await dev(b, g => g.ready(true))
  for (const p of [a, b])
    await waitFor(p, s => s.matchPhase?.kind === 'play', { label: 'play' })
  await sleep(600)
  if (la.heard.size || lb.heard.size)
    throw new Error(`sound before the first tap: ${[...la.heard, ...lb.heard]}`)
  console.log('desktop: the countdown and "Mow!" stayed silent before any tap')
  // One real click in the sky unlocks each page.
  for (const p of [a, b]) await p.mouse.click(30, 30)

  // A throw over the fence, landing next door, and their head popping up there.
  await throwFrom(a, 150, 1800)
  await hear(la, 'whoosh', 'throw')
  await hear(lb, 'thud', 'landing next door')
  await hear(lb, 'pop', 'head pop')
  await hear(la, 'thud', 'my landing over there')

  // A soft throw from mid-lawn clips the fence: a creak, then their laugh. Its reach
  // must land just past the fence, so it allows for the wind and retries in a gust.
  for (let tries = 0; tries < 6 && !la.heard.has('laugh'); tries++) {
    await dev(a, g => {
      g.act.setArm(0)
      g.spawn('gnome', 102)
      return new Promise(resolve =>
        setTimeout(() => {
          const garden = g.garden()
          const gnome = garden.items
            .filter(i => i.kind === 'gnome' && i.state === 'rest')
            .sort((x, y) => y.id - x.id)[0]
          const wind = 1 + 0.3 * garden.wind.over
          const speedPx = (gnome.ly * 1.08) / (0.4 * wind)
          resolve(g.act.throw(gnome.id, { speedPx }))
        }, 80)
      )
    })
    await sleep(1500)
  }
  await hear(la, 'creak', 'clip')
  await hear(la, 'laugh', 'laugh')

  // A short throw onto mud squishes.
  for (const patch of [
    53, 54, 55, 65, 66, 67, 77, 78, 79, 89, 90, 91, 101, 102, 103
  ])
    await dev(a, (g, p) => g.setPatch(p, { health: 0 }), patch)
  await throwFrom(a, 150, 600)
  await hear(la, 'squish', 'mud landing')

  // A weed yanked pops.
  await dev(a, g => g.act.sprout(110))
  await sleep(100)
  await dev(a, g => g.act.yank(g.garden().weeds.find(w => w.patch === 110).id))
  await hear(la, 'pop', 'yank')
  await dev(a, g => g.act.clearItems())

  // The can: a sparkle, the pour loop, then an empty can.
  await dev(a, g => g.setPatch(41, { health: 6 }))
  await dev(a, g => g.act.water(41, 1200))
  await hear(la, 'pour', 'pouring')
  await hear(la, 'ding', 'sparkle')
  await sleep(1300)
  await dev(a, g => g.act.setCan(300))
  await dev(a, g => g.act.water(44, 900))
  await hear(la, 'drip', 'empty can')

  // The tap runs (rain) and floods after 8s (splash).
  await dev(a, g => g.act.tap())
  await hear(la, 'rain', 'tap running')

  // A gust: the vane creaks, then the wind blows.
  await dev(a, g => g.act.gust('over', 1))
  await hear(la, 'wind', 'gust')

  // Shake Fist by a real click: a hammer here, a fist on B within 300 ms.
  const shakeAt = await dev(a, g => g.state().now)
  await a.click('[data-testid="fist-button"]')
  await hear(la, 'hammer', 'shake fist')
  await b.waitForFunction(
    () => window.__game.greener.neighbour().fists.length > 0,
    null,
    { timeout: 3000 }
  )
  const seenAt = await dev(b, g => g.neighbour().fists[0].at)
  if (seenAt - shakeAt > 300)
    throw new Error(`the fist took ${seenAt - shakeAt} ms to pop up next door`)
  await hear(lb, 'hammer', 'fist next door')
  if (
    (await a.getAttribute('[data-testid="fist-button"]', 'aria-disabled')) !==
    'true'
  )
    throw new Error('Shake Fist did not rest after a shake')
  await a.keyboard.press('f')
  await sleep(200)
  const shakes = (await dev(a, g => g.events(200))).filter(
    e => e.type === 'shakeFist'
  ).length
  if (shakes !== 1) throw new Error(`F shook again during the rest: ${shakes}`)
  console.log(
    `desktop: Shake Fist popped up next door ${Math.round(seenAt - shakeAt)} ms later`
  )
  await shot(b, 'sound-desktop-fist')

  // Mowing: a fast real rub down a clear column rumbles and scalps.
  const col = await dev(a, g => {
    const busy = new Set(g.garden().weeds.map(w => w.patch % 12))
    for (const s of g.garden().snails) busy.add(Math.floor(s.lx / 50))
    return [3, 8, 5, 6, 2, 9].find(c => !busy.has(c)) ?? 4
  })
  const top = await dev(a, (g, c) => g.toClient(c * 50 + 25, 45), col)
  const bottom = await dev(a, (g, c) => g.toClient(c * 50 + 25, 600), col)
  await mouseFlick(a, top, bottom, 1500, { holdMs: 160 })
  await hear(la, 'rumble', 'mowing')
  await hear(la, 'rattle', 'scalp')

  // A slow real rub down another clear column stripes it, with its own chime.
  const clear = await dev(
    a,
    (g, used) => {
      const garden = g.garden()
      const busy = new Set([
        used,
        ...garden.weeds.map(w => w.patch % 12),
        ...garden.snails.map(s => Math.floor(s.lx / 50)),
        ...garden.items.map(i => Math.floor(i.lx / 50))
      ])
      const c = [5, 6, 4, 7, 2, 9, 1, 10].find(c => !busy.has(c))
      // Holes stay all round, so this column starts without any.
      for (let row = 0; row < 16; row++) g.setPatch(row * 12 + c, { hole: 0 })
      return c
    },
    col
  )
  await mouseFlick(
    a,
    await dev(a, (g, c) => g.toClient(c * 50 + 25, 45), clear),
    await dev(a, (g, c) => g.toClient(c * 50 + 25, 668), clear),
    600,
    { holdMs: 0 }
  )
  await hear(la, 'stripe', 'a new stripe')

  // A snail grabbed by a real press squishes into its shell.
  await dev(a, g => g.spawn('snailShell', 64))
  const snail = await a.waitForFunction(
    () => window.__game.greener.garden().snails[0]?.id ?? null,
    null,
    { timeout: 6000 }
  )
  const at = await dev(
    a,
    (g, id) => g.targetClient(id),
    await snail.jsonValue()
  )
  await a.mouse.move(at.x, at.y)
  await a.mouse.down()
  await sleep(80)
  await a.mouse.up()
  await hear(la, 'squish', 'snail grab')

  await hear(la, 'splash', 'flood', 9000)
  await dev(a, g => g.act.tap())

  // Biscuit wakes 10s into a fast round: a dig circle and hole, and a bark at a gnome.
  await waitFor(a, s => s.matchPhase.elapsed > 10_500, {
    label: 'Biscuit awake'
  })
  await dev(a, g => g.act.dig(3500))
  await dev(a, g => g.spawn('gnome', 100))
  await dev(a, g => g.act.dogReady(0))
  await hear(la, 'bark', 'Biscuit')
  await hear(la, 'stomp', 'dig', 8000)

  // The shed bangs open, and a trampoline thrown short sinks with a boing.
  await dev(a, g => g.act.shed())
  await hear(la, 'slam', 'shed')
  await sleep(1500)
  await dev(a, g => {
    const tramp = g.garden().items.find(i => i.kind === 'trampoline')
    return g.act.throw(tramp.id, { speedPx: 1300 })
  })
  await hear(la, 'boing', 'trampoline')

  // The last 10s tick; then Brenda's reveal and the next countdown with its bell.
  await dev(a, g => g.jump(9000))
  await hear(la, 'tick', 'last 10s')
  for (const name of ['doorbell', 'scrub'])
    await hear(la, name, 'reveal', 15_000)
  await hear(la, 'bell', 'next round', 20_000)
  await la.stop()
  await lb.stop()
  const missing = MAP.filter(name => !la.heard.has(name))
  if (missing.length) throw new Error(`never played: ${missing.join(', ')}`)
  console.log(
    `desktop: all ${MAP.length} sounds in the map played on one page (${la.heard.size} kinds logged)`
  )
  check()
  await context.close()
}

/** Phones: Shake Fist by touch, and the top bar with its button at both sizes. */
async function phone(browser, size) {
  const { context, a, b, check } = await pair(browser, size, 'fast&calm')
  await dev(a, g => g.ready(true))
  await dev(b, g => g.ready(true))
  for (const p of [a, b])
    await waitFor(p, s => s.matchPhase?.kind === 'play', { label: 'play' })
  await sleep(900)
  await a.tap('[data-testid="fist-button"]')
  await b.waitForFunction(
    () => window.__game.greener.neighbour().fists.length > 0,
    null,
    { timeout: 3000 }
  )
  const sounds = (await dev(a, g => g.events(100))).filter(
    e => e.type === 'sfx'
  )
  if (!sounds.some(e => e.detail.name === 'hammer'))
    throw new Error(`${size}: the tap on Shake Fist made no sound`)
  await shot(a, `sound-${size}-fist-resting`)
  await shot(b, `sound-${size}-fist`)
  console.log(`${size}: a tap on Shake Fist popped a fist next door`)
  check()
  await context.close()
}

const browser = await launch()
try {
  if (!ONLY || ONLY === 'desktop') await desktop(browser)
  for (const size of ['phone', 'small'])
    if (!ONLY || ONLY === size) await phone(browser, size)
  console.log('sound: ok')
} finally {
  await browser.close()
}
