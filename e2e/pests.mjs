// M10 weeds, snails and gnomes on two ?local pages with one seed: identical spawns for 40s
// (live, then after a jump), round 1's back-row weed at 2:50 left, an idle lawn full at 40
// weeds, a thrown weed wilting on the other lawn 20s after its yank, and a grabbed snail
// thrown over that comes out of its shell 3s after it lands. Mouse on desktop, touch on
// phones, with screenshots at every size.
import {
  BASE,
  dev,
  frames,
  hold,
  launch,
  mouseFlick,
  roomCode,
  shot,
  SIZES,
  sleep,
  startMatch,
  touchFlick,
  waitFor,
  watchErrors
} from './lib.mjs'

/** A seeded pair with A as the host, in a full-length round. */
async function seededPair(browser, size, seed) {
  const context = await browser.newContext(SIZES[size])
  const code = roomCode()
  const a = await context.newPage()
  const b = await context.newPage()
  const ea = watchErrors(a, 'A')
  const eb = watchErrors(b, 'B')
  await a.goto(`${BASE}/r/${code}?local&seed=${seed}&pid=aaaaaaaa88&first=1`)
  await waitFor(a, s => s.admission === 'seated')
  await b.goto(`${BASE}/r/${code}?local&pid=zzzzzzzz88`)
  await waitFor(a, s => s.seats.length === 2)
  await waitFor(b, s => s.seats.length === 2)
  await startMatch(a, b)
  return { context, a, b, check: () => (ea.check(), eb.check()) }
}

/** What spawned on a page: rooted weeds with birth times, and snails. */
const spawns = page =>
  dev(page, g => {
    const garden = g.garden()
    return {
      t: garden.t,
      weeds: garden.weeds.map(w => `${w.patch}@${Math.round(w.bornAt)}`).sort(),
      snails: garden.snails
        .map(s => `${s.dir}:${Math.round(s.ly)}:${Math.round(s.lx / 10)}`)
        .sort()
    }
  })

async function sameSpawns(browser, size) {
  const { a, b, check, context } = await seededPair(browser, size, 4242)
  // Live: round 1's second weed roots on the back row at 2:50 left on both lawns.
  await waitFor(a, s => s.matchPhase.msLeft < 168_500, { timeout: 20_000 })
  const [la, lb] = [await spawns(a), await spawns(b)]
  const backRow = la.weeds.filter(
    w => Math.floor(Number(w.split('@')[0]) / 12) === 15
  )
  console.log(
    `pests ${size}: live at ${Math.round(la.t / 1000)}s A ${la.weeds} | B ${lb.weeds}`
  )
  if (!backRow.some(w => w.endsWith('@10000')))
    throw new Error(`${size}: no back-row weed at 10s: ${la.weeds}`)
  const notes = (await dev(a, g => g.events(60)))
    .filter(e => e.type === 'note')
    .map(e => e.detail.text)
  if (!notes.includes('Drag the weed out first, then swipe it up.'))
    throw new Error(`${size}: no weed tip: ${notes}`)

  // Jump both to 40s in and compare.
  await dev(a, g => g.jump(140_000))
  await sleep(600)
  const [ja, jb] = [await spawns(a), await spawns(b)]
  console.log(
    `pests ${size}: at 40s ${ja.weeds.length} weeds and ${ja.snails.length} snails on A, ${jb.weeds.length} and ${jb.snails.length} on B`
  )
  if (JSON.stringify(ja.weeds) !== JSON.stringify(jb.weeds))
    throw new Error(`${size}: weeds differ:\n${ja.weeds}\n${jb.weeds}`)
  if (JSON.stringify(ja.snails) !== JSON.stringify(jb.snails))
    throw new Error(`${size}: snails differ:\n${ja.snails}\n${jb.snails}`)
  await shot(a, `pests-${size}-40s`)

  // An idle lawn fills up to 40 weeds.
  await dev(a, g => g.jump(3000))
  await sleep(600)
  const [ea, eb] = [await spawns(a), await spawns(b)]
  console.log(
    `pests ${size}: near the end ${ea.weeds.length} and ${eb.weeds.length} weeds`
  )
  if (ea.weeds.length !== 40 || eb.weeds.length !== 40)
    throw new Error(`${size}: an idle lawn didn't reach 40 weeds`)
  await shot(b, `pests-${size}-full`)
  check()
  await context.close()
}

function flick(page, from, to, speedPx, touch) {
  return touch
    ? touchFlick(page, from, to, speedPx)
    : mouseFlick(page, from, to, speedPx)
}

/** Shared-clock time of the newest event of `type` on a page. */
async function lastEventAt(page, type) {
  const events = await dev(page, g => g.events(120))
  return [...events].reverse().find(e => e.type === type)?.at ?? null
}

