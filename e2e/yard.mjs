// M44 and M45, the yard in the lobby. A on `?first=0` hosts and presses Ready; B opens the
// room link from empty storage, so B is new (touch at 375 by 548, 375 by 667 and 390 by
// 844, the mouse at 1280 by 800). Each size runs:
// - Try the Yard on B's card only; B opens it, focus lands on "The Yard", A's line reads
//   "… is trying the yard (1 of 3)." within 2.5s and follows each step, and B's Ready in
//   the panel never pulses though A is Ready;
// - the bar, panel and step line clear of each step's object;
// - step 1 by real input with its peek-strip puff; How to Play and Back return to step 2
//   with focus on How to Play; Skip returns the card with focus on Ready, which pulses;
// - Try the Yard again, a plain button now, starts from step 1, and all 3 steps by real
//   input: the back-row weed dragged out, thrown too softly so it clips with the clip tip
//   while the step stays open, then over; the column mown into a stripe and "That's a
//   stripe. Yard done." before the card comes back with focus on Ready;
// - the match: B's round 1 shows the start tip and the dig tip, never the weed or mow tip;
// - A's lawn and log untouched, and B sending only hello and sync during the yard.
// `ready`: B presses Ready inside the yard with A Ready and a pointer held on the lawn: the
// countdown starts, the yard closes at once, focus moves to the menu button, the held
// pointer does nothing in round 1, and B's garden at play start is the seed's fresh one.
// `still` shoots the 3 still arrows under Reduced Motion. `practice` checks Try the Yard
// in a new player's Practice lobby and Start's pulse once it's finished. `pusher` shows
// B's yard line on A over real Pusher within 3s in under 30 client events.
//
// Usage: node e2e/yard.mjs [se|small|phone|desktop|ready|still|practice|pusher] [size]
import {
  BASE,
  dev,
  heldPointer,
  launch,
  mouseFlick,
  roomCode,
  settledBox,
  shot,
  SIZES,
  sleep,
  touchFlick,
  waitFor,
  watchErrors
} from './lib.mjs'

const ONLY = process.argv[2]
const SIZE_ARG = process.argv[3]
const LINES = {
  throw: 'Throw the gnome over the fence.',
  pull: 'Drag the weed until it pops out.',
  swipe: 'Now swipe it up hard at the fence.',
  mow: 'Mow slowly up and down this column.',
  done: "That's a stripe. Yard done."
}
const TIPS = {
  start: 'Throw the gnomes over the fence.',
  dig: 'Press Biscuit now, or he digs a hole.',
  weed: 'Drag the weed out first, then swipe it up.',
  mow: 'Mow slowly up and down a whole column.'
}
const CLIP_TIP = 'Too soft. It clipped the fence.'
/** Drawn radius and lift of the step objects, in lawn units, for the box checks. */
const RADIUS = { gnome: 18, weed: 16 }
/** Garden events only a press makes. */
const PRESS_EVENTS = [
  'throw',
  'putDown',
  'tired',
  'rooted',
  'miss',
  'catch',
  'pourStart',
  'cut',
  'scalp',
  'mowEnd',
  'yank',
  'grip',
  'tap',
  'sit'
]

/**
 * One context with empty storage: A on `?first=0` hosts, and B opens the plain room link,
 * as a friend's copied link, so B counts as new.
 */
async function pair(browser, options, query = '') {
  const context = await browser.newContext({ ...options, fresh: true })
  const code = roomCode()
  const a = await context.newPage()
  const b = await context.newPage()
  const errors = [watchErrors(a, 'A'), watchErrors(b, 'B')]
  const url = `${BASE}/r/${code}?local${query}`
  await a.goto(`${url}&pid=aaaaaaaa45&first=0&name=Gnome%20Hoarder`)
  await waitFor(a, s => s.admission === 'seated')
  await b.goto(`${url}&name=Compost%20Mentis`)
  await waitFor(b, s => s.seats.length === 2 && s.first.now)
  await waitFor(a, s => s.seats.length === 2 && s.first.peer)
  const seatedAt = Date.now()
  return {
    context,
    a,
    b,
    seatedAt,
    check: () => errors.forEach(e => e.check())
  }
}

const yard = page => dev(page, g => g.yard())

