// M22 disconnects, rejoins and catch-up on two ?local pages with fixed player ids, so
// page A always hosts:
// - a guest reloaded mid-round rebuilds its lawn from the host's copy, plus the weeds it
//   missed (the same weeds the idle host grew);
// - hide(20000) on the host catches up to exactly the lawn of a twin that never hid,
//   and its timer keeps its lawn going, so the guest never sees it Away;
// - the offline fault shows Reconnecting on one page and Away, never a walkover, on the
//   other;
// - Ready resets when the guest reloads in the lobby, and a guest reloaded during a
//   reveal rejoins it and gets the verdict;
// - a closed tab shows Gone with its countdown, then a walkover, which the returner sees;
// - a guest that hears nothing for 60s ends the match as a no contest on both pages, and
//   Rematch still works.
// `steps` runs only the lobby, reveal and host reloads. `pusher` instead runs a short
// real-Pusher check that a closed context shows Gone.
//
// Usage: node e2e/rejoin.mjs [desktop|phone|small|steps|pusher]
import {
  BASE,
  dev,
  launch,
  roomCode,
  shot,
  SIZES,
  sleep,
  startMatch,
  waitFor,
  watchErrors
} from './lib.mjs'

const ONLY = process.argv[2]

/** Two ?local pages in one context with fixed ids: `a` sorts first, so it hosts. */
async function pair(browser, size, query = '') {
  const context = await browser.newContext(SIZES[size])
  const code = roomCode()
  const tag = Math.random().toString(36).slice(2, 8).padEnd(6, '0')
  const ids = { a: `aa${tag}xx`, b: `bb${tag}xx` }
  const url = id =>
    `${BASE}/r/${code}?local&pid=${id}${query ? `&${query}` : ''}`
  const errors = []
  const page = async (id, label) => {
    const p = await context.newPage()
    errors.push(watchErrors(p, label))
    await p.goto(url(id))
    await waitFor(p, s => s.admission === 'seated')
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
    url,
    page,
    check: () => errors.forEach(e => e.check())
  }
}

const text = (page, id) =>
  page.locator(`[data-testid="${id}"]`).first().textContent({ timeout: 4000 })

/** Reload mid-round: the guest's lawn comes back from the host's copy plus what it missed. */
async function reloadMidRound(ctx, size) {
  const { a, b } = ctx
  // Late enough for round 1's first two weeds.
  await sleep(9000)
  await dev(b, g => g.dryLawn(2))
  // A row 2 to 4 patch with nothing on it or crawling along its row, since a resting
  // gnome, a weed or a snail would take health from it before the check.
  const patch = await dev(b, g => {
    const garden = g.garden()
    const things = [...garden.items, ...garden.weeds, ...garden.snails]
    const at = t => Math.floor(t.ly / 40) * 12 + Math.floor(t.lx / 50)
    for (let p = 25; p < 59; p++)
      if (
        p % 12 > 0 &&
        p % 12 < 11 &&
        things.every(t => at(t) !== p) &&
        garden.snails.every(s => Math.floor(s.ly / 40) !== Math.floor(p / 12))
      )
        return p
    return -1
  })
  if (patch < 0) throw new Error(`${size}: no clear patch to water and mow`)
  await dev(b, (g, p) => g.setPatch(p, { health: 7, length: 0 }), patch)
  await sleep(2600)
  await b.reload()
  await waitFor(b, s => s.matchPhase?.kind === 'play' && s.gardenRound === 0, {
    label: 'guest back in play'
  })
  await sleep(400)
  const start = await dev(b, g => g.start())
  if (!start?.copy) throw new Error(`${size}: the reloaded guest had no copy`)
  const sent = (await dev(a, g => g.events(200)))
    .filter(e => e.type === 'copySent')
    .map(e => e.detail.pack)
  if (!sent.includes(start.copy))
    throw new Error(
      `${size}: the guest rebuilt from a copy the host never sent`
    )
  const copyLawn = await dev(a, g => g.neighbour().lawn)
  const gb = await dev(b, g => g.garden())
  const ga = await dev(a, g => g.garden())
  // The copy the host holds now may be the rebuilt guest's first report, which still
  // matches the rebuild; every patch must sit at or below the copy's health.
  let changed = 0
  for (let i = 0; i < 192; i++) {
    if (gb.health[i] > copyLawn.health[i] + 0)
      throw new Error(
        `${size}: patch ${i} healed from ${copyLawn.health[i]} to ${gb.health[i]}`
      )
    if (gb.health[i] !== copyLawn.health[i]) changed++
  }
  // Its growth timer may tick once between the copy and now, as it would live.
  if (gb.health[patch] < 6 || gb.length[patch] > 1) {
    const on = g =>
      [...g.items, ...g.weeds, ...g.snails]
        .filter(
          t => Math.floor(t.ly / 40) * 12 + Math.floor(t.lx / 50) === patch
        )
        .map(t => t.kind ?? 'snail')
    throw new Error(
      `${size}: watered, mown patch ${patch} came back at health ${gb.health[patch]} and length ${gb.length[patch]} (copy ${copyLawn.health[patch]}), under ${JSON.stringify(on(gb))}`
    )
  }
  if (changed > 30)
    throw new Error(`${size}: ${changed} patches differ from the copy`)
  const weeds = g => g.weeds.map(w => w.patch).sort((x, y) => x - y)
  if (JSON.stringify(weeds(gb)) !== JSON.stringify(weeds(ga)))
    throw new Error(
      `${size}: guest weeds ${weeds(gb)} differ from the idle host's ${weeds(ga)}`
    )
  const healthDrop = copyLawn.health.reduce((n, h) => n + h, 0)
  console.log(
    `${size}: reload rebuilt from the host's copy at ${Math.round(start.copyT / 100) / 10}s, ${changed} patches dried since, ${weeds(gb).length} weeds like the host (copy health ${healthDrop})`
  )
  await shot(b, `rejoin-${size}-rebuilt`)
}

