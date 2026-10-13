// M3 real Pusher: two contexts share one real room, seat each other, sync clocks and
// throw a weed across, whose landing comes back in a lawn report (M12). M16b: the second
// player must see both names within 2s of its subscription succeeding, using under 15
// client events. A third context sees Room Full and leaves the member list. A second tab
// of one player shows "already open" and Play Here moves the game. Spends real quota,
// so it stays under 2 minutes and 300 events. It never prints the Pusher secret.
import { readFileSync } from 'node:fs'

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

const started = Date.now()
const secret = /^PUSHER_SECRET=(.*)$/m
  .exec(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'))?.[1]
  ?.trim()
const logs = []
const pages = []

async function open(context, label, url) {
  const page = await context.newPage()
  const errors = watchErrors(page, label)
  page.on('console', msg => logs.push(msg.text()))
  await page.goto(url)
  pages.push(page)
  return { page, errors }
}

async function eventsSent() {
  let total = 0
  for (const page of pages) {
    if (page.isClosed()) continue
    const net = await dev(page, g => g.net()).catch(() => null)
    if (net) total += net.sent.bundles + net.clockSends
  }
  return total
}

const browser = await launch()
let spent = 0
try {
  const code = roomCode()
  const url = `${BASE}/r/${code}?fast`
  const ctxA = await browser.newContext(SIZES.desktop)
  const ctxB = await browser.newContext(SIZES.desktop)
  const A = await open(ctxA, 'A', url)
  await waitFor(A.page, s => s.admission === 'seated', {
    timeout: 20000,
    label: 'A seated'
  })
  const B = await open(ctxB, 'B', url)
  // M16b: time from B's subscription to both names in B's lobby, polled inside the page.
  const seatedAt = await B.page.evaluate(async () => {
    const until = Date.now() + 20_000
    for (;;) {
      const s = window.__game?.greener?.state()
      if (s?.seats.length === 2 && s.peer?.name && s.peer.name !== 'Neighbour')
        return Date.now()
      if (Date.now() > until) return -1
      await new Promise(r => setTimeout(r, 5))
    }
  })
  const seatNets = await Promise.all(
    [A.page, B.page].map(p => dev(p, g => g.net()))
  )
  const snapshot = (await dev(B.page, g => g.events(60))).find(
    e => e.type === 'snapshot'
  )
  if (seatedAt < 0 || !snapshot) throw new Error('B never saw both names')
  const seatMs = seatedAt - snapshot.at
  const seatEvents = seatNets.reduce((n, net) => n + net.sent.bundles, 0)
  const pingEvents = seatNets.reduce((n, net) => n + net.clockSends, 0)
  console.log(
    `M16b: both names ${seatMs} ms after B subscribed, ${seatEvents} bundles and ${pingEvents} clock events`
  )
  if (seatMs > 2000 || seatEvents + pingEvents >= 15)
    throw new Error('seating is too slow or too chatty')
  const sb = await waitFor(B.page, s => s.seats.length === 2, {
    timeout: 20000,
    label: 'B seated'
  })
  const sa = await waitFor(A.page, s => s.seats.length === 2, {
    label: 'A sees B'
  })
  const guest = sa.role === 'guest' ? A.page : B.page
  const g = await waitFor(
    guest,
    s => Number.isFinite(s.bestRtt) && s.bestRtt > 0,
    { label: 'clock sync' }
  )
  console.log(
    `seated on Pusher: host ${sa.role === 'host' ? 'A' : 'B'}, clock round trip ${Math.round(g.bestRtt)} ms, offset ${Math.round(g.offset)} ms`
  )
  if (sa.seats.join() !== sb.seats.join()) throw new Error('seats differ')

  // A third player gets Room Full and drops off the member list.
  const ctxC = await browser.newContext(SIZES.desktop)
  const C = await open(ctxC, 'C', url)
  const sc = await waitFor(C.page, s => s.admission === 'full', {
    timeout: 20000,
    label: 'Room Full'
  })
  await waitFor(A.page, s => !s.others.includes(sc.me.id), {
    timeout: 15000,
    label: 'C left the member list'
  })
  console.log('third context saw Room Full and left the member list')
  await shot(C.page, 'pusher-room-full')
  spent += await eventsSent()
  C.errors.check()
  await ctxC.close()

  // A second tab of player A: already open, then Play Here moves the game.
  const A2 = await open(ctxA, 'A2', url)
  await A2.page
    .getByText('This room is open in another tab.')
    .waitFor({ timeout: 10000 })
  await shot(A2.page, 'pusher-already-open')
  await A2.page.getByRole('button', { name: 'Play Here' }).click()
  await A.page
    .getByText('This game moved to another tab.')
    .waitFor({ timeout: 10000 })
  await waitFor(
    A2.page,
    s => s.admission === 'seated' && s.seats.length === 2,
    { timeout: 20000, label: 'A2 seated' }
  )
  await shot(A.page, 'pusher-moved')
  console.log('Play Here moved the game to the second tab')

  // Throw a weed across for real.
  await dev(A2.page, g => g.ready(true))
  await dev(B.page, g => g.ready(true))
  for (const p of [A2.page, B.page])
    await waitFor(p, s => s.matchPhase?.kind === 'play', {
      timeout: 20000,
      label: 'play'
    })
  // Weeds sprout on their own schedule, so root one mid-lawn to throw.
  await dev(A2.page, g => g.act.sprout(8 * 12 + 6))
  await sleep(300)
  const garden = await dev(A2.page, g => g.garden())
  const weed = garden.weeds.find(w => w.patch === 8 * 12 + 6)
  const from = await dev(A2.page, (g, id) => g.targetClient(id), weed.id)
  await mouseFlick(A2.page, from, { x: from.x, y: from.y - 200 }, 1300)
  const landed = await (async () => {
    const t0 = Date.now()
    while (Date.now() - t0 < 4000) {
      const items = (await dev(B.page, g => g.garden())).items
      const item = items.find(i => i.fromNeighbour && i.state === 'rest')
      if (item) return { item, ms: Date.now() - t0 }
      await sleep(50)
    }
    return null
  })()
  if (!landed) throw new Error('the weed never landed over real Pusher')
  console.log(`weed crossed over Pusher and landed in ${landed.ms} ms`)
  await shot(B.page, 'pusher-landed')
  // The landing comes back in B's next lawn report, as a puff in A's peek strip.
  const puffed = await (async () => {
    const t0 = Date.now()
    while (Date.now() - t0 < 3000) {
      const n = await dev(A2.page, g => g.neighbour())
      if (n.lawn && n.puffs.length > 0) return Date.now() - t0
      await sleep(50)
    }
    return null
  })()
  if (puffed === null)
    throw new Error('the landing never came back in a lawn report over Pusher')
  console.log(`the lawn report showed the landing ${puffed} ms after it landed`)

  spent += await eventsSent()
  for (const x of [A, A2, B]) x.errors.check()
  const seconds = (Date.now() - started) / 1000
  if (secret && logs.some(line => line.includes(secret)))
    throw new Error('a browser log printed the Pusher secret')
  try {
    if (secret && readFileSync('/tmp/greener-dev.log', 'utf8').includes(secret))
      throw new Error('the dev server log printed the Pusher secret')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  console.log(
    `pusher: ok in ${seconds.toFixed(0)}s with ${spent} client events sent`
  )
  if (seconds > 120) throw new Error('the real-Pusher run took over 2 minutes')
  if (spent > 300) throw new Error('the real-Pusher run sent over 300 events')
} finally {
  await browser.close()
}
