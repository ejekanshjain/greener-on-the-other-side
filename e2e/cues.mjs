// M34 failure cues for everyone, on full-length `?local&calm` rounds where A hosts on
// `?first=0` and B is a new player on `?first=1`. Each page makes every mistake by real
// input (touch at phone sizes, the mouse on desktop) and checks its cue:
// - a fast flick on bare grass draws the swish, and one aimed at the fence beside a gnome
//   too, each within 100 ms of the flick;
// - a short flick on a weed leaves it rooted and shakes it;
// - a throw too soon and a throw with a tired arm drop with "Too soon" or "Arm's tired";
// - a slow, a sideways, a downward and a bag put-down, and a cancelled press; sideways
//   and downward releases leave the item where you let go;
// - a drowned patch's splash and squish, a full can spilling under the tap, "Full" on a
//   full bag, and a press on a bag too empty to lift that does nothing.
// M42 for everyone: a 30 px drag from a rooted weed fills its pull ring part way and a
// longer one pops it, the grey dashed swish beside a real throw in flight, and a gnome held
// still and let go, which earns its own tip. A screenshot 250 ms after the empty flick
// shows its swish still drawn.
// B, the new player, gets each failure tip's words; A, a returning player, sees every cue
// and no tip. Screenshots go to /tmp/greener-shots/cues-*.png.
//
// Usage: node e2e/cues.mjs [phone|desktop|small]
import {
  BASE,
  dev,
  dragHold,
  frames,
  heldPointer,
  hold,
  launch,
  mouseFlick,
  roomCode,
  shot,
  SIZES,
  sleep,
  touchFlick,
  waitFor,
  watchErrors
} from './lib.mjs'

const ONLY = process.argv[2]
/** Lawn units: a weed comes out once the finger moves this far. */
const YANK_PULL = 60
const BAG_POS = { lx: 220, ly: 744 }
const TAP_POS = { lx: 40, ly: 672 }
const CAN_MS = 10_000
/** The put-down tips a cancelled press must never earn. */
const PUT_DOWN_TIPS = [
  "Let go while you're still moving.",
  'Swipe it up to throw it. Water bare grass.',
  'Swipe up toward the fence.',
  'Hold the bag on the compost to empty it.'
]
/** A cue must show within this long of the input that caused it. */
const CUE_BUDGET_MS = 100

/** A on `?first=0` hosts; B is new with `?first=1`. */
async function pair(browser, size) {
  const context = await browser.newContext(SIZES[size])
  const code = roomCode()
  const a = await context.newPage()
  const b = await context.newPage()
  const errors = [watchErrors(a, 'A'), watchErrors(b, 'B')]
  const url = `${BASE}/r/${code}?local&calm`
  await a.goto(`${url}&pid=aaaaaaaa34&first=0`)
  await waitFor(a, s => s.admission === 'seated')
  await b.goto(`${url}&pid=zzzzzzzz34&first=1`)
  await waitFor(b, s => s.seats.length === 2)
  await waitFor(b, s => s.bestRtt < 1000, { label: 'clock sync' })
  return { context, a, b, check: () => errors.forEach(e => e.check()) }
}

/** Records when each pointer event reached the page, for cue timing. */
function stampPointers(page) {
  return page.evaluate(() => {
    window.__ptr = []
    for (const type of [
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointercancel'
    ])
      window.addEventListener(
        type,
        () => window.__ptr.push({ type, at: performance.now() }),
        true
      )
  })
}

/** A flick from `from` to `to` in client pixels, by touch or mouse. */
function flick(page, from, to, speedPx, touch, holdMs = 40) {
  return touch
    ? touchFlick(page, from, to, speedPx, { holdMs })
    : mouseFlick(page, from, to, speedPx, { holdMs })
}

/**
 * Presses at `from`, moves to `to` in `steps`, then cancels the press as the browser
 * would for a call, through dispatched pointer events.
 */
