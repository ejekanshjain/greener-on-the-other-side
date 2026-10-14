// M46, the playtest clock, on `?local` pages and in Practice:
// - `round` (the default): a `?local&first=1` full-length round 1 paused on both pages at
//   2:30 for 60s keeps garden t, the clock text ("Paused"), the tip on show and Biscuit's
//   state the same across five samples 10s apart, a real press does nothing, and the round
//   ends 60s later than it would have on both pages with matching verdicts;
// - `reveal` and `countdown`: a pause through a reveal step and through a countdown
//   resumes at the same step;
// - `practice`: a Practice pause stops Mr Pemberton's garden and hands too, and a gnome
//   held as the pause begins is put down as if the press were cut off, with no tip;
// - `pusher`: a real Pusher room ignores the pause (one page alone in its lobby).
//
// Usage: node e2e/pause.mjs [round|reveal|countdown|practice|pusher] [size]
import {
  BASE,
  dev,
  frames,
  heldPointer,
  launch,
  mouseFlick,
  pauseAll,
  resumeAll,
  roomCode,
  shot,
  SIZES,
  sleep,
  touchFlick,
  waitFor,
  watchErrors
} from './lib.mjs'

const ONLY = process.argv[2] ?? 'round'
const SIZE = process.argv[3] ?? 'small'

/** Two `?local` pages on one room in one context, A hosting. */
async function pair(browser, query) {
  const context = await browser.newContext(SIZES[SIZE])
  const code = roomCode()
  const a = await context.newPage()
  const b = await context.newPage()
  const errors = [watchErrors(a, 'A'), watchErrors(b, 'B')]
  const url = `${BASE}/r/${code}?local&${query}`
  await a.goto(`${url}&pid=aaaaaaaa46`)
  await waitFor(a, s => s.admission === 'seated')
  await b.goto(`${url}&pid=zzzzzzzz46`)
  await waitFor(b, s => s.seats.length === 2)
  await waitFor(a, s => s.seats.length === 2)
  return { context, a, b, check: () => errors.forEach(e => e.check()) }
}

/** What must stand still on a paused page. */
const still = page =>
  dev(page, g => {
    const garden = g.garden()
    const tip = g.tipNow()
    return {
      t: garden.t,
      clock: document.querySelector('[data-testid="clock"]')?.textContent,
      tip: tip && `${tip.key}:${tip.text}`,
      biscuit: JSON.stringify(garden.biscuit),
      phase: JSON.stringify(g.state().matchPhase)
    }
  })

/** Ms of play left in the page's round now. */
const msLeft = page => dev(page, g => g.state().matchPhase?.msLeft ?? null)

async function round(browser) {
  const touch = SIZE !== 'desktop'
  const { context, a, b, check } = await pair(browser, 'first=1')
  await dev(a, g => g.ready(true))
  await dev(b, g => g.ready(true))
  for (const p of [a, b])
    await waitFor(p, s => s.matchPhase?.kind === 'play', { label: 'play' })
  // Pause at 2:30: 30s into round 1.
  const left = await msLeft(a)
  await sleep(left - 150_000 - 150)
  const endBefore = Date.now() + (await msLeft(a))
  await pauseAll([a, b])
  const pausedAt = Date.now()
  const samples = []
  for (let k = 0; k < 5; k++) {
    if (k > 0) await sleep(10_000)
    samples.push(await Promise.all([still(a), still(b)]))
    if (k === 1) {
      // A real press during the pause does nothing.
      const before = await dev(b, g => JSON.stringify(g.garden()))
      const gnome = (await dev(b, g => g.garden())).items.find(
        i => i.kind === 'gnome' && i.state === 'rest'
      )
      const at = await dev(b, (g, id) => g.targetClient(id), gnome.id)
      await (touch ? touchFlick : mouseFlick)(
        b,
        at,
        { x: at.x, y: at.y - 200 },
        1500
      )
      await sleep(300)
      if ((await dev(b, g => JSON.stringify(g.garden()))) !== before)
        throw new Error('a press during the pause changed B')
      await shot(b, `pause-${SIZE}-round`)
    }
  }
  for (const page of [0, 1]) {
    const first = JSON.stringify(samples[0][page])
    for (const sample of samples)
      if (JSON.stringify(sample[page]) !== first)
        throw new Error(
          `page ${page ? 'B' : 'A'} moved during the pause: ${first} then ${JSON.stringify(sample[page])}`
        )
  }
  const [sa, sb] = samples[0]
  if (sa.t !== sb.t)
    throw new Error(`the pages paused at different times: ${sa.t} and ${sb.t}`)
  if (sa.clock !== 'Paused' || sb.clock !== 'Paused')
    throw new Error(`the clocks read ${sa.clock} and ${sb.clock}`)
  if (!sb.tip) console.log('B showed no tip while paused')
  await sleep(Math.max(0, 60_000 - (Date.now() - pausedAt)))
  await resumeAll([a, b])
  const endAfter = Date.now() + (await msLeft(a))
  const shift = endAfter - endBefore
  if (Math.abs(shift - 60_000) > 600)
    throw new Error(`the round's end moved ${shift} ms, not 60s`)
  for (const p of [a, b])
    await waitFor(p, s => s.results.length === 1, {
      label: 'verdict',
      timeout: 200_000
    })
  const endedAt = Date.now()
  if (Math.abs(endedAt - endAfter) > 6000)
    throw new Error(
      `the verdict came ${endedAt - endAfter} ms after the predicted end`
    )
  const [ra, rb] = await Promise.all(
    [a, b].map(p => dev(p, g => g.state().results[0]))
  )
  if (JSON.stringify(ra.scores) !== JSON.stringify(rb.scores))
    throw new Error(`the verdicts differ: ${JSON.stringify([ra, rb])}`)
  check()
  await context.close()
  console.log(
    `round: paused at garden t ${sa.t} on both pages for 60s, the round ended ${(shift / 1000).toFixed(2)}s later, and both pages agreed on ${JSON.stringify(ra.scores.map(s => s.total))}`
  )
}

