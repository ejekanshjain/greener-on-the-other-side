// Match endings nobody plays for: two idle gardens on one seed end every round level, so
// the match ends drawn ("Brenda can't choose."). Then B leaves from the match end by
// click, A reads "neighbour_name left." and goes back to the lobby, B comes back by the
// link and a new match starts from Ready.
// Usage: node e2e/endings.mjs [size]
import {
  dev,
  launch,
  localPair,
  shot,
  sleep,
  startMatch,
  waitFor
} from './lib.mjs'

const SIZE = process.argv[2] ?? 'desktop'
const TAG = `endings-${SIZE}`
const button = (page, name) =>
  page.getByRole('button', { name, exact: true }).first()

const browser = await launch()
try {
  const { a, b, url, check } = await localPair(browser, {
    query: 'fast&calm',
    size: SIZE
  })
  await startMatch(a, b)
  const host = (await dev(a, g => g.state().role)) === 'host' ? a : b

  // Nobody plays: the host skips to each round's last moments.
  for (let round = 0; round < 3; round++) {
    await waitFor(
      host,
      s => s.matchPhase?.kind === 'play' && s.matchPhase.round === round,
      { label: `round ${round + 1}`, timeout: 30_000 }
    )
    await dev(host, (g, r) => g.jump(400, r), round)
    await waitFor(host, s => s.results.length > round, {
      label: `verdict ${round + 1}`,
      timeout: 20_000
    })
  }
  for (const p of [a, b])
    await waitFor(p, s => s.phase === 'over', {
      label: 'match end',
      timeout: 40_000
    })
  await sleep(1500)
  await shot(a, `${TAG}-1-drawn`)
  const sa = await dev(a, g => g.state())
  console.log(
    `${SIZE}: ${sa.results.map(r => `${r.scores[0].total}-${r.scores[1].total} ${r.winner}`).join(', ')}; A reads "${await a.getByTestId('match-summary').textContent()}"`
  )

  // B leaves from the match end; A sees it and goes back to the lobby.
  await button(b, 'Leave').click()
  await b.waitForURL(u => !u.pathname.startsWith('/r/'))
  await a.getByTestId('match-status').waitFor()
  await sleep(500)
  await shot(a, `${TAG}-2-they-left`)
  console.log(
    `${SIZE}: A reads "${await a.getByTestId('match-status').textContent()}"`
  )
  await button(a, 'Back to Lobby').click()
  await waitFor(a, s => s.phase === 'lobby', { label: 'lobby' })
  await sleep(500)
  await shot(a, `${TAG}-3-lobby-alone`)

  // B comes back by the link, and both press Ready for a new match.
  await b.goto(url)
  for (const p of [a, b])
    await waitFor(p, s => s.seats.length === 2 && s.peer?.listed, {
      label: 'both seated'
    })
  await button(a, 'Ready').click({ force: true })
  await button(b, 'Ready').click({ force: true })
  for (const p of [a, b])
    await waitFor(p, s => s.matchPhase?.kind === 'play', {
      label: 'new match',
      timeout: 15_000
    })
  const next = await dev(a, g => g.state().match.id)
  if (next === sa.match.id) throw new Error('the new match kept the old id')
  console.log(`${SIZE}: B came back by the link and a new match started`)
  check()
} finally {
  await browser.close()
}