/** Waits until `test` holds for the page's `yard()`, and returns it. */
async function untilYard(page, test, why, timeout = 8000) {
  const start = Date.now()
  let last = null
  while (Date.now() - start < timeout) {
    last = await yard(page)
    if (test(last)) return last
    await sleep(60)
  }
  throw new Error(`${why}: yard ${JSON.stringify(last)}`)
}

/** Waits for the ghost finger showing `move`, `atMs` into its play. */
async function ghostAt(page, move, atMs, why) {
  const start = Date.now()
  while (Date.now() - start < 6000) {
    const ghost = await dev(page, g => g.ghostNow())
    if (ghost?.move === move && ghost.elapsed >= atMs) return ghost
    await sleep(30)
  }
  throw new Error(`${why}: no ${move} ghost finger`)
}

/** Waits for the ghost finger to end. */
async function ghostGone(page) {
  const start = Date.now()
  while (Date.now() - start < 4000) {
    if (!(await dev(page, g => g.ghostNow()))) return
    await sleep(60)
  }
  throw new Error('the ghost finger never ended')
}

/**
 * Waits until the tip line reads `text`, both as `tipNow()` has it and on screen, which
 * follows within a 50 ms pump, and returns the tip as `tipNow()` has it.
 */
async function lineReads(page, text, why, timeout = 6000) {
  const start = Date.now()
  let tip = null
  while (Date.now() - start < timeout) {
    tip = await dev(page, g => g.tipNow())
    const shown = await page.evaluate(
      () => document.querySelector('[data-testid="tip"]')?.textContent ?? null
    )
    if (tip?.text === text && shown === text) return tip
    await sleep(50)
  }
  throw new Error(`${why}: the line read ${JSON.stringify(tip)}`)
}

/** Waits until A's pinned status line reads `text`; returns how long it took in ms. */
async function statusReads(page, text, why, timeout = 4000) {
  const start = Date.now()
  let seen = null
  while (Date.now() - start < timeout) {
    seen = await page
      .getByTestId('lobby-status')
      .textContent({ timeout: 200 })
      .catch(() => null)
    if (seen === text) return Date.now() - start
    await sleep(50)
  }
  throw new Error(`${why}: the status line read ${JSON.stringify(seen)}`)
}

/** What has keyboard focus, as tag:text. */
const focused = page =>
  page.evaluate(() => {
    const el = document.activeElement
    return `${el?.tagName.toLowerCase()}:${el?.textContent?.trim()}`
  })

/** Client box of an element by test id, or null. */
const boxOf = (page, id) => settledBox(page, `[data-testid="${id}"]`)

/**
 * Checks the step's line and its arrow sit clear of its object, and that the yard bar and
 * panel don't reach it: the line and bar end above the object's drawn top, the arrow's
 * point sits above it, and the panel starts below its drawn bottom.
 */
async function clearOf(page, id, kind, label) {
  const tipBox = await boxOf(page, 'tip')
  const bar = await boxOf(page, 'yard-bar')
  const panel = await boxOf(page, 'yard-panel')
  const tip = await dev(page, g => g.tipNow())
  const at = await dev(page, (g, id) => g.targetClient(id), id)
  const scale = await dev(page, g => g.toClient(1, 0).x - g.toClient(0, 0).x)
  const top = at.y - RADIUS[kind] * scale
  const bottom = at.y + RADIUS[kind] * scale
  if (!tipBox || !bar || !panel)
    throw new Error(`${label}: no line, bar or panel`)
  if (tipBox.y + tipBox.height > top)
    throw new Error(
      `${label}: the line's bottom ${tipBox.y + tipBox.height} covers the ${kind} from ${top}`
    )
  if (bar.y + bar.height > top)
    throw new Error(`${label}: the bar reaches the ${kind}`)
  if (panel.y < bottom)
    throw new Error(
      `${label}: the panel's top ${panel.y} covers the ${kind} to ${bottom}`
    )
  if (!tip.arrow || tip.arrow.y > top + 1)
    throw new Error(
      `${label}: the arrow ${JSON.stringify(tip.arrow)} sits on the ${kind}`
    )
}

/** Checks the bar, panel and line leave a column's whole length in view. */
async function columnClear(page, col, label) {
  const tipBox = await boxOf(page, 'tip')
  const bar = await boxOf(page, 'yard-bar')
  const panel = await boxOf(page, 'yard-panel')
  const top = await dev(page, (g, c) => g.toClient(c * 50 + 25, 0), col)
  const bottom = await dev(page, (g, c) => g.toClient(c * 50 + 25, 640), col)
  if (tipBox.y + tipBox.height > top.y + 1.5 || bar.y + bar.height > top.y)
    throw new Error(`${label}: the line or bar covers the column's top`)
  if (panel.y < bottom.y - 1)
    throw new Error(`${label}: the panel covers the column's bottom`)
}

