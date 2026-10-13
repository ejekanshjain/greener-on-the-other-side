// M27: a full ?local match played by hand on both pages at once, with full-length rounds.
// Each page has a "hand" that reads its own garden through the dev API and plays like a
// regular with real input: the mouse at desktop size, touch pointer events on phones. It
// taps Biscuit, runs the tap, empties the bag, drags, lifts and throws heavy junk, yanks
// and throws weeds, throws snails and loose things, waters the driest spot and mows the
// longest column. It prints each round's verdict and screenshots the match end.
// Usage: node e2e/play.mjs [size], where size is desktop (default), phone, small or se.
import { hand } from './hand.mjs'
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
const TOUCH = SIZE !== 'desktop'
const browser = await launch()
try {
  const started = Date.now()
  const { a, b, check, context } = await localPair(browser, { size: SIZE })
  await startMatch(a, b)
  const hands = [hand(a, 'A', TOUCH), hand(b, 'B', TOUCH)]
  let shots = 0
  const snap = setInterval(() => {
    if (shots < 6) void shot(a, `play-${SIZE}-${shots++}`).catch(() => {})
  }, 30_000)
  await Promise.all(hands.map(h => h.play()))
  clearInterval(snap)
  for (const p of [a, b])
    await waitFor(p, s => s.phase === 'over', {
      label: 'match end',
      timeout: 60_000
    })
  await sleep(1500)
  await shot(a, `play-${SIZE}-end-a`)
  await shot(b, `play-${SIZE}-end-b`)
  const sa = await dev(a, g => g.state())
  const sb = await dev(b, g => g.state())
  for (const r of sa.results) {
    const line = s =>
      `green ${s.green} stripes ${s.stripes} tidy ${s.tidy} junk ${s.junk} = ${s.total}`
    console.log(
      `round ${r.round + 1}: host ${line(r.scores[0])} | guest ${line(r.scores[1])} | winner ${r.winner}${r.blame ? `, blame ${r.blame}` : ''}`
    )
  }
  if (
    JSON.stringify(sa.results.map(r => r.scores)) !==
    JSON.stringify(sb.results.map(r => r.scores))
  )
    throw new Error('the two pages disagree on the verdicts')
  console.log(
    `hands: A ${JSON.stringify(hands[0].counts)}, B ${JSON.stringify(hands[1].counts)}`
  )
  console.log(
    `play ${SIZE}: a full match by hand in ${((Date.now() - started) / 60_000).toFixed(1)} min`
  )
  check()
  await context.close()
} finally {
  await browser.close()
}
