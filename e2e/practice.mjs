// M21 Practice: a ?fast&calm Practice match against Mr Pemberton at one screen size per
// run (desktop, phone, small; all three by default). Start begins the match; round 1's
// first tip shows; three gnomes thrown into his front rows get "My begonias!" and his
// fist; a soft throw that clips gets his laugh; then autopilot plays on and the match
// runs to its end, where his own clip has said "Blast." along the way and he asks for a
// rematch. Nothing ever talks to Pusher.
//
// Usage: node e2e/practice.mjs [desktop|phone|small]
import {
  BASE,
  dev,
  launch,
  shot,
  SIZES,
  sleep,
  waitFor,
  waitForNotice,
  watchErrors
} from './lib.mjs'

const ONLY = process.argv[2]

/** Waits until Mr Pemberton has said `text`, checking his event log. */
async function said(page, text, timeout = 8000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const lines = await dev(page, g =>
      g.bot
        .events(200)
        .filter(e => e.type === 'say')
        .map(e => e.detail.text)
    )
    if (lines.includes(text)) return
    await sleep(150)
  }
  throw new Error(`Mr Pemberton never said "${text}"`)
}

/** Spawns a gnome on `patch` and throws it at `speed` px/s, or at the speed `aim(arm)` gives. */
function throwGnome(page, patch, speed) {
  return dev(
    page,
    (g, a) => {
      g.spawn('gnome', a.patch)
      return new Promise(resolve =>
        setTimeout(() => {
          const garden = g.garden()
          const gnome = garden.items
            .filter(i => i.kind === 'gnome' && i.state === 'rest')
            .sort((x, y) => y.id - x.id)[0]
          // A clip needs the throw's reach just past the fence: 1 to 1.17 times its depth.
          const speedPx =
            a.speed ?? (gnome.ly * 1.08) / (0.4 * (1 - 0.4 * garden.arm.level))
          resolve(g.act.throw(gnome.id, { speedPx }))
        }, 100)
      )
    },
    { patch, speed }
  )
}

async function run(browser, size) {
  const context = await browser.newContext(SIZES[size])
  const page = await context.newPage()
  const errors = watchErrors(page, size)
  const pusher = []
  page.on('request', r => {
    if (/pusher\.com|pusherapp|\/api\/pusher/.test(r.url()))
      pusher.push(r.url())
  })
  page.on('websocket', ws => {
    if (!ws.url().includes('/_next/')) pusher.push(ws.url())
  })
  await page.goto(`${BASE}/practice?fast&calm`)
  await waitFor(page, s => s.admission === 'seated' && s.peer?.listed, {
    label: 'Mr Pemberton seated'
  })
  const s0 = await dev(page, g => g.state())
  if (s0.role !== 'host' || s0.peer.name !== 'Mr Pemberton')
    throw new Error(`${size}: practice seats ${JSON.stringify(s0.peer)}`)
  await sleep(300)
  await shot(page, `practice-${size}-lobby`)
  const start = 'role=button[name="Start"]'
  if (size === 'desktop') await page.click(start)
  else await page.tap(start)
  await waitFor(page, s => s.matchPhase?.kind === 'play', { label: 'play' })
  await waitForNotice(page, 'Throw the gnome over the fence.', 6000)

  // Three gnomes into his front rows: the begonias, then the fist on the third hit.
  for (const patch of [41, 42, 43]) {
    await throwGnome(page, patch, 600)
    await sleep(500)
  }
  await said(page, 'My begonias!')
  // The fist arrives as a message, so it shows in your view of next door.
  const fistAt = Date.now()
  let fist = false
  while (!fist && Date.now() - fistAt < 6000) {
    fist = await dev(page, g => g.neighbour().fists.length > 0)
    if (!fist) await sleep(150)
  }
  if (!fist) throw new Error(`${size}: no fist after 3 hits`)
  await shot(page, `practice-${size}-fist`)

  // A soft throw from row 1 clips the fence, and he laughs.
  await sleep(1500)
  await throwGnome(page, 13)
  await said(page, 'Heh heh heh.')
  await sleep(250)
  await shot(page, `practice-${size}-laugh`)

  // Autopilot plays the rest; jumps keep the match short. His own clips say "Blast."
  await dev(page, g => g.autopilot('regular'))
  let blast = false
  for (let round = 0; round < 3; round++) {
    const state = await dev(page, g => g.state())
    if (state.phase !== 'match' || state.results.some(r => r.over)) break
    const phase = state.matchPhase
    if (phase.round > round) continue
    // Rounds after the first get 25s of play for his sends and clips.
    await dev(page, (g, a) => g.jump(a.left, a.round), {
      left: round === 0 ? 4000 : 25_000,
      round
    })
    if (round > 0 && !blast) {
      try {
        await said(page, 'Blast.', 24_000)
        blast = true
      } catch {
        // He may not clip this round; the next one gets another go.
      }
    }
    await waitFor(page, (s, r = round) => s.results.some(x => x.round === r), {
      label: `verdict ${round + 1}`,
      timeout: 40_000
    })
  }
  if (!blast) throw new Error(`${size}: Mr Pemberton never clipped`)
  await waitFor(page, s => s.phase === 'over', {
    label: 'match end',
    timeout: 60_000
  })
  await waitFor(page, s => s.peer?.rematch, { label: 'his rematch' })
  await sleep(300)
  const card = await page.evaluate(
    () => document.querySelector('section')?.innerText ?? ''
  )
  if (!card.includes('Mr Pemberton wants a rematch.'))
    throw new Error(`${size}: match end reads ${card}`)
  await shot(page, `practice-${size}-end`)
  if (pusher.length) throw new Error(`${size}: Pusher traffic ${pusher}`)
  errors.check()
  console.log(`${size}: Practice played to the end with every reaction`)
  await context.close()
}

const browser = await launch()
try {
  for (const size of ['desktop', 'phone', 'small'])
    if (!ONLY || ONLY === size) await run(browser, size)
  console.log('practice: ok')
} finally {
  await browser.close()
}