/** A flick by touch or by the real mouse. */
function flick(page, from, to, speedPx, touch) {
  return touch
    ? touchFlick(page, from, to, speedPx)
    : mouseFlick(page, from, to, speedPx)
}

/** The page's shared clock now. */
const clockNow = page => dev(page, g => g.state().now)

/** Garden events of `type` the page logged since shared time `since`. */
async function eventsOf(page, type, since) {
  const log = await dev(page, g => g.events(200))
  return log.filter(e => e.type === type && e.at >= since)
}

/** Whether the element carries the Ready pulse. */
const pulses = locator =>
  locator.evaluate(el => el.classList.contains('ready-pulse'))

/** Step 1: the gnome thrown over the fence by real input, with its peek-strip puff. */
async function throwGnome(b, size, touch) {
  const y = await yard(b)
  const gnome = await dev(b, (g, id) => g.targetClient(id), y.id)
  const since = await clockNow(b)
  await flick(b, gnome, { x: gnome.x, y: gnome.y - 220 }, 1500, touch)
  await untilYard(b, y => y.step === 1, `${size}: the gnome went over`)
  const [cross] = await eventsOf(b, 'cross', since)
  if (!cross) throw new Error(`${size}: no crossing for the gnome`)
  const puffs = await dev(b, g => g.neighbour().puffs)
  if (!puffs.some(p => p.row === 0 && p.kind === 'gnome'))
    throw new Error(
      `${size}: no puff in the peek strip: ${JSON.stringify(puffs)}`
    )
}

/**
 * Step 2 by real input: the back-row weed dragged out sideways, thrown too softly so it
 * clips and drops back with the clip tip while the step stays open, then thrown over.
 */
async function pullWeed(b, size, touch) {
  const scale = await dev(b, g => g.toClient(1, 0).x - g.toClient(0, 0).x)
  let y = await yard(b)
  const root = (await dev(b, g => g.garden())).weeds.find(w => w.id === y.id)
  const weedAt = await dev(b, (g, id) => g.targetClient(id), y.id)
  const hand = heldPointer(b, touch)
  await hand.down(weedAt)
  const out = { x: weedAt.x - 70 * scale, y: weedAt.y }
  await hand.move(weedAt, out, 300)
  await untilYard(b, y => y.pulled, `${size}: the weed popped out`, 2000)
  await lineReads(b, LINES.swipe, `${size} pulled`)
  // Held 100 units from its root at most, it lets go about 92 units nearer the fence.
  const releaseLy = root.ly - 92
  const softPx = 2.72 * releaseLy
  const since = await clockNow(b)
  await hand.move(
    out,
    { x: out.x, y: out.y - 150 * scale },
    (150 * scale * 1000) / softPx
  )
  await hand.up()
  const clipStart = Date.now()
  let clip = null
  while (Date.now() - clipStart < 3000 && !clip) {
    ;[clip] = await eventsOf(b, 'clip', since)
    if (!clip) await sleep(40)
  }
  if (!clip) {
    const log = (await dev(b, g => g.events(30))).map(e => e.type)
    throw new Error(
      `${size}: the soft throw at ${softPx.toFixed(0)} px/s didn't clip: ${log}`
    )
  }
  await lineReads(b, CLIP_TIP, `${size} clip tip`, 4000)
  await settledBox(b, '[data-testid="tip"]')
  await shot(b, `yard-${size}-2-clip`)
  if ((await yard(b)).step !== 1)
    throw new Error(`${size}: a clip finished the weed step`)
  await lineReads(b, LINES.swipe, `${size} after the clip tip`, 5000)
  y = await yard(b)
  const dropped = await dev(b, (g, id) => g.targetClient(id), y.id)
  await flick(b, dropped, { x: dropped.x, y: dropped.y - 200 }, 1500, touch)
  await untilYard(b, y => y.step === 2, `${size}: the weed went over`)
  return softPx
}

