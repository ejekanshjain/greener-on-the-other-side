// M12 lawn updates and the peek strip, on two ?local pages at three sizes. A gnome thrown
// into the other page's row 2 shows in the thrower's peek strip within 1.2s, with a puff
// and an angry head pop. A landing on row 10 puffs on the horizon with no marker. Lawn
// reports go out every second even when nothing changes. Screenshots show each round's
// sky lie: sunshine and a bird, a rainbow, then a sprinkler.
import {
  dev,
  launch,
  localPair,
  shot,
  sleep,
  startMatch,
  waitFor
} from './lib.mjs'

/** Waits until a dev query on `page` returns something truthy, or throws `why`. */
async function until(page, fn, arg, why, timeout = 4000) {
  const start = Date.now()
  for (;;) {
    const value = await dev(page, fn, arg)
    if (value) return value
    if (Date.now() - start > timeout) throw new Error(why)
    await sleep(30)
  }
}

/**
 * Throws one of `page`'s gnomes straight at the fence so it lands `depth` units past it,
 * and returns the gnome's lawn spot.
 */
async function throwGnome(page, depth, skip = []) {
  const gnome = await dev(
    page,
    (g, skip) =>
      g
        .garden()
        .items.find(
          i => i.kind === 'gnome' && i.state === 'rest' && !skip.includes(i.id)
        ),
    skip
  )
  if (!gnome) throw new Error('no gnome left to throw')
  // A throw flies 0.4 units per px/s, so it lands `depth` past the fence from depth ly.
  const speedPx = (gnome.ly + depth) / 0.4
  await dev(page, (g, a) => g.act.throw(a.id, { speedPx: a.speedPx }), {
    id: gnome.id,
    speedPx
  })
  return gnome
}

/** The newest landing event on `page` since shared time `since`. */
function landing(page, since) {
  return until(
    page,
    (g, since) =>
      g
        .events(80)
        .find(
          e => e.at >= since && e.type === 'land' && e.detail.fromNeighbour
        ),
    since,
    'the gnome never landed on the other page'
  )
}

async function run(browser, size) {
  const { a, b, check, context } = await localPair(browser, { size })
  await startMatch(a, b)

  // 1. Lawn reports flow both ways every second, even on an untouched lawn.
  const first = await until(
    a,
    g => g.neighbour().lawn && g.neighbour().lawnAt,
    undefined,
    `${size}: no lawn report arrived`,
    3000
  )
  await sleep(2100)
  const later = await dev(a, g => g.neighbour().lawnAt)
  if (later - first < 1800)
    throw new Error(`${size}: lawn reports stopped (${later - first} ms apart)`)
  const sent = await dev(a, g => g.net().sent.bundles)
  if (sent < 3) throw new Error(`${size}: only ${sent} bundles sent`)

  // 2. A gnome into their row 2 shows in the peek strip with a puff and a head pop.
  const since = await dev(a, g => g.state().now)
  const near = await throwGnome(a, 100)
  const landed = await landing(b, since)
  const row = Math.floor(landed.detail.landing.patch / 12)
  if (row !== 2) throw new Error(`${size}: the gnome landed on row ${row}`)
  const seen = await until(
    a,
    (g, patch) => {
      const n = g.neighbour()
      return n.lawn?.markers.some(m => m.patch === patch && m.kind === 'gnome')
        ? n
        : null
    },
    landed.detail.landing.patch,
    `${size}: the gnome never showed in the peek strip`,
    3000
  )
  const delay = seen.lawnAt - landed.at
  if (delay > 1200)
    throw new Error(
      `${size}: the peek strip took ${delay} ms to show the gnome`
    )
  const puff = seen.puffs.find(p => p.row === 2 && p.at === seen.lawnAt)
  const head = seen.heads.find(h => h.angry && h.at === seen.lawnAt)
  if (!puff || !head)
    throw new Error(`${size}: no puff or head pop: ${JSON.stringify(seen)}`)
  const mirrored = 600 - ((landed.detail.landing.patch % 12) * 50 + 25)
  if (puff.x !== mirrored)
    throw new Error(`${size}: puff at x ${puff.x}, expected ${mirrored}`)
  await sleep(120)
  await shot(a, `peek-${size}-row2`)
  console.log(
    `${size}: gnome on row 2 showed in the peek strip ${delay} ms after it landed, with a puff and a head pop`
  )

  // 3. A landing on row 10 puffs on the horizon and leaves no marker.
  await sleep(600)
  const since10 = await dev(a, g => g.state().now)
  await throwGnome(a, 420, [near.id])
  const deep = await landing(b, since10)
  const deepRow = Math.floor(deep.detail.landing.patch / 12)
  if (deepRow !== 10)
    throw new Error(`${size}: the second gnome landed on row ${deepRow}`)
  const after = await until(
    a,
    (g, since) => {
      const n = g.neighbour()
      return n.puffs.some(p => p.row === 10 && p.at > since) ? n : null
    },
    since10,
    `${size}: no horizon puff for the row 10 landing`,
    3000
  )
  if (after.lawn.markers.some(m => m.patch === deep.detail.landing.patch))
    throw new Error(`${size}: row 10 got a peek marker`)
  if (after.lawn.counts.gnomes !== 5)
    throw new Error(
      `${size}: their lawn reports ${after.lawn.counts.gnomes} gnomes, expected 5`
    )
  console.log(`${size}: row 10 landing puffed on the horizon with no marker`)

  // 4. Each round's sky lie, from both pages.
  await shot(b, `peek-${size}-round1`)
  for (const round of [1, 2]) {
    const host = (await dev(a, g => g.state().role)) === 'host' ? a : b
    if (!(await dev(host, (g, r) => g.jump(170_000, r), round)))
      throw new Error(`${size}: the jump to round ${round + 1} failed`)
    for (const p of [a, b])
      await waitFor(p, s => s.gardenRound === round, {
        label: `round ${round}`
      })
    await until(a, g => g.neighbour().lawn, undefined, 'no report after jump')
    await sleep(300)
    await shot(a, `peek-${size}-round${round + 1}`)
  }
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
  console.log('peek: ok')
} finally {
  await browser.close()
}
