// The playtest: two players go from the home screen through the lobby, a whole best-of-3
// match, the reveal, the match end, the share card and a rematch, using real clicks,
// typing, mouse drags and touch swipes. It screenshots every step for review, checks both
// pages agree on every verdict, and reports the network numbers.
// Usage: node e2e/playtest.mjs [sizeA] [sizeB] [extra query] [pusher]
// Sizes: desktop, phone, small, se. Page A starts the room and B joins with the code. With
// `?local` both pages share one context, so a mixed pair takes A's context and resizes B's
// page (B keeps A's touch setting). `pusher` uses real Pusher with a context per player,
// so each keeps its own size and touch: it spends about 1,000 messages of the daily quota.
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

const SIZE_A = process.argv[2] ?? 'desktop'
const SIZE_B = process.argv[3] ?? SIZE_A
const EXTRA = process.argv[4] ?? 'fast'
const PUSHER = process.argv[5] === 'pusher'
const QUERY = `?${[PUSHER ? '' : 'local', EXTRA].filter(Boolean).join('&')}`
const TAG = `pt-${PUSHER ? 'pusher-' : ''}${SIZE_A}-${SIZE_B}`

const button = (page, name) =>
  page.getByRole('button', { name, exact: true }).first()
/** Ready and Rematch pulse while the neighbour waits, so clicks skip the stillness check. */
const press = (page, name) => button(page, name).click({ force: true })

/** Types a name on the home screen and returns the page. */
async function home(page, name) {
  await page.goto(`${BASE}/${QUERY}`)
  const box = page.getByLabel('Your Name')
  await box.waitFor()
  await sleep(300)
  await box.fill(name)
  return page
}

/** Samples both pages' send stats once a second while `running()` holds. */
function netWatch(pages) {
  const samples = pages.map(() => [])
  let stop = false
  const done = (async () => {
    while (!stop) {
      for (const [i, p] of pages.entries()) {
        const n = await dev(p, g => {
          const s = g.net().sent
          return {
            bundles: s.bundles,
            bytes: s.bytes,
            largest: s.largest,
            peak: s.peakPerSecond,
            clock: g.net().clockSends
          }
        }).catch(() => null)
        if (n) samples[i].push({ at: Date.now(), ...n })
      }
      await sleep(1000)
    }
  })()
  return {
    samples,
    async stop() {
      stop = true
      await done
    }
  }
}

