// M30 to M33, a new player's tips, on `?local` pages where A hosts on `?first=0` and B
// is a new player on `?first=1`. Pass one part's name to run it alone:
// - `lines`: every tip, toast and banner line fits 295 px at 18 px, and at four sizes a
//   tip sits on the fence with a gnome in row 1 in full view below it.
// - `stream`: a `?fast` round 1 gives B tips on the fence line, each shown at least 3s,
//   with the status line following them and toasts in the patio strip; A gets none until
//   Show Tips. A tip whose object sits behind the tip line may take the patio strip.
// - `hidden`: B hidden for 20s through a sprout, an arrival and a dig shows no tip and
//   marks none as seen; Biscuit's circle tip, waiting behind the tap tip as the hide
//   begins, never shows once B comes back, since he dug while B was hidden.
// - `reload`: B reloaded at 1:30 in round 1 replays neither the start tip nor the finger.
// - `stages`: a full-length round 1 shows the staged tips in order, none under 3s.
// - `pointers`, `still`, `clipped`, `catching`: M32's arrows and tip placement.
// - `ghost`, `ghoststill`, `banner`: M33's ghost finger and shed banner.
// - `coach`: M35's coach tip first in the round 2 and 3 countdowns, not after a reload.
import {
  BASE,
  dev,
  expectedCoach,
  frames,
  hold,
  launch,
  roomCode,
  settledBox,
  shot,
  SHOTS,
  sleep,
  SIZES,
  spokenText,
  tipNotes,
  waitFor,
  waitForNotice,
  watchErrors
} from './lib.mjs'

const ONLY = process.argv[2]
const START = 'Throw the gnomes over the fence.'

/** A on `?first=0` hosts; B is new with `?first=1`. */
async function pair(browser, size, query = '') {
  const context = await browser.newContext(SIZES[size])
  const code = roomCode()
  const a = await context.newPage()
  const b = await context.newPage()
  const errors = [watchErrors(a, 'A'), watchErrors(b, 'B')]
  const url = `${BASE}/r/${code}?local${query}`
  await a.goto(`${url}&pid=aaaaaaaa41&first=0`)
  await waitFor(a, s => s.admission === 'seated')
  await b.goto(`${url}&pid=zzzzzzzz41&first=1`)
  await waitFor(b, s => s.seats.length === 2)
  await waitFor(b, s => s.bestRtt < 1000, { label: 'clock sync' })
  return { context, a, b, url, check: () => errors.forEach(e => e.check()) }
}

async function start(a, b) {
  await dev(a, g => g.ready(true))
  await dev(b, g => g.ready(true))
  for (const p of [a, b])
    await waitFor(p, s => s.matchPhase?.kind === 'countdown', {
      label: 'countdown'
    })
}

/** Every line fits 295 px; then the tip sits on the fence over a gnome in row 1. */
async function lines(browser, size) {
  const { context, a, b, check } = await pair(browser, size, '&calm')
  await start(a, b)
  const tip = b.locator('[data-testid="tip"]')
  await tip.waitFor({ timeout: 5000 })
  if ((await tip.textContent()) !== START)
    throw new Error(
      `${size}: the countdown tip reads ${await tip.textContent()}`
    )
  // Once play starts, a gnome lies in row 1, right under the tip.
  await waitFor(b, s => s.matchPhase?.kind === 'play', { label: 'play' })
  await dev(b, g => g.spawnAt('gnome', 300, 50))
  await sleep(400)
  await tip.waitFor({ timeout: 1000 })
  const box = await settledBox(b, '[data-testid="tip"]')
  const lawnTop = await dev(b, g => g.toClient(300, 0))
  const gnome = await dev(b, g => g.toClient(300, 20))
  if (box.y + box.height > lawnTop.y + 1.5 || box.y + box.height > gnome.y)
    throw new Error(
      `${size}: the tip's bottom ${box.y + box.height} covers the lawn from ${lawnTop.y}`
    )
  await shot(b, `tips-${size}-fence-line`)
  if (size === 'se' || size === 'small') {
    const all = await dev(b, g => g.tipLines())
    // Every fetch variant is in the check, since the fetch tip names what Biscuit carries.
    for (const kind of [
      'weed',
      'dandelion',
      'seed clock',
      'seed',
      'gnome',
      'litter'
    ])
      if (!all.includes(`Biscuit has your ${kind}. Press it.`))
        throw new Error(`${size}: the width check lacks the ${kind} fetch tip`)
    const widths = await b.evaluate(all => {
      const line = document.querySelector('[data-testid="tip"]')
      const parent = line.parentElement
      // The line's own padding leaves this much room for a line inside it.
      const pad = parseFloat(getComputedStyle(parent).paddingLeft) * 2
      const room = parent.clientWidth - pad
      return all.map(text => {
        const copy = line.cloneNode(false)
        // Layout sizes ignore the pop-in's scale; the copy stays out of the way.
        copy.style.animation = 'none'
        copy.style.position = 'absolute'
        copy.style.visibility = 'hidden'
        const span = document.createElement('span')
        span.textContent = text
        copy.append(span)
        parent.append(copy)
        const width = span.offsetWidth
        const font = getComputedStyle(copy).fontSize
        const fits = copy.offsetWidth <= room
        copy.remove()
        return { text, width, font, fits, room }
      })
    }, all)
    const bad = widths.filter(
      w => w.width > 295 || !w.fits || w.font !== '18px'
    )
    if (bad.length)
      throw new Error(`${size}: lines too wide: ${JSON.stringify(bad)}`)
    const widest = widths.reduce((m, w) => (w.width > m.width ? w : m))
    const fetches = widths.filter(w => w.text.startsWith('Biscuit has your'))
    const widestFetch = fetches.reduce((m, w) => (w.width > m.width ? w : m))
    console.log(
      `${size}: widest fetch tip ${widestFetch.width.toFixed(0)} px, "${widestFetch.text}"`
    )
    console.log(
      `${size}: all ${widths.length} lines fit at 18 px; widest ${widest.width.toFixed(0)} px, "${widest.text}"`
    )
  }
  check()
  await context.close()
  console.log(`${size}: the tip sits on the fence with row 1 in view`)
}