/** Step 3 by real input: a slow rub down the shaggy column and back stripes it. */
async function mowColumn(b, size, touch) {
  const y = await yard(b)
  const top = await dev(b, (g, c) => g.toClient(c * 50 + 25, 45), y.col)
  const bottom = await dev(b, (g, c) => g.toClient(c * 50 + 25, 668), y.col)
  await (touch
    ? touchFlick(b, top, bottom, 600, { holdMs: 0 })
    : mouseFlick(b, top, bottom, 600, { holdMs: 0 }))
  await untilYard(b, y => y.step === 3, `${size}: the column striped`, 3000)
}

/** Records the page's notes and events across a round, past the 200-event log. */
function recorder(page) {
  const seen = new Map()
  return {
    async pull() {
      for (const e of await dev(page, g => g.events(200)).catch(() => []))
        seen.set(`${e.at}|${e.type}|${JSON.stringify(e.detail)}`, e)
    },
    all: () => [...seen.values()].sort((x, y) => x.at - y.at)
  }
}

async function run(browser, size) {
  const touch = size !== 'desktop'
  const { context, a, b, seatedAt, check } = await pair(
    browser,
    SIZES[size],
    '&fast'
  )
  const aLawn = await dev(a, g => JSON.stringify(g.garden()))
  const aSince = await clockNow(a)
  const bName = (await dev(b, g => g.state())).me.name

  // Try the Yard leads B's card only, with Ready beside it.
  const tryYard = b.getByRole('button', { name: 'Try the Yard' })
  await tryYard.waitFor()
  if (await a.getByRole('button', { name: 'Try the Yard' }).count())
    throw new Error(`${size}: A, a returning player, sees Try the Yard`)
  await a.getByRole('button', { name: 'Ready', exact: true }).click()
  await waitFor(b, s => s.peer?.ready === true, { label: 'A ready on B' })
  await b.waitForTimeout(300)
  await shot(b, `yard-${size}-card`)

  // B opens the yard: focus on "The Yard", and A's line within 2.5s.
  await tryYard.click()
  const openedAt = Date.now()
  await untilYard(b, y => y.open && y.step === 0, `${size}: the yard opened`)
  if (await b.getByRole('heading', { name: 'The Garden Gate' }).count())
    throw new Error(`${size}: the lobby card still shows over the yard`)
  const lag = await statusReads(
    a,
    `${bName} is trying the yard (1 of 3).`,
    `${size}: A's yard line`,
    3000
  )
  const total = Date.now() - openedAt
  if (total > 2500)
    throw new Error(`${size}: A's yard line took ${total} ms (polled ${lag})`)
  await shot(a, `yard-${size}-a-line`)
  if ((await focused(b)) !== 'h1:The Yard')
    throw new Error(
      `${size}: the yard opened with focus on ${await focused(b)}`
    )
  const panelReady = b
    .getByTestId('yard-panel')
    .getByRole('button', { name: 'Ready', exact: true })
  if (await pulses(panelReady))
    throw new Error(`${size}: B's Ready pulses inside the yard`)

  // Step 1: the ghost finger shows the throw, then the line points at the gnome.
  await ghostAt(b, 'throw', 900, `${size} step 1`)
  await shot(b, `yard-${size}-1-ghost`)
  await ghostGone(b)
  let y = await yard(b)
  await lineReads(b, LINES.throw, `${size} step 1`)
  await clearOf(b, y.id, 'gnome', `${size} step 1`)
  await shot(b, `yard-${size}-1-line`)
  await throwGnome(b, size, touch)
  await shot(b, `yard-${size}-1-puff`)
  await statusReads(
    a,
    `${bName} is trying the yard (2 of 3).`,
    `${size}: A follows step 2`,
    3000
  )
  // A's screen reader hears each step change from the live region.
  const heard = await a.evaluate(
    () => document.querySelector('p[aria-live="polite"]')?.textContent
  )
  if (heard !== `${bName} is trying the yard (2 of 3).`)
    throw new Error(`${size}: A's live region says ${JSON.stringify(heard)}`)

  // How to Play and Back return to the same step, with focus on How to Play.
  await b
    .getByTestId('yard-bar')
    .getByRole('button', { name: 'How to Play' })
    .click()
  await b.getByRole('heading', { name: 'How to Play' }).waitFor()
  if (await b.getByTestId('yard-bar').count())
    throw new Error(`${size}: the yard bar shows over How to Play`)
  await b.waitForTimeout(400)
  await shot(b, `yard-${size}-how-to-play`)
  await b.getByRole('button', { name: 'Back' }).click()
  await b.getByTestId('yard-bar').waitFor()
  y = await yard(b)
  if (!y.open || y.step !== 1 || y.help)
    throw new Error(`${size}: Back returned to ${JSON.stringify(y)}`)
  if ((await focused(b)) !== 'button:How to Play')
    throw new Error(`${size}: Back left focus on ${await focused(b)}`)
  if ((await b.getByTestId('yard-step').textContent()) !== 'Step 2 of 3')
    throw new Error(`${size}: the bar lost its step`)
  await ghostGone(b).catch(() => {})
  await lineReads(b, LINES.pull, `${size} step 2`)
  y = await yard(b)
  await clearOf(b, y.id, 'weed', `${size} step 2`)
  await shot(b, `yard-${size}-2-line`)

  // Skip at step 2: the card comes back with focus on Ready, which pulses.
  const wait = 6500 - (Date.now() - seatedAt)
  if (wait > 0) await b.waitForTimeout(wait)
  await b.getByRole('button', { name: 'Skip' }).click()
  await b.getByRole('heading', { name: 'The Garden Gate' }).waitFor()
  y = await yard(b)
  if (!y.last?.skipped || y.learned.length)
    throw new Error(`${size}: Skip ended the yard as ${JSON.stringify(y)}`)
  await b.waitForTimeout(200)
  if ((await focused(b)) !== 'button:Ready')
    throw new Error(`${size}: Skip left focus on ${await focused(b)}`)
  const cardReady = b.getByRole('button', { name: 'Ready', exact: true })
  if (!(await pulses(cardReady)))
    throw new Error(`${size}: Ready doesn't pulse after Skip`)
  await statusReads(
    a,
    `Waiting for ${bName} to press Ready.`,
    `${size}: A's line after Skip`,
    3000
  )
  await shot(b, `yard-${size}-skipped`)

  // Try the Yard again, a plain button now, starts from step 1.
  await tryYard.click()
  await untilYard(b, y => y.open && y.step === 0, `${size}: the yard reopened`)
  await ghostGone(b)
  await lineReads(b, LINES.throw, `${size} step 1 again`)
  await throwGnome(b, size, touch)
  await ghostAt(b, 'pull', 800, `${size} step 2`)
  await shot(b, `yard-${size}-2-ghost`)
  await ghostGone(b)
  const softPx = await pullWeed(b, size, touch)

  // Step 3: the ghost finger rubs the column, then the line points at its outline.
  await ghostAt(b, 'mow', 900, `${size} step 3`)
  await shot(b, `yard-${size}-3-ghost`)
  await ghostGone(b)
  y = await yard(b)
  await lineReads(b, LINES.mow, `${size} step 3`)
  const tip = await dev(b, g => g.tipNow())
  if (tip.target?.col !== y.col)
    throw new Error(`${size}: ${JSON.stringify(tip)}`)
  await columnClear(b, y.col, `${size} step 3`)
  await statusReads(
    a,
    `${bName} is trying the yard (3 of 3).`,
    `${size}: A follows step 3`,
    3000
  )
  await shot(b, `yard-${size}-3-line`)
  await mowColumn(b, size, touch)
  await lineReads(b, LINES.done, `${size} done`, 2000)
  // The stripe's chalk tick shows on the patio's edge, above the panel.
  const ticks = await dev(b, g => g.ticks())
  const tickFoot = await dev(b, g => g.toClient(300, 640 + 26))
  const panelTop = (await boxOf(b, 'yard-panel')).y
  if (ticks[y.col] !== 'tick' || panelTop < tickFoot.y)
    throw new Error(
      `${size}: the tick ${ticks[y.col]} ends at ${tickFoot.y}, the panel starts at ${panelTop}`
    )
  await settledBox(b, '[data-testid="tip"]')
  await shot(b, `yard-${size}-done`)
  y = await untilYard(b, y => !y.open, `${size}: the yard closed`, 4000)
  if (!y.last?.finished || y.last.skipped || y.learned.join() !== 'weed,mow')
    throw new Error(`${size}: the yard ended ${JSON.stringify(y)}`)
  await b.getByRole('heading', { name: 'The Garden Gate' }).waitFor()
  await b.waitForTimeout(200)
  if ((await focused(b)) !== 'button:Ready')
    throw new Error(`${size}: Yard done left focus on ${await focused(b)}`)

  // Nothing reached A, and B sent only its lobby messages.
  if ((await dev(a, g => JSON.stringify(g.garden()))) !== aLawn)
    throw new Error(`${size}: A's lawn changed`)
  const aLog = (await dev(a, g => g.events(200))).filter(e => e.at >= aSince)
  const leaked = aLog.filter(e =>
    ['arrive', 'land', 'landed', 'clip', 'throw', 'cross'].includes(e.type)
  )
  if (leaked.length)
    throw new Error(`${size}: A logged ${JSON.stringify(leaked)}`)
  const pushed = (await dev(b, g => g.net())).sent.pushed
  const kinds = Object.keys(pushed).filter(k => pushed[k] > 0)
  if (kinds.some(k => k !== 'hello' && k !== 'sync'))
    throw new Error(`${size}: B sent ${JSON.stringify(pushed)}`)

  // The match: B's round 1 teaches the start tip and the dig tip, but not the weed or mow
  // tip the yard already taught.
  // Ready pulses, so the press skips the stillness check.
  await b
    .getByRole('button', { name: 'Ready', exact: true })
    .click({ force: true })
  await waitFor(b, s => s.matchPhase?.kind === 'play', { label: 'play' })
  if (!(await dev(b, g => g.tipSeen('weed') && g.tipSeen('mow'))))
    throw new Error(`${size}: the match forgot the yard's tips`)
  const log = recorder(b)
  let dug = false
  for (;;) {
    await log.pull()
    const s = await dev(b, g => g.state())
    const phase = s.matchPhase
    if (phase?.kind !== 'play' || phase.round !== 0) break
    // Biscuit is awake 10s into a `?fast` round; a circle soon after brings the dig tip.
    if (!dug && phase.elapsed > 11_000) {
      dug = true
      await dev(b, g => g.act.dig(1500))
    }
    await sleep(700)
  }
  const events = log.all()
  const notes = events
    .filter(e => e.type === 'note' && e.detail.kind === 'tip')
    .map(e => e.detail.text)
  for (const want of [TIPS.start, TIPS.dig])
    if (!notes.includes(want))
      throw new Error(`${size}: round 1 lacked "${want}": ${notes.join(' / ')}`)
  for (const banned of [TIPS.weed, TIPS.mow])
    if (notes.includes(banned))
      throw new Error(`${size}: round 1 showed "${banned}"`)
  const sprouted = events.some(e => e.type === 'sprout')
  const shaggy = events.some(e => e.type === 'shaggy')
  if (!sprouted || !shaggy)
    throw new Error(
      `${size}: round 1 never raised the weed or mow trigger (sprout ${sprouted}, shaggy ${shaggy})`
    )
  check()
  await context.close()
  console.log(
    `${size}: A's yard line in ${total} ms; Skip, How to Play and Back kept their step and focus; all 3 steps by real input with a clip at ${softPx.toFixed(0)} px/s; round 1 tips: ${notes.join(' / ')}`
  )
}

