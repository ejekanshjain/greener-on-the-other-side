// Room trouble with real clicks on two ?fast pages: a third joiner gets Room Full,
// one player's tab goes to the background for 20s mid-round (hidden, then paused,
// as a phone does), a mid-round reload rebuilds the garden, both screens still agree
// on the verdict, then a player leaves mid-round through the menu and the other sees
// Stormed Off, goes back to the lobby and seats a new neighbour.
// Usage: node e2e/rooms.mjs [size] [pusher]. The local transport by default; `pusher`
// plays A at desktop size against B at `size` over real Pusher, about 500 messages.
import {
  BASE,
  SIZES,
  dev,
  launch,
  localPair,
  roomCode,
  shot,
  sleep,
  startMatch,
  waitFor,
  watchErrors
} from './lib.mjs'

const SIZE = process.argv[2] ?? 'desktop'
const PUSHER = process.argv[3] === 'pusher'
const TAG = `rooms-${PUSHER ? 'pusher-' : ''}${SIZE}`
const button = (page, name) =>
  page.getByRole('button', { name, exact: true }).first()

/**
 * Hides the page the way a phone does: visibility goes hidden, then the page stops running.
 * Headless Chromium ignores CDP's freeze, so a debugger pause stops its timers instead.
 */
async function background(page, cdp, ms) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden'
    })
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await cdp.send('Debugger.enable')
  await cdp.send('Debugger.pause')
  await sleep(ms)
  await cdp.send('Debugger.resume')
  await cdp.send('Debugger.disable')
  await page.evaluate(() => {
    delete document.visibilityState
    delete document.hidden
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

/**
 * Two seated players: one context on the local transport, or a context each on real
 * Pusher. `join(pid)` opens a newcomer's page, in its own context on Pusher.
 */
async function pair(browser) {
  if (!PUSHER) {
    const p = await localPair(browser, { query: 'fast', size: SIZE })
    return {
      ...p,
      contextB: p.context,
      join: async pid =>
        p.context.newPage().then(async page => {
          await page.goto(`${p.url}&pid=${pid}`)
          return page
        })
    }
  }
  const url = `${BASE}/r/${roomCode()}?fast`
  const context = await browser.newContext(SIZES.desktop)
  const contextB = await browser.newContext(SIZES[SIZE])
  const a = await context.newPage()
  const b = await contextB.newPage()
  const ea = watchErrors(a, 'A')
  const eb = watchErrors(b, 'B')
  await a.goto(url)
  await waitFor(a, s => s.admission === 'seated', { timeout: 20_000 })
  await b.goto(url)
  for (const p of [a, b])
    await waitFor(p, s => s.seats.length === 2, { timeout: 20_000 })
  const extra = []
  return {
    context,
    contextB,
    a,
    b,
    url,
    check: () => (ea.check(), eb.check()),
    join: async () => {
      const ctx = await browser.newContext(SIZES.desktop)
      extra.push(ctx)
      const page = await ctx.newPage()
      await page.goto(url)
      return page
    }
  }
}

const browser = await launch()
try {
  const { context, contextB, a, b, check, join } = await pair(browser)

  // 1. A third player finds two seats taken.
  const c = await join('thirdtab01')
  const ec = watchErrors(c, 'C')
  await c
    .getByRole('heading', { name: 'Room Full' })
    .waitFor({ timeout: 20_000 })
  await shot(c, `${TAG}-1-room-full`)
  await button(c, 'Try Again').click()
  await c
    .getByRole('heading', { name: 'Room Full' })
    .waitFor({ timeout: 20_000 })
  console.log(`${SIZE}: a third tab sees Room Full, also after Try Again`)
  await c.close()

  // 2. Start a match, then B's tab spends 20s in the background mid-round.
  await startMatch(a, b)
  await sleep(4000)
  const cdp = await contextB.newCDPSession(b)
  const hidden = background(b, cdp, 20_000)
  const away = await waitFor(a, s => s.peer?.away === true, {
    label: 'Away on A',
    timeout: 8000
  })
  await shot(a, `${TAG}-2-neighbour-away`)
  console.log(`${SIZE}: A shows B as Away (${JSON.stringify(away.peer)})`)
  await hidden
  const back = await waitFor(b, s => s.matchPhase !== null, { label: 'B back' })
  await waitFor(a, s => s.peer?.away === false, { label: 'B heard again' })
  await sleep(500)
  await shot(b, `${TAG}-3-back-from-background`)
  const gb = await dev(b, g => ({
    t: g.garden().t,
    round: g.state().gardenRound
  }))
  console.log(
    `${SIZE}: B came back after 20s in ${back.matchPhase.kind} of round ${back.matchPhase.round + 1}, garden at ${Math.round(gb.t)} ms`
  )

  // 3. B reloads mid-round and its garden rebuilds from A's copy.
  await waitFor(b, s => s.matchPhase?.kind === 'play', {
    label: 'play',
    timeout: 40_000
  })
  await b.reload()
  await waitFor(b, s => s.matchPhase?.kind === 'play' && s.gardenRound >= 0, {
    label: 'B playing after reload'
  })
  await sleep(800)
  await shot(b, `${TAG}-4-after-reload`)
  const rebuilt = await dev(b, g =>
    g.events(200).find(e => e.type === 'rebuild')
  )
  console.log(
    `${SIZE}: B reloaded mid-round and ${rebuilt ? `rebuilt from A's copy in ${rebuilt.detail.ms?.toFixed?.(1) ?? '?'} ms` : 'started without a rebuild'}`
  )

  // 4. Both screens agree on the next verdict.
  const results = await Promise.all(
    [a, b].map(p =>
      waitFor(p, s => s.results.length >= 1, {
        label: 'verdict',
        timeout: 60_000
      })
    )
  )
  if (
    JSON.stringify(results[0].results[0].scores) !==
    JSON.stringify(results[1].results[0].scores)
  )
    throw new Error(`${SIZE}: the pages disagree on round 1`)
  console.log(`${SIZE}: both pages agree on round 1 after the trouble`)

  // 5. In the next round B leaves through the menu, and A sees Stormed Off.
  await waitFor(
    b,
    s => s.matchPhase?.kind === 'play' && s.matchPhase.round === 1,
    {
      label: 'round 2',
      timeout: 40_000
    }
  )
  await sleep(1500)
  await b.getByRole('button', { name: 'Menu' }).click()
  await sleep(300)
  await shot(b, `${TAG}-5-menu`)
  await button(b, 'Leave').click()
  await sleep(300)
  await shot(b, `${TAG}-6-leave-question`)
  await b.getByRole('dialog').getByRole('button', { name: 'Leave' }).click()
  await b.waitForURL(`${BASE}/**`)
  await a.getByRole('heading', { name: 'Stormed Off' }).waitFor()
  await sleep(300)
  await shot(a, `${TAG}-7-stormed-off`)
  console.log(
    `${SIZE}: A reads "${await a.getByTestId('match-status').textContent()}"`
  )
  await button(a, 'Back to Lobby').click()
  await waitFor(a, s => s.phase === 'lobby', { label: 'lobby' })

  // 6. The freed seat goes to a newcomer.
  const d = await join('newcomer01')
  const ed = watchErrors(d, 'D')
  await waitFor(d, s => s.admission === 'seated' && s.seats.length === 2, {
    label: 'newcomer seated',
    timeout: 20_000
  })
  await sleep(500)
  await shot(a, `${TAG}-8-new-neighbour`)
  console.log(`${SIZE}: a newcomer takes the freed seat`)
  check()
  ec.check()
  ed.check()
  await context.close()
  if (PUSHER) await contextB.close()
} finally {
  await browser.close()
}