/** B gets tips on the fence, each for 3s or more; A gets none until Show Tips. */
async function stream(browser, size) {
  const { context, a, b, check } = await pair(browser, size, '&fast')
  await start(a, b)
  const t0 = await dev(b, g => g.state().now)
  const texts = new Set()
  const statuses = new Set()
  // Tips first sampled in the patio strip whose object sat behind the tip line then.
  const behindLine = new Set()
  const until = Date.now() + 22_000
  let thrown = 0
  while (Date.now() < until) {
    const [tip, status, now] = await b.evaluate(() => [
      document.querySelector('[data-testid="tip"]')?.textContent ?? '',
      [...document.querySelectorAll('[role="status"]')]
        .map(el => el.textContent)
        .join('|'),
      window.__game.greener.tipNow()
    ])
    if (now && !texts.has(now.text) && now.spot === 'patio')
      if (now.ruleSpot === 'patio') behindLine.add(now.text)
    if (tip) texts.add(tip)
    if (tip) statuses.add(status)
    // A throws its gnomes at B now and then, so B gets "Throw it back".
    if (thrown < 3 && Date.now() > until - 18_000 + thrown * 3000) {
      const sent = await dev(a, g => {
        const gnome = g.garden().items.find(i => i.kind === 'gnome')
        return gnome ? g.act.throw(gnome.id, { speedPx: 1400 }) : false
      })
      if (sent) thrown++
    }
    await sleep(200)
  }
  const events = await dev(b, g => g.events(400))
  const shown = tipNotes(events, t0)
  if (shown.length < 3)
    throw new Error(`${size}: B saw ${shown.length} tips: ${[...texts]}`)
  // A tip moves to the patio strip only when its object sits behind the tip line.
  const moved = shown.filter(
    e => e.detail.spot !== 'fence' && !behindLine.has(e.detail.text)
  )
  if (moved.length)
    throw new Error(
      `${size}: a tip left the fence line: ${JSON.stringify(moved)}`
    )
  const ends = events.filter(e => e.type === 'noteEnd' && e.at >= t0)
  // Only an urgent tip's cut-in or the 0:00 clear may end a tip early; a cut tip shows again.
  const short = ends.filter(
    e => e.detail.shownMs < 3000 && e.detail.why === 'done'
  )
  const endAt = events.at(-1)?.at ?? 0
  for (const cut of ends.filter(e => e.detail.why === 'cut'))
    if (
      cut.at < endAt - 8000 &&
      !shown.some(e => e.at > cut.at && e.detail.text === cut.detail.text)
    )
      throw new Error(
        `${size}: "${cut.detail.text}" was cut and never came back`
      )
  if (short.length)
    throw new Error(`${size}: tips under 3s: ${JSON.stringify(short)}`)
  if (statuses.size < 2)
    throw new Error(`${size}: the status line never changed`)
  // A new player's toasts stay in the patio strip, under the props.
  await dev(b, g => g.act.setCan(0))
  await dev(b, g => g.act.water(7 * 12 + 6, 300))
  const toast = b.locator('[data-testid="toast"]')
  await toast.waitFor({ timeout: 2000 })
  const toastBox = await toast.boundingBox()
  const patioTop = await dev(b, g => g.toClient(300, 640))
  if (toastBox.y < patioTop.y)
    throw new Error(
      `${size}: the toast at ${toastBox.y} sits above the patio at ${patioTop.y}`
    )
  const aTips = tipNotes(await dev(a, g => g.events(400)), t0)
  if (aTips.length)
    throw new Error(`${size}: A saw tips: ${JSON.stringify(aTips)}`)
  await shot(b, `tips-${size}-stream`)
  // Show Tips gives A a new player's tips from now on.
  await dev(a, g => g.tips(true))
  const t1 = await dev(a, g => g.state().now)
  await dev(a, g => g.act.sprout(5 * 12 + 5))
  await waitFor(a, () => true)
  const deadline = Date.now() + 6000
  let aSaw = []
  while (!aSaw.length && Date.now() < deadline) {
    aSaw = tipNotes(await dev(a, g => g.events(100)), t1)
    await sleep(200)
  }
  if (!aSaw.length) throw new Error(`${size}: Show Tips gave A no tip`)
  check()
  await context.close()
  const patio = shown.filter(e => e.detail.spot === 'patio').length
  console.log(
    `${size}: B saw ${shown.length} tips, ${patio} in the patio strip over an object behind the tip line, none under 3s (${[...texts].join(' / ')}); A saw none until Show Tips`
  )
}

