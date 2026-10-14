// M25 phone layout and touch polish, on ?local pages with fixed ids so page A hosts.
//
// - layout: at 375 by 548 (se), 375 by 667 (small), 390 by 844 (phone) and 1280 by 800,
//   screenshots of home, the lobby, play, the menu, Away, Reconnecting, a reveal, both
//   rosettes, Gone and the match end. Every time, the top bar is 48 px or more, ends at
//   the peek strip's top, centres the clock, shows both names cut to 10 characters with
//   nothing clipped or overlapping; nothing pressable sits over the peek strip, the fence
//   or the lawn; and the tip line and the Reconnecting banner stay under the patio props.
// - touch: at the three phone sizes, real touch pointer events throw a weed next door,
//   mow a stripe and water a dry patch, and the 20 px edge guard ignores a press on a
//   gnome against either hedge that a press 2 px further in grabs.
// - turn: a phone held sideways shows "Turn your phone upright." in the lobby and in
//   play (the round keeps going), and loses it when turned back; a short desktop window
//   never shows it.
// - zoom: a two-finger pinch zooms the lobby card but never the game canvas.
// - cvd: every health level through the deutan and protan filters at 375 by 548.
//
// Usage: node e2e/phone.mjs [layout|touch|turn|zoom|cvd] [se|small|phone|desktop]
import {
  BASE,
  dev,
  hold,
  launch,
  roomCode,
  settledBox,
  shot,
  SIZES,
  sleep,
  touchFlick,
  waitFor,
  watchErrors
} from './lib.mjs'

const ONLY = process.argv[2]
const SIZE = process.argv[3]
const NAMES = ['Gnome Hoarder', 'Compost Mentis']
const CUT = ['Gnome Hoa…', 'Compost M…']
/** Design y where the strip under the patio's props begins. */
const PROPS_BOTTOM = 1000

/** Two ?local pages with fixed ids and names: `a` sorts first, so it hosts. */
async function pair(browser, size, query, context) {
  context ??= await browser.newContext(SIZES[size])
  const code = roomCode()
  const tag = Math.random().toString(36).slice(2, 8).padEnd(6, '0')
  const errors = []
  const open = async (id, label, name) => {
    const p = await context.newPage()
    errors.push(watchErrors(p, label))
    await p.goto(
      `${BASE}/r/${code}?local&pid=${id}&name=${encodeURIComponent(name)}${query ? `&${query}` : ''}`
    )
    await waitFor(p, s => s.admission === 'seated')
    return p
  }
  const a = await open(`aa${tag}xx`, 'A', NAMES[0])
  const b = await open(`bb${tag}xx`, 'B', NAMES[1])
  for (const p of [a, b]) await waitFor(p, s => s.seats.length === 2)
  return { context, a, b, check: () => errors.forEach(e => e.check()) }
}

/** Client pixels for a design point. */
function designClient(page, x, y) {
  return dev(page, (g, p) => g.toClient(p.x - 40, p.y - 236), { x, y })
}

/** Readies both pages and waits for round `round` in play. */
async function play(a, b, round = 0) {
  for (const p of [a, b])
    await waitFor(
      p,
      s => s.matchPhase?.kind === 'play' && s.matchPhase.round === round,
      { label: `round ${round + 1} play`, timeout: 40_000 }
    )
}

/**
 * The top bar's fit: 48 px or more, ending at the peek strip's top, the clock centred,
 * buttons at least 44 px, names as `names` with no clipping, and nothing overlapping.
 */