/**
 * B presses Ready inside the yard while a pointer is held on its lawn: the countdown
 * starts and the yard closes at once, focus moves to the menu button, the held press does
 * nothing in round 1, and B's garden starts as the seed's fresh one.
 */
async function ready(browser, size) {
  const touch = size !== 'desktop'
  const { context, a, b, check } = await pair(browser, SIZES[size], '&fast')
  await a.getByRole('button', { name: 'Ready', exact: true }).click()
  await waitFor(b, s => s.peer?.ready === true, { label: 'A ready on B' })
  await b.getByRole('button', { name: 'Try the Yard' }).click()
  await untilYard(b, y => y.open, `${size}: the yard opened`)
  await ghostGone(b)
  const y = await yard(b)
  const gnome = await dev(b, (g, id) => g.targetClient(id), y.id)
  const hand = heldPointer(b, touch)
  await hand.down(gnome)
  await hand.move(gnome, { x: gnome.x, y: gnome.y + 20 }, 200)
  if (!(await dev(b, g => g.garden().held)))
    throw new Error(`${size}: the held press holds nothing in the yard`)
  // Ready by keyboard, while the finger stays down.
  await b
    .getByTestId('yard-panel')
    .getByRole('button', { name: 'Ready' })
    .focus()
  await b.keyboard.press('Enter')
  const s = await waitFor(b, s => s.phase === 'match', { label: 'countdown' })
  const now = await yard(b)
  if (now.open)
    throw new Error(`${size}: the yard stayed open into the countdown`)
  if (!['waiting', 'countdown'].includes(s.matchPhase?.kind))
    throw new Error(`${size}: no countdown: ${JSON.stringify(s.matchPhase)}`)
  await waitFor(b, s => s.matchPhase?.kind === 'countdown', {
    label: 'countdown'
  })
  await b.getByTestId('menu-button').waitFor()
  await b.waitForTimeout(250)
  const onMenu = await b.evaluate(
    () => document.activeElement?.getAttribute('data-testid') === 'menu-button'
  )
  if (!onMenu)
    throw new Error(`${size}: the countdown left focus on ${await focused(b)}`)
  await shot(b, `yard-${size}-ready-countdown`)
  await waitFor(b, s => s.matchPhase?.kind === 'play', { label: 'play' })
  const playAt = await clockNow(b)
  const fresh = await dev(b, g => g.twin())
  if (!fresh?.sameLawn || !fresh.sameFinal)
    throw new Error(
      `${size}: B's round 1 began changed: ${JSON.stringify(fresh)}`
    )
  // The held finger drags slowly, then flicks up and lets go: nothing in round 1 moves.
  const far = { x: gnome.x, y: gnome.y - 120 }
  await hand.move({ x: gnome.x, y: gnome.y + 20 }, gnome, 600)
  await hand.move(gnome, far, 80)
  await hand.up()
  await sleep(600)
  const after = await dev(b, g => g.twin())
  const pressed = (await dev(b, g => g.events(200))).filter(
    e => e.at >= playAt && PRESS_EVENTS.includes(e.type)
  )
  if (pressed.length || !after.sameFinal)
    throw new Error(
      `${size}: the held press acted in round 1: ${JSON.stringify(pressed)} ${JSON.stringify(after)}`
    )
  if (await dev(b, g => g.garden().held))
    throw new Error(`${size}: round 1 holds the yard's press`)
  check()
  await context.close()
  console.log(
    `${size}: Ready inside the yard started the countdown, closed the yard, focused the menu button, and the held press did nothing`
  )
}