const TAP = 'Press the tap again within 8s, or it floods.'
const DIG = 'Press Biscuit now, or he digs a hole.'

/**
 * B hidden for 20s through a sprout, an arrival and a dig shows no tip and marks none
 * seen. Before the hide, the tap tip shows and Biscuit's circle tip waits behind it. He
 * digs while B is hidden, so his tip never shows once B comes back.
 */
async function hidden(browser) {
  // Seed 18's first weed sprouts at 5.0s, after the hide begins.
  const { context, a, b, check } = await pair(browser, 'desktop', '&seed=18')
  await start(a, b)
  await waitFor(b, s => s.matchPhase?.kind === 'play', { label: 'play' })
  await waitFor(b, () => true)
  const deadline0 = Date.now() + 4000
  while (!(await dev(b, g => g.tipSeen('start'))) && Date.now() < deadline0)
    await sleep(100)
  // The tap tip holds the line; Biscuit circles 0.3s later, and his urgent tip waits.
  await dev(b, g => g.act.tap())
  await dev(b, g => g.act.dig(300))
  const deadline1 = Date.now() + 2000
  while (
    (await dev(b, g => g.garden().biscuit.state)) !== 'circle' &&
    Date.now() < deadline1
  )
    await sleep(30)
  await sleep(150)
  const before = await dev(b, g => ({
    tip: g.tipNow()?.text ?? null,
    dog: g.garden().biscuit.state,
    played: g.state().matchPhase.elapsed
  }))
  if (before.tip !== TAP || before.dog !== 'circle')
    throw new Error(`hidden: before the hide ${JSON.stringify(before)}`)
  await dev(b, g => g.hide(20_000))
  const hiddenAt = await dev(b, g => g.state().now)
  await sleep(500)
  await dev(b, g => g.act.dig(1500))
  await dev(b, g => g.act.sprout(6 * 12 + 4))
  await dev(a, g => {
    const gnome = g
      .garden()
      .items.find(i => i.kind === 'gnome' && i.state === 'rest')
    return gnome && g.act.throw(gnome.id, { speedPx: 1400 })
  })
  await sleep(20_000)
  const backAt = await dev(b, g => g.state().now)
  const during = tipNotes(await dev(b, g => g.events(400)), hiddenAt).filter(
    e => e.at < backAt
  )
  if (during.length)
    throw new Error(`hidden: tips while hidden: ${JSON.stringify(during)}`)
  // The hidden events marked nothing seen; the start tip, shown before, stays seen.
  const seen = await dev(b, g =>
    ['start', 'weed', 'back', 'biscuit', 'snail'].map(id => [id, g.tipSeen(id)])
  )
  const marked = seen.filter(([id, on]) => on !== (id === 'start'))
  if (marked.length)
    throw new Error(`hidden: seen flags after the hide ${JSON.stringify(seen)}`)
  // Biscuit dug while B was hidden: his circle tip left the line, stale, unseen.
  await sleep(3500)
  const stale = tipNotes(await dev(b, g => g.events(400)), hiddenAt).filter(
    e => e.detail.text === DIG
  )
  if (stale.length)
    throw new Error(
      `hidden: the stale dig tip showed: ${JSON.stringify(stale)}`
    )
  await shot(b, 'tips-hidden-back')
  // Back on screen, the next trigger shows its tip.
  const since = await dev(b, g => g.state().now)
  await dev(b, g => g.act.dig(300))
  const deadline = Date.now() + 4000
  let dig = false
  while (!dig && Date.now() < deadline) {
    dig = tipNotes(await dev(b, g => g.events(200)), since).some(
      e => e.detail.text === DIG
    )
    if (!dig) await sleep(200)
  }
  if (!dig) throw new Error('hidden: the dig tip never showed after the hide')
  check()
  await context.close()
  console.log(
    `hidden: the tap tip showed and Biscuit's tip waited at ${(before.played / 1000).toFixed(1)}s; no tips while hidden, none marked seen, no stale dig tip, and the next dig's tip showed`
  )
}

const STAGES = [
  START,
  'Drag the weed out first, then swipe it up.',
  'Grab the snail before it slimes your grass.',
  'That came from next door. Throw it back.',
  'Hold still on brown grass until it sparkles.',
  DIG,
  'Mow slowly up and down a whole column.'
]