/** hide(20000): the hidden page's timer keeps it on the twin's lawn, and never Away. */
async function hideCatchUp(ctx, size) {
  const { a, b } = ctx
  const hiddenAt = Date.now()
  await dev(a, g => g.hide(20000))
  while (Date.now() - hiddenAt < 19_000) {
    await sleep(1000)
    if ((await dev(b, g => g.state())).peer?.away)
      throw new Error(`${size}: the hidden host shows Away`)
  }
  await shot(b, `rejoin-${size}-hidden-host`)
  await sleep(hiddenAt + 20_500 - Date.now())
  const twin = await dev(a, g => g.twin())
  if (!twin?.sameLawn || !twin.sameFinal)
    throw new Error(
      `${size}: catch-up differs from the twin ${JSON.stringify(twin)}`
    )
  console.log(
    `${size}: hide(20000) caught up to the twin's lawn at ${(twin.t / 1000).toFixed(1)}s`
  )
}

/** The offline fault: Reconnecting here, Away there, and no walkover. */
async function offline(ctx, size) {
  const { a, b } = ctx
  await dev(b, g => g.fault({ offline: true }))
  await waitFor(b, s => s.conn === 'reconnecting', { label: 'reconnecting' })
  if ((await text(b, 'reconnecting')) !== 'Reconnecting…')
    throw new Error(`${size}: no Reconnecting banner`)
  await waitFor(a, s => s.peer?.away === true, {
    label: 'guest Away',
    timeout: 6000
  })
  await shot(b, `rejoin-${size}-reconnecting`)
  await shot(a, `rejoin-${size}-guest-away`)
  await sleep(9000)
  const s = await dev(a, g => g.state())
  if (s.phase !== 'match' || !s.peer.listed)
    throw new Error(
      `${size}: offline guest became ${s.phase}, listed ${s.peer.listed}`
    )
  await dev(b, g => g.fault({ offline: false }))
  await waitFor(b, s => s.conn === 'connected', { label: 'reconnected' })
  await waitFor(a, s => !s.peer.away, { label: 'guest back' })
  if ((await b.locator('[data-testid="reconnecting"]').count()) !== 0)
    throw new Error(`${size}: the banner stayed after reconnecting`)
  for (const p of [a, b])
    if ((await dev(p, g => g.state().phase)) !== 'match')
      throw new Error(`${size}: the match ended over a 12s drop`)
  console.log(`${size}: 12s offline showed Reconnecting and Away, no walkover`)
}

