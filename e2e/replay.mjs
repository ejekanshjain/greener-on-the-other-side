// M24 replays and the share card on two ?local&fast&calm pages with fixed player ids, so
// A hosts. A soft throw on A clips the fence; A then wins the match in 2 rounds. A's match
// end plays its worst moment in slow motion, captioned "Clipped the fence. Again.", and
// Share Card draws a 1080 by 1350 picture that downloads (headless Chromium can't share
// files). Screenshots of the match end and the card at every size.
//
// Usage: node e2e/replay.mjs [desktop|phone|small]
import { readFile } from 'node:fs/promises'

import {
  BASE,
  dev,
  launch,
  roomCode,
  shot,
  SIZES,
  sleep,
  waitFor,
  watchErrors
} from './lib.mjs'

const ONLY = process.argv[2]

/** Two ?local pages with fixed ids: `a` sorts first, so it hosts. */
async function pair(browser, size) {
  const context = await browser.newContext({
    ...SIZES[size],
    acceptDownloads: true
  })
  const code = roomCode()
  const tag = Math.random().toString(36).slice(2, 8).padEnd(6, '0')
  const errors = []
  const open = async (id, label) => {
    const p = await context.newPage()
    errors.push(watchErrors(p, label))
    await p.goto(`${BASE}/r/${code}?local&pid=${id}&fast&calm`)
    await waitFor(p, s => s.admission === 'seated')
    return p
  }
  const a = await open(`aa${tag}xx`, 'A')
  const b = await open(`bb${tag}xx`, 'B')
  for (const p of [a, b]) await waitFor(p, s => s.seats.length === 2)
  return { context, a, b, check: () => errors.forEach(e => e.check()) }
}

/** A gnome thrown from row 8 with just enough reach to clip the fence top. */
async function clip(page) {
  for (let tries = 0; tries < 5; tries++) {
    const before = (await dev(page, g => g.garden())).blame.clips
    await dev(page, g => {
      g.act.setArm(0)
      g.spawn('gnome', 102)
      return new Promise(resolve =>
        setTimeout(() => {
          const gnome = g
            .garden()
            .items.filter(i => i.kind === 'gnome' && i.state === 'rest')
            .sort((x, y) => y.id - x.id)[0]
          resolve(g.act.throw(gnome.id, { speedPx: (gnome.ly * 1.08) / 0.4 }))
        }, 80)
      )
    })
    await sleep(1600)
    if ((await dev(page, g => g.garden())).blame.clips > before) return
  }
  throw new Error('the soft throw never clipped')
}

/** Plays round `round` to its verdict, with the guest's lawn dried so the host wins it. */
async function hostWins(a, b, round) {
  await waitFor(b, s => s.gardenRound === round, {
    label: `round ${round + 1}`
  })
  await dev(b, g => g.dryLawn(3))
  await dev(a, (g, r) => g.jump(1500, r), round)
  await waitFor(a, s => s.results.some(r => r.round === round), {
    label: `verdict ${round + 1}`,
    timeout: 20_000
  })
}

async function run(browser, size) {
  const { context, a, b, check } = await pair(browser, size)
  await dev(a, g => g.ready(true))
  await dev(b, g => g.ready(true))
  for (const p of [a, b])
    await waitFor(p, s => s.matchPhase?.kind === 'play', { label: 'play' })
  await sleep(500)
  await clip(a)
  await sleep(1300)
  const worst = await dev(a, g => g.worst())
  if (worst?.label !== 'Clipped the fence. Again.')
    throw new Error(`${size}: the worst moment is ${JSON.stringify(worst)}`)
  await hostWins(a, b, 0)
  await waitFor(
    a,
    s => s.matchPhase?.kind === 'play' && s.matchPhase.round === 1,
    {
      label: 'round 2 play',
      timeout: 20_000
    }
  )
  await hostWins(a, b, 1)
  await waitFor(a, s => s.phase === 'over', {
    label: 'match end',
    timeout: 30_000
  })
  const replay = a.locator('[data-testid="worst-replay"]')
  await replay.waitFor({ timeout: 5000 })
  const caption = await replay.locator('figcaption').textContent()
  if (caption !== 'Clipped the fence. Again.')
    throw new Error(`${size}: the replay reads "${caption}"`)
  await sleep(1500)
  await shot(a, `replay-${size}-match-end`)

  await a.click('role=button[name="Share Card"]', { force: true })
  await a.locator('img[alt^="Share card"]').waitFor({ timeout: 8000 })
  await shot(a, `replay-${size}-card`)
  const [download] = await Promise.all([
    a.waitForEvent('download', { timeout: 8000 }),
    a.click('role=button[name="Download"]', { force: true })
  ])
  const png = await readFile(await download.path())
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  if (width !== 1080 || height !== 1350)
    throw new Error(`${size}: the card is ${width} by ${height}`)
  console.log(
    `${size}: worst moment "${worst.label}" (${worst.frames} frames, ${worst.loss} health) replayed at the match end; the card downloaded at ${width} by ${height}`
  )
  check()
  await context.close()
}

const browser = await launch()
try {
  for (const size of ['desktop', 'phone', 'small'])
    if (!ONLY || ONLY === size) await run(browser, size)
  console.log('replay: ok')
} finally {
  await browser.close()
}