const browser = await launch()
try {
  const started = Date.now()
  const context = await browser.newContext(SIZES[SIZE_A])
  const contextB = PUSHER ? await browser.newContext(SIZES[SIZE_B]) : context
  const a = await context.newPage()
  const b = await contextB.newPage()
  if (!PUSHER && SIZE_B !== SIZE_A)
    await b.setViewportSize(SIZES[SIZE_B].viewport)
  const ea = watchErrors(a, 'A')
  const eb = watchErrors(b, 'B')

  // Home: A types a name and starts a room.
  await home(a, 'Gnome Hoarder')
  await shot(a, `${TAG}-01-home`)
  await button(a, 'Start a Room').click()
  await a.waitForURL(/\/r\/[a-z0-9]{6}/)
  await waitFor(a, s => s.admission === 'seated')
  await sleep(500)
  await shot(a, `${TAG}-02-lobby-alone`)
  const code = new URL(a.url()).pathname.split('/').pop()

  // B joins with the code, typed in capitals with a space.
  await home(b, 'Compost Mentis')
  await button(b, 'Join With Code').click()
  await b
    .getByLabel('Room Code')
    .pressSequentially(
      `${code.slice(0, 3).toUpperCase()} ${code.slice(3).toUpperCase()}`,
      { delay: 60 }
    )
  await b.waitForURL(/\/r\/[a-z0-9]{6}/)
  for (const p of [a, b]) await waitFor(p, s => s.seats.length === 2)
  await sleep(600)
  await shot(a, `${TAG}-03-lobby-a`)
  await shot(b, `${TAG}-03-lobby-b`)

  // Ready, Not Ready, Ready again on B; A's button pulses meanwhile.
  await press(b, 'Ready')
  await sleep(700)
  await shot(a, `${TAG}-04-lobby-they-ready`)
  await shot(b, `${TAG}-04-lobby-you-ready`)
  await press(b, 'Not Ready')
  await sleep(400)
  await press(b, 'Ready')
  await press(a, 'Ready')
  await waitFor(a, s => s.matchPhase?.kind === 'countdown', {
    label: 'countdown'
  })
  await sleep(700)
  await shot(a, `${TAG}-05-countdown`)
  await shot(b, `${TAG}-05-countdown-b`)
  for (const p of [a, b])
    await waitFor(p, s => s.matchPhase?.kind === 'play', { label: 'play' })
  await sleep(1200)
  await shot(a, `${TAG}-06-play-start`)
  await shot(b, `${TAG}-06-play-start-b`)

  const touchA = SIZE_A !== 'desktop'
  const touchB = PUSHER ? SIZE_B !== 'desktop' : touchA
  const hands = [hand(a, 'A', touchA), hand(b, 'B', touchB)]
  const net = netWatch([a, b])

  // Screenshots through each round and reveal, driven by what A's page shows.
  const seen = new Set()
  const observer = (async () => {
    for (;;) {
      const s = await dev(a, g => ({
        phase: g.state().phase,
        mp: g.state().matchPhase,
        step: g.reveal().step
      })).catch(() => null)
      if (!s) break
      if (s.phase === 'over') break
      const mp = s.mp
      let key = null
      if (mp?.kind === 'play') {
        const frac = mp.msLeft / (mp.msLeft + mp.elapsed)
        if (frac < 0.55 && frac > 0.45) key = `r${mp.round}-mid`
        if (frac < 0.15 && frac > 0.05) key = `r${mp.round}-finale`
      } else if (mp?.kind === 'reveal') {
        key = `r${mp.round}-reveal-${s.step}`
        // The walk home: once as she sets off, once near the end with the caption.
        if (s.step === 'ending' && mp.msLeft < 2500) key += '-late'
      }
      if (key && !seen.has(key)) {
        seen.add(key)
        await shot(a, `${TAG}-07-${key}-a`)
        await shot(b, `${TAG}-07-${key}-b`)
      }
      await sleep(250)
    }
  })()

  await Promise.all(hands.map(h => h.play()))
  await observer
  await net.stop()
  for (const p of [a, b])
    await waitFor(p, s => s.phase === 'over', {
      label: 'match end',
      timeout: 60_000
    })
  await sleep(2000)
  await shot(a, `${TAG}-08-end-a`)
  await shot(b, `${TAG}-08-end-b`)

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
    `tally (host first) on A ${JSON.stringify(sa.tally)}, on B ${JSON.stringify(sb.tally)}`
  )

  // Network: bundles per second over the match, peak, largest bundle.
  for (const [i, list] of net.samples.entries()) {
    const first = list[0]
    const last = list[list.length - 1]
    const secs = (last.at - first.at) / 1000
    console.log(
      `${i ? 'B' : 'A'}: ${last.bundles - first.bundles} bundles in ${secs.toFixed(0)}s = ${((last.bundles - first.bundles) / secs).toFixed(2)}/s, peak ${last.peak}/s, largest ${last.largest} B, ${last.bytes} B total, clock pings ${last.clock}`
    )
  }
  console.log(
    `hands: A ${JSON.stringify(hands[0].counts)}, B ${JSON.stringify(hands[1].counts)}`
  )
  // Every bundle and clock ping is one client event: Pusher counts it once sent and once
  // delivered to the one other member.
  const events = await Promise.all(
    [a, b].map(p =>
      dev(p, g => ({
        sent: g.net().sent.bundles + g.net().clockSends,
        received: g.net().received,
        drops: g.net().drops,
        role: g.state().role
      }))
    )
  )
  const total = events[0].sent + events[1].sent
  console.log(
    `client events from the home screen to the match end: A ${events[0].sent} (${events[0].role}), B ${events[1].sent} (${events[1].role}); about ${total * 2} Pusher messages`
  )
  console.log(
    `received A ${JSON.stringify(events[0].received)} drops ${JSON.stringify(events[0].drops)}`
  )
  console.log(
    `received B ${JSON.stringify(events[1].received)} drops ${JSON.stringify(events[1].drops)}`
  )

  // Share card, then a rematch from the match end.
  await button(b, 'Share Card').click()
  await sleep(1500)
  await shot(b, `${TAG}-08-share-card`)
  await b.keyboard.press('Escape')
  await sleep(400)
  await press(a, 'Rematch')
  await sleep(800)
  await shot(a, `${TAG}-09-rematch-you`)
  await shot(b, `${TAG}-09-rematch-them`)
  await press(b, 'Rematch')
  for (const p of [a, b])
    await waitFor(
      p,
      s => s.matchPhase?.kind === 'play' && s.matchPhase.round === 0,
      { label: 'rematch play', timeout: 20_000 }
    )
  await sleep(1000)
  await shot(b, `${TAG}-10-rematch-play`)
  const next = await dev(a, g => g.state().match)
  if (next.id === sa.match.id) throw new Error('the rematch kept the old match')
  console.log(`rematch started with seed ${next.seed} (was ${sa.match.seed})`)
  console.log(
    `playtest ${TAG}: ${((Date.now() - started) / 60_000).toFixed(1)} min`
  )
  ea.check()
  eb.check()
  await context.close()
  if (PUSHER) await contextB.close()
} finally {
  await browser.close()
}