/** Ready resets on a lobby reload; a reveal reload rejoins the reveal with the verdict. */
async function stepReloads(browser) {
  const ctx = await pair(browser, 'desktop', 'fast&calm')
  const { a, b } = ctx
  await dev(b, g => g.ready(true))
  await waitFor(a, s => s.peer.ready, { label: 'guest ready' })
  await b.reload()
  await waitFor(b, s => s.seats.length === 2, { label: 'guest reseated' })
  const ra = await dev(a, g => g.state())
  const rb = await dev(b, g => g.state())
  if (ra.peer.ready || rb.myReady || ra.phase !== 'lobby')
    throw new Error('Ready survived a lobby reload')
  await startMatch(a, b)
  await dev(a, g => g.jump(1500, 0))
  await waitFor(b, s => s.matchPhase?.kind === 'reveal', { label: 'reveal' })
  await sleep(500)
  await b.reload()
  const s = await waitFor(
    b,
    s => s.matchPhase?.kind === 'reveal' && s.results.length === 1,
    { label: 'reveal rejoined with its verdict' }
  )
  const h = await dev(a, g => g.state())
  if (JSON.stringify(h.results) !== JSON.stringify(s.results))
    throw new Error('the reloaded guest shows another verdict')
  console.log(
    'lobby reload cleared Ready; reveal reload rejoined with the verdict'
  )
  // A host that reloads mid-round takes the match back from the guest's sync.
  for (const p of [a, b])
    await waitFor(
      p,
      s => s.matchPhase?.kind === 'play' && s.matchPhase.round === 1,
      { label: 'round 2', timeout: 20_000 }
    )
  await sleep(3000)
  const matchId = (await dev(b, g => g.state())).match.id
  await a.reload()
  const back = await waitFor(
    a,
    s =>
      s.role === 'host' && s.matchPhase?.kind === 'play' && s.gardenRound === 1,
    { label: 'host back in round 2' }
  )
  const start = await dev(a, g => g.start())
  if (back.match.id !== matchId || !start?.copy)
    throw new Error(
      `the reloaded host joined ${back.match.id} with copy ${!!start?.copy}`
    )
  if (
    JSON.stringify(back.tally) !==
    JSON.stringify((await dev(b, g => g.state())).tally)
  )
    throw new Error('the reloaded host lost the tally')
  await dev(a, g => g.jump(1500, 1))
  const verdict = await waitFor(a, s => s.results.some(r => r.round === 1), {
    label: 'round 2 verdict',
    timeout: 20_000
  })
  const guest = await waitFor(b, s => s.results.some(r => r.round === 1), {
    label: 'guest round 2 verdict'
  })
  const r1 = s => JSON.stringify(s.results.find(r => r.round === 1))
  if (r1(verdict) !== r1(guest))
    throw new Error('host and guest disagree after the host reloaded')
  console.log(
    `host reload rejoined ${matchId} with the tally and judged round 2 for both`
  )
  ctx.check()
  await ctx.context.close()
}

/** A closed tab: Gone with its countdown, a walkover at 60s, and the returner sees it. */
async function walkover(browser, size) {
  const ctx = await pair(browser, size, 'calm')
  const { a, b } = ctx
  await startMatch(a, b)
  const [nameA, nameB] = [
    (await dev(a, g => g.state())).me.name,
    (await dev(b, g => g.state())).me.name
  ]
  await b.close()
  await waitFor(a, s => s.peer && !s.peer.listed, {
    label: 'guest Gone',
    timeout: 4000
  })
  const gone = await text(a, 'gone')
  if (!/^Gone (1:00|0:5\d)$/.test(gone ?? ''))
    throw new Error(`${size}: the top bar shows "${gone}"`)
  await shot(a, `rejoin-${size}-gone`)
  const started = Date.now()
  await waitFor(a, s => s.over?.reason === 'walkover', {
    label: 'walkover',
    timeout: 70_000
  })
  const waited = (Date.now() - started) / 1000
  const line = await text(a, 'match-status')
  if (line !== `${nameB} didn't come back. You win.`)
    throw new Error(`${size}: walkover reads "${line}"`)
  await shot(a, `rejoin-${size}-walkover`)
  const back = await ctx.page(ctx.ids.b, 'B2')
  await waitFor(back, s => s.over?.reason === 'walkover', {
    label: 'returner sees the walkover'
  })
  const their = await text(back, 'match-status')
  if (their !== `You didn't come back in time. ${nameA} wins.`)
    throw new Error(`${size}: the returner reads "${their}"`)
  await shot(back, `rejoin-${size}-walked-over`)
  console.log(
    `${size}: Gone, then a walkover after ${waited.toFixed(0)}s more; the returner saw it`
  )
  ctx.check()
  await ctx.context.close()
}