/** Under Reduced Motion each step's ghost finger is a still arrow. */
async function still(browser) {
  const { context, b, check } = await pair(browser, {
    ...SIZES.small,
    reducedMotion: 'reduce'
  })
  await b.getByRole('button', { name: 'Try the Yard' }).click()
  await ghostAt(b, 'throw', 300, 'still step 1')
  await shot(b, 'yard-still-1')
  let y = await yard(b)
  await dev(b, (g, id) => g.act.throw(id, { speedPx: 1600 }), y.id)
  await untilYard(b, y => y.step === 1, 'still: the gnome went over')
  await ghostAt(b, 'pull', 300, 'still step 2')
  await shot(b, 'yard-still-2')
  y = await yard(b)
  await dev(b, (g, id) => g.act.yank(id), y.id)
  y = await untilYard(b, y => y.pulled, 'still: the weed popped out')
  // A thrown item lets go of the one in your hand: this throws the pulled weed.
  await dev(b, (g, id) => g.act.throw(id, { speedPx: 2200 }), y.id)
  await untilYard(b, y => y.step === 2, 'still: the weed went over')
  await ghostAt(b, 'mow', 300, 'still step 3')
  await shot(b, 'yard-still-3')
  check()
  await context.close()
  console.log('still: each step showed its still arrow')
}

