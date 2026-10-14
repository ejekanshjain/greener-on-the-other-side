// M29 new players: the finished-match fact and its dev override. At three sizes, A on
// `?first=0` and B on `?first=1` share one context: A's lobby shows First Match on B's
// gate and B's shows nothing on A's, B's Ready waits for the yard to be skipped and for
// 6s before it pulses while A's pulses at once, and in a `?fast` match B's top bar reads You while A's shows A's name. Then a
// context with empty storage: B counts as new with no override, saves the fact at the end
// of a decided match, stays returning after a reload, and after Back to Lobby A sees no
// First Match on B's gate. Pass a size to run one.
import {
  BASE,
  dev,
  launch,
  roomCode,
  shot,
  sleep,
  SIZES,
  waitFor,
  watchErrors
} from './lib.mjs'

const ONLY = process.argv[2]

/** Opens A (host) and B on one `?local` room and waits until both are seated. */
async function pair(context, query, bQuery = query) {
  const code = roomCode()
  const a = await context.newPage()
  const b = await context.newPage()
  const errors = [watchErrors(a, 'A'), watchErrors(b, 'B')]
  const url = `${BASE}/r/${code}?local&fast&calm`
  await a.goto(`${url}&pid=aaaaaaaa31${query}`)
  await waitFor(a, s => s.admission === 'seated')
  await b.goto(`${url}&pid=zzzzzzzz31${bQuery}`)
  // B's lobby card shows once B is seated.
  await waitFor(b, s => s.admission === 'seated', { timeout: 5000 })
  const bSeatedAt = Date.now()
  await waitFor(b, s => s.seats.length === 2)
  await waitFor(b, s => s.bestRtt < 1000, { label: 'clock sync' })
  return { a, b, url, bSeatedAt, check: () => errors.forEach(e => e.check()) }
}

/** The First Match tags a page's lobby shows, by gate text. */
const firstTags = page =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="first-match"]')].map(
      el => el.parentElement?.textContent ?? ''
    )
  )

const pulses = page =>
  page
    .getByRole('button', { name: 'Ready', exact: true })
    .getAttribute('class')
    .then(c => c.includes('ready-pulse'))

async function override(browser, size) {
  const context = await browser.newContext(SIZES[size])
  const { a, b, bSeatedAt, check } = await pair(context, '&first=0', '&first=1')
  const bName = (await dev(b, g => g.state())).me.name
  await waitFor(a, s => s.first.peer, { label: "B's First Match flag" })
  await a.getByTestId('first-match').waitFor()
  const onA = await firstTags(a)
  if (onA.length !== 1 || !onA[0].includes(bName))
    throw new Error(`${size}: A's lobby tags ${JSON.stringify(onA)}`)
  await sleep(500)
  if ((await firstTags(b)).length)
    throw new Error(`${size}: B's lobby shows First Match on A's gate`)
  const sa = await dev(a, g => g.state())
  const sb = await dev(b, g => g.state())
  if (sa.first.now || !sb.first.now)
    throw new Error(`${size}: first flags A ${sa.first.now}, B ${sb.first.now}`)
  await shot(a, `newplayer-${size}-first-match-gate`)

  // B is new: its Ready waits until B finishes or skips the yard and the card has shown
  // for 6s. A's pulses at once.
  await dev(a, g => g.ready(true))
  await waitFor(b, s => s.peer?.ready, { label: 'A ready on B' })
  await sleep(300)
  if (await pulses(b))
    throw new Error(`${size}: B's Ready pulses before the yard`)
  await b.getByRole('button', { name: 'Try the Yard' }).click()
  await b.getByRole('button', { name: 'Skip' }).click()
  await b.getByRole('heading', { name: 'The Garden Gate' }).waitFor()
  let waited = 0
  while (!(await pulses(b))) {
    waited = Date.now() - bSeatedAt
    if (waited > 8000) throw new Error(`${size}: B's Ready never pulsed`)
    await sleep(100)
  }
  waited = Date.now() - bSeatedAt
  if (waited < 5800)
    throw new Error(
      `${size}: B's Ready pulsed ${waited} ms after its card showed`
    )
  await dev(a, g => g.ready(false))
  await dev(b, g => g.ready(true))
  await waitFor(a, s => s.peer?.ready, { label: 'B ready on A' })
  await sleep(150)
  if (!(await pulses(a))) throw new Error(`${size}: A's Ready didn't pulse`)

  // In the match, each page's own name tag reads You, and the other tag names the other.
  await dev(a, g => g.ready(true))
  for (const p of [a, b])
    await waitFor(p, s => s.matchPhase?.kind === 'play', { label: 'play' })
  const aName = (await dev(a, g => g.state())).me.name
  const tag = (p, id) => p.getByTestId(id).textContent()
  const [tagA, tagB, theirA, theirB] = await Promise.all([
    tag(a, 'my-name'),
    tag(b, 'my-name'),
    tag(a, 'their-name'),
    tag(b, 'their-name')
  ])
  if (
    tagA !== 'You' ||
    tagB !== 'You' ||
    !bName.startsWith(theirA.slice(0, 8)) ||
    !aName.startsWith(theirB.slice(0, 8))
  )
    throw new Error(
      `${size}: name tags A "${tagA}" and "${theirA}", B "${tagB}" and "${theirB}"`
    )
  await shot(b, `newplayer-${size}-you`)
  check()
  await context.close()
  console.log(
    `${size}: First Match only on A's screen, B's Ready pulsed after ${(waited / 1000).toFixed(1)}s, each reads You`
  )
}