/**
 * A full-length round 1 on seed 18, whose idle lawn sprouts a weed at 5s, a snail at
 * 13.5s, a dry patch by 25s, Biscuit's first circle at 49.7s and a shaggy column at
 * 64.4s. A throws a gnome at B at 17s and B presses Biscuit while he circles. B sees the
 * staged tips in order, none under 3s, and only the dig tip from 2:20 to 2:05.
 */
async function stages(browser) {
  const { context, a, b, check } = await pair(browser, 'small', '&seed=18')
  await start(a, b)
  // Shared time when round 1's play starts; its countdown runs the 3s before.
  const playAt = await dev(b, g => g.state().match.at)
  const t0 = playAt - 3000
  await waitFor(b, s => s.matchPhase?.kind === 'play', { label: 'play' })
  const played = () => dev(b, g => g.state().matchPhase.elapsed ?? 0)
  let thrown = false
  let pressed = false
  while ((await played()) < 70_000) {
    const ms = await played()
    if (!thrown && ms >= 17_000) {
      thrown = await dev(a, g => {
        const gnome = g.garden().items.find(i => i.kind === 'gnome')
        return gnome ? g.act.throw(gnome.id, { speedPx: 1400 }) : false
      })
    }
    // B does what the dig tip says: press Biscuit while he circles.
    if (
      !pressed &&
      (await dev(b, g => g.garden().biscuit.state)) === 'circle'
    ) {
      const dog = await dev(b, g => g.biscuitClient())
      await b.mouse.click(dog.x, dog.y)
      pressed = true
      await shot(b, 'tips-stages-dig')
    }
    await sleep(200)
  }
  await sleep(3500)
  const events = await dev(b, g => g.events(600))
  const shown = tipNotes(events, t0).map(e => ({
    text: e.detail.text,
    playedMs: e.at - playAt
  }))
  const order = shown.map(e => e.text).filter(t => STAGES.includes(t))
  if (order.join('|') !== STAGES.join('|'))
    throw new Error(`stages: tips came as ${JSON.stringify(shown)}`)
  const ends = events.filter(e => e.type === 'noteEnd' && e.at >= t0)
  const short = ends.filter(
    e => e.detail.shownMs < 3000 && e.detail.why === 'done'
  )
  if (short.length)
    throw new Error(`stages: tips under 3s ${JSON.stringify(short)}`)
  const window = shown.filter(e => e.playedMs >= 40_000 && e.playedMs < 55_000)
  if (window.map(e => e.text).join() !== STAGES[5])
    throw new Error(`stages: from 2:20 to 2:05 B saw ${JSON.stringify(window)}`)
  if (!pressed || !events.some(e => e.type === 'sit'))
    throw new Error('stages: B never sat Biscuit')
  check()
  await context.close()
  console.log(
    `stages: ${shown.map(e => `${(e.playedMs / 1000).toFixed(1)}s "${e.text}"`).join(', ')}`
  )
}

/** Spawns a gnome at lawn point (lx, ly) and returns its id once it lies there. */
async function spawnGnome(page, lx, ly) {
  await dev(page, (g, p) => g.spawnAt('gnome', p.lx, p.ly), { lx, ly })
  for (let k = 0; k < 20; k++) {
    await sleep(50)
    const id = await dev(
      page,
      (g, p) =>
        g
          .garden()
          .items.findLast(
            i => i.kind === 'gnome' && Math.hypot(i.lx - p.lx, i.ly - p.ly) < 2
          )?.id,
      { lx, ly }
    )
    if (id) return id
  }
  throw new Error(`no gnome spawned at ${lx}, ${ly}`)
}

/** Waits for B's tip `id` to show and returns it from `tipNow()`. */
async function waitTip(page, id, timeout = 12_000) {
  const start = Date.now()
  let last = null
  while (Date.now() - start < timeout) {
    last = await dev(page, g => g.tipNow())
    if (last?.id === id) return last
    await sleep(100)
  }
  throw new Error(`no "${id}" tip; last ${JSON.stringify(last)}`)
}

/**
 * M32 at one size on a `?fast` round 1 of seed 18: the arrow on a snail, on the tap and
 * on a shaggy column with its outline, and none on Biscuit's dig circle.
 */
async function pointers(browser, size) {
  const { context, a, b, check } = await pair(browser, size, '&fast&seed=18')
  await start(a, b)
  const snail = await waitTip(b, 'snail')
  const crawler = await dev(
    b,
    (g, id) => g.garden().snails.find(s => s.id === id),
    snail.target.id
  )
  const at = await dev(b, (g, s) => g.toClient(s.lx, s.ly), crawler)
  if (
    !snail.arrow ||
    Math.abs(snail.arrow.x - at.x) > 20 ||
    snail.arrow.y > at.y
  )
    throw new Error(
      `${size}: snail arrow ${JSON.stringify(snail.arrow)} vs ${JSON.stringify(at)}`
    )
  await shot(b, `tips-${size}-arrow-snail`)
  await dev(b, g => g.act.tap())
  const tap = await waitTip(b, 'tap', 3000)
  if (!tap.arrow) throw new Error(`${size}: no arrow on the tap`)
  await sleep(200)
  await shot(b, `tips-${size}-arrow-tap`)
  await dev(b, g => g.act.tap())
  const dig = await waitTip(b, 'biscuit', 15_000)
  if (dig.arrow || dig.target)
    throw new Error(`${size}: the dig tip has an arrow`)
  await sleep(300)
  await shot(b, `tips-${size}-dig-no-arrow`)
  const mow = await waitTip(b, 'mow', 15_000)
  if (mow.target?.kind !== 'column' || !mow.arrow)
    throw new Error(`${size}: mow tip ${JSON.stringify(mow)}`)
  await sleep(300)
  await shot(b, `tips-${size}-arrow-column`)
  check()
  await context.close()
  console.log(
    `${size}: arrows on the snail, tap and column ${mow.target.col}; none on the dig`
  )
}

