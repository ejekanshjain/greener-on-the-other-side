// Neighbours who step away, on ?local pages with fixed ids so A hosts:
// - hidden: a desktop tab hidden for 70s mid-round keeps sending its lawn, so it never
//   shows Away, the match carries on, and throws still land on it (full-length round).
// - overEnd: a guest hidden over 0:00 is judged on its own final, crate gnomes and all.
// - frozen, gone: a guest frozen over 0:00 (a phone app switch) is judged on its lawn
//   rebuilt to 0:00, after 6s while it's Away or at once when it's Gone, and both screens
//   draw that lawn.
// - chores: a reload keeps the bag, the can, the tap, the arm and your own faults.
// - walkover: the loser of a walkover keeps their seat while the result shows, so a
//   newcomer sees Room Full and the loser comes back to the result.
// - pusher: over real Pusher, a frozen guest's rebuilt lawn reaches both screens. It runs
//   only when asked for, and costs about 300 messages.
// Usage: node e2e/away.mjs [part] [size]. Parts run in the order above by default.
import {
  BASE,
  dev,
  launch,
  mouseFlick,
  roomCode,
  shot,
  SIZES,
  sleep,
  startMatch,
  touchFlick,
  waitFor,
  watchErrors
} from './lib.mjs'

const PART = process.argv[2]
const SIZE = process.argv[3] ?? 'desktop'

/** Two ?local pages in one context with fixed ids: `a` sorts first, so it hosts. */
async function pair(browser, query = '') {
  const context = await browser.newContext(SIZES[SIZE])
  const code = roomCode()
  const tag = Math.random().toString(36).slice(2, 8).padEnd(6, '0')
  const ids = { a: `aa${tag}xx`, b: `bb${tag}xx`, c: `cc${tag}xx` }
  const url = id =>
    `${BASE}/r/${code}?local&pid=${id}${query ? `&${query}` : ''}`
  const errors = []
  const page = async (id, label, seated = true) => {
    const p = await context.newPage()
    errors.push(watchErrors(p, label))
    await p.goto(url(id))
    if (seated) await waitFor(p, s => s.admission === 'seated')
    return p
  }
  const a = await page(ids.a, 'A')
  const b = await page(ids.b, 'B')
  for (const p of [a, b]) await waitFor(p, s => s.seats.length === 2)
  return {
    context,
    a,
    b,
    ids,
    page,
    check: () => errors.forEach(e => e.check())
  }
}

/**
 * Freezes a page the way a phone app switch does: it says it's hidden, then its JavaScript
 * stops. Headless Chromium ignores CDP's freeze, so a debugger pause stands in. Returns
 * a function that wakes it.
 */
async function freeze(page, cdp) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden'
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await cdp.send('Debugger.enable')
  await cdp.send('Debugger.pause')
  return async () => {
    await cdp.send('Debugger.resume')
    await cdp.send('Debugger.disable')
    await page.evaluate(() => {
      delete document.visibilityState
      document.dispatchEvent(new Event('visibilitychange'))
    })
  }
}

/** Flicks one of A's resting gnomes at the fence with the real mouse or a finger. */
async function throwGnome(a) {
  const id = await dev(a, g => {
    const gnome = g
      .garden()
      .items.find(i => i.kind === 'gnome' && i.state === 'rest' && i.ly < 500)
    return gnome?.id ?? null
  })
  if (id === null) return false
  const from = await dev(a, (g, i) => g.targetClient(i), id)
  const to = { x: from.x, y: from.y - 120 }
  if (SIZES[SIZE].hasTouch) await touchFlick(a, from, to, 1400)
  else await mouseFlick(a, from, to, 1400)
  return true
}

