// M8 and M9 chores on real pages: a held pour sparkles at about 0.8s and drowns at about
// 2.3s; a tap left on floods exactly 2 patches at 8s; an empty can shows its toast; a
// rub down a column stripes it for 75s; a 1,500 px/s rub scalps; a fast flick from grass
// never mows but snaps to a nearby item. Mouse on desktop, touch on phones.
import {
  BASE,
  dev,
  frames,
  hold,
  launch,
  mouseFlick,
  roomCode,
  shot,
  SIZES,
  sleep,
  startMatch,
  touchFlick,
  waitFor,
  waitForNotice,
  watchErrors
} from './lib.mjs'

/**
 * Two pages in one context with A as the host, in a full-length round. `?calm` keeps the
 * wind and Biscuit out of these chores, since the stripe check jumps past 2:20 left.
 */
async function hostPair(browser, size) {
  const context = await browser.newContext(SIZES[size])
  const code = roomCode()
  const a = await context.newPage()
  const b = await context.newPage()
  const ea = watchErrors(a, 'A')
  const eb = watchErrors(b, 'B')
  await a.goto(`${BASE}/r/${code}?local&calm&pid=aaaaaaaa77&first=1`)
  await waitFor(a, s => s.admission === 'seated')
  await b.goto(`${BASE}/r/${code}?local&calm&pid=zzzzzzzz77`)
  await waitFor(a, s => s.seats.length === 2)
  await waitFor(b, s => s.seats.length === 2)
  await startMatch(a, b)
  return { context, a, b, check: () => (ea.check(), eb.check()) }
}

/** Columns with no rooted weed or item, nearest column 3 first. */
async function clearColumns(page) {
  const g = await dev(page, g => g.garden())
  const busy = new Set([
    ...g.weeds.map(w => w.patch % 12),
    ...g.items.map(i => Math.floor(i.lx / 50))
  ])
  return [3, 4, 2, 5, 1, 6, 7, 8, 9, 10, 0, 11].filter(c => !busy.has(c))
}

/** A column and a near-fence start point with no weed, snail or item within 45 units. */
async function clearStart(page) {
  const g = await dev(page, g => g.garden())
  const things = [...g.weeds, ...g.snails, ...g.items]
  for (const col of [3, 4, 2, 5, 1, 6, 7, 8, 9, 10])
    for (const y of [45, 85, 125]) {
      const x = col * 50 + 25
      if (things.every(t => Math.hypot(t.lx - x, t.ly - y) > 45))
        return { col, y }
    }
  throw new Error('no clear place to start mowing')
}

/** A mid-lawn patch with nothing within 70 units of its centre. */
async function clearPatch(page) {
  const g = await dev(page, g => g.garden())
  const things = [...g.weeds, ...g.items]
  for (let row = 6; row < 12; row++)
    for (let col = 2; col < 10; col++) {
      const x = col * 50 + 25
      const y = row * 40 + 20
      if (things.every(t => Math.hypot(t.lx - x, t.ly - y) > 70))
        return { patch: row * 12 + col, x, y }
    }
  throw new Error('no clear patch')
}

const lastOf = (events, type, pred = () => true) =>
  [...events].reverse().find(e => e.type === type && pred(e.detail))