async function checkBar(page, label, names) {
  const bar = await page.evaluate(() => {
    const rect = el => {
      const r = el.getBoundingClientRect()
      return {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        text: el.textContent,
        clipped: el.scrollWidth > el.clientWidth + 1
      }
    }
    const one = id => {
      const el = document.querySelector(`[data-testid="${id}"]`)
      return el ? rect(el) : null
    }
    const header = document.querySelector('[data-testid="top-bar"]')
    return {
      bar: one('top-bar'),
      parts: {
        menu: one('menu-button'),
        mine: one('my-name'),
        clock: one('clock'),
        theirs: one('their-name'),
        fist: one('fist-button'),
        away: one('away'),
        gone: one('gone'),
        ...Object.fromEntries(
          [...header.querySelectorAll('[data-testid="rosettes"]')].map(
            (el, i) => [`rosettes${i}`, rect(el)]
          )
        )
      }
    }
  })
  const peekTop = (await designClient(page, 340, 96)).y
  const fail = why => {
    throw new Error(`${label}: ${why}: ${JSON.stringify(bar)}`)
  }
  if (bar.bar.h < 47.9) fail('the bar is under 48 px')
  if (bar.bar.y + bar.bar.h > peekTop + 0.5)
    fail('the bar covers the peek strip')
  const { menu, mine, clock, theirs, fist } = bar.parts
  for (const button of [menu, fist])
    if (button.w < 43.9 || button.h < 43.9) fail('a button is under 44 px')
  const centre = bar.bar.x + bar.bar.w / 2
  if (Math.abs(clock.x + clock.w / 2 - centre) > 1.5)
    fail('the clock is off centre')
  // Your own tag reads You for everyone; theirs shows their name cut short.
  if (mine.text !== 'You' || theirs.text !== names[1])
    fail(`names read ${mine.text} and ${theirs.text}`)
  if (mine.clipped || theirs.clipped) fail('a name is clipped')
  const parts = Object.entries(bar.parts).filter(([, r]) => r)
  for (const [name, r] of parts) {
    if (
      r.x < bar.bar.x - 0.5 ||
      r.x + r.w > bar.bar.x + bar.bar.w + 0.5 ||
      r.y < bar.bar.y - 0.5 ||
      r.y + r.h > bar.bar.y + bar.bar.h + 0.5
    )
      fail(`${name} spills out of the bar`)
    for (const [other, o] of parts) {
      if (other <= name) continue
      const overlap =
        Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x) > 0.5 &&
        Math.min(r.y + r.h, o.y + o.h) - Math.max(r.y, o.y) > 0.5
      if (overlap) fail(`${name} overlaps ${other}`)
    }
  }
  return bar
}

/** Every point over the peek strip, the fence and the lawn reaches the canvas. */
async function checkOpenField(page, label) {
  const points = []
  for (let y = 98; y <= 874; y += 16)
    for (let x = 42; x <= 638; x += 24)
      points.push(await designClient(page, x, y))
  const blocked = await page.evaluate(
    pts =>
      pts
        .filter(p => document.elementFromPoint(p.x, p.y)?.tagName !== 'CANVAS')
        .map(p => {
          const el = document.elementFromPoint(p.x, p.y)
          return `${Math.round(p.x)},${Math.round(p.y)} ${el?.tagName} ${el?.className}`
        }),
    points
  )
  if (blocked.length)
    throw new Error(
      `${label}: ${blocked.length} points over the lawn reach no canvas: ${blocked.slice(0, 4).join('; ')}`
    )
}

/** The tip line or the Reconnecting banner sits in the strip under the patio props. */
async function checkPatioLine(page, label, testId) {
  const rect = await page
    .locator(`[data-testid="${testId}"]`)
    .boundingBox({ timeout: 5000 })
  const strip = (await designClient(page, 340, PROPS_BOTTOM)).y
  const bottom = page.viewportSize().height
  if (!rect || rect.y < strip - 0.5 || rect.y + rect.height > bottom)
    throw new Error(
      `${label}: ${testId} at ${JSON.stringify(rect)} leaves the strip from ${strip.toFixed(1)} to ${bottom}`
    )
  return rect
}

/**
 * A new player's tip sits on the fence: its bottom edge on the lawn's top edge, below
 * the peek strip's top, so it never covers the lawn.
 */