/** A 70s desktop hide mid-round: lawns keep coming, no Away, no no contest. */
async function hidden(browser) {
  const { a, b, check, context } = await pair(browser)
  await startMatch(a, b)
  await dev(a, g => g.jump(120_000))
  await sleep(1500)
  const started = Date.now()
  await dev(b, g => g.hide(70_000))
  let awayPolls = 0
  let polls = 0
  let oldestLawn = 0
  let thrown = 0
  while (Date.now() - started < 69_000) {
    await sleep(1000)
    const s = await dev(a, g => g.state())
    if (s.phase !== 'match') throw new Error(`A left the match: ${s.phase}`)
    polls++
    if (s.peer?.away) awayPolls++
    const n = await dev(a, g => g.neighbour())
    oldestLawn = Math.max(oldestLawn, n.now - n.lawnAt)
    if (thrown < 2 && Date.now() - started > 10_000 * (thrown + 1))
      if (await throwGnome(a)) thrown++
  }
  const hiddenState = await b.evaluate(() => document.visibilityState)
  if (hiddenState !== 'hidden') throw new Error('B was not hidden')
  await sleep(2500)
  const received = (await dev(b, g => g.events(200))).filter(
    e => e.type === 'received'
  )
  const vanished = (await dev(a, g => g.events(200))).filter(
    e => e.type === 'vanish'
  )
  if (awayPolls > 0)
    throw new Error(`A saw B Away in ${awayPolls} of ${polls} polls`)
  if (oldestLawn > 2600)
    throw new Error(`B's lawn went ${oldestLawn} ms without an update`)
  if (vanished.length > 0 || received.length < thrown)
    throw new Error(
      `throws to the hidden tab: ${received.length} landed, ${vanished.length} vanished, ${thrown} thrown`
    )
  const sb = await dev(b, g => g.state())
  if (sb.phase !== 'match' || sb.peer?.away)
    throw new Error(`B came back to ${sb.phase}, peer Away ${sb.peer?.away}`)
  await shot(a, `away-${SIZE}-hidden-host`)
  await shot(b, `away-${SIZE}-hidden-back`)
  console.log(
    `${SIZE} hidden: 70s hidden mid-round, never Away in ${polls} polls, lawn gaps at most ${oldestLawn} ms, ${received.length} of ${thrown} throws landed on the hidden lawn`
  )
  check()
  await context.close()
}

/** The guest hides from 14s left to 11s past 0:00: Brenda judges its own final. */
async function overEnd(browser) {
  const { a, b, check, context } = await pair(browser, 'fast')
  await startMatch(a, b)
  await dev(a, g => g.jump(14_000))
  await sleep(500)
  await dev(b, g => g.hide(25_000))
  const h = await waitFor(a, s => s.results.length === 1, {
    label: 'host verdict',
    timeout: 30_000
  })
  const g = await waitFor(b, s => s.results.length === 1, {
    label: 'guest verdict',
    timeout: 30_000
  })
  const hp = await dev(a, g => g.packs(0))
  const gp = await dev(b, g => g.packs(0))
  if (h.results[0].guestFinal !== null)
    throw new Error('the host rebuilt a guest that sent its own final')
  if (hp.theirs.pack !== gp.mine.pack)
    throw new Error('the two screens draw different guest lawns')
  if (JSON.stringify(h.results) !== JSON.stringify(g.results))
    throw new Error('the verdicts differ')
  if (gp.mine.counts.gnomes <= 3)
    throw new Error(
      `the guest's lawn missed the crate: ${gp.mine.counts.gnomes} gnomes`
    )
  await waitFor(b, s => s.matchPhase?.kind === 'reveal', { label: 'reveal' })
  await sleep(4000)
  await shot(a, `away-${SIZE}-over-end-host`)
  await shot(b, `away-${SIZE}-over-end-guest`)
  console.log(
    `${SIZE} overEnd: judged the hidden guest's own final, ${gp.mine.counts.gnomes} gnomes, Junk ${h.results[0].scores[1].junk}, same lawn on both screens`
  )
  check()
  await context.close()
}

/**
 * The guest freezes before 0:00 and wakes during the reveal, as a phone app switch does.
 * Still listed, it is Away, so the host waits 6s for its final before judging its lawn
 * rebuilt to 0:00. Off the member list after 30s (`gone`, full-length), it is Gone, so
 * the host judges at once. Both screens then draw the rebuilt lawn.
 */