async function water(browser, size) {
  const touch = size !== 'desktop'
  const { a, b, check, context } = await hostPair(browser, size)
  await sleep(600)
  const spot = await clearPatch(a)
  await dev(a, (g, p) => g.setPatch(p, { health: 5 }), spot.patch)
  const point = await dev(a, (g, s) => g.toClient(s.x, s.y), spot)
  await Promise.all([
    // The pour starts 150 ms into the press and drowns the patch 2.3s later, so it
    // runs about 450 ms past the drown: 1 health step back, with 330 ms to spare.
    hold(a, point, 2900, touch),
    sleep(600).then(() => shot(a, `chores-${size}-pouring`))
  ])
  await sleep(200)
  const events = await dev(a, g => g.events(80))
  const start = lastOf(events, 'pourStart')
  const sparkle = lastOf(events, 'sparkle', d => d.patch === spot.patch)
  const drown = lastOf(events, 'drown', d => d.patch === spot.patch)
  if (!start || !sparkle || !drown)
    throw new Error(
      `${size}: missing pour events: ${JSON.stringify(events.map(e => e.type))}`
    )
  const sparkleMs = sparkle.at - start.at
  const drownMs = drown.at - start.at
  console.log(
    `water ${size}: sparkle ${sparkleMs} ms and drown ${drownMs} ms after the pour started`
  )
  if (Math.abs(sparkleMs - 800) > 120 || Math.abs(drownMs - 2300) > 150)
    throw new Error(
      `${size}: pour timings are off: ${events
        .filter(e => e.at >= start.at - 3000)
        .map(e => `${e.type}@${Math.round(e.at - start.at)}`)
        .join(' ')}`
    )
  const g = await dev(a, g => g.garden())
  // The pour went on after the drown, so the mud may have gained 1 health back. Each step
  // takes 400 ms of pour.
  if (g.health[spot.patch] > 3 || g.mess[spot.patch] !== 7)
    throw new Error(
      `${size}: the drowned patch isn't mud with a puddle (health ${g.health[spot.patch]}, mess ${g.mess[spot.patch]})`
    )
  if (g.blame.drowned < 1) throw new Error(`${size}: drowning wasn't blamed`)
  const notes = events.filter(e => e.type === 'note').map(e => e.detail.text)
  if (!notes.includes('Sparkling means full. Stop pouring.'))
    throw new Error(`${size}: no sparkle tip: ${JSON.stringify(notes)}`)
  await shot(a, `chores-${size}-drowned`)

  // The tap: on, a full can sits under it, it floods the 2 patches nearest it at 8s.
  const tap = await dev(a, g => g.toClient(40, 680))
  await hold(a, tap, 60, touch)
  await sleep(300)
  if (!(await dev(a, g => g.garden().water.tapOn)))
    throw new Error(`${size}: pressing the tap didn't turn it on`)
  await waitForNotice(a, 'Press the tap again within 8s, or it floods.', 6000)
  await shot(a, `chores-${size}-tap`)
  const ranFor = await dev(a, g => g.garden().water.tapRunMs)
  await sleep(8300 - ranFor)
  const flood = lastOf(await dev(a, g => g.events(80)), 'flood')
  if (!flood || flood.detail.patches.length !== 2)
    throw new Error(`${size}: no 2-patch flood at 8s`)
  const after = await dev(a, g => g.garden())
  const puddles = after.mess.flatMap((m, i) => (m === 7 ? [i] : []))
  console.log(
    `tap ${size}: flooded ${flood.detail.patches} (puddles now ${puddles})`
  )
  for (const p of flood.detail.patches)
    if (after.health[p] !== 2 || after.mess[p] !== 7)
      throw new Error(`${size}: flooded patch ${p} isn't mud`)
  await shot(a, `chores-${size}-flood`)
  await hold(a, tap, 60, touch)
  await sleep(200)
  if (await dev(a, g => g.garden().water.tapOn))
    throw new Error(`${size}: the tap didn't turn off`)

  // An empty can glugs and shows its toast.
  await dev(a, g => g.act.setCan(0))
  await hold(a, point, 500, touch)
  await waitForNotice(a, "The can's empty. Press the tap to fill it.", 1000)
  await shot(a, `chores-${size}-empty`)
  check()
  await context.close()
}

function rub(page, from, to, speedPx, holdMs, touch) {
  return touch
    ? touchFlick(page, from, to, speedPx, { holdMs })
    : mouseFlick(page, from, to, speedPx, { holdMs })
}

