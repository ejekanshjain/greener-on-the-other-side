// M18 finals and verdicts on two ?local&fast&calm pages. Each round, one lawn gets worse
// at random, the host jumps to the round's last moments, and both pages must show the
// same verdict, tally and totals, also with drop=0.3 on both transports. The verdict
// card and the top bar's rosettes are checked on screen at three sizes. A guest frozen
// (like a hidden phone) through 0:00 gets the host's verdict when it comes back.
//
// Usage: node e2e/results.mjs [rounds=20] [size or soak]
import {
  dev,
  launch,
  localPair,
  rematch,
  shot,
  sleep,
  waitFor
} from './lib.mjs'

const ROUNDS = Number(process.argv[2] ?? 20)
const ONLY = process.argv[3]

/** Waits until `predicate(state)` holds on both pages. */
const both = (a, b, predicate, label, timeout = 20_000) =>
  Promise.all([a, b].map(p => waitFor(p, predicate, { label, timeout })))

/** The host page and the guest page. */
async function roles(a, b) {
  const s = await dev(a, g => g.state())
  return s.role === 'host' ? [a, b] : [b, a]
}

/** What the verdict card shows: your lines, theirs and the round line. */
function card(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="verdict"]')
    if (!el || el.hidden) return null
    const read = id => el.querySelector(`[data-testid="${id}"]`)?.textContent
    const keys = ['green', 'stripes', 'tidy', 'junk', 'total']
    return {
      mine: keys.map(k => Number(read(`mine-${k}`))),
      theirs: keys.map(k => Number(read(`theirs-${k}`))),
      line: read('round-line'),
      match: read('match-line') ?? null,
      rosettes: [...document.querySelectorAll('[data-testid="rosettes"]')].map(
        r => r.children.length
      )
    }
  })
}

const lines = s => [s.green, s.stripes, s.tidy, s.junk, s.total]

/** Starts a match, with Ready in the lobby or Rematch at a match end, and returns the host and guest pages. */
async function newMatch(a, b) {
  const { phase } = await dev(a, g => g.state())
  if (phase === 'over') await rematch(a, b)
  else {
    await dev(a, g => g.ready(true))
    await dev(b, g => g.ready(true))
    await both(a, b, s => s.matchPhase?.kind === 'play', 'play')
  }
  return roles(a, b)
}

/**
 * Moves round `round` to its last 2.5s on both pages. A jump is a re-sent `start`, which
 * a lossy transport can drop, so the host repeats it, aimed at the same end, until the
 * guest's match clock agrees.
 */
async function jumpToEnd(host, guest, round) {
  const end = Date.now() + 2500
  for (let tries = 0; tries < 12; tries++) {
    await dev(host, (g, a) => g.jump(a.left, a.round), {
      left: Math.max(0, end - Date.now()),
      round
    })
    await sleep(400)
    const [h, g] = await Promise.all(
      [host, guest].map(p => dev(p, g => g.state()))
    )
    if (h.match.at === g.match.at) return
  }
}

/**
 * Plays round `round` to its verdict: spoils one lawn at random, jumps to the last
 * moments, and checks both pages agree. Returns the verdict.
 */
async function playRound(host, guest, round, seed) {
  const spoiled = seed % 3 === 0 ? host : seed % 3 === 1 ? guest : null
  await jumpToEnd(host, guest, round)
  // Spoil one lawn once its garden for this round is on screen.
  if (spoiled) {
    await waitFor(spoiled, s => s.gardenRound === round, { label: 'garden' })
    await dev(spoiled, (g, n) => g.dryLawn(n), 1 + (seed % 2))
  }
  await both(
    host,
    guest,
    (s, r = round) => s.results?.some(x => x.round === r),
    `verdict for round ${round + 1}`
  )
  const [h, g] = await Promise.all(
    [host, guest].map(p => dev(p, g => g.state()))
  )
  const hr = h.results.find(x => x.round === round)
  const gr = g.results.find(x => x.round === round)
  if (JSON.stringify(hr) !== JSON.stringify(gr))
    throw new Error(
      `round ${round + 1} differs:\n${JSON.stringify(hr)}\n${JSON.stringify(gr)}`
    )
  if (JSON.stringify(h.tally) !== JSON.stringify(g.tally))
    throw new Error(`tallies differ: ${h.tally} and ${g.tally}`)
  return hr
}

