// M16 dandelions and round banners on two ?local pages at three sizes, on full rounds.
// Round 2's countdown shows the dandelion banner. Dandelions turn into seed clocks at the
// same moments on both pages. A seed clock yanked and thrown with real input bursts on
// the other lawn, and its 3 seeds root there 10s later. Round 3's countdown shows the
// heatwave banner.
import {
  dev,
  launch,
  localPair,
  mouseFlick,
  shot,
  sleep,
  startMatch,
  touchFlick
} from './lib.mjs'

/** Waits until a dev query on `page` returns something truthy, or throws `why`. */
async function until(page, fn, arg, why, timeout = 8000) {
  const start = Date.now()
  for (;;) {
    const value = await dev(page, fn, arg)
    if (value) return value
    if (Date.now() - start > timeout) throw new Error(why)
    await sleep(40)
  }
}

/** The first logged event of `type` on `page` since shared time `since` that passes `test`. */
function event(page, type, since, why, timeout, test = 'true') {
  return until(
    page,
    (g, a) =>
      g
        .events(200)
        .find(
          e =>
            e.at >= a.since &&
            e.type === a.type &&
            new Function('e', `return ${a.test}`)(e)
        ),
    { type, since, test },
    why,
    timeout
  )
}

const now = page => dev(page, g => g.state().now)
const garden = page => dev(page, g => g.garden())
const banner = page =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid="round-banner"]')
    return el && !el.hidden ? el.textContent : ''
  })

/** Jumps the host to the last 0.5s of `round`, then waits for the next round's banner. */
async function bannerAfter(host, guest, round, title, size) {
  await dev(host, (g, r) => g.jump(500, r), round)
  for (const p of [host, guest]) {
    const start = Date.now()
    let seen = ''
    while (!seen.startsWith(title)) {
      if (Date.now() - start > 30_000)
        throw new Error(`${size}: no "${title}" banner, saw "${seen}"`)
      await sleep(200)
      seen = await banner(p)
    }
  }
  await shot(host, `dandelion-${size}-banner-${round + 2}`)
}

async function run(browser, size) {
  const touch = size !== 'desktop'
  const { a, b, check, context } = await localPair(browser, { size })
  await startMatch(a, b)
  const [host, guest] =
    (await dev(a, g => g.state().role)) === 'host' ? [a, b] : [b, a]

  // 1. Round 2's countdown announces dandelions on both pages.
  await bannerAfter(host, guest, 0, 'Round 2: Dandelions', size)
  for (const p of [host, guest])
    await until(
      p,
      g => g.state().matchPhase?.kind === 'play' && g.state().gardenRound === 1,
      null,
      `${size}: round 2 never started`,
      8000
    )

  // 2. Jump to 3s before the next dandelion turns into a seed clock; both pages agree.
  // A round can go a while without one, so look further on until one is growing.
  const { roundMs } = (await dev(host, g => g.state())).match
  let first = null
  for (let at = 35_000; !first && at <= 110_000; at += 25_000) {
    await dev(host, (g, ms) => g.jump(ms, 1), roundMs - at)
    for (const p of [host, guest])
      await until(p, (g, t) => g.garden().t >= t, at, `${size}: no catch-up`)
    first = (await garden(host)).weeds
      .filter(w => w.kind === 'dandelion' && w.clockAt > at + 3500)
      .sort((x, y) => x.clockAt - y.clockAt)[0]
  }
  if (!first) throw new Error(`${size}: no dandelion growing by 1:10 left`)
  const before = first.clockAt - 3000
  await dev(host, (g, ms) => g.jump(ms, 1), roundMs - before)
  for (const p of [host, guest])
    await until(p, (g, t) => g.garden().t >= t, before, `${size}: no catch-up`)
  const since = await now(host)
  const clocks = await Promise.all(
    [host, guest].map(p => event(p, 'clock', since, `${size}: no clock`, 8000))
  )
  const apart = Math.abs(clocks[0].at - clocks[1].at)
  if (apart > 100 || clocks[0].detail.patch !== clocks[1].detail.patch)
    throw new Error(
      `${size}: clocks ${apart} ms apart on ${clocks[0].detail.patch} and ${clocks[1].detail.patch}`
    )
  console.log(
    `${size}: patch ${clocks[0].detail.patch} turned into a seed clock ${apart} ms apart on both pages`
  )
  await shot(host, `dandelion-${size}-clock`)

  // 3. Yank the clock with real input and throw it over. Wait for 5s of calm first, since
  // a gust on the guest's side while it lands would blow the seeds straight back.
  await until(
    host,
    () => {
      const g = window.__game.greener.garden()
      return !g.wind.gusts.some(x => g.t > x.at - 5000 && g.t < x.end)
    },
    null,
    `${size}: the wind never calmed`,
    12_000
  )
  const clock = (await garden(host)).weeds.find(
    w => w.patch === clocks[0].detail.patch && w.kind === 'seedClock'
  )
  // Seeds only root under the 40-weed cap, and an idle lawn this late sits at it.
  await dev(guest, g => g.act.pullWeeds(20))
  const from = await dev(host, (g, id) => g.targetClient(id), clock.id)
  const to = { x: from.x, y: from.y - 220 }
  const thrownAt = await now(host)
  if (touch) await touchFlick(host, from, to, 2200, { holdMs: 40 })
  else await mouseFlick(host, from, to, 2200, { holdMs: 40 })
  await event(
    host,
    'cross',
    thrownAt,
    `${size}: the clock never crossed the fence`,
    4000,
    "e.detail.crossing.kind === 'seedClock'"
  )
  const burst = await event(
    guest,
    'burst',
    thrownAt,
    `${size}: the clock never burst next door`,
    6000
  )
  if (burst.detail.over)
    throw new Error(`${size}: the guest's tailwind blew the seeds back`)
  const seeds = (await garden(guest)).seeds.map(s => s.patch)
  if (seeds.length !== 3) throw new Error(`${size}: ${seeds.length} seeds`)
  await sleep(200)
  await shot(guest, `dandelion-${size}-seeds`)
  await until(
    guest,
    (g, ps) => ps.every(p => g.garden().weeds.some(w => w.patch === p)),
    seeds,
    `${size}: the seeds never rooted on ${seeds}`,
    13_000
  ).catch(async error => {
    const g = await garden(guest)
    throw new Error(
      `${error.message} (${g.weeds.length} weeds, holes ${seeds.map(p => g.hole?.[p])}, seeds left ${JSON.stringify(g.seeds)})`
    )
  })
  const rootedAt = await now(guest)
  const rootMs = rootedAt - burst.at
  if (rootMs < 9800 || rootMs > 10_800)
    throw new Error(`${size}: seeds rooted ${rootMs} ms after the burst`)
  console.log(
    `${size}: the thrown clock burst next door; its seeds rooted on ${seeds} after ${rootMs} ms`
  )

  // 4. Round 3's countdown announces the heatwave.
  await bannerAfter(host, guest, 1, 'Round 3: Heatwave', size)
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
  console.log('dandelion: ok')
} finally {
  await browser.close()
}