/** With Reduced Motion on, the arrow on the tap holds still. */
async function still(browser) {
  const context = await browser.newContext({
    ...SIZES.small,
    reducedMotion: 'reduce'
  })
  const code = roomCode()
  const a = await context.newPage()
  const b = await context.newPage()
  const errors = [watchErrors(a, 'A'), watchErrors(b, 'B')]
  const url = `${BASE}/r/${code}?local&calm`
  await a.goto(`${url}&pid=aaaaaaaa42&first=0`)
  await waitFor(a, s => s.admission === 'seated')
  await b.goto(`${url}&pid=zzzzzzzz42&first=1`)
  await waitFor(b, s => s.seats.length === 2)
  await waitFor(b, s => s.bestRtt < 1000, { label: 'clock sync' })
  await start(a, b)
  await waitFor(b, s => s.matchPhase?.kind === 'play', { label: 'play' })
  await dev(b, g => g.act.tap())
  const tip = await waitTip(b, 'tap', 3000)
  const clip = {
    x: tip.arrow.x - 24,
    y: tip.arrow.y - 50,
    width: 48,
    height: 56
  }
  const first = await b.screenshot({ clip })
  await sleep(300)
  const second = await b.screenshot({ clip })
  await b.screenshot({ path: `${SHOTS}/tips-still-arrow.png`, clip })
  if (!first.equals(second))
    throw new Error('still: the arrow moved under Reduced Motion')
  errors.forEach(e => e.check())
  await context.close()
  console.log('still: the arrow holds still under Reduced Motion')
}

/**
 * At 375 by 548 a gnome thrown too softly clips the fence and drops into the front rows
 * while a tip shows; the gnome stays in full view below the tip.
 */
async function clipped(browser) {
  const { context, a, b, check } = await pair(browser, 'se', '&calm')
  await start(a, b)
  await waitFor(b, s => s.matchPhase?.kind === 'play', { label: 'play' })
  const id = await spawnGnome(b, 300, 140)
  await dev(b, (g, id) => g.act.throw(id, { speedPx: 370 }), id)
  const landed = await waitTip(b, 'clip', 6000)
  const gnome = await dev(
    b,
    (g, id) => g.garden().items.find(i => i.id === id),
    id
  )
  const box = await settledBox(b, '[data-testid="tip"]')
  const top = await dev(b, (g, x) => g.toClient(x.lx, x.ly, 40), gnome)
  const patioTop = await dev(b, g => g.toClient(300, 640))
  // On the fence line the gnome sits clear below the tip; a gnome whose hat pokes above
  // the lawn's edge sends the tip to the patio strip instead.
  const clear =
    landed.spot === 'fence'
      ? top.y >= box.y + box.height
      : landed.spot === 'patio' && box.y >= patioTop.y - 1
  if (!clear)
    throw new Error(
      `clipped: the ${landed.spot} tip from ${box.y} to ${box.y + box.height} covers the gnome's top at ${top.y}`
    )
  await shot(b, 'tips-se-clipped-gnome')
  check()
  await context.close()
  console.log(
    `clipped: the gnome dropped back to ${Math.round(gnome.ly)} units, with the tip in the ${landed.spot === 'fence' ? 'fence line' : 'patio strip'}, clear of it`
  )
}

/** Round 3's catch tip shows in the patio strip while the throw falls. */
async function catching(browser) {
  const { context, a, b, check } = await pair(browser, 'small', '&calm')
  await start(a, b)
  await dev(a, g => g.jump(170_000, 2))
  for (const p of [a, b])
    await waitFor(
      p,
      s => s.matchPhase?.round === 2 && s.matchPhase.kind === 'play',
      {
        label: 'round 3'
      }
    )
  await sleep(1500)
  const id = await spawnGnome(a, 300, 400)
  await dev(a, (g, id) => g.act.throw(id, { speedPx: 1600 }), id)
  const tip = await waitTip(b, 'catch', 4000)
  const box = await settledBox(b, '[data-testid="tip"]')
  const patioTop = await dev(b, g => g.toClient(300, 640))
  if (tip.spot !== 'patio' || box.y < patioTop.y)
    throw new Error(
      `catching: the catch tip sits at ${box.y}, patio from ${patioTop.y}`
    )
  await shot(b, 'tips-small-catch')
  check()
  await context.close()
  console.log('catching: the catch tip showed in the patio strip')
}