/** A guest that hears nothing for 60s: a no contest on both pages, then a rematch. */
async function noContest(browser, size) {
  const ctx = await pair(browser, size, 'fast&calm')
  const { a, b } = ctx
  await startMatch(a, b)
  await dev(b, g => g.fault({ drop: 1 }))
  await waitFor(b, s => s.peer?.away === true, { label: 'host silent' })
  for (const p of [b, a])
    await waitFor(p, s => s.over?.reason === 'noContest', {
      label: 'no contest',
      timeout: 75_000
    })
  for (const p of [a, b]) {
    const line = await text(p, 'match-summary')
    if (line !== 'The line went dead. Nobody wins.')
      throw new Error(`${size}: no contest reads "${line}"`)
  }
  await shot(a, `rejoin-${size}-no-contest`)
  await dev(b, g => g.fault({ drop: 0 }))
  for (const p of [a, b])
    await p.click('role=button[name="Rematch"]', { force: true })
  for (const p of [a, b])
    await waitFor(p, s => s.phase === 'match' && !s.over, { label: 'rematch' })
  console.log(
    `${size}: 60s of silence ended as a no contest on both pages; Rematch worked`
  )
  ctx.check()
  await ctx.context.close()
}

async function local(browser, size) {
  const ctx = await pair(browser, size, 'calm')
  await startMatch(ctx.a, ctx.b)
  await reloadMidRound(ctx, size)
  await hideCatchUp(ctx, size)
  await offline(ctx, size)
  ctx.check()
  await ctx.context.close()
}

/** Real Pusher: a closed context leaves the member list, and its neighbour shows Gone. */
async function pusher(browser) {
  const t0 = Date.now()
  const url = `${BASE}/r/${roomCode()}?fast&calm`
  const ctxA = await browser.newContext(SIZES.desktop)
  const ctxB = await browser.newContext(SIZES.desktop)
  const a = await ctxA.newPage()
  const b = await ctxB.newPage()
  const ea = watchErrors(a, 'A')
  watchErrors(b, 'B')
  await a.goto(url)
  await waitFor(a, s => s.admission === 'seated', { timeout: 20_000 })
  await b.goto(url)
  for (const p of [a, b])
    await waitFor(p, s => s.seats.length === 2 && s.peer?.listed, {
      timeout: 20_000,
      label: 'seated on Pusher'
    })
  await startMatch(a, b)
  await sleep(2000)
  const closedAt = Date.now()
  await ctxB.close()
  await waitFor(a, s => s.peer && !s.peer.listed, {
    label: 'Gone on Pusher',
    timeout: 40_000
  })
  const goneMs = Date.now() - closedAt
  const gone = await text(a, 'gone')
  if (!gone?.startsWith('Gone'))
    throw new Error(`Pusher: the top bar shows "${gone}"`)
  const net = await dev(a, g => g.net())
  await dev(a, g => g.leave())
  await sleep(300)
  ea.check()
  await ctxA.close()
  console.log(
    `pusher: Gone ${goneMs} ms after the context closed ("${gone}"); A sent ${net.sent.bundles} bundles; ${((Date.now() - t0) / 1000).toFixed(0)}s`
  )
}

const browser = await launch()
try {
  if (ONLY === 'pusher') await pusher(browser)
  else {
    for (const size of ['desktop', 'phone', 'small'])
      if (!ONLY || ONLY === size) await local(browser, size)
    if (!ONLY || ONLY === 'desktop' || ONLY === 'steps')
      await stepReloads(browser)
    if (!ONLY || ONLY === 'desktop') await walkover(browser, 'desktop')
    if (!ONLY || ONLY === 'small') await walkover(browser, 'small')
    if (!ONLY || ONLY === 'desktop') await noContest(browser, 'desktop')
    if (!ONLY || ONLY === 'phone') await noContest(browser, 'phone')
  }
  console.log('rejoin: ok')
} finally {
  await browser.close()
}