async function frozenGuest(browser, gone) {
  const { a, b, check, context } = await pair(browser, gone ? '' : 'fast')
  await startMatch(a, b)
  // The shed opens at 40s left, or 10s left in a ?fast round.
  const left = gone ? 44_000 : 14_000
  await dev(a, (g, ms) => g.jump(ms), left)
  // A lawn sent before the jump says nothing true about the jumped clock.
  await sleep(1500)
  const cdp = await context.newCDPSession(b)
  const wake = await freeze(b, cdp)
  const h = await waitFor(a, s => s.results.length === 1, {
    label: 'host verdict',
    timeout: 60_000
  })
  const waited = h.matchPhase.elapsed
  // It wakes during the reveal. A ?fast reveal's last 3s are the next countdown, so only
  // the full-length reveal leaves time to see it.
  await sleep(1000)
  await wake()
  const g = await waitFor(b, s => s.results.length === 1, {
    label: 'guest verdict',
    timeout: 15_000
  })
  const reveal = g.matchPhase
  await sleep(800)
  await shot(a, `away-${SIZE}-${gone ? 'gone' : 'frozen'}-host`)
  await shot(b, `away-${SIZE}-${gone ? 'gone' : 'frozen'}-guest`)
  const hp = await dev(a, g => g.packs(0))
  const gp = await dev(b, g => g.packs(0))
  if (!h.results[0].guestFinal)
    throw new Error('the host judged without rebuilding the frozen guest')
  if (
    hp.theirs.pack !== gp.mine.pack ||
    gp.mine.pack !== h.results[0].guestFinal
  )
    throw new Error('the two screens draw different guest lawns')
  if (JSON.stringify(h.results) !== JSON.stringify(g.results))
    throw new Error('the verdicts differ')
  if (gp.mine.counts.gnomes <= 3)
    throw new Error(
      `the rebuild missed the crate: ${gp.mine.counts.gnomes} gnomes`
    )
  if (gone ? h.peer.listed || waited > 1500 : !h.peer.away || waited < 5500)
    throw new Error(
      `the host judged ${waited} ms into the reveal, guest listed ${h.peer.listed}, Away ${h.peer.away}`
    )
  if (gone && reveal?.kind !== 'reveal')
    throw new Error(`the guest woke to ${reveal?.kind}, not the reveal`)
  // The rebuild from a copy taken up to 1s before the freeze lands close to the lawn the
  // guest's own garden reached when it woke and caught up.
  const own = gp.own.score
  const rebuilt = gp.mine.score
  if (Math.abs(own.total - rebuilt.total) > 3 || own.junk !== rebuilt.junk)
    throw new Error(
      `the rebuild scores ${JSON.stringify(rebuilt)}, the guest's own lawn ${JSON.stringify(own)}`
    )
  console.log(
    `${SIZE} ${gone ? 'gone' : 'frozen'}: own lawn ${own.total} (Green ${own.green}), rebuilt ${rebuilt.total} (Green ${rebuilt.green})`
  )
  console.log(
    `${SIZE} ${gone ? 'gone' : 'frozen'}: the host judged the ${gone ? 'Gone' : 'Away'} guest ${(waited / 1000).toFixed(1)}s into the reveal from its rebuilt lawn: ${gp.mine.counts.gnomes} gnomes, Junk ${h.results[0].scores[1].junk}, ${gp.mine.blame.clips} clips; both screens draw the rebuild`
  )
  check()
  await context.close()
}

const frozen = browser => frozenGuest(browser, false)
const gone = browser => frozenGuest(browser, true)

/** A guest reload mid-round keeps the bag, the can, the tap, the arm and own faults. */
async function chores(browser) {
  const { a, b, check, context } = await pair(browser, 'fast&calm')
  await startMatch(a, b)
  await dev(b, g => {
    g.act.setBag(90)
    g.act.tap()
  })
  // The running tap floods its 2 nearest patches after 8s.
  await waitFor(b, () => true)
  const flooded = await (async () => {
    for (let i = 0; i < 40; i++) {
      const blame = await dev(b, g => g.garden().blame)
      if (blame.drowned >= 2) return blame
      await sleep(300)
    }
    throw new Error('the tap never flooded')
  })()
  await dev(b, g => g.act.setArm(0.9))
  await sleep(1300)
  const copy = (await dev(a, g => g.neighbour())).lawn
  await b.reload()
  await waitFor(b, s => s.gardenRound === 0 && s.matchPhase?.kind === 'play')
  await sleep(300)
  const back = await dev(b, g => g.garden())
  const start = await dev(b, g => g.start())
  if (!start?.copy) throw new Error('the reload did not rebuild from a copy')
  if (back.mower.bag !== 90) throw new Error(`bag ${back.mower.bag}, not 90`)
  if (!back.water.tapOn) throw new Error('the reload turned the tap off')
  if (back.blame.drowned < flooded.drowned)
    throw new Error(`drowned ${back.blame.drowned}, was ${flooded.drowned}`)
  if (back.arm.level < 0.5) throw new Error(`arm ${back.arm.level}, was 0.9`)
  // Now the can: tap off, a part-used can, then reload again.
  await dev(b, g => {
    g.act.tap()
    g.act.setCan(4200)
  })
  await sleep(1300)
  await b.reload()
  await waitFor(b, s => s.gardenRound === 0 && s.matchPhase?.kind === 'play')
  await sleep(300)
  const again = await dev(b, g => g.garden())
  if (again.water.tapOn) throw new Error('the reload turned the tap back on')
  if (Math.abs(again.water.can - 4200) > 100)
    throw new Error(`can ${again.water.can}, was 4200`)
  if (again.blame.drowned < flooded.drowned)
    throw new Error('the second reload lost the drowned patches')
  await shot(b, `away-${SIZE}-chores-reloaded`)
  console.log(
    `${SIZE} chores: the host's copy carried bag ${copy.chores.bag}, tap ${copy.chores.tapOn}, drowned ${copy.blame.drowned}; after a reload: bag ${back.mower.bag}, tap on, arm ${back.arm.level.toFixed(2)}, drowned ${back.blame.drowned}; after another: tap off, can ${again.water.can}`
  )
  check()
  await context.close()
}

