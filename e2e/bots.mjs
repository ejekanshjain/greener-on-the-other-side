// M21 autopilot: two ?local&fast pages with `?bot=` play a whole match with no help but
// the dev jumps that shorten rounds. Both pages must agree on every verdict and the
// match end, with a clean console.
//
// Usage: node e2e/bots.mjs [profileA=regular] [profileB=expert]
import { dev, launch, localPair, waitFor } from './lib.mjs'

const [A = 'regular', B = 'expert'] = process.argv.slice(2)

const browser = await launch()
try {
  const { a, b, check, context } = await localPair(browser, {
    query: `fast&bot=${A}`
  })
  // The second page swaps its own profile in through the dev hook.
  await dev(b, (g, name) => g.autopilot(name), B)
  await dev(a, g => g.ready(true))
  await dev(b, g => g.ready(true))
  for (const p of [a, b])
    await waitFor(p, s => s.matchPhase?.kind === 'play', { label: 'play' })
  const host = (await dev(a, g => g.state())).role === 'host' ? a : b
  for (let round = 0; round < 3; round++) {
    const s = await dev(host, g => g.state())
    if (s.phase !== 'match' || s.results.some(r => r.over)) break
    // 20s of each round play out live; the rest is skipped.
    await dev(host, (g, r) => g.jump(20_000, r), round)
    // The guest hears the verdict one message after the host decides it.
    for (const p of [host, host === a ? b : a])
      await waitFor(p, (st, r = round) => st.results.some(x => x.round === r), {
        label: `verdict ${round + 1}`,
        timeout: 40_000
      })
    const results = await Promise.all(
      [a, b].map(p =>
        dev(p, (g, r) => g.state().results.find(x => x.round === r), round)
      )
    )
    if (JSON.stringify(results[0]) !== JSON.stringify(results[1]))
      throw new Error(`round ${round + 1} differs`)
    const [h, g] = results[0].scores.map(x => x.total)
    console.log(`round ${round + 1}: ${h} to ${g}, winner ${results[0].winner}`)
    const thrown = await Promise.all(
      [a, b].map(p =>
        dev(p, g => g.events(200).filter(e => e.type === 'throw').length)
      )
    )
    if (thrown.some(n => n === 0)) throw new Error(`no throws: ${thrown}`)
  }
  for (const p of [a, b])
    await waitFor(p, s => s.phase === 'over', {
      label: 'match end',
      timeout: 60_000
    })
  const [x, y] = await Promise.all([a, b].map(p => dev(p, g => g.state())))
  if (JSON.stringify(x.results) !== JSON.stringify(y.results))
    throw new Error('the pages disagree on the match')
  if (x.over.winner !== y.over.winner)
    throw new Error(`winners differ: ${x.over.winner} ${y.over.winner}`)
  check()
  console.log(
    `bots: ${A} against ${B} agreed on a ${x.results.length}-round match`
  )
  await context.close()
} finally {
  await browser.close()
}