async function wiltAndShell(browser, size) {
  const touch = size !== 'desktop'
  const { a, b, check, context } = await seededPair(browser, size, 777)
  const scale = await dev(a, g => g.toClient(1, 0).x - g.toClient(0, 0).x)

  // A real tap on the patio unlocks sound first, as a player's Ready click would. The
  // unlock can stall the page's frames, and a mouse flick timed from outside the page
  // would then read as slow.
  const patio = await dev(a, g => g.toClient(560, 720))
  await hold(a, patio, 60, touch)
  await sleep(200)
  await frames(a, 10)

  // A yanked weed thrown over wilts on the other lawn 20s after the yank.
  await dev(a, g => g.act.sprout(8 * 12 + 6))
  await sleep(200)
  const weed = await dev(a, g =>
    g.garden().weeds.find(w => w.patch === 8 * 12 + 6)
  )
  const from = await dev(a, (g, id) => g.targetClient(id), weed.id)
  await flick(a, from, { x: from.x, y: from.y - 260 * scale }, 1250, touch)
  const yankAt = await lastEventAt(a, 'yank')
  if (yankAt === null) throw new Error(`${size}: the flick didn't yank`)
  let landed = null
  for (let i = 0; i < 40 && !landed; i++) {
    landed = (await dev(b, g => g.garden())).items.find(
      x => x.fromNeighbour && x.kind === 'weed' && x.state === 'rest'
    )
    if (!landed) await sleep(100)
  }
  if (!landed) {
    const ev = (await dev(a, g => g.events(40))).map(
      e => `${e.type} ${JSON.stringify(e.detail)?.slice(0, 90)}`
    )
    throw new Error(`${size}: the thrown weed never landed\n${ev.join('\n')}`)
  }
  await shot(b, `pests-${size}-landed`)

  // A snail grabbed with a real press goes over as a shell and comes out 3s after landing.
  // A shell put down mid-lawn lets its snail out after 3s.
  await dev(a, g => g.spawn('snailShell', 9 * 12 + 4))
  let snail = null
  for (let i = 0; i < 50 && !snail; i++) {
    snail = (await dev(a, g => g.garden())).snails.find(
      s => s.ly > 360 && s.ly < 400 && s.lx > 150 && s.lx < 260
    )
    if (!snail) await sleep(100)
  }
  if (!snail) throw new Error(`${size}: the shell's snail never came out`)
  await sleep(300)
  snail = (await dev(a, g => g.garden())).snails.find(s => s.id === snail.id)
  await shot(a, `pests-${size}-crawling`)
  const before = (await dev(b, g => g.garden())).snails.length
  const at = await dev(a, (g, id) => g.targetClient(id), snail.id)
  await flick(a, at, { x: at.x, y: at.y - 220 * scale }, 1500, touch)
  let shell = null
  for (let i = 0; i < 40 && !shell; i++) {
    shell = (await dev(b, g => g.garden())).items.find(
      x => x.fromNeighbour && x.kind === 'snailShell' && x.state === 'rest'
    )
    if (!shell) await sleep(100)
  }
  if (!shell)
    throw new Error(`${size}: the thrown snail never landed as a shell`)
  const restAt = (await dev(b, g => g.state())).now
  let outAt = null
  while (!outAt) {
    const g = await dev(b, g => g.garden())
    if (!g.items.some(x => x.id === shell.id))
      outAt = (await dev(b, g => g.state())).now
    else await sleep(100)
  }
  const after = (await dev(b, g => g.garden())).snails.length
  console.log(
    `pests ${size}: the thrown snail came out about ${Math.round(outAt - restAt)} ms after it landed (${before} then ${after} snails)`
  )
  if (outAt - restAt > 3400)
    throw new Error(`${size}: the shell stayed shut too long`)
  await shot(b, `pests-${size}-snail`)

  // Back to the weed: it wilts 20s after the yank.
  let wiltAt = null
  while (!wiltAt) {
    const g = await dev(b, g => g.garden())
    if (!g.items.some(x => x.id === landed.id))
      wiltAt = (await dev(b, g => g.state())).now
    else await sleep(100)
  }
  const mess = await dev(
    b,
    (g, p) =>
      g.garden().mess[Math.floor(p.ly / 40) * 12 + Math.floor(p.lx / 50)],
    landed
  )
  console.log(
    `pests ${size}: the thrown weed wilted ${Math.round(wiltAt - yankAt)} ms after its yank, leaving mess ${mess}`
  )
  if (Math.abs(wiltAt - yankAt - 20_000) > 400)
    throw new Error(`${size}: the weed didn't wilt 20s after its yank`)
  if (mess !== 5) throw new Error(`${size}: no wilt mark where it lay`)
  check()
  await context.close()
}

const browser = await launch()
try {
  if (process.argv[2] !== 'throws')
    for (const size of ['desktop', 'phone', 'small'])
      await sameSpawns(browser, size)
  for (const size of ['desktop', 'phone']) await wiltAndShell(browser, size)
  console.log('pests: ok')
} finally {
  await browser.close()
}
