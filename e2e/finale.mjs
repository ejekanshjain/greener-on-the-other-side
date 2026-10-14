// M17 heavy-junk finale on two ?local&fast&calm pages at three sizes. At 0:40 the shed
// opens on both pages at once, the crate's gnomes settle on rows 8 to 13, and the junk
// rolls onto the patio. Real input drags the bin forward (flattening a path), holds it
// still until it lifts and swipes it over the fence, where it sinks, spills 4 litter and
// can't be grabbed. In round 2 the trampoline goes over, and an exact throw sends a gnome
// onto it; it bounces back over the fence and counts against the thrower. In round 3, or
// a new match's round 1 when round 2 decided the match, a thrown mower ends mowing and
// the clock turns red for the last 10s.
import {
  dev,
  dragHold,
  frames,
  hold,
  launch,
  localPair,
  mouseFlick,
  shot,
  sleep,
  rematch,
  startMatch,
  touchFlick,
  waitFor,
  waitForNotice
} from './lib.mjs'

/** Waits until a dev query on `page` returns something truthy, or throws `why`. */
async function until(page, fn, arg, why, timeout = 4000) {
  const start = Date.now()
  for (;;) {
    const value = await dev(page, fn, arg)
    if (value) return value
    if (Date.now() - start > timeout) {
      const events = await dev(page, g =>
        g
          .events(40)
          .map(e => e.type)
          .filter(t => t !== 'tick' && t !== 'flatten')
      )
      throw new Error(`${why}. Last events: ${events.join(', ')}`)
    }
    await sleep(40)
  }
}

const garden = page => dev(page, g => g.garden())
const client = (page, p) => dev(page, (g, p) => g.toClient(p.lx, p.ly), p)
const target = (page, id) => dev(page, (g, id) => g.targetClient(id), id)
const junk = (g, kind) =>
  g.items.find(i => i.kind === kind && i.state !== 'sunk')

/**
 * A lawn point between depths 220 and 340 whose drawn spot, `lift` units up, has nothing
 * within 45 units that a press would grab before heavy junk.
 */
function clearSpot(g, lift) {
  const things = [...g.items, ...g.weeds, ...g.snails]
  for (let ly = 300; ly >= 220; ly -= 20)
    for (let lx = 75; lx <= 525; lx += 25) {
      const free = things.every(
        t =>
          Math.hypot(t.lx - lx, t.ly - ly) > 45 &&
          Math.hypot(t.lx - lx, t.ly - (ly - lift)) > 45
      )
      if (free) return { lx, ly }
    }
  throw new Error('no clear spot on the lawn')
}

/** Moves the match to `round` with `msLeft` of play left, and waits for both pages. */
async function jumpTo(a, b, msLeft, round) {
  // Only the host can jump; the guest's call does nothing.
  for (const p of [a, b])
    await dev(p, (g, a) => g.jump(a.msLeft, a.round), { msLeft, round })
  for (const p of [a, b]) {
    await waitFor(
      p,
      s => s.matchPhase?.kind === 'play' && s.matchPhase.round === round,
      { label: `round ${round}` }
    )
    // The jump's catch-up can stall frames for a moment; real presses wait it out.
    await frames(p)
  }
}