/** A reload at 1:30 in round 1 never replays the start tip. */
async function reload(browser) {
  const { context, a, b, check } = await pair(browser, 'small')
  await start(a, b)
  await waitFor(b, s => s.matchPhase?.kind === 'play', { label: 'play' })
  await dev(a, g => g.jump(90_000))
  await sleep(1000)
  await b.reload()
  await waitFor(b, s => s.matchPhase?.kind === 'play' && s.gardenRound === 0, {
    label: 'B back in play'
  })
  await sleep(4000)
  const events = await dev(b, g => g.events(300))
  const frame = events.find(e => e.type === 'liveFrame')
  if (!frame || frame.detail.fresh)
    throw new Error(`reload: first live frame ${JSON.stringify(frame)}`)
  if (tipNotes(events).some(e => e.detail.text === START))
    throw new Error('reload: the start tip showed again')
  if (events.some(e => e.type === 'ghost'))
    throw new Error('reload: the ghost finger played again')
  check()
  await context.close()
  console.log('reload: a reload at 1:30 shows no start tip and no ghost finger')
}

/** Polls `ghostNow()` on `page` until `test` holds for it, and returns it. */
async function untilGhost(page, test, why, timeout = 6000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const ghost = await dev(page, g => g.ghostNow())
    if (ghost && test(ghost)) return ghost
    await sleep(30)
  }
  throw new Error(why)
}

/** A lawn point with nothing within 70 units, for a press that does nothing. */
async function barePoint(page) {
  const spot = await dev(page, g => {
    const garden = g.garden()
    const things = [...garden.weeds, ...garden.snails, ...garden.items]
    for (let row = 6; row < 14; row++)
      for (let col = 1; col < 11; col++) {
        const lx = col * 50 + 25
        const ly = row * 40 + 20
        if (things.every(t => Math.hypot(t.lx - lx, t.ly - ly) > 70))
          return { lx, ly }
      }
    return null
  })
  if (!spot) throw new Error('no bare lawn point')
  return dev(page, (g, p) => g.toClient(p.lx, p.ly), spot)
}

/**
 * M33 at one size: the ghost finger plays on B's nearest gnome in the countdown, then
 * once more at 0s, which B's first press stops at once. A sees no finger.
 */
async function ghost(browser, size) {
  const touch = size !== 'desktop'
  const { context, a, b, check } = await pair(browser, size, '&calm')
  await dev(a, g => g.ready(true))
  await dev(b, g => g.ready(true))
  const first = await untilGhost(b, () => true, `${size}: no countdown finger`)
  const phase = (await dev(b, g => g.state())).matchPhase?.kind
  if (first.stoppable || phase !== 'countdown')
    throw new Error(`${size}: first play ${JSON.stringify(first)} in ${phase}`)
  await untilGhost(
    b,
    g => g.elapsed >= 800,
    `${size}: the first play ended early`
  )
  await shot(b, `tips-${size}-ghost-countdown`)
  await waitFor(b, s => s.matchPhase?.kind === 'play', { label: 'play' })
  const second = await untilGhost(
    b,
    g => g.stoppable,
    `${size}: no finger at 0s`
  )
  if (second.id !== first.id)
    throw new Error(
      `${size}: the plays used gnomes ${first.id} and ${second.id}`
    )
  await untilGhost(
    b,
    g => g.elapsed >= 800,
    `${size}: the second play ended early`
  )
  await shot(b, `tips-${size}-ghost-swipe`)
  const gnome = await dev(
    b,
    (g, id) => g.garden().items.find(i => i.id === id),
    first.id
  )
  if (gnome.state !== 'rest')
    throw new Error(`${size}: the ghost moved the gnome`)
  await hold(b, await barePoint(b), 40, touch)
  if (await dev(b, g => g.ghostNow()))
    throw new Error(`${size}: a press didn't stop the finger`)
  await frames(b, 1)
  await shot(b, `tips-${size}-ghost-stopped`)
  const events = await dev(b, g => g.events(300))
  if (!events.some(e => e.type === 'ghostStop'))
    throw new Error(`${size}: no ghostStop logged`)
  if ((await dev(a, g => g.events(300))).some(e => e.type === 'ghost'))
    throw new Error(`${size}: A, a returning player, saw the finger`)
  check()
  await context.close()
  console.log(
    `${size}: the finger played in the countdown and at 0s on gnome ${first.id}, and a press stopped it`
  )
}