/** Checks the verdict card and rosettes on both pages against the verdict. */
async function checkCard(host, guest, result, size) {
  await sleep(2300)
  const [hc, gc] = await Promise.all([card(host), card(guest)])
  if (!hc || !gc) throw new Error(`${size}: no verdict card`)
  const [hs, gs] = result.scores.map(lines)
  if (
    JSON.stringify(hc.mine) !== JSON.stringify(hs) ||
    JSON.stringify(gc.mine) !== JSON.stringify(gs) ||
    JSON.stringify(hc.theirs) !== JSON.stringify(gs)
  )
    throw new Error(`${size}: cards show ${JSON.stringify([hc, gc])}`)
  // The top bar shows the round's rosette once Brenda pins it, 5.8s into a fast reveal.
  await waitFor(host, s => s.matchPhase?.elapsed >= 6000, { label: 'rosette' })
  const rosettes = await Promise.all(
    [host, guest].map(p =>
      p.evaluate(() =>
        [...document.querySelectorAll('[data-testid="rosettes"]')].reduce(
          (n, r) => n + r.children.length,
          0
        )
      )
    )
  )
  const wins = result.tally[0] + result.tally[1]
  if (rosettes.some(n => n !== wins))
    throw new Error(`${size}: rosettes ${rosettes} for tally ${result.tally}`)
  return [hc, gc]
}

/** The verdict card and rosettes at one screen size. */
async function screens(browser, size) {
  const { a, b, check, context } = await localPair(browser, {
    size,
    query: 'fast&calm'
  })
  const [host, guest] = await newMatch(a, b)
  const result = await playRound(host, guest, 0, 0)
  const [hc, gc] = await checkCard(host, guest, result, size)
  await shot(host, `results-${size}-host`)
  await shot(guest, `results-${size}-guest`)
  console.log(`${size}: host reads "${hc.line}", guest reads "${gc.line}"`)
  check()
  await context.close()
}

/** `ROUNDS` rounds across as many matches as it takes, with drop=0.3. */
async function soak(browser) {
  const { a, b, check, context } = await localPair(browser, {
    query: 'fast&calm&drop=0.3'
  })
  let played = 0
  let matches = 0
  while (played < ROUNDS) {
    const [host, guest] = await newMatch(a, b)
    matches++
    for (let round = 0; round < 3 && played < ROUNDS; round++) {
      const result = await playRound(host, guest, round, played * 7 + matches)
      played++
      console.log(
        `round ${played}: ${result.scores.map(s => s.total).join(' to ')}, winner ${result.winner}, tally ${result.tally}`
      )
      if (result.over) break
    }
    // The last reveal runs out and both pages show the match end.
    if (played < ROUNDS)
      await both(a, b, s => s.phase === 'over', 'match end', 40_000)
  }
  console.log(
    `soak: ${played} rounds in ${matches} matches agreed with drop=0.3`
  )
  check()
  await context.close()
}

/** A guest frozen through 0:00 gets the host's verdict when it comes back. */
async function frozenGuest(browser) {
  const { a, b, check, context } = await localPair(browser, {
    query: 'fast&calm'
  })
  const [host, guest] = await newMatch(a, b)
  const cdp = await context.newCDPSession(guest)
  await dev(guest, g => g.dryLawn(2))
  await dev(host, g => g.jump(2500, 0))
  await sleep(500)
  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' })
  await waitFor(host, s => s.results?.length === 1, {
    label: 'host verdict without the guest',
    timeout: 15_000
  })
  await cdp.send('Page.setWebLifecycleState', { state: 'active' })
  const g = await waitFor(guest, s => s.results?.length === 1, {
    label: 'guest verdict after waking',
    timeout: 15_000
  })
  const h = await dev(host, g => g.state())
  if (JSON.stringify(h.results) !== JSON.stringify(g.results))
    throw new Error('the woken guest shows a different verdict')
  console.log(
    `frozen guest: woke to the host's verdict, ${h.results[0].scores.map(s => s.total).join(' to ')}`
  )
  check()
  await context.close()
}

const browser = await launch()
try {
  for (const size of ['desktop', 'phone', 'small'])
    if (!ONLY || ONLY === size) await screens(browser, size)
  if (!ONLY || ONLY === 'soak') {
    await frozenGuest(browser)
    await soak(browser)
  }
  console.log('results: all checks passed')
} finally {
  await browser.close()
}