async function run(browser, size) {
  const touch = size !== 'desktop'
  const flick = touch ? touchFlick : mouseFlick
  const { a, b, check, context } = await localPair(browser, {
    size,
    query: 'fast&calm&first=1'
  })
  await startMatch(a, b)

  // 1. The shed opens at 0:40 (10s left in a fast round) on both pages together.
  await jumpTo(a, b, 10_600, 0)
  const opened = await Promise.all(
    [a, b].map(p =>
      until(
        p,
        g =>
          g.garden().shed.open &&
          g.events(200).find(e => e.type === 'shed')?.at,
        null,
        `${size}: the shed never opened`,
        3000
      )
    )
  )
  if (Math.abs(opened[0] - opened[1]) > 100)
    throw new Error(`${size}: the sheds opened ${opened} apart`)
  // A new player's banner covers the peek strip for 3s; the shed tip follows it later.
  await a.locator('[data-testid="shed-banner"]').waitFor({ timeout: 2000 })
  await sleep(1500)
  await shot(a, `finale-${size}-shed`)
  let g = await garden(a)
  const crate = g.items.filter(i => i.kind === 'gnome' && i.state === 'rest')
  const back = crate.filter(i => i.ly >= 320 && i.ly < 560)
  if (back.length < 12)
    throw new Error(`${size}: only ${back.length} gnomes on rows 8 to 13`)
  console.log(
    `${size}: shed opened ${Math.abs(opened[0] - opened[1])} ms apart`
  )

  // 2. Drag the bin forward from the patio: each crossed patch flattens once. It goes
  // to a spot mid-lawn clear of anything a press there would grab first.
  const bin = junk(g, 'bin')
  const spot = clearSpot(g, 38)
  const from = await target(a, bin.id)
  const to = await client(a, { lx: spot.lx, ly: spot.ly - 38 })
  await dragHold(a, from, to, 350, 80, touch)
  await waitForNotice(a, 'Slide it halfway up the lawn, then let go.')
  await sleep(150)
  g = await garden(a)
  const dragged = g.items.find(i => i.id === bin.id)
  if (dragged.state !== 'rest' || dragged.ly > 340 || g.blame.flattened < 8)
    throw new Error(
      `${size}: the drag left ${JSON.stringify(dragged)}, flattened ${g.blame.flattened}`
    )

  // 3. Hold it still to lift it, then swipe it over the fence.
  const grip = await target(a, bin.id)
  await flick(a, grip, { x: grip.x, y: grip.y - 160 }, 1900, { holdMs: 750 })
  const thrown = await until(
    a,
    (g, id) => g.events(60).find(e => e.type === 'throw' && e.detail.id === id),
    bin.id,
    `${size}: the lifted bin never threw`
  )
  // Pressing it on the grass earned the second heavy-junk tip.
  await until(
    a,
    g =>
      g
        .events(80)
        .some(
          e =>
            e.type === 'note' &&
            e.detail.text === 'Now hold it still until it lifts, then swipe up.'
        ),
    null,
    `${size}: no lift tip for heavy junk on the grass`
  )
  const sunk = await until(
    b,
    g => {
      const garden = g.garden()
      const bin = garden.items.find(i => i.kind === 'bin' && i.state === 'sunk')
      const litter = garden.items.filter(
        i => i.kind === 'litter' && i.state === 'rest'
      )
      return bin && litter.length === 4 ? { bin, litter } : null
    },
    null,
    `${size}: no sunk bin with 4 litter on the other lawn`,
    5000
  )
  // The shed tip showed after the banner, behind the heavy-junk tips.
  await until(
    a,
    g =>
      g
        .events(200)
        .some(
          e =>
            e.type === 'note' &&
            e.detail.text === 'Gnomes first. Then big junk, if you dare.'
        ),
    null,
    `${size}: no shed tip after the banner`,
    5000
  )
  await sleep(300)
  await shot(b, `finale-${size}-bin`)
  // A real press on the sunk bin over there grabs nothing.
  await hold(b, await target(b, sunk.bin.id), 120, touch)
  g = await garden(b)
  if (g.items.find(i => i.id === sunk.bin.id).state !== 'sunk')
    throw new Error(`${size}: the sunk bin moved`)
  const looks = sunk.litter.map(i => i.look).sort()
  console.log(
    `${size}: bin thrown at ${Math.round(thrown.detail.speedPx)} px/s sank with litter looks ${looks}`
  )

  // 4. Round 2: the trampoline goes over, and a gnome bounces off it back home.
  await jumpTo(a, b, 10_400, 1)
  await until(
    a,
    g => g.garden().round === 1 && g.garden().shed.open,
    null,
    `${size}: no shed in round 2`
  )
  await sleep(1300)
  g = await garden(a)
  const trampoline = junk(g, 'trampoline')
  await dev(a, (g, id) => g.act.drag(id, 7 * 12 + 6), trampoline.id)
  await sleep(100)
  await dev(a, (g, id) => g.act.throw(id, { speedPx: 1900 }), trampoline.id)
  const landed = await until(
    b,
    g =>
      g.garden().items.find(i => i.kind === 'trampoline' && i.state === 'sunk'),
    null,
    `${size}: the trampoline never sank next door`,
    5000
  )
  // Straight throws land mirrored: aim a gnome from row 7 at the trampoline's middle.
  const lx = 600 - landed.lx
  await dev(a, (g, lx) => g.spawn('gnome', 7 * 12 + Math.floor(lx / 50)), lx)
  await sleep(150)
  await dev(a, g => g.act.setArm(0))
  g = await garden(a)
  const gnome = g.items
    .filter(i => i.kind === 'gnome')
    .reduce((x, i) => (i.id > x.id ? i : x))
  const speed = (landed.ly + gnome.ly) / 0.4
  await sleep(450)
  // Real swipes measure up to 15% fast, more than the trampoline's depth allows, so this
  // throw goes through the garden command at the exact speed.
  await dev(a, (g, a) => g.act.throw(a.id, { speedPx: a.speed }), {
    id: gnome.id,
    speed
  })
  await until(
    b,
    g => g.events(80).find(e => e.type === 'bounce'),
    null,
    `${size}: the gnome never bounced at ${Math.round(speed)} px/s`,
    5000
  )
  const home = await until(
    a,
    g => {
      const garden = g.garden()
      return garden.blame.bounces === 1 && garden.items.find(i => i.back)
    },
    null,
    `${size}: the bounce never came home`,
    5000
  )
  await sleep(200)
  await shot(b, `finale-${size}-trampoline`)
  console.log(
    `${size}: a gnome at ${Math.round(speed)} px/s bounced off the trampoline and came home (${home.state})`
  )
  // 5. A thrown mower ends mowing, and the clock turns red for the last 10s. Round 3
  // when the match goes on; a new match's round 1 when round 2 decided it.
  for (const p of [a, b]) await dev(p, g => g.jump(300, 1))
  const judged = await waitFor(a, s => s.results.length === 2, {
    label: 'round 2 verdict'
  })
  const decided = judged.results.some(r => r.over)
  let round = 2
  if (decided) {
    await rematch(a, b)
    round = 0
  }
  await jumpTo(a, b, 10_400, round)
  await until(
    a,
    (g, r) => g.garden().round === r && g.garden().shed.open,
    round,
    `${size}: no shed for the mower`
  )
  await sleep(300)
  g = await garden(a)
  await dev(a, (g, id) => g.act.drag(id, 7 * 12 + 4), g.mower.id)
  await dev(a, g => g.act.setArm(0))
  await sleep(500)
  await dev(a, (g, id) => g.act.throw(id, { speedPx: 2200 }), g.mower.id)
  await until(
    b,
    g => g.events(80).find(e => e.type === 'run'),
    null,
    `${size}: the mower never ran next door`,
    5000
  )
  // Mow on a bare patch, clear of weeds, snails and items a press would grab instead.
  g = await garden(a)
  const things = [...g.items, ...g.weeds, ...g.snails]
  const bare = [...Array(192).keys()]
    .map(p => ({ lx: (p % 12) * 50 + 25, ly: Math.floor(p / 12) * 40 + 20 }))
    .find(
      p =>
        p.lx > 60 &&
        p.lx < 460 &&
        things.every(t => Math.hypot(t.lx - p.lx, t.ly - p.ly) > 70)
    )
  const grass = await client(a, bare)
  await dragHold(a, grass, { x: grass.x + 80, y: grass.y }, 300, 50, touch)
  // Toasts show in every round, unlike tips.
  await waitForNotice(a, 'You threw your mower. No mowing this round.')
  const clock = await a.evaluate(() => {
    const el = document.querySelector('[data-testid="clock"]')
    return {
      text: el?.textContent,
      red: el?.classList.contains('text-marker-red')
    }
  })
  if (!clock.red) throw new Error(`${size}: the clock isn't red: ${clock.text}`)
  await shot(a, `finale-${size}-late`)

  check()
  await context.close()
}

const browser = await launch()
try {
  const only = process.argv[2]
  for (const size of ['desktop', 'phone', 'small'])
    if (!only || only === size) await run(browser, size)
  console.log('finale: all checks passed')
} finally {
  await browser.close()
}