function cancelPress(page, from, to, touch) {
  return page.evaluate(
    async ([f, t, pointerType]) => {
      const canvas = document.querySelector('canvas')
      const fire = (type, x, y) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 21,
            pointerType,
            isPrimary: true,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: type === 'pointercancel' ? 0 : 1
          })
        )
      fire('pointerdown', f.x, f.y)
      for (let k = 1; k <= 6; k++) {
        await new Promise(r => setTimeout(r, 16))
        fire(
          'pointermove',
          f.x + ((t.x - f.x) * k) / 6,
          f.y + ((t.y - f.y) * k) / 6
        )
      }
      fire('pointercancel', t.x, t.y)
    },
    [from, to, touch ? 'touch' : 'mouse']
  )
}

/**
 * Clears loose items, weeds and snails, so the next mistake has room. Snails pile up
 * over the round, and a crawling one near a press gets grabbed.
 */
const tidy = page =>
  dev(page, g => {
    g.act.clearItems()
    g.act.pullWeeds(0)
    g.act.clearSnails()
  })

/**
 * A lawn point with nothing within 140 units, away from the fence and the patio. With
 * `below`, the point that many units under it must also have nothing within 140 units.
 */
async function bareSpot(page, taken = [], below = 0) {
  const g = await dev(page, g => g.garden())
  const things = [...g.items, ...g.weeds, ...g.snails, ...taken]
  const clear = (lx, ly) =>
    things.every(t => Math.hypot(t.lx - lx, t.ly - ly) > 140)
  for (let row = 5; row <= 12; row++)
    for (const col of [5, 6, 4, 7, 3, 8, 2, 9]) {
      const lx = col * 50 + 25
      const ly = row * 40 + 20
      if (clear(lx, ly) && clear(lx, ly + below)) return { lx, ly }
    }
  throw new Error('no bare spot on the lawn')
}

/** Spawns a gnome at a bare spot and returns its id and drawn point on screen. */
async function newGnome(page, taken = [], below = 0) {
  const spot = await bareSpot(page, taken, below)
  const before = new Set(
    (await dev(page, g => g.garden())).items.map(i => i.id)
  )
  await dev(page, (g, s) => g.spawnAt('gnome', s.lx, s.ly), spot)
  await frames(page, 3)
  const item = (await dev(page, g => g.garden())).items.find(
    i => !before.has(i.id) && i.kind === 'gnome'
  )
  if (!item) throw new Error('the spawned gnome never showed')
  return {
    id: item.id,
    lx: item.lx,
    ly: item.ly,
    client: await dev(page, (g, id) => g.targetClient(id), item.id)
  }
}

/** Client pixels per lawn unit. */
const scaleOf = page => dev(page, g => g.toClient(1, 0).x - g.toClient(0, 0).x)

/** The garden events of `type` logged after shared-clock time `since`. */
async function eventsOf(page, type, since) {
  const log = await dev(page, g => g.events(200))
  return log.filter(e => e.type === type && e.at >= since)
}

/**
 * Waits for a failure cue of `kind` heard after page time `after`, and returns how long
 * after its cause it first drew. A blocked throw or a rooted weed comes from letting go,
 * the last `pointerup` before the scene heard of it. A miss comes from the flick's first
 * fast move, so its cause is the press's first `pointermove`.
 */
async function cueDelay(page, kind, after, cause) {
  const start = Date.now()
  while (Date.now() - start < 2000) {
    const [cues, ptr] = await page.evaluate(() => [
      window.__game.greener.cues(),
      window.__ptr
    ])
    const cue = cues.find(c => c.kind === kind && c.heardAt > after)
    if (cue && cue.shownAt > 0) {
      const before = ptr.filter(p => p.at <= cue.heardAt)
      const downAt = before.findLast(p => p.type === 'pointerdown')?.at ?? 0
      const from =
        cause === 'pointermove'
          ? before.find(p => p.type === cause && p.at >= downAt)
          : before.findLast(p => p.type === cause)
      if (!from) throw new Error(`no ${cause} before the ${kind} cue`)
      return cue.shownAt - from.at
    }
    await sleep(30)
  }
  const log = (await dev(page, g => g.events(40))).map(e => e.type)
  throw new Error(`the ${kind} cue never showed; recent events ${log}`)
}