/** Finishes the open yard's 3 steps through the dev hooks. */
async function finishByHooks(page, label) {
  let y = await yard(page)
  await dev(page, (g, id) => g.act.throw(id, { speedPx: 1600 }), y.id)
  y = await untilYard(page, y => y.step === 1, `${label}: step 1`)
  await dev(page, (g, id) => g.act.yank(id), y.id)
  y = await untilYard(page, y => y.pulled, `${label}: the weed popped out`)
  await dev(page, (g, id) => g.act.throw(id, { speedPx: 2200 }), y.id)
  y = await untilYard(page, y => y.step === 2, `${label}: step 2`)
  await dev(page, (g, c) => g.act.mowColumn(c, 300), y.col)
  await untilYard(page, y => y.step === 3, `${label}: step 3`)
}

/** A new player's Practice lobby leads with Try the Yard, and Start pulses once it's done. */
async function practice(browser, size) {
  const context = await browser.newContext({ ...SIZES[size], fresh: true })
  const page = await context.newPage()
  const errors = watchErrors(page, 'practice')
  await page.goto(`${BASE}/practice?fast`)
  await waitFor(page, s => s.seats.length === 2 && s.first.now, {
    label: 'Mr Pemberton seated'
  })
  const shownAt = Date.now()
  const start = page.getByRole('button', { name: 'Start' })
  await page.getByRole('button', { name: 'Try the Yard' }).waitFor()
  await start.waitFor()
  await page.waitForTimeout(300)
  await shot(page, `yard-practice-${size}-card`)
  await page.getByRole('button', { name: 'Try the Yard' }).click()
  await untilYard(page, y => y.open, 'practice: the yard opened')
  const status = await page.getByTestId('lobby-status').textContent()
  if (status !== 'Mr Pemberton is ready.')
    throw new Error(`practice: the panel reads ${status}`)
  await shot(page, `yard-practice-${size}-yard`)
  await finishByHooks(page, 'practice')
  await untilYard(page, y => !y.open, 'practice: the yard closed', 4000)
  await page
    .getByRole('heading', { name: 'Practice With Mr Pemberton' })
    .waitFor()
  const wait = 6200 - (Date.now() - shownAt)
  if (wait > 0) await page.waitForTimeout(wait)
  if (!(await pulses(start)))
    throw new Error('practice: Start does not pulse after the yard')
  if ((await focused(page)) !== 'button:Start')
    throw new Error(`practice: focus sits on ${await focused(page)}`)
  await shot(page, `yard-practice-${size}-done`)
  errors.check()
  await context.close()
  console.log(
    `practice ${size}: Try the Yard led the card, and Start pulsed once it was done`
  )
}