/** Under Reduced Motion the ghost finger is a still arrow from the gnome to the fence. */
async function ghostStill(browser) {
  const context = await browser.newContext({
    ...SIZES.small,
    reducedMotion: 'reduce'
  })
  const code = roomCode()
  const a = await context.newPage()
  const b = await context.newPage()
  const errors = [watchErrors(a, 'A'), watchErrors(b, 'B')]
  const url = `${BASE}/r/${code}?local&calm`
  await a.goto(`${url}&pid=aaaaaaaa43&first=0`)
  await waitFor(a, s => s.admission === 'seated')
  await b.goto(`${url}&pid=zzzzzzzz43&first=1`)
  await waitFor(b, s => s.seats.length === 2)
  await waitFor(b, s => s.bestRtt < 1000, { label: 'clock sync' })
  await start(a, b)
  await waitFor(b, s => s.matchPhase?.kind === 'play', { label: 'play' })
  // After "Mow!" goes, the arrow's column holds still.
  const ghost = await untilGhost(
    b,
    g => g.stoppable && g.elapsed >= 850,
    'no still arrow'
  )
  // A strip down the shaft, which the arrow covers whole: the drying lawn beside it
  // repaints now and then.
  const lawnTop = await dev(b, g => g.toClient(0, 0))
  const clip = {
    x: ghost.gnome.x - 1.5,
    y: lawnTop.y + 4,
    width: 3,
    height: ghost.gnome.y - lawnTop.y - 40
  }
  const one = await b.screenshot({
    clip,
    path: `${SHOTS}/tips-ghost-still-1.png`
  })
  await sleep(300)
  const two = await b.screenshot({
    clip,
    path: `${SHOTS}/tips-ghost-still-2.png`
  })
  // Both shots must fall inside the 2.4s play, or they compare nothing.
  if (!(await dev(b, g => g.ghostNow())))
    throw new Error('ghostStill: the play ended before the second shot')
  await shot(b, 'tips-ghost-still')
  if (!one.equals(two)) throw new Error('ghostStill: the arrow moved')
  errors.forEach(e => e.check())
  await context.close()
  console.log('ghostStill: a still arrow from the gnome to the fence')
}

/**
 * M33's shed banner at one size on a `?fast` round 1: it covers only the peek strip for
 * 3s, screen readers hear the full rule, and the shed tip follows. A sees no banner.
 */
async function banner(browser, size) {
  const { context, a, b, check } = await pair(browser, size, '&fast&calm')
  await start(a, b)
  await waitFor(b, s => s.matchPhase?.kind === 'play', { label: 'play' })
  // The shed opens with 10s left in a fast round; land 2s before it.
  await dev(a, g => g.jump(12_000))
  await frames(b)
  const el = b.locator('[data-testid="shed-banner"]')
  await el.waitFor({ timeout: 6000 })
  const shownAt = Date.now()
  const box = await settledBox(b, '[data-testid="shed-banner"]')
  const [peekTop, peekBottom] = [
    await dev(b, g => g.toClient(300, -140)),
    await dev(b, g => g.toClient(300, -40))
  ]
  if (box.y < peekTop.y - 0.5 || box.y + box.height > peekBottom.y + 0.5)
    throw new Error(
      `${size}: the banner ${JSON.stringify(box)} leaves the peek strip ${peekTop.y} to ${peekBottom.y}`
    )
  const spoken = await b.evaluate(() =>
    [...document.querySelectorAll('[role="status"]')]
      .map(e => e.textContent)
      .join('|')
  )
  if (!spoken.includes('Every gnome left on your grass at 0:00 costs a point.'))
    throw new Error(`${size}: screen readers hear ${spoken}`)
  // The accessibility tree holds the region's full sentence alone, not the visible line.
  const region = await spokenText(
    b,
    '[role="status"]:has(> [data-testid="shed-banner"])'
  )
  if (
    region?.role !== 'status' ||
    region.text !==
      "The shed's open. Every gnome left on your grass at 0:00 costs a point."
  )
    throw new Error(
      `${size}: the shed banner's region reads ${JSON.stringify(region)}`
    )
  await shot(b, `tips-${size}-shed-banner`)
  await el.waitFor({ state: 'detached', timeout: 5000 })
  const shownMs = Date.now() - shownAt
  await waitForNotice(b, 'Gnomes first. Then big junk, if you dare.', 5000)
  if (await a.locator('[data-testid="shed-banner"]').count())
    throw new Error(`${size}: A, a returning player, sees the banner`)
  if ((await dev(a, g => g.events(300))).some(e => e.type === 'banner'))
    throw new Error(`${size}: A logged a banner`)
  check()
  await context.close()
  console.log(
    `${size}: the banner covered only the peek strip for about ${Math.round(shownMs / 100) / 10}s, then the shed tip`
  )
}

/** Drops `n` gnomes across the middle of a page's lawn, so its Junk line loses big. */
function bury(page, n) {
  return dev(
    page,
    (g, n) => {
      for (let k = 0; k < n; k++) g.spawn('gnome', 48 + ((k * 7) % 96))
    },
    n
  )
}

/** Ends round `round` on both pages and waits for the next round's countdown on `page`. */
async function nextCountdown(host, page, round) {
  await dev(host, (g, r) => g.jump(800, r), round)
  await waitFor(
    page,
    s => s.matchPhase?.kind === 'countdown' && s.matchPhase.round === round + 1,
    { label: `round ${round + 2} countdown`, timeout: 30_000 }
  )
}