/** The tip line's text, or ''. */
const tipText = page =>
  page.evaluate(
    () => document.querySelector('[data-testid="tip"]')?.textContent ?? ''
  )

/** Waits until no tip shows, so a failure tip raised next shows at once. */
async function quiet(page) {
  const start = Date.now()
  while (Date.now() - start < 12_000) {
    if (!(await dev(page, g => g.tipNow()))) return
    await sleep(150)
  }
  throw new Error(`the tip line never cleared: ${await tipText(page)}`)
}

/** Waits up to `ms` for the tip line to read `text`. */
async function sawTip(page, text, ms = 3000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if ((await tipText(page)) === text) return true
    await sleep(50)
  }
  return false
}

/** Page time now, in `performance.now()` ms. */
const pageNow = page => page.evaluate(() => performance.now())
/** The shared clock now. */
const clockNow = page => dev(page, g => g.state().now)

/**
 * Runs one mistake on a page. A new player must see `tip` (when given); a returning
 * player must see none. A staged tip that lands at the same moment can push a failure tip
 * out unseen, so a new player gets up to 2 more tries once the line is clear. Each staged
 * tip that pushes one out is seen then, so it can't do it again.
 */
async function mistake(page, isNew, label, tip, act) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (isNew) await quiet(page)
    await tidy(page)
    const result = await act()
    if (!isNew) {
      await sleep(400)
      const shown = await dev(page, g => g.tipNow())
      if (shown)
        throw new Error(`${label}: a returning page showed "${shown.text}"`)
      return result
    }
    if (!tip || (await sawTip(page, tip))) return result
    console.log(
      `${label}: the tip didn't show (saw "${await tipText(page)}"), trying again`
    )
  }
  throw new Error(`${label}: never showed "${tip}"`)
}

