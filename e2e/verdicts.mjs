// Verdicts a host page lost, on two ?local&fast&calm pages with fixed ids, so page A
// always hosts:
// - `reload`: the host reloads 0.5s after round 1's verdict. Its reveal still peels,
//   counts and pins the rosette, and its match end lists every round like the guest's.
//   A guest that goes quiet there shows Away beside its name.
// - `missed`: the host closes its page 1s before round 1 ends and comes back in round 2.
//   Round 1 still gets one verdict, the same on both pages, and the guest stops repeating
//   its final while the host is gone.
//
// Usage: node e2e/verdicts.mjs [both|reload|missed] [desktop|phone|small]
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

const ONLY = process.argv[2] ?? 'both'
const SIZE = process.argv[3] ?? 'desktop'

/** Two ?local pages in one context with fixed ids: `a` sorts first, so it hosts. */
async function pair(browser) {
  const context = await browser.newContext(SIZES[SIZE])
  const code = roomCode()
  const tag = Math.random().toString(36).slice(2, 8).padEnd(6, '0')
  const ids = { a: `aa${tag}xx`, b: `bb${tag}xx` }
  const url = id => `${BASE}/r/${code}?local&fast&calm&pid=${id}`
  const watchers = []
  const open = async (id, label) => {
    const p = await context.newPage()
    watchers.push(watchErrors(p, label))
    await p.goto(url(id))
    return p
  }
  const a = await open(ids.a, 'A')
  await waitFor(a, s => s.admission === 'seated')
  const b = await open(ids.b, 'B')
  for (const p of [a, b]) await waitFor(p, s => s.seats.length === 2)
  return {
    context,
    a,
    b,
    ids,
    open,
    check: () => watchers.forEach(w => w.check())
  }
}

/** Moves the host's round `round` to `msLeft` left and waits until the guest follows. */
async function jump(host, guest, round, msLeft) {
  await dev(host, (g, a) => g.jump(a.msLeft, a.round), { msLeft, round })
  await waitFor(
    guest,
    s => s.matchPhase?.kind === 'play' && s.matchPhase.msLeft <= msLeft + 500,
    { label: `guest follows the jump in round ${round + 1}` }
  )
}

/** The match end's points table body: each row's cells, your points first. */
function pointsRows(page) {
  return page
    .getByTestId('match-points')
    .evaluate(table =>
      [...table.querySelectorAll('tbody tr')].map(tr =>
        [...tr.children].map(cell => cell.textContent.trim())
      )
    )
}

async function reload(browser) {
  const { context, a, b, check } = await pair(browser)
  await startMatch(a, b)
  // The guest's lawn is drier, so the host wins round 1 and the match goes on.
  await dev(b, g => g.dryLawn(3))
  await jump(a, b, 0, 1500)
  const verdict = await waitFor(a, s => s.results.length === 1, {
    label: 'round 1 verdict'
  })
  await sleep(500)
  await a.reload()
  const back = await waitFor(
    a,
    s => s.role === 'host' && s.results.length === 1,
    { label: 'reloaded host holds the round 1 verdict' }
  )
  if (JSON.stringify(back.results) !== JSON.stringify(verdict.results))
    throw new Error('the reloaded host shows another verdict')
  const steps = new Set()
  for (let i = 0; i < 80; i++) {
    const r = await dev(a, g => ({
      ...g.reveal(),
      phase: g.state().matchPhase
    }))
    if (r.phase?.kind !== 'reveal') break
    steps.add(r.step)
    if (r.step === 'count' && !steps.has('shot')) {
      steps.add('shot')
      await shot(a, `verdicts-reload-${SIZE}-host-count`)
      if (r.mine.length === 0 || r.theirs.length === 0)
        throw new Error('Brenda has no lines on the reloaded host')
    }
    await sleep(100)
  }
  for (const step of ['peel', 'count', 'rosette'])
    if (!steps.has(step))
      throw new Error(
        `the reloaded host never reached ${step}: saw ${[...steps]}`
      )
  console.log(
    `${SIZE}: the host reloaded 0.5s after the verdict and still saw ${[...steps].filter(s => s !== 'shot').join(', ')}`
  )
  // Round 2: the host wins again, which ends the match.
  for (const p of [a, b])
    await waitFor(
      p,
      s => s.matchPhase?.kind === 'play' && s.matchPhase.round === 1,
      { label: 'round 2', timeout: 20_000 }
    )
  await dev(b, g => g.dryLawn(3))
  await jump(a, b, 1, 1500)
  for (const p of [a, b])
    await waitFor(p, s => s.phase === 'over', {
      label: 'match end',
      timeout: 30_000
    })
  await sleep(500)
  const [ra, rb] = await Promise.all([pointsRows(a), pointsRows(b)])
  await shot(a, `verdicts-reload-${SIZE}-host-end`)
  await shot(b, `verdicts-reload-${SIZE}-guest-end`)
  console.log(`${SIZE}: host rows ${JSON.stringify(ra)}`)
  console.log(`${SIZE}: guest rows ${JSON.stringify(rb)}`)
  // Two rounds and the points line, each the guest's row mirrored.
  const mirrored = rb.map(([mine, label, theirs]) => [theirs, label, mine])
  if (ra.length !== 3 || JSON.stringify(ra) !== JSON.stringify(mirrored))
    throw new Error('the match ends list different rounds or points')
  // The guest's phone goes quiet at the match end: Away shows beside their name.
  await dev(b, g => g.fault({ offline: true }))
  await a.getByTestId('away').waitFor({ timeout: 9000 })
  await shot(a, `verdicts-reload-${SIZE}-end-away`)
  await dev(b, g => g.fault({ offline: false }))
  await a.getByTestId('away').waitFor({ state: 'detached', timeout: 5000 })
  console.log(`${SIZE}: the match end showed the quiet guest as Away`)
  check()
  await context.close()
}