/** Plays a `?fast` match to its end, the host winning 2 rounds to 0. */
async function playToEnd(a, b) {
  await dev(a, g => g.ready(true))
  await dev(b, g => g.ready(true))
  for (const round of [0, 1]) {
    for (const p of [a, b])
      await waitFor(p, s => s.gardenRound === round, {
        label: `round ${round}`
      })
    const end = Date.now() + 2500
    for (const p of [a, b])
      await dev(p, (g, x) => g.jump(x.left, x.round), {
        left: Math.max(0, end - Date.now()),
        round
      })
    await dev(b, g => g.dryLawn(3))
    for (const p of [a, b])
      await waitFor(p, s => s.results.length === round + 1, {
        label: `verdict ${round + 1}`,
        timeout: 20_000
      })
  }
  for (const p of [a, b])
    await waitFor(p, s => s.phase === 'over', {
      label: 'over',
      timeout: 30_000
    })
}

async function fresh(browser, size) {
  const context = await browser.newContext({ ...SIZES[size], fresh: true })
  const { a, b, url, check } = await pair(context, '&first=0', '')
  const before = await dev(b, g => g.state())
  if (!before.first.now) throw new Error(`${size}: empty storage isn't new`)
  await a.getByTestId('first-match').waitFor()
  await playToEnd(a, b)
  const stored = await b.evaluate(() =>
    localStorage.getItem('greener-finished')
  )
  if (stored !== '1') throw new Error(`${size}: no fact after the match`)
  const finished = (await dev(b, g => g.events(200))).some(
    e => e.type === 'finished'
  )
  if (!finished) throw new Error(`${size}: B never logged the save`)
  // At the match end, B's syncs stop saying it's new.
  await waitFor(a, s => !s.first.peer, { label: 'B returning on A' })
  await b.reload()
  await waitFor(b, s => s.phase === 'over', { label: 'B back at the end' })
  if ((await dev(b, g => g.state())).first.now)
    throw new Error(`${size}: B is new again after a reload`)
  // B leaves; A goes back to the lobby; B comes back by link with no First Match.
  await b.getByRole('button', { name: 'Leave' }).click()
  await b.waitForURL(`${BASE}/`)
  await a.getByRole('button', { name: 'Back to Lobby' }).click()
  await waitFor(a, s => s.phase === 'lobby', { label: 'A in the lobby' })
  await b.goto(`${url}&pid=zzzzzzzz31`)
  await waitFor(a, s => s.peer?.listed && s.seats.length === 2, {
    label: 'B back in the lobby'
  })
  await sleep(2500)
  if ((await firstTags(a)).length)
    throw new Error(`${size}: A still shows First Match on B's gate`)
  await shot(a, `newplayer-${size}-back-to-lobby`)
  check()
  await context.close()
  console.log(
    `${size}: empty storage made B new, the decided match saved the fact, and Back to Lobby shows no First Match`
  )
}

const browser = await launch()
try {
  for (const size of ['small', 'phone', 'desktop'])
    if (!ONLY || ONLY === size) await override(browser, size)
  await fresh(browser, ONLY ?? 'small')
  console.log('newplayer: ok')
} finally {
  await browser.close()
}