/** Every cue on one page. `who` labels the output; `isNew` says whether tips show. */
async function cues(page, size, who, isNew) {
  const touch = size !== 'desktop'
  const scale = await scaleOf(page)
  const tag = `${size} ${who}`
  const report = []
  await stampPointers(page)
  // One real tap on the patio unlocks sound, as a player's first touch does.
  const patio = await dev(page, g => g.toClient(560, 720))
  await hold(page, patio, 60, touch)
  await sleep(200)
  // A press in a stalled frame lands in catch-up; start once frames flow.
  await frames(page, 10)

  // 1. A fast sideways flick on bare grass grabs nothing: the swish, "Too fast to mow".
  await mistake(
    page,
    isNew,
    `${tag} too fast`,
    'Too fast to mow. Press, then drag slowly.',
    async () => {
      const spot = await bareSpot(page)
      const from = await dev(page, (g, s) => g.toClient(s.lx - 60, s.ly), spot)
      const t0 = await pageNow(page)
      const since = await clockNow(page)
      await flick(
        page,
        from,
        { x: from.x + 160 * scale, y: from.y },
        2600,
        touch,
        0
      )
      const delay = await cueDelay(page, 'miss', t0, 'pointermove')
      await shot(page, `cues-${size}-${who}-swish`)
      // The swish lasts 450 ms, so a glance 250 ms after the flick still catches it.
      const glance = t0 + 250 - (await pageNow(page))
      if (glance > 0) await sleep(glance)
      await shot(page, `cues-${size}-${who}-swish-250ms`)
      const [miss] = await eventsOf(page, 'miss', since)
      if (!miss || miss.detail.near)
        throw new Error(`${tag}: no plain miss: ${JSON.stringify(miss)}`)
      report.push(`swish ${delay.toFixed(0)} ms`)
      if (delay > CUE_BUDGET_MS)
        throw new Error(`${tag}: swish took ${delay} ms`)
    }
  )

  // 1b. M42: the grey dashed swish beside a real throw in flight, in one screenshot.
  {
    if (isNew) await quiet(page)
    await tidy(page)
    await dev(page, g => g.act.setArm(0))
    const gnome = await newGnome(page)
    const since = await clockNow(page)
    await flick(
      page,
      gnome.client,
      { x: gnome.client.x, y: gnome.client.y - 140 },
      1600,
      touch,
      20
    )
    const spot = await bareSpot(page, [gnome])
    const from = await dev(page, (g, s) => g.toClient(s.lx - 60, s.ly), spot)
    await flick(
      page,
      from,
      { x: from.x + 160 * scale, y: from.y },
      2600,
      touch,
      0
    )
    await sleep(40)
    await shot(page, `cues-${size}-${who}-swish-beside-throw`)
    const [thrown] = await eventsOf(page, 'throw', since)
    const [miss] = await eventsOf(page, 'miss', since)
    if (!thrown || !miss)
      throw new Error(
        `${tag}: wanted a throw and a miss, got ${JSON.stringify({ thrown, miss })}`
      )
    if (miss.at - thrown.at > 900)
      throw new Error(
        `${tag}: the miss came ${miss.at - thrown.at} ms after the throw`
      )
  }

  // 2. The same flick aimed at the fence 66 px below a gnome: "Missed."
  await mistake(
    page,
    isNew,
    `${tag} missed`,
    'Missed. Press on it first, then swipe.',
    async () => {
      // A snail crawling near the press would be grabbed instead, so keep it clear too.
      const gnome = await newGnome(page, [], 66 / scale)
      const from = { x: gnome.client.x, y: gnome.client.y + 66 }
      const t0 = await pageNow(page)
      const since = await clockNow(page)
      await flick(page, from, { x: from.x, y: from.y - 160 }, 2600, touch, 0)
      const delay = await cueDelay(page, 'miss', t0, 'pointermove')
      const [miss] = await eventsOf(page, 'miss', since)
      if (miss?.detail.near?.id !== gnome.id)
        throw new Error(
          `${tag}: the miss didn't name the gnome: ${JSON.stringify(miss)}`
        )
      report.push(`aimed miss ${delay.toFixed(0)} ms`)
      if (delay > CUE_BUDGET_MS)
        throw new Error(`${tag}: swish took ${delay} ms`)
    }
  )

  // 3. A short fast flick on a weed leaves it rooted, and it shakes.
  await mistake(
    page,
    isNew,
    `${tag} rooted`,
    "It's rooted. Drag it until it pops out.",
    async () => {
      const spot = await bareSpot(page)
      const patch = Math.floor(spot.ly / 40) * 12 + Math.floor(spot.lx / 50)
      await dev(page, (g, p) => g.act.sprout(p), patch)
      await frames(page, 3)
      const weed = (await dev(page, g => g.garden())).weeds.find(
        w => w.patch === patch
      )
      if (!weed) throw new Error(`${tag}: no weed sprouted on ${patch}`)
      const from = await dev(page, (g, id) => g.targetClient(id), weed.id)
      const t0 = await pageNow(page)
      // Half the pull a weed needs, fast.
      await flick(
        page,
        from,
        { x: from.x, y: from.y - (YANK_PULL / 2) * scale },
        1500,
        touch
      )
      const delay = await cueDelay(page, 'rooted', t0, 'pointerup')
      const still = (await dev(page, g => g.garden())).weeds.some(
        w => w.id === weed.id
      )
      if (!still) throw new Error(`${tag}: the weed came out`)
      report.push(`rooted ${delay.toFixed(0)} ms`)
      if (delay > CUE_BUDGET_MS)
        throw new Error(`${tag}: rooted shake took ${delay} ms`)
    }
  )

  // 3b. M42: a 30 px drag from a rooted weed fills its pull ring part way, within 100 ms of
  // the press; dragging on to the 60-unit pull pops it out.
  {
    if (isNew) await quiet(page)
    await tidy(page)
    const spot = await bareSpot(page)
    const patch = Math.floor(spot.ly / 40) * 12 + Math.floor(spot.lx / 50)
    await dev(page, (g, p) => g.act.sprout(p), patch)
    await frames(page, 3)
    const weed = (await dev(page, g => g.garden())).weeds.find(
      w => w.patch === patch
    )
    if (!weed) throw new Error(`${tag}: no weed sprouted on ${patch}`)
    const from = await dev(page, (g, id) => g.targetClient(id), weed.id)
    const part = { x: from.x + 18, y: from.y - 24 }
    const t0 = await pageNow(page)
    const since = await clockNow(page)
    const hand = heldPointer(page, touch)
    await hand.down(from)
    await hand.move(from, part, 200)
    await sleep(120)
    const pull = (await dev(page, g => g.garden())).pull
    const want = 30 / scale / YANK_PULL
    if (Math.abs(pull - want) > 0.08)
      throw new Error(`${tag}: a 30 px drag pulled ${pull}, not ${want}`)
    await shot(page, `cues-${size}-${who}-pull-ring`)
    const delay = await cueDelay(page, 'pull', t0, 'pointerdown')
    const out = { x: from.x, y: from.y - (YANK_PULL + 10) * scale }
    await hand.move(part, out, 200)
    await sleep(120)
    const popped = await dev(page, g => g.garden())
    // Swipe the popped weed over the fence. Letting go here would put it down, and its
    // slow or still tip would use up the round's showing before the put-down checks.
    const fence = { x: out.x, y: Math.max(5, out.y - 320 * scale) }
    await hand.move(out, fence, 80)
    await hand.up()
    // The hand needs 0.4s after a throw, or the next step's throw is too soon.
    await sleep(500)
    const [yank] = await eventsOf(page, 'yank', since)
    const [down] = await eventsOf(page, 'putDown', since)
    if (
      !yank ||
      popped.weeds.some(w => w.id === weed.id) ||
      popped.pull !== -1 ||
      down
    )
      throw new Error(
        `${tag}: the longer drag didn't pop the weed out and throw it: ${JSON.stringify(down?.detail)}`
      )
    report.push(`pull ring ${delay.toFixed(0)} ms at ${pull.toFixed(2)}`)
    if (delay > CUE_BUDGET_MS)
      throw new Error(`${tag}: the pull ring took ${delay} ms`)
  }

  // 4. A real throw 0.2s after another: "Too soon".
  await mistake(
    page,
    isNew,
    `${tag} too soon`,
    'Too soon. Wait half a second.',
    async () => {
      const first = await newGnome(page)
      const second = await newGnome(page, [first])
      await dev(page, g => g.act.setArm(0))
      const t0 = await pageNow(page)
      const since = await clockNow(page)
      await dev(page, (g, id) => g.act.throw(id, { speedPx: 1500 }), first.id)
      await flick(
        page,
        second.client,
        { x: second.client.x, y: second.client.y - 140 },
        1600,
        touch,
        20
      )
      const delay = await cueDelay(page, 'hand', t0, 'pointerup')
      await shot(page, `cues-${size}-${who}-too-soon`)
      const [tired] = await eventsOf(page, 'tired', since)
      if (tired?.detail.reason !== 'hand')
        throw new Error(`${tag}: no hand block: ${JSON.stringify(tired)}`)
      report.push(`too soon ${delay.toFixed(0)} ms`)
      if (delay > CUE_BUDGET_MS)
        throw new Error(`${tag}: "Too soon" took ${delay} ms`)
    }
  )

  // 5. A real throw while a full meter locks the arm: "Arm's tired".
  await mistake(
    page,
    isNew,
    `${tag} tired`,
    "Arm's tired. Throw once a second.",
    async () => {
      const first = await newGnome(page)
      const second = await newGnome(page, [first])
      await dev(page, g => g.act.setArm(0.95))
      await dev(page, (g, id) => g.act.throw(id, { speedPx: 1500 }), first.id)
      // The hand's 0.4s passes; the 1.5s lock doesn't.
      await sleep(500)
      const t0 = await pageNow(page)
      await flick(
        page,
        second.client,
        { x: second.client.x, y: second.client.y - 140 },
        1600,
        touch
      )
      const delay = await cueDelay(page, 'tired', t0, 'pointerup')
      await shot(page, `cues-${size}-${who}-arm-tired`)
      report.push(`arm tired ${delay.toFixed(0)} ms`)
      if (delay > CUE_BUDGET_MS)
        throw new Error(`${tag}: "Arm's tired" took ${delay} ms`)
      await dev(page, g => g.act.setArm(0))
    }
  )

  // A cancelled press earns no tip, even for a new player.
  {
    if (isNew) await quiet(page)
    await tidy(page)
    const gnome = await newGnome(page)
    const since = await clockNow(page)
    await cancelPress(
      page,
      gnome.client,
      { x: gnome.client.x, y: gnome.client.y - 20 },
      touch
    )
    await sleep(2500)
    const [down] = await eventsOf(page, 'putDown', since)
    if (down?.detail.reason !== 'cancel')
      throw new Error(
        `${tag}: a cancelled press said ${JSON.stringify(down?.detail)}`
      )
    // Before any slow put-down, so the slow tip could still show this round.
    const tips = (await eventsOf(page, 'note', since)).filter(
      e => e.detail.kind === 'tip' && PUT_DOWN_TIPS.includes(e.detail.text)
    )
    if (tips.length)
      throw new Error(
        `${tag}: a cancelled press earned ${JSON.stringify(tips)}`
      )
  }

  // 6 to 9. Put-downs say why.
  const putDown = async (label, tip, reason, act) =>
    mistake(page, isNew, `${tag} ${label}`, tip, async () => {
      const since = await clockNow(page)
      await act()
      await sleep(250)
      const [down] = await eventsOf(page, 'putDown', since)
      if (down?.detail.reason !== reason)
        throw new Error(
          `${tag}: a ${label} put-down said ${JSON.stringify(down?.detail)}`
        )
    })
  await putDown(
    'slow',
    "Let go while you're still moving.",
    'slow',
    async () => {
      const gnome = await newGnome(page)
      const to = { x: gnome.client.x, y: gnome.client.y - 40 }
      await dragHoldAt(page, gnome.client, to, touch)
    }
  )
  await putDown(
    'still',
    'Swipe it up to throw it. Water bare grass.',
    'still',
    async () => {
      const gnome = await newGnome(page)
      await hold(page, gnome.client, 600, touch)
    }
  )
  // A sideways or downward release puts the item down where you let go, never thrown.
  // Each failure tip shows once a round, so only the sideways one expects it.
  for (const [label, dx, dy, tip] of [
    ['sideways', 130, 0, 'Swipe up toward the fence.'],
    ['downward', 0, 100, null]
  ])
    await putDown(label, tip, 'angle', async () => {
      const gnome = await newGnome(page)
      await flick(
        page,
        gnome.client,
        { x: gnome.client.x + dx * scale, y: gnome.client.y + dy * scale },
        1400,
        touch
      )
      await sleep(600)
      const item = (await dev(page, g => g.garden())).items.find(
        i => i.id === gnome.id
      )
      const along = dx ? item.lx - gnome.lx : item.ly - gnome.ly
      const across = dx ? item.ly - gnome.ly : item.lx - gnome.lx
      if (item.state !== 'rest' || along < 60 || Math.abs(across) > 25)
        throw new Error(
          `${tag}: a ${label} release left the gnome ${item.state} at ${along.toFixed(0)} units along, ${across.toFixed(0)} across`
        )
      report.push(`${label} put down ${along.toFixed(0)} units along`)
    })
  await putDown(
    'bag',
    'Hold the bag on the compost to empty it.',
    'bag',
    async () => {
      await dev(page, g => g.act.setBag(60))
      const bag = await dev(page, (g, p) => g.toClient(p.lx, p.ly), BAG_POS)
      await dragHoldAt(page, bag, { x: bag.x, y: bag.y - 90 * scale }, touch)
    }
  )
  // 10. Pouring on a full patch drowns it: a muddy splash and a squish.
  {
    await tidy(page)
    const spot = await bareSpot(page)
    const patch = Math.floor(spot.ly / 40) * 12 + Math.floor(spot.lx / 50)
    await dev(page, (g, p) => g.setPatch(p, { health: 7 }), patch)
    await dev(page, (g, ms) => g.act.setCan(ms), CAN_MS)
    const since = await clockNow(page)
    const at = await dev(page, (g, p) => g.toClient(p.lx, p.ly), spot)
    const full = (await dev(page, g => g.garden())).health[patch]
    await hold(page, at, 2000, touch)
    await sleep(100)
    const [drown] = await eventsOf(page, 'drown', since)
    if (!drown) {
      // What the press did instead, such as grabbing a snail that crawled in.
      const did = (await dev(page, g => g.events(80)))
        .filter(e => e.at >= since && !['sfx', 'dry'].includes(e.type))
        .map(
          e => `${Math.round(e.at - since)} ${e.type} ${e.detail?.patch ?? ''}`
        )
      throw new Error(
        `${tag}: pouring on patch ${patch} at health ${full} never drowned it: ${did.join(', ')}`
      )
    }
    const squish = (await eventsOf(page, 'sfx', since)).find(
      e => e.detail.name === 'squish'
    )
    if (!squish) throw new Error(`${tag}: the drowned patch made no squish`)
    report.push(`drown squish ${squish.at - drown.at} ms`)
  }

  // 11. The tap running into a full can spills over its rim.
  {
    await dev(page, (g, ms) => g.act.setCan(ms), CAN_MS)
    const tap = await dev(page, (g, p) => g.toClient(p.lx, p.ly), TAP_POS)
    await hold(page, tap, 60, touch)
    await sleep(150)
    const water = (await dev(page, g => g.garden())).water
    if (!water.tapOn) throw new Error(`${tag}: the tap didn't turn on`)
    await sleep(300)
    await shot(page, `cues-${size}-${who}-spill`)
    await hold(page, tap, 60, touch)
  }

  // 12 and 13. "Full" on a full bag; a press on a bag too empty to lift does nothing.
  {
    await dev(page, g => g.act.setBag(96))
    await sleep(200)
    await shot(page, `cues-${size}-${who}-full-bag`)
    await dev(page, g => g.act.setBag(10))
    const since = await clockNow(page)
    const bag = await dev(page, (g, p) => g.toClient(p.lx, p.ly), BAG_POS)
    await hold(page, bag, 120, touch)
    await sleep(600)
    const pokes = await eventsOf(page, 'mowerPoke', since)
    const toast = await page.evaluate(
      () => document.querySelector('[data-testid="toast"]')?.textContent ?? ''
    )
    if (pokes.length || toast)
      throw new Error(
        `${tag}: a press on a light bag poked the mower: "${toast}"`
      )
    await dev(page, g => g.act.setBag(0))
  }
  console.log(`${tag}: ${report.join(', ')}`)
}

/** Presses at `from`, slides to `to` over 400 ms, holds still 300 ms and lets go. */
function dragHoldAt(page, from, to, touch) {
  return dragHold(page, from, to, 400, 300, touch)
}

async function run(browser, size) {
  const { context, a, b, check } = await pair(browser, size)
  await dev(a, g => g.ready(true))
  await dev(b, g => g.ready(true))
  for (const p of [a, b])
    await waitFor(p, s => s.matchPhase?.kind === 'play', { label: 'play' })
  await frames(b, 3)
  await cues(b, size, 'new', true)
  await cues(a, size, 'returning', false)
  const aTips = (await dev(a, g => g.events(200))).filter(
    e => e.type === 'note' && e.detail.kind === 'tip'
  )
  if (aTips.length)
    throw new Error(
      `${size}: the returning page showed tips: ${JSON.stringify(aTips)}`
    )
  check()
  await context.close()
  console.log(
    `${size}: every cue showed on both pages; tips only for the new player`
  )
}

const browser = await launch()
try {
  for (const size of ['phone', 'desktop'])
    if (!ONLY || ONLY === size) await run(browser, size)
  if (ONLY === 'small') await run(browser, 'small')
} finally {
  await browser.close()
}