async function checkFenceLine(page, label) {
  const tip = page.locator('[data-testid="tip"]')
  await tip.waitFor({ timeout: 6000 })
  // Measure once its pop-in has settled: a new tip can pop in at any moment.
  const rect = await settledBox(page, '[data-testid="tip"]')
  const lawnTop = (await designClient(page, 340, 236)).y
  const peekTop = (await designClient(page, 340, 96)).y
  if (
    !rect ||
    Math.abs(rect.y + rect.height - lawnTop) > 1.5 ||
    rect.y < peekTop
  )
    throw new Error(
      `${label}: the tip "${await tip.textContent()}" at ${JSON.stringify(rect)} isn't on the fence above ${lawnTop.toFixed(1)}`
    )
  return rect
}

/** Clicks with the mouse on desktop, taps with a finger on phones. */
function press(page, selector, size) {
  return size === 'desktop' ? page.click(selector) : page.tap(selector)
}

async function layout(browser, size) {
  const context = await browser.newContext(SIZES[size])
  const home = await context.newPage()
  const homeErrors = watchErrors(home, 'home')
  await home.goto(`${BASE}/`)
  // The name box fills in once React hydrates. A screenshot before that hides the caret
  // with an inline style, which React then reports as a hydration mismatch.
  await home.waitForFunction(() => document.querySelector('input')?.value)
  await shot(home, `phone-${size}-home`)
  homeErrors.check()
  await home.close()

  const { a, b, check } = await pair(browser, size, 'fast&calm', context)
  await shot(a, `phone-${size}-lobby`)
  // Show Tips keeps A's own name in the bar but gives it a new player's start tip.
  await dev(a, g => g.tips(true))
  await dev(a, g => g.ready(true))
  await dev(b, g => g.ready(true))
  await play(a, b)
  await sleep(600)
  await checkBar(a, `${size} A`, CUT)
  await checkBar(b, `${size} B`, [CUT[1], CUT[0]])
  await checkOpenField(a, size)
  await checkFenceLine(a, `${size} tip`)
  await shot(a, `phone-${size}-play`)
  // A toast keeps the strip under the patio props: an empty can's pour.
  await dev(a, g => g.act.setCan(0))
  await hold(a, await designClient(a, 340, 236 + 590), 400, size !== 'desktop')
  await checkPatioLine(a, `${size} toast`, 'toast')
  await shot(a, `phone-${size}-toast`)

  // The menu opens from its button and closes with Keep Playing.
  await press(a, '[data-testid="menu-button"]', size)
  const keep = a.getByRole('button', { name: 'Keep Playing' })
  await keep.waitFor()
  await shot(a, `phone-${size}-menu`)
  await keep.click()

  // B's line drops: Away beside B's name on A, Reconnecting over B's patio.
  await dev(b, g => g.fault({ offline: true }))
  await waitFor(a, s => s.peer?.away, { label: 'away' })
  await waitFor(b, s => s.conn === 'reconnecting', { label: 'reconnecting' })
  await checkBar(a, `${size} away`, CUT)
  await checkPatioLine(b, `${size} reconnecting`, 'reconnecting')
  await shot(a, `phone-${size}-away`)
  await shot(b, `phone-${size}-reconnecting`)
  await dev(b, g => g.fault({ offline: false }))
  await waitFor(a, s => !s.peer?.away, { label: 'back' })

  // A wins round 1 and B round 2, so both rosettes show.
  for (const [loser, winner, round] of [
    [b, a, 0],
    [a, b, 1]
  ]) {
    await dev(loser, g => g.dryLawn(3))
    await dev(a, g => g.jump(1500))
    await waitFor(a, s => s.results.length === round + 1, {
      label: `round ${round + 1} verdict`,
      timeout: 20_000
    })
    if (round === 0) {
      await sleep(4000)
      await shot(a, `phone-${size}-reveal`)
    }
    await play(a, b, round + 1)
    const won = await dev(winner, g => g.state().tally)
    console.log(`layout ${size}: round ${round + 1} tally ${won}`)
  }
  await sleep(400)
  const rosettes = await a.locator('[data-testid="rosettes"]').count()
  if (rosettes !== 2)
    throw new Error(`${size}: expected a rosette each, saw ${rosettes} rows`)

  // Round 3 with both rosettes and Away, then Gone once B's tab closes.
  await dev(b, g => g.fault({ offline: true }))
  await waitFor(a, s => s.peer?.away, { label: 'away again' })
  await checkBar(a, `${size} rosettes and away`, CUT)
  await shot(a, `phone-${size}-rosettes-away`)
  await b.close()
  await waitFor(a, s => s.peer && !s.peer.listed, { label: 'gone' })
  await sleep(300)
  const gone = await checkBar(a, `${size} gone`, CUT)
  if (!/^Gone [01]:\d\d$/.test(gone.parts.gone?.text ?? ''))
    throw new Error(`${size}: no Gone countdown: ${gone.parts.gone?.text}`)
  await shot(a, `phone-${size}-gone`)

  await dev(a, g => g.jump(1500))
  await waitFor(a, s => s.phase === 'over' || s.over, {
    label: 'match end',
    timeout: 30_000
  })
  await sleep(800)
  await shot(a, `phone-${size}-end`)
  console.log(`layout ${size}: every bar, field and patio line check passed`)
  check()
  await context.close()
}