/**
 * Waits for the coach tip on `page` during round `round`'s countdown (from 0), checks it's
 * the round's first tip and that it matches Brenda's verdict on `page`'s lawn last round,
 * and returns its words.
 */
async function coachTip(page, round) {
  const start = Date.now()
  let tip = null
  while (Date.now() - start < 4000 && !tip) {
    const now = await dev(page, g => g.tipNow())
    if (now?.id === 'coach') tip = now
    else await sleep(50)
  }
  const s = await dev(page, g => g.state())
  if (!tip) throw new Error(`round ${round + 1}: no coach tip`)
  if (s.matchPhase?.kind !== 'countdown')
    throw new Error(
      `round ${round + 1}: the coach tip came in ${s.matchPhase?.kind}`
    )
  const events = await dev(page, g => g.events(300))
  const live = events.find(
    e => e.type === 'liveFrame' && e.detail.round === round
  )
  if (!live?.detail.fresh)
    throw new Error(
      `round ${round + 1}: no fresh first frame ${JSON.stringify(live)}`
    )
  const first = tipNotes(events, live.at)[0]
  if (first?.detail.text !== tip.text)
    throw new Error(
      `round ${round + 1}: the first tip was ${first?.detail.text}`
    )
  const last = s.results.find(r => r.round === round - 1)
  const me = s.role === 'host' ? 0 : 1
  const want = expectedCoach(last.scores[me], last.counts[me])
  if (tip.text !== want)
    throw new Error(
      `round ${round + 1}: the coach tip read "${tip.text}", not "${want}"`
    )
  return tip.text
}

/**
 * M35: B, the new player, loses round 1 under 20 gnomes, so round 2's countdown opens
 * with the coach tip from B's verdict. A, a returning player, gets none. B reloads in
 * round 2 and sees no coach tip again. A loses round 2, and round 3's countdown coaches B
 * on round 2.
 */
async function coach(browser, size) {
  const { context, a, b, check } = await pair(browser, size, '&fast&calm')
  await start(a, b)
  await waitFor(b, s => s.matchPhase?.kind === 'play', { label: 'play' })
  await bury(b, 20)
  await nextCountdown(a, b, 0)
  // Screen readers hear round 2's banner as one sentence.
  await b.getByTestId('round-banner').waitFor()
  const banner2 = await spokenText(b, '[data-testid="round-banner"]')
  const want2 =
    'Round 2: Dandelions. 1 weed in 4 is a dandelion. Its seed clock bursts where it lands.'
  if (banner2?.role !== 'status' || banner2.text !== want2)
    throw new Error(
      `${size}: round 2's banner reads ${JSON.stringify(banner2)}`
    )
  const line2 = await coachTip(b, 1)
  // Once its pop-in ends, so the screenshot shows the line as it reads.
  await settledBox(b, '[data-testid="tip"]')
  await shot(b, `tips-${size}-coach`)
  await waitFor(b, s => s.matchPhase?.kind === 'play', {
    label: 'round 2 play'
  })
  await sleep(1500)
  await b.reload()
  await waitFor(b, s => s.matchPhase?.kind === 'play' && s.gardenRound === 1, {
    label: 'B back in round 2'
  })
  await sleep(2500)
  const after = await dev(b, g => g.events(300))
  if (tipNotes(after).some(e => e.detail.text === line2))
    throw new Error(`${size}: the coach tip showed again after a reload`)
  await bury(a, 30)
  await nextCountdown(a, b, 1)
  const line3 = await coachTip(b, 2)
  if (tipNotes(await dev(a, g => g.events(300))).length)
    throw new Error(`${size}: A, a returning player, saw tips`)
  check()
  await context.close()
  console.log(`${size}: coach tips "${line2}" then "${line3}"`)
}

const browser = await launch()
try {
  if (!ONLY || ONLY === 'coach')
    for (const size of ['small', 'phone', 'desktop']) await coach(browser, size)
  if (!ONLY || ONLY === 'lines')
    for (const size of ['se', 'small', 'phone', 'desktop'])
      await lines(browser, size)
  if (!ONLY || ONLY === 'stream')
    for (const size of ['small', 'desktop']) await stream(browser, size)
  if (!ONLY || ONLY === 'hidden') await hidden(browser)
  if (!ONLY || ONLY === 'reload') await reload(browser)
  if (!ONLY || ONLY === 'ghost')
    for (const size of ['small', 'phone', 'desktop']) await ghost(browser, size)
  if (!ONLY || ONLY === 'ghoststill') await ghostStill(browser)
  if (!ONLY || ONLY === 'banner')
    for (const size of ['se', 'desktop']) await banner(browser, size)
  if (!ONLY || ONLY === 'stages') await stages(browser)
  if (!ONLY || ONLY === 'pointers')
    for (const size of ['small', 'phone', 'desktop'])
      await pointers(browser, size)
  if (!ONLY || ONLY === 'still') await still(browser)
  if (!ONLY || ONLY === 'clipped') await clipped(browser)
  if (!ONLY || ONLY === 'catching') await catching(browser)
  console.log('tips: ok')
} finally {
  await browser.close()
}