async function mow(browser, size) {
  const touch = size !== 'desktop'
  const { a, b, check, context } = await hostPair(browser, size)
  await sleep(600)
  const [col] = await clearColumns(a)
  const top = await dev(a, (g, c) => g.toClient(c * 50 + 25, 45), col)
  const bottom = await dev(a, (g, c) => g.toClient(c * 50 + 25, 668), col)
  const before = (await dev(a, g => g.garden())).t
  await rub(a, top, bottom, 600, 0, touch)
  const after = (await dev(a, g => g.garden())).t
  await sleep(250)
  let g = await dev(a, g => g.garden())
  const cuts = (await dev(a, g => g.events(80))).filter(
    e => e.type === 'cut'
  ).length
  console.log(
    `mow ${size}: column ${col} rubbed at 600 px/s, ${cuts} cuts, bag ${g.mower.bag}, stripes ${g.stripes.toString(2)}`
  )
  if (!(g.stripes & (1 << col)))
    throw new Error(`${size}: the rub didn't stripe column ${col}`)
  if (g.blame.scalped) throw new Error(`${size}: a 600 px/s rub scalped`)
  await shot(a, `chores-${size}-stripe`)

  // The stripe lasts 75s: jump the host's round to 74s after the rub began, then to 76s
  // after it ended. Garden time runs from the round's start, so msLeft is 180s minus it.
  // Weeds and snails arrive meanwhile and may break the stripe, so count short patches.
  const shortIn = async c =>
    (await dev(a, g => g.garden())).length.filter(
      (l, i) => i % 12 === c && l <= 1
    ).length
  await dev(a, (g, ms) => g.jump(ms), 180_000 - (before + 74_000))
  await sleep(500)
  const at74 = await shortIn(col)
  await dev(a, (g, ms) => g.jump(ms), 180_000 - (after + 76_000))
  await sleep(500)
  // The jump's catch-up can stall frames for a moment; real presses wait it out.
  await frames(a)
  const at76 = await shortIn(col)
  console.log(
    `mow ${size}: column ${col} has ${at74} short patches 74s after the rub, ${at76} at 76s`
  )
  if (at74 < 14 || at76 >= 14)
    throw new Error(`${size}: the stripe didn't last 75s`)
  await shot(a, `chores-${size}-later`)

  // A fast flick from grass far from anything never mows.
  const empty = await dev(a, g => {
    const garden = g.garden()
    const things = [...garden.weeds, ...garden.items, ...garden.snails]
    for (let y = 120; y < 600; y += 40)
      for (let x = 75; x < 540; x += 50)
        if (things.every(t => Math.hypot(t.lx - x, t.ly - y) > 110))
          return g.toClient(x, y)
    return null
  })
  if (empty) {
    const before = g.mower.bag
    await rub(a, empty, { x: empty.x + 5, y: empty.y - 150 }, 1600, 0, touch)
    await sleep(200)
    g = await dev(a, g => g.garden())
    if (g.mower.bag !== before)
      throw new Error(`${size}: a fast flick from grass mowed`)
    console.log(`mow ${size}: a fast flick from grass mowed nothing`)
  }

  // A fast flick that just misses a gnome snaps to it and throws it. The hand needs 0.4s
  // after any throw, so wait that out first.
  await sleep(500)
  const gnome = g.items.find(i => i.kind === 'gnome' && i.state === 'rest')
  if (gnome) {
    const p = await dev(a, (g, id) => g.targetClient(id), gnome.id)
    const scale = await dev(a, g => g.toClient(1, 0).x - g.toClient(0, 0).x)
    const miss = { x: p.x, y: p.y + 34 * scale }
    await rub(a, miss, { x: miss.x, y: miss.y - 200 }, 1600, 0, touch)
    await sleep(300)
    const thrown = (await dev(a, g => g.events(20))).some(
      e => e.type === 'throw' && e.detail.id === gnome.id
    )
    console.log(
      `mow ${size}: a fast flick ${34} units below a gnome threw it: ${thrown}`
    )
    if (!thrown)
      throw new Error(
        `${size}: the fast flick didn't snap to the gnome: ${JSON.stringify((await dev(a, g => g.events(14))).map(e => [e.type, e.detail?.id ?? e.detail?.reason ?? '']))} gnome ${gnome.id}`
      )
  }

  // A 1,500 px/s rub scalps, and Brenda will hear about it.
  // Weeds and snails have arrived by now, so start where nothing can be grabbed.
  const start = await clearStart(a)
  const scalpCol = start.col
  const top2 = await dev(a, (g, p) => g.toClient(p.col * 50 + 25, p.y), start)
  const bottom2 = await dev(a, (g, c) => g.toClient(c * 50 + 25, 668), scalpCol)
  await Promise.all([
    rub(a, top2, bottom2, 1500, 160, touch),
    sleep(420).then(() => shot(a, `chores-${size}-mowing`))
  ])
  await sleep(250)
  g = await dev(a, g => g.garden())
  const scalps = g.mess.filter(m => m === 6).length
  console.log(
    `mow ${size}: column ${scalpCol} rubbed at 1,500 px/s scalped ${g.blame.scalped} patches (${scalps} scalp marks)`
  )
  if (g.blame.scalped < 1)
    throw new Error(`${size}: a 1,500 px/s rub didn't scalp`)
  await shot(a, `chores-${size}-scalp`)

  check()
  await context.close()
}

const browser = await launch()
try {
  const only = process.argv[2]
  if (only !== 'mow')
    for (const size of ['desktop', 'phone']) await water(browser, size)
  if (only !== 'water')
    for (const size of ['desktop', 'phone', 'small']) await mow(browser, size)
  console.log('chores: ok')
} finally {
  await browser.close()
}