async function missed(browser) {
  const { context, a, b, open, ids, check } = await pair(browser)
  await startMatch(a, b)
  await dev(b, g => g.dryLawn(3))
  await jump(a, b, 0, 2500)
  await sleep(1300)
  // The host closes its page about 1s before round 1 ends.
  await a.close({ runBeforeUnload: false })
  await waitFor(b, s => s.peer && !s.peer.listed, { label: 'host Gone' })
  await waitFor(b, s => s.pendingFinal?.round === 0, {
    label: 'guest waits on round 1',
    timeout: 5000
  })
  const sentAtEnd = (await dev(b, g => g.net())).sent.pushed.final ?? 0
  // It comes back once round 2 is in play.
  await waitFor(
    b,
    s => s.matchPhase?.kind === 'play' && s.matchPhase.round === 1,
    { label: 'round 2 without the host', timeout: 20_000 }
  )
  await sleep(1500)
  const whileGone =
    ((await dev(b, g => g.net())).sent.pushed.final ?? 0) - sentAtEnd
  const a2 = await open(ids.a, 'A2')
  const host = await waitFor(
    a2,
    s => s.role === 'host' && s.results.some(r => r.round === 0),
    { label: 'returned host judges round 1', timeout: 10_000 }
  )
  const guest = await waitFor(b, s => s.results.some(r => r.round === 0), {
    label: 'guest gets the round 1 verdict'
  })
  const r0 = s => JSON.stringify(s.results.find(r => r.round === 0))
  if (r0(host) !== r0(guest)) throw new Error('the pages disagree on round 1')
  if (guest.pendingFinal) throw new Error('the guest still waits on a final')
  const built = (await dev(a2, g => g.events(200))).find(
    e => e.type === 'finalBuilt'
  )
  if (!built) throw new Error('the returned host never built its round 1 final')
  const totalFinals = (await dev(b, g => g.net())).sent.pushed.final ?? 0
  console.log(
    `${SIZE}: round 1 judged after the host came back in round 2 (built from a copy: ${built.detail.copy}, ${built.detail.ms.toFixed(1)} ms), winner ${guest.results[0].winner}, tally ${JSON.stringify(guest.tally)}; the guest repeated its final ${whileGone} times while the host was gone, ${totalFinals} in all`
  )
  if (whileGone > 0)
    throw new Error('the guest repeated its final to an empty room')
  await sleep(1000)
  await shot(a2, `verdicts-missed-${SIZE}-host`)
  check()
  await context.close()
}

const browser = await launch()
try {
  if (ONLY !== 'missed') await reload(browser)
  if (ONLY !== 'reload') await missed(browser)
} finally {
  await browser.close()
}