/** Real Pusher: B's yard line on A within 3s, the whole lobby in under 30 client events. */
async function pusher(browser) {
  const ctxA = await browser.newContext({ ...SIZES.desktop })
  const ctxB = await browser.newContext({ ...SIZES.small, fresh: true })
  const a = await ctxA.newPage()
  const b = await ctxB.newPage()
  const errors = [watchErrors(a, 'A'), watchErrors(b, 'B')]
  const code = roomCode()
  try {
    await a.goto(`${BASE}/r/${code}?first=0`)
    await waitFor(a, s => s.admission === 'seated', { timeout: 20_000 })
    await b.goto(`${BASE}/r/${code}`)
    await waitFor(b, s => s.seats.length === 2 && s.first.now, {
      timeout: 20_000
    })
    await waitFor(a, s => s.seats.length === 2, { timeout: 10_000 })
    const bName = (await dev(b, g => g.state())).me.name
    await b.getByRole('button', { name: 'Try the Yard' }).click()
    const openedAt = Date.now()
    await statusReads(
      a,
      `${bName} is trying the yard (1 of 3).`,
      'pusher: A yard line',
      4000
    )
    const took = Date.now() - openedAt
    if (took > 3000) throw new Error(`pusher: A's yard line took ${took} ms`)
    await shot(a, 'yard-pusher-a-line')
    let sent = 0
    for (const p of [a, b]) {
      const net = await dev(p, g => g.net())
      if (net.kind !== 'pusher') throw new Error(`a page used ${net.kind}`)
      sent += net.sent.bundles + net.clockSends
    }
    if (sent >= 30) throw new Error(`the lobby spent ${sent} client events`)
    for (const p of [a, b]) await dev(p, g => g.leave())
    errors.forEach(e => e.check())
    console.log(
      `pusher: A read B's yard line ${took} ms after B opened it, ${sent} client events`
    )
  } finally {
    await ctxA.close()
    await ctxB.close()
  }
}

const browser = await launch()
try {
  const sizes = ['se', 'small', 'phone', 'desktop']
  for (const size of sizes) if (!ONLY || ONLY === size) await run(browser, size)
  if (!ONLY || ONLY === 'ready')
    for (const size of SIZE_ARG ? [SIZE_ARG] : sizes) await ready(browser, size)
  if (!ONLY || ONLY === 'still') await still(browser)
  if (!ONLY || ONLY === 'practice')
    for (const size of SIZE_ARG ? [SIZE_ARG] : ['small', 'desktop'])
      await practice(browser, size)
  if (ONLY === 'pusher') await pusher(browser)
  console.log('yard: ok')
} finally {
  await browser.close()
}
