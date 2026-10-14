// M15 wind on two ?local pages at three sizes. Both pages swing the vane and start each
// gust at the same moment. An over-fence gust is a tailwind on one page and a headwind on
// the other, checked with a real swipe on each page during the same gust. An along gust
// pushes the two pages opposite ways in their own frames. A new player gets no wind tip
// in round 1, and in round 2 gets the line for the first gust in their own frame before
// it blows.
import {
  dev,
  frames,
  launch,
  localPair,
  mouseFlick,
  shot,
  sleep,
  startMatch,
  touchFlick,
  waitFor
} from './lib.mjs'

const WIND_TIPS = {
  tail: 'Wind in 2s. It carries your throws further.',
  head: 'Wind in 2s. It pushes your throws back.',
  side: 'Wind in 2s. It pushes throws sideways.'
}

/** Waits until a dev query on `page` returns something truthy, or throws `why`. */
async function until(page, fn, arg, why, timeout = 6000) {
  const start = Date.now()
  for (;;) {
    const value = await dev(page, fn, arg)
    if (value) return value
    if (Date.now() - start > timeout) throw new Error(why)
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
const wind = page => dev(page, g => g.garden().wind)

/**
 * Jumps the host to `leadMs` before gust `k`, so its vane swings 2s before it, and waits
 * on both pages.
 */
async function toGust(host, guest, k, leadMs = 3500) {
  const { roundMs } = (await dev(host, g => g.state())).match
  const gust = (await wind(host)).gusts[k]
  const at = gust.at - leadMs
  await dev(host, (g, ms) => g.jump(ms), roundMs - at)
  for (const p of [host, guest]) {
    await until(p, (g, t) => g.garden().t >= t, at, 'no catch-up')
    await frames(p)
  }
  return gust
}

/**
 * Spawns a gnome on patch 10 * 12 + col and flicks it at the fence with real input.
 * Returns its throw event.
 */
async function flickGnome(page, col, touch, size) {
  const since = await now(page)
  await dev(page, (g, p) => g.spawn('gnome', p), 10 * 12 + col)
  const gnome = await until(
    page,
    (g, x) =>
      g
        .garden()
        .items.findLast(
          i => i.kind === 'gnome' && Math.abs(i.lx - x) < 16 && i.ly > 400
        ),
    col * 50 + 25,
    `${size}: no gnome`
  )
  const from = await dev(page, (g, id) => g.targetClient(id), gnome.id)
  const to = { x: from.x, y: from.y - 140 }
  if (touch) await touchFlick(page, from, to, 1100)
  else await mouseFlick(page, from, to, 1100)
  return event(page, 'throw', since, `${size}: the flick threw nothing`)
}

async function run(browser, size) {
  const touch = size !== 'desktop'
  const { a, b, check, context } = await localPair(browser, {
    size,
    // A new player's tips, so the wind tip shows.
    query: 'first=1'
  })
  await startMatch(a, b)
  const [host, guest] =
    (await dev(a, g => g.state().role)) === 'host' ? [a, b] : [b, a]

  // 1. The first gust blows over the fence: the vane and the gust come together on both.
  const gust = await toGust(host, guest, 0)
  if (gust.kind !== 'over') throw new Error(`${size}: gust 1 is ${gust.kind}`)
  const since = await now(host)
  const vanes = await Promise.all(
    [host, guest].map(p => event(p, 'vane', since, `${size}: no vane`))
  )
  const gusts = await Promise.all(
    [host, guest].map(p => event(p, 'gust', since, `${size}: no gust`))
  )
  const apart = Math.abs(gusts[0].at - gusts[1].at)
  const lead = gusts[0].at - vanes[0].at
  if (apart > 100 || Math.abs(lead - 2000) > 100)
    throw new Error(`${size}: gusts ${apart} ms apart, vane ${lead} ms early`)
  if (gusts[0].detail.dir !== -gusts[1].detail.dir)
    throw new Error(`${size}: both pages got the same gust direction`)
  const [hw, gw] = await Promise.all([wind(host), wind(guest)])
  if (hw.over === 0 || hw.over !== -gw.over)
    throw new Error(`${size}: host wind ${hw.over}, guest ${gw.over}`)
  const [tail, head] = hw.over > 0 ? [host, guest] : [guest, host]
  await shot(tail, `wind-${size}-tailwind`)
  await shot(head, `wind-${size}-headwind`)

  // 2. A real swipe on each page during the same gust: 1.3 times as far on the tailwind
  // page, 0.7 times on the headwind page.
  const fast = await flickGnome(tail, 4, touch, size)
  const slow = await flickGnome(head, 7, touch, size)
  const ratio = e =>
    e.detail.distance / (0.4 * Math.min(2500, e.detail.speedPx))
  const [up, down] = [ratio(fast), ratio(slow)]
  if (Math.abs(up - 1.3) > 0.02 || Math.abs(down - 0.7) > 0.02)
    throw new Error(`${size}: wind ratios ${up} and ${down}`)
  console.log(
    `${size}: gust ${apart} ms apart, vane ${lead} ms early; ${Math.round(fast.detail.speedPx)} px/s flew ${Math.round(fast.detail.distance)} with the tailwind, ${Math.round(slow.detail.speedPx)} px/s flew ${Math.round(slow.detail.distance)} into the headwind`
  )

  // 3. The along gust pushes each page toward opposite hedges in its own frame.
  await sleep(4500)
  const along = await toGust(host, guest, 1)
  if (along.kind !== 'along')
    throw new Error(`${size}: gust 2 is ${along.kind}`)
  const t2 = await now(host)
  await Promise.all(
    [host, guest].map(p => event(p, 'gust', t2, `${size}: no along gust`))
  )
  await sleep(300)
  const [ha, ga] = await Promise.all([wind(host), wind(guest)])
  if (ha.side === 0 || ha.side !== -ga.side)
    throw new Error(`${size}: along sides ${ha.side} and ${ga.side}`)
  await shot(host, `wind-${size}-along`)
  console.log(
    `${size}: the along gust blows ${ha.side} on the host, ${ga.side} on the guest`
  )
  // Round 1 teaches no wind.
  for (const p of [host, guest]) {
    const early = (await dev(p, g => g.events(300))).filter(
      e => e.type === 'note' && Object.values(WIND_TIPS).includes(e.detail.text)
    )
    if (early.length) throw new Error(`${size}: a wind tip showed in round 1`)
  }

  // 4. Round 2's first gust gets the wind tip before it blows, with the line for that
  // gust in each page's own frame: a tailwind on one page is a headwind on the other.
  await dev(host, g => g.jump(170_000, 1))
  for (const p of [host, guest])
    await waitFor(p, s => s.matchPhase?.round === 1, { label: 'round 2' })
  // Biscuit's urgent tips would push a wind tip past its gust, as the queue intends.
  for (const p of [host, guest]) await dev(p, g => g.act.quietDog())
  // Let any tip on show finish on both pages, so neither wind tip waits behind one.
  for (const p of [host, guest])
    await until(
      p,
      () => !document.querySelector('[data-testid="tip"]'),
      null,
      'tip line busy',
      12_000
    )
  // A jump holds a page's frames for about 1s, and a frame that long raises no tips, so
  // land 6s before the gust: its vane swings 2s before it.
  const first = await toGust(host, guest, 0, 6000)
  if (first.kind !== 'over')
    throw new Error(`${size}: round 2 opens with ${first.kind}`)
  const t3 = await now(host)
  const lines = []
  for (const p of [host, guest]) {
    const blow = await event(p, 'gust', t3, `${size}: no round 2 gust`)
    const tip = (await dev(p, g => g.events(200))).find(
      e =>
        e.type === 'note' &&
        e.at >= t3 &&
        Object.values(WIND_TIPS).includes(e.detail.text)
    )
    if (!tip || tip.at >= blow.at) {
      const seen = (await dev(p, g => g.events(200)))
        .filter(e =>
          ['vane', 'gust', 'note', 'noteEnd', 'liveFrame', 'catchUp'].includes(
            e.type
          )
        )
        .map(e => `${e.at - t3} ${e.type} ${JSON.stringify(e.detail)}`)
      throw new Error(
        `${size}: wind tip ${JSON.stringify(tip)} not before the gust at ${blow.at - t3} ms:\n${seen.join('\n')}`
      )
    }
    const want = blow.detail.dir === 1 ? WIND_TIPS.tail : WIND_TIPS.head
    if (tip.detail.text !== want)
      throw new Error(
        `${size}: "${tip.detail.text}" for a gust with dir ${blow.detail.dir}`
      )
    lines.push(tip.detail.text)
  }
  if (lines[0] === lines[1])
    throw new Error(`${size}: both pages read "${lines[0]}"`)
  await shot(host, `wind-${size}-tip`)
  console.log(
    `${size}: round 2 wind tips before the gust: host "${lines[0]}", guest "${lines[1]}"`
  )
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
  console.log('wind: ok')
} finally {
  await browser.close()
}