/** Presses with a finger at a client point, reads what the hand holds, then lets go. */
function touchProbe(page, point) {
  return page.evaluate(async p => {
    const canvas = document.querySelector('canvas')
    const fire = type =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 21,
          pointerType: 'touch',
          isPrimary: true,
          clientX: p.x,
          clientY: p.y,
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1
        })
      )
    fire('pointerdown')
    await new Promise(r => setTimeout(r, 120))
    const held = window.__game.greener.garden().held
    fire('pointerup')
    return held
  }, point)
}

/** A rooted weed in the middle of the lawn with nothing near it, and its client point. */
async function midWeed(page) {
  const garden = await dev(page, g => g.garden())
  const clear = w =>
    [...garden.items, ...garden.snails].every(
      i => Math.hypot(i.lx - w.lx, i.ly - w.ly) > 60
    ) &&
    garden.weeds.every(
      o => o.id === w.id || Math.hypot(o.lx - w.lx, o.ly - w.ly) > 40
    )
  const weed = garden.weeds
    .filter(w => w.ly > 200 && w.ly < 500 && clear(w))
    .sort((x, y) => Math.abs(x.ly - 330) - Math.abs(y.ly - 330))[0]
  if (!weed) throw new Error('no clear mid-lawn weed')
  return {
    ...weed,
    client: await dev(page, (g, id) => g.targetClient(id), weed.id)
  }
}

