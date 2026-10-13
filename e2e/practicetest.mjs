// The Practice playtest: Practice Alone from the home screen, then a whole ?fast match
// against Mr Pemberton played with real input, his reactions, the reveal, the match end,
// the share card and a rematch. It fails on any request to Pusher.
// Usage: node e2e/practicetest.mjs [size]
import { hand } from './hand.mjs'
import {
  BASE,
  SIZES,
  dev,
  launch,
  shot,
  sleep,
  waitFor,
  watchErrors
} from './lib.mjs'

const SIZE = process.argv[2] ?? 'desktop'
const TAG = `practice-${SIZE}`
const button = (page, name) =>
  page.getByRole('button', { name, exact: true }).first()

const browser = await launch()
try {
  const context = await browser.newContext(SIZES[SIZE])
  const page = await context.newPage()
  const errors = watchErrors(page, 'practice')
  const pusher = []
  page.on('request', r => {
    // Pusher's servers or the auth route; the pusher-js code file itself may load.
    if (/pusher(app)?\.com|\/api\/pusher/.test(r.url())) pusher.push(r.url())
  })

  // Practice Alone from the home screen needs no name.
  await page.goto(`${BASE}/`)
  await page.getByRole('link', { name: 'Practice Alone' }).click()
  await page.waitForURL(/\/practice/)
  await page.getByRole('button', { name: 'Start' }).waitFor()
  await shot(page, `${TAG}-1-lobby`)

  // The same screen with ?fast for a short match.
  await page.goto(`${BASE}/practice?fast`)
  await button(page, 'Start').click()
  await waitFor(page, s => s.matchPhase?.kind === 'play', { label: 'play' })
  await sleep(1500)
  await shot(page, `${TAG}-2-play`)

  const me = hand(page, 'me', SIZE !== 'desktop')
  const seen = new Set()
  const bubbles = new Set()
  const watcher = (async () => {
    for (;;) {
      const s = await dev(page, g => ({
        phase: g.state().phase,
        mp: g.state().matchPhase,
        step: g.reveal().step,
        bubbles: g.neighbour().bubbles.map(b => b.text),
        fists: g.neighbour().fists.length,
        laughs: g.neighbour().laughs.length
      })).catch(() => null)
      if (!s || s.phase === 'over') break
      for (const b of s.bubbles) {
        if (!bubbles.has(b)) {
          bubbles.add(b)
          await shot(page, `${TAG}-bubble-${bubbles.size}`)
        }
      }
      if (s.fists) bubbles.add('(fist)')
      if (s.laughs) bubbles.add('(laugh)')
      const mp = s.mp
      let key = null
      if (mp?.kind === 'play') {
        const frac = mp.msLeft / (mp.msLeft + mp.elapsed)
        if (frac < 0.55 && frac > 0.45) key = `r${mp.round}-mid`
        if (frac < 0.12 && frac > 0.04) key = `r${mp.round}-finale`
      } else if (mp?.kind === 'reveal' && s.step === 'rosette')
        key = `r${mp.round}-rosette`
      if (key && !seen.has(key)) {
        seen.add(key)
        await shot(page, `${TAG}-3-${key}`)
      }
      await sleep(200)
    }
  })()
  await me.play()
  await watcher
  await waitFor(page, s => s.phase === 'over', { label: 'match end' })
  await sleep(2000)
  await shot(page, `${TAG}-4-end`)
  const s = await dev(page, g => g.state())
  for (const r of s.results)
    console.log(
      `round ${r.round + 1}: you ${r.scores[0].total}, Mr Pemberton ${r.scores[1].total}, winner ${r.winner}`
    )
  console.log(`Mr Pemberton's reactions: ${[...bubbles].join(' | ')}`)
  console.log(`your hand: ${JSON.stringify(me.counts)}`)

  await button(page, 'Share Card').click()
  await sleep(1200)
  await shot(page, `${TAG}-5-share`)
  await page.keyboard.press('Escape')
  await page
    .getByRole('button', { name: 'Rematch', exact: true })
    .click({ force: true })
  await waitFor(
    page,
    s => s.matchPhase?.kind === 'play' && s.matchPhase.round === 0,
    { label: 'rematch', timeout: 15_000 }
  )
  console.log('practice rematch started')
  if (pusher.length)
    throw new Error(`Practice talked to Pusher: ${pusher.slice(0, 3)}`)
  errors.check()
  await context.close()
} finally {
  await browser.close()
}
