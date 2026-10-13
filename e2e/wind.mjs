// M15 wind on two ?local pages at three sizes. Both pages swing the vane and start each
// gust at the same moment. An over-fence gust is a tailwind on one page and a headwind on
// the other, checked with a real swipe on each page during the same gust. An along gust
// pushes the two pages opposite ways in their own frames.
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

/** Jumps the host so the vane of gust `k` swings 1.5s from now, and waits on both pages. */
async function toGust(host, guest, k) {
  const { roundMs } = (await dev(host, g => g.state())).match
  const gust = (await wind(host)).gusts[k]
  const at = gust.at - 3500
  await dev(host, (g, ms) => g.jump(ms), roundMs - at)
  for (const p of [host, guest])
    await until(p, (g, t) => g.garden().t >= t, at, 'no catch-up')
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
  const { a, b, check, context } = await localPair(browser, { size })
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
  const notes = (await dev(host, g => g.events(150)))
    .filter(e => e.type === 'note')
    .map(e => e.detail.text)
  if (!notes.includes("Wind's coming. Throw with it."))
    throw new Error(`${size}: no wind tip`)
  console.log(
    `${size}: the along gust blows ${ha.side} on the host, ${ga.side} on the guest`
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