/** A pause through a reveal step and through a countdown resumes at the same step. */
async function steps(browser, part) {
  const { context, a, b, check } = await pair(browser, 'fast&calm')
  await dev(a, g => g.ready(true))
  await dev(b, g => g.ready(true))
  if (part === 'countdown') {
    for (const p of [a, b])
      await waitFor(p, s => s.matchPhase?.kind === 'countdown', {
        label: 'countdown'
      })
    await sleep(800)
  } else {
    for (const p of [a, b])
      await waitFor(p, s => s.matchPhase?.kind === 'play', { label: 'play' })
    await dev(a, g => g.jump(800))
    for (const p of [a, b])
      await waitFor(p, s => s.matchPhase?.kind === 'reveal', {
        label: 'reveal'
      })
    await waitFor(a, () => true)
    // Into the reveal's count, where the scores climb.
    const start = Date.now()
    while ((await dev(a, g => g.reveal().step)) !== 'count') {
      if (Date.now() - start > 15_000) throw new Error('no count step')
      await sleep(80)
    }
  }
  const look = page =>
    dev(page, g => ({
      phase: JSON.stringify(g.state().matchPhase),
      step: g.reveal().step,
      countdown:
        document.querySelector('[data-testid="countdown"]')?.textContent ?? ''
    }))
  await pauseAll([a, b])
  // The countdown's digit follows the phase on the next frame.
  await Promise.all([frames(a, 3), frames(b, 3)])
  const first = await Promise.all([look(a), look(b)])
  await sleep(5000)
  const later = await Promise.all([look(a), look(b)])
  if (JSON.stringify(first) !== JSON.stringify(later))
    throw new Error(
      `${part}: moved during the pause: ${JSON.stringify(first)} then ${JSON.stringify(later)}`
    )
  await shot(a, `pause-${SIZE}-${part}`)
  await resumeAll([a, b])
  const after = await Promise.all([look(a), look(b)])
  for (const k of [0, 1]) {
    const was = JSON.parse(first[k].phase)
    const now = JSON.parse(after[k].phase)
    if (
      now.kind !== was.kind ||
      now.round !== was.round ||
      now.msLeft > was.msLeft ||
      was.msLeft - now.msLeft > 400
    )
      throw new Error(
        `${part}: resumed at ${after[k].phase}, not ${first[k].phase}`
      )
    if (part === 'reveal' && after[k].step !== first[k].step)
      throw new Error(`reveal: resumed at ${after[k].step}`)
  }
  // And it carries on to the next step.
  const next = part === 'countdown' ? 'play' : 'countdown'
  for (const p of [a, b])
    await waitFor(p, s => s.matchPhase?.kind === next, {
      label: next,
      timeout: 20_000
    })
  check()
  await context.close()
  console.log(
    `${part}: both pages held ${first[0].step || first[0].countdown || part} for 5s and resumed at the same step`
  )
}