async function touch(browser, size) {
  const { a, b, check, context } = await pair(browser, size, 'calm')
  await dev(a, g => g.ready(true))
  await dev(b, g => g.ready(true))
  await play(a, b)
  await sleep(600)
  const scale = await dev(a, g => g.toClient(1, 0).x - g.toClient(0, 0).x)

  // Throw: a touch flick at 1,200 px/s sends a mid-lawn weed next door.
  await dev(a, g => {
    for (const patch of [7 * 12 + 3, 8 * 12 + 6, 7 * 12 + 9])
      g.act.sprout(patch)
  })
  await sleep(300)
  const weed = await midWeed(a)
  await touchFlick(
    a,
    weed.client,
    { x: weed.client.x, y: weed.client.y - 260 * scale },
    1200
  )
  const started = Date.now()
  let landed = null
  while (!landed && Date.now() - started < 2500) {
    landed = (await dev(b, g => g.garden())).items.find(
      i => i.fromNeighbour && i.kind === 'weed' && i.state === 'rest'
    )
    if (!landed) await sleep(50)
  }
  if (!landed)
    throw new Error(`${size}: the touch throw never landed next door`)
  console.log(
    `touch ${size}: threw a weed next door, landed at lx ${landed.lx.toFixed(0)} in ${Date.now() - started} ms`
  )

  // Mow: a touch rub down a clear column stripes it.
  const col = await dev(a, g => {
    const garden = g.garden()
    const things = [...garden.weeds, ...garden.items, ...garden.snails]
    for (const c of [5, 6, 4, 7, 3, 8, 2, 9])
      if (things.every(t => Math.abs(t.lx - (c * 50 + 25)) > 45)) return c
    return null
  })
  if (col === null) throw new Error(`${size}: no clear column to mow`)
  const top = await dev(a, (g, c) => g.toClient(c * 50 + 25, 45), col)
  const bottom = await dev(a, (g, c) => g.toClient(c * 50 + 25, 668), col)
  await touchFlick(a, top, bottom, 600, { holdMs: 0 })
  await sleep(250)
  const mowed = await dev(a, g => g.garden())
  if (!(mowed.stripes & (1 << col)))
    throw new Error(`${size}: the touch rub didn't stripe column ${col}`)
  console.log(`touch ${size}: a touch rub striped column ${col}`)

  // Water: holding still on a dry patch pours on it.
  const patch = 12 * 12 + col
  await dev(a, (g, p) => g.setPatch(p, { health: 3 }), patch)
  const spot = await dev(
    a,
    (g, p) => g.toClient((p % 12) * 50 + 25, Math.floor(p / 12) * 40 + 20),
    patch
  )
  await hold(a, spot, 900, true)
  await sleep(200)
  const watered = await dev(a, g => g.garden())
  if (watered.health[patch] < 4)
    throw new Error(`${size}: holding still didn't water patch ${patch}`)
  console.log(
    `touch ${size}: a 900 ms touch hold took patch ${patch} from 3 to ${watered.health[patch]}`
  )

  // The edge guard: gnomes against each hedge ignore a press 19 px from the screen's
  // edge, and a press 21 px in grabs them.
  const width = a.viewportSize().width
  for (const [lx, inside, outside] of [
    [8, 19, 21],
    [592, width - 19, width - 21]
  ]) {
    await dev(a, g => g.act.clearItems())
    await dev(a, (g, x) => g.spawnAt('gnome', x, 420), lx)
    await sleep(300)
    const gnome = (await dev(a, g => g.garden())).items.find(
      i => i.kind === 'gnome'
    )
    const at = await dev(a, (g, id) => g.targetClient(id), gnome.id)
    const guarded = await touchProbe(a, { x: inside, y: at.y })
    await sleep(500)
    const grabbed = await touchProbe(a, { x: outside, y: at.y })
    if (guarded || grabbed?.id !== gnome.id)
      throw new Error(
        `${size}: at lx ${lx} the guarded press held ${JSON.stringify(guarded)} and the press beside it ${JSON.stringify(grabbed)}`
      )
    console.log(
      `touch ${size}: a gnome ${Math.abs(at.x - inside).toFixed(1)} px from a press at ${inside} px stayed put; ${outside} px grabbed it`
    )
    await sleep(500)
  }
  await shot(a, `phone-${size}-touch`)
  check()
  await context.close()
}

async function turn(browser) {
  const context = await browser.newContext({
    ...SIZES.phone,
    viewport: { width: 844, height: 390 }
  })
  const { a, b, check } = await pair(browser, 'phone', 'fast&calm', context)
  const cover = a.locator('[data-testid="turn-upright"]')
  await cover.waitFor()
  const lobbyText = await cover.textContent()
  if (!lobbyText.includes('Turn your phone upright.'))
    throw new Error(`the lobby cover reads ${lobbyText}`)
  if (lobbyText.includes('The round keeps going.'))
    throw new Error('the lobby cover talks about a round')
  await shot(a, 'phone-turn-lobby')
  await dev(a, g => g.ready(true))
  await dev(b, g => g.ready(true))
  await play(a, b)
  const t0 = (await dev(a, g => g.garden())).t
  await sleep(1000)
  const t1 = (await dev(a, g => g.garden())).t
  const playText = await cover.textContent()
  if (!playText.includes('The round keeps going.'))
    throw new Error(`the play cover reads ${playText}`)
  if (t1 - t0 < 800)
    throw new Error(`the garden stopped under the cover: ${t0} to ${t1}`)
  const onTop = await a.evaluate(
    () =>
      document
        .elementFromPoint(innerWidth / 2, innerHeight / 2)
        ?.closest('[data-testid="turn-upright"]') !== null
  )
  if (!onTop) throw new Error('presses reach the garden under the cover')
  await shot(a, 'phone-turn-play')
  await a.setViewportSize({ width: 390, height: 844 })
  await cover.waitFor({ state: 'detached', timeout: 2000 })
  await shot(a, 'phone-turn-upright')
  console.log(
    `turn: the cover shows in the lobby and in play (garden ran ${t1 - t0} ms under it) and lifts upright`
  )
  check()
  await context.close()

  const desk = await browser.newContext({
    viewport: { width: 1280, height: 400 }
  })
  const page = await desk.newPage()
  await page.goto(`${BASE}/r/${roomCode()}?local`)
  await waitFor(page, s => s.admission === 'seated')
  if (await page.locator('[data-testid="turn-upright"]').count())
    throw new Error('a short desktop window shows the cover')
  console.log('turn: a 1280 by 400 desktop window shows no cover')
  await desk.close()
}

