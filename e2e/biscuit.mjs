// M14 Biscuit on two ?local pages at three sizes. Both lawns dig the same seeded holes.
// A gnome put down by a real press gets a bark at 1.5s and lies on the back row by about
// 5s. A real press on the item in his mouth takes it back. A real tap while he circles
// sits him and stops the hole; a missed circle digs one and counts in blame.
import {
  dev,
  hold,
  launch,
  localPair,
  shot,
  sleep,
  startMatch
} from './lib.mjs'

/** Waits until a dev query on `page` returns something truthy, or throws `why`. */
async function until(page, fn, arg, why, timeout = 6000) {
  const start = Date.now()
  for (;;) {
    const value = await dev(page, fn, arg)
    if (value) return value
    if (Date.now() - start > timeout) {
      const events = await dev(page, g =>
        g.events(30).map(e => `${e.at} ${e.type}`)
      )
      throw new Error(`${why}\n${events.join('\n')}`)
    }
    await sleep(30)
  }
}

/** The first logged event of `type` on `page` since shared time `since`. */
function event(page, type, since, why, timeout) {
  return until(
    page,
    (g, a) => g.events(150).find(e => e.at >= a.since && e.type === a.type),
    { type, since },
    why,
    timeout
  )
}

const now = page => dev(page, g => g.state().now)
const garden = page => dev(page, g => g.garden())
const ROW = 12

async function run(browser, size) {
  const touch = size !== 'desktop'
  const { a, b, check, context } = await localPair(browser, { size })
  await startMatch(a, b)
  const [host, guest] =
    (await dev(a, g => g.state().role)) === 'host' ? [a, b] : [b, a]
  await shot(host, `biscuit-${size}-asleep`)

  // 1. Jump past the first seeded dig: both lawns dug the same hole at the same patch.
  const { roundMs } = (await dev(host, g => g.state())).match
  const digAt = (await garden(host)).biscuit.digAt
  const after = digAt[0] + 5000
  await dev(host, (g, ms) => g.jump(ms), roundMs - after)
  for (const p of [host, guest])
    await until(p, (g, t) => g.garden().t >= t, after, `${size}: no catch-up`)
  const [hostHoles, guestHoles] = [
    (await garden(host)).hole,
    (await garden(guest)).hole
  ]
  const dug = hostHoles.flatMap((h, i) => (h ? [i] : []))
  if (dug.length !== 1 || hostHoles.join() !== guestHoles.join())
    throw new Error(`${size}: seeded holes differ ${dug} vs guest`)
  console.log(`${size}: both lawns dug patch ${dug[0]} in the first dig`)

  // 2. A gnome put down by a real press gets a bark at 1.5s, then sits on the back row.
  await dev(host, g => {
    g.act.clearItems()
    g.act.dogReady(60_000)
    g.spawn('gnome', 6 * 12 + 4)
  })
  const gnome = await until(
    host,
    g => g.garden().items.find(i => i.kind === 'gnome'),
    null,
    `${size}: no gnome`
  )
  let since = await now(host)
  const at = await dev(host, (g, id) => g.targetClient(id), gnome.id)
  await hold(host, at, 350, touch)
  const putDown = await event(host, 'putDown', since, `${size}: no put-down`)
  await dev(host, g => g.act.dogReady(0))
  const bark = await event(host, 'bark', since, `${size}: no bark`)
  const fetch = await event(host, 'fetch', since, `${size}: no fetch`)
  await sleep(250)
  await shot(host, `biscuit-${size}-carry`)
  const drop = await event(host, 'drop', since, `${size}: no drop`, 8000)
  const barkMs = bark.at - putDown.at
  const dropMs = drop.at - putDown.at
  const row = Math.floor(drop.detail.patch / ROW)
  if (Math.abs(barkMs - 1500) > 150 || row !== 15 || dropMs > 5600)
    throw new Error(
      `${size}: bark after ${barkMs} ms, drop on row ${row} after ${dropMs} ms`
    )
  console.log(
    `${size}: bark ${barkMs} ms, fetch ${fetch.at - putDown.at} ms, back row ${dropMs} ms after the put-down`
  )
  await shot(host, `biscuit-${size}-dropped`)

  // 3. A real press on the item in his mouth takes it back; letting go slowly puts it down.
  await dev(host, g => {
    g.act.dogReady(0)
    g.spawn('gnome', 3 * 12 + 8)
  })
  since = await now(host)
  const carried = await event(host, 'fetch', since, `${size}: no second fetch`)
  await sleep(150)
  const mouth = await dev(
    host,
    (g, id) => g.targetClient(id),
    carried.detail.id
  )
  await hold(host, mouth, 300, touch)
  const back = await event(host, 'takeBack', since, `${size}: no take back`)
  await event(host, 'putDown', back.at, `${size}: no put-down after take back`)
  const state = await garden(host)
  const item = state.items.find(i => i.id === back.detail.id)
  if (!item || item.state !== 'rest' || state.biscuit.state === 'carry')
    throw new Error(`${size}: take back left ${JSON.stringify(item)}`)
  console.log(`${size}: took item ${item.id} back out of his mouth`)

  // 4. A real tap while he circles sits him, and no hole appears.
  const digsBefore = (await garden(host)).blame.digs
  await dev(host, g => g.act.dig(3500))
  since = await now(host)
  const circle = await event(host, 'circle', since, `${size}: no circle`)
  await sleep(300)
  await shot(host, `biscuit-${size}-circle`)
  const dog = await dev(host, g => g.biscuitClient())
  await hold(host, dog, 80, touch)
  await event(host, 'sit', since, `${size}: the tap didn't sit him`)
  await sleep(2000)
  let g1 = await garden(host)
  if (g1.hole[circle.detail.patch] || g1.blame.digs !== digsBefore)
    throw new Error(`${size}: a tapped dig still dug a hole`)
  await shot(host, `biscuit-${size}-sit`)

  // 5. A missed circle digs a hole and counts in blame.
  await dev(host, g => g.act.dig(3500))
  since = await now(host)
  const missed = await event(host, 'dig', since, `${size}: no dig`, 8000)
  g1 = await garden(host)
  if (!g1.hole[missed.detail.patch] || g1.blame.digs !== digsBefore + 1)
    throw new Error(`${size}: a missed dig left ${JSON.stringify(g1.blame)}`)
  console.log(
    `${size}: a tap sat him on patch ${circle.detail.patch}; a miss dug patch ${missed.detail.patch}`
  )
  await sleep(300)
  await shot(host, `biscuit-${size}-hole`)
  const notes = (await dev(host, g => g.events(150)))
    .filter(e => e.type === 'note')
    .map(e => e.detail.text)
  for (const tip of [
    'Tap Biscuit before he digs.',
    "Biscuit's eyeing that. Throw it first."
  ])
    if (!notes.includes(tip)) throw new Error(`${size}: no tip "${tip}"`)
  check()
  await context.close()
}

const browser = await launch()
try {
  for (const size of process.env.SIZES?.split(',') ?? [
    'desktop',
    'phone',
    'small'
  ])
    await run(browser, size)
  console.log('biscuit: ok')
} finally {
  await browser.close()
}