/** A Practice pause stops Mr Pemberton too. */
async function practice(browser) {
  const context = await browser.newContext(SIZES[SIZE])
  const page = await context.newPage()
  const errors = watchErrors(page, 'practice')
  await page.goto(`${BASE}/practice?fast&calm`)
  await waitFor(page, s => s.seats.length === 2)
  await page.getByRole('button', { name: 'Start' }).click()
  await waitFor(page, s => s.matchPhase?.kind === 'play', { label: 'play' })
  await sleep(6000)
  // A gnome held as the pause begins goes down where it is, as a cut-off press would.
  const gnome = (await dev(page, g => g.garden())).items.find(
    i => i.kind === 'gnome' && i.state === 'rest'
  )
  const at = await dev(page, (g, id) => g.targetClient(id), gnome.id)
  const hand = heldPointer(page, SIZE !== 'desktop')
  await hand.down(at)
  await hand.move(at, { x: at.x, y: at.y + 10 }, 150)
  if (!(await dev(page, g => g.garden().held)))
    throw new Error('the press never grabbed the gnome')
  const pausedAt = await pauseAll([page])
  // The finger keeps going and flicks up while paused: nothing may come of it.
  await hand.move({ x: at.x, y: at.y + 10 }, { x: at.x, y: at.y - 200 }, 120)
  await hand.up()
  const his = () =>
    dev(page, g => {
      const bot = g.bot
      const garden = bot.garden()
      return JSON.stringify({
        t: garden.t,
        items: garden.items,
        held: garden.held
      })
    })
  const before = await his()
  const events = (await dev(page, g => g.bot.events(200))).length
  await sleep(5000)
  if ((await his()) !== before)
    throw new Error("Mr Pemberton's garden moved during the pause")
  const bot = await dev(page, g => g.bot.events(200))
  const acted = bot
    .slice(events)
    .filter(e => ['throw', 'grab', 'yank', 'pourStart', 'cut'].includes(e.type))
  if (acted.length)
    throw new Error(`Mr Pemberton acted while paused: ${JSON.stringify(acted)}`)
  await shot(page, `pause-${SIZE}-practice`)
  await resumeAll([page])
  await sleep(1500)
  // The garden takes commands on its next tick, so the cut-off put-down lands as time runs
  // again, still at the paused moment's garden time.
  const mine = (await dev(page, g => g.events(200))).filter(
    e => e.at >= pausedAt - 200
  )
  const downs = mine.filter(e => e.type === 'putDown')
  if (
    (await dev(page, g => g.garden().held)) ||
    downs.length !== 1 ||
    downs[0].detail.reason !== 'cancel' ||
    mine.some(e => e.type === 'throw' || e.type === 'note')
  )
    throw new Error(`the held press after the pause: ${JSON.stringify(mine)}`)
  const t = JSON.parse(await his()).t
  if (t <= JSON.parse(before).t) throw new Error('Mr Pemberton never resumed')
  errors.check()
  await context.close()
  console.log(
    'practice: the pause stopped Mr Pemberton, and he carried on after it'
  )
}

/** A real Pusher room ignores the pause. */
async function pusher(browser) {
  const context = await browser.newContext(SIZES[SIZE])
  const page = await context.newPage()
  const errors = watchErrors(page, 'pusher')
  await page.goto(`${BASE}/r/${roomCode()}`)
  await waitFor(page, s => s.admission === 'seated', { timeout: 20_000 })
  const at = await page.evaluate(() => window.__game.pause())
  await sleep(400)
  const paused = await dev(page, g => g.paused().paused)
  if (at !== null || paused) throw new Error('a real Pusher room paused')
  await dev(page, g => g.leave())
  errors.check()
  await context.close()
  console.log('pusher: the real Pusher room ignored the pause')
}

const browser = await launch()
try {
  if (ONLY === 'round') await round(browser)
  if (ONLY === 'reveal' || ONLY === 'countdown') await steps(browser, ONLY)
  if (ONLY === 'practice') await practice(browser)
  if (ONLY === 'pusher') await pusher(browser)
  console.log('pause: ok')
} finally {
  await browser.close()
}