/** A walkover keeps the loser's seat while the result shows. */
async function walkover(browser) {
  const { a, b, ids, page, check, context } = await pair(browser, 'fast')
  await startMatch(a, b)
  await b.close()
  await waitFor(a, s => s.over?.reason === 'walkover', {
    label: 'walkover',
    timeout: 75_000
  })
  await sleep(2000)
  const c = await page(ids.c, 'C', false)
  await waitFor(c, s => s.admission === 'full', { label: 'newcomer Room Full' })
  await shot(c, `away-${SIZE}-walkover-newcomer`)
  await c.close()
  await sleep(12_000)
  const b2 = await page(ids.b, 'B again', false)
  const back = await waitFor(b2, s => s.over?.reason === 'walkover', {
    label: 'returner sees the walkover'
  })
  if (back.over.winner !== ids.a) throw new Error('the wrong winner')
  await b2
    .getByText("You didn't come back in time.", { exact: false })
    .first()
    .waitFor({ timeout: 5000 })
  await shot(b2, `away-${SIZE}-walkover-returner`)
  await shot(a, `away-${SIZE}-walkover-winner`)
  console.log(
    `${SIZE} walkover: a newcomer 2s later saw Room Full, and the loser came back 14s later to the result`
  )
  check()
  await context.close()
}

/**
 * Over real Pusher, one `?fast` round (about 300 messages): the guest freezes 12s before
 * 0:00 and wakes after the verdict, which carries its rebuilt lawn to both screens.
 */
async function pusher(browser) {
  const url = `${BASE}/r/${roomCode()}?fast`
  const contexts = [
    await browser.newContext(SIZES.desktop),
    await browser.newContext(SIZES[SIZE])
  ]
  const pages = []
  const errors = []
  for (const [i, context] of contexts.entries()) {
    const p = await context.newPage()
    errors.push(watchErrors(p, i ? 'B' : 'A'))
    await p.goto(url)
    await waitFor(p, s => s.admission === 'seated', { timeout: 20_000 })
    pages.push(p)
  }
  for (const p of pages)
    await waitFor(p, s => s.seats.length === 2 && s.peer, { timeout: 20_000 })
  const roles = await Promise.all(pages.map(p => dev(p, g => g.state().role)))
  const host = pages[roles.indexOf('host')]
  const guest = pages[roles.indexOf('guest')]
  await startMatch(host, guest)
  await waitFor(host, s => s.matchPhase?.msLeft < 12_000, {
    label: '12s left',
    timeout: 60_000
  })
  const guestContext = contexts[pages.indexOf(guest)]
  const wake = await freeze(guest, await guestContext.newCDPSession(guest))
  const h = await waitFor(host, s => s.results.length === 1, {
    label: 'host verdict',
    timeout: 30_000
  })
  await sleep(1000)
  await wake()
  const g = await waitFor(guest, s => s.results.length === 1, {
    label: 'guest verdict',
    timeout: 15_000
  })
  const hp = await dev(host, g => g.packs(0))
  const gp = await dev(guest, g => g.packs(0))
  if (!h.results[0].guestFinal || gp.mine.pack !== hp.theirs.pack)
    throw new Error('the two screens draw different guest lawns')
  if (JSON.stringify(h.results) !== JSON.stringify(g.results))
    throw new Error('the verdicts differ')
  const nets = await Promise.all(pages.map(p => dev(p, g => g.net())))
  const events = nets.map(n => n.sent.bundles + n.clockSends)
  const largest = Math.max(...nets.map(n => n.sent.largest))
  console.log(
    `pusher: the frozen guest's rebuilt lawn reached both screens (${gp.mine.counts.gnomes} gnomes, Junk ${g.results[0].scores[1].junk}); ${events.join(' and ')} client events, largest bundle ${largest} B`
  )
  errors.forEach(e => e.check())
  for (const context of contexts) await context.close()
}

const PARTS = { hidden, overEnd, frozen, gone, chores, walkover }
const browser = await launch()
try {
  if (PART === 'pusher') await pusher(browser)
  else
    for (const [name, part] of Object.entries(PARTS))
      if (!PART || PART === name || PART === 'all') await part(browser)
  console.log('away: all checks passed')
} finally {
  await browser.close()
}