/** A two-finger pinch spreading from 40 to 160 px apart around a client point. */
async function pinch(cdp, x, y) {
  const points = d => [
    { x: x - d, y, id: 1 },
    { x: x + d, y, id: 2 }
  ]
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: points(20)
  })
  for (let d = 24; d <= 80; d += 4) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: points(d)
    })
    await sleep(16)
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: []
  })
  await sleep(500)
}

async function zoom(browser) {
  const context = await browser.newContext(SIZES.small)
  const page = await context.newPage()
  const errors = watchErrors(page, 'zoom')
  await page.goto(`${BASE}/r/${roomCode()}?local`)
  await waitFor(page, s => s.admission === 'seated')
  const meta = await page.evaluate(
    () => document.querySelector('meta[name="viewport"]')?.content
  )
  if (/user-scalable=no|maximum-scale/.test(meta))
    throw new Error(`the viewport still blocks zoom: ${meta}`)
  const cdp = await context.newCDPSession(page)
  const scale = () => page.evaluate(() => visualViewport.scale)
  await sleep(400)
  await pinch(cdp, 120, 60)
  const onCanvas = await scale()
  const card = await page.locator('section').first().boundingBox()
  await pinch(cdp, card.x + card.width / 2, card.y + 60)
  const onCard = await scale()
  console.log(
    `zoom: a pinch on the canvas leaves scale ${onCanvas}; on the lobby card ${onCard.toFixed(2)}`
  )
  if (onCanvas !== 1 || onCard < 1.5)
    throw new Error('pinch zoom works on the wrong parts of the page')
  errors.check()
  await context.close()
}

/** Rows 2h and 2h + 1 at health h, so all 8 levels show from the fence down. */
async function cvd(browser) {
  for (const filter of ['', 'deutan', 'protan']) {
    const { a, b, check, context } = await pair(
      browser,
      'se',
      ['fast&calm', filter && `cvd=${filter}`].filter(Boolean).join('&')
    )
    await dev(a, g => g.ready(true))
    await dev(b, g => g.ready(true))
    await play(a, b)
    await sleep(600)
    await dev(a, g => {
      g.act.clearItems()
      for (let i = 0; i < 192; i++)
        g.setPatch(i, { health: Math.floor(i / 24), mess: 0, hole: 0 })
    })
    await sleep(400)
    await shot(a, `phone-cvd-${filter || 'normal'}`)
    check()
    await context.close()
  }
  console.log('cvd: health levels shot through no filter, deutan and protan')
}

const browser = await launch()
try {
  const phones = SIZE ? [SIZE] : ['se', 'small', 'phone']
  if (!ONLY || ONLY === 'layout')
    for (const size of SIZE ? [SIZE] : [...phones, 'desktop'])
      await layout(browser, size)
  if (!ONLY || ONLY === 'touch')
    for (const size of phones) await touch(browser, size)
  if (!ONLY || ONLY === 'turn') await turn(browser)
  if (!ONLY || ONLY === 'zoom') await zoom(browser)
  if (!ONLY || ONLY === 'cvd') await cvd(browser)
} finally {
  await browser.close()
}
