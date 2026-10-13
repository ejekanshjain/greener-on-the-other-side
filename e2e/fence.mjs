// M1 and M11 fence rules: two ?local pages in one context. A real drag yanks a mid-lawn
// weed and throws it over the fence; the other page lands it at the mirrored column. A
// slow release puts a weed down. A soft swipe clips, teeters on both pages and drops on
// the thrower's front rows. The other page catches a throw with real pointer events and
// sends it straight back. Every arrival enters above the fence top. Runs at desktop with
// the mouse and at both phone sizes with touch. Extra query flags (such as `lag=250`)
// come from argv[2]. `?calm` keeps gusts and Biscuit out, since these full rounds run
// past 2:20 left and the clip search needs exact throw distances.
import {
  dev,
  waitFor,
  launch,
  localPair,
  mouseFlick,
  shot,
  sleep,
  startMatch,
  touchFlick
} from './lib.mjs'

const extra = process.argv[2] ?? ''
const query = ['calm', extra].filter(Boolean).join('&')
/** The fence top sits this many lawn units above the lawn's front edge. */
const FENCE_TOP_H = 40

/** The rooted weed nearest mid-lawn on a page, with its client point. */
async function midWeed(page, avoid = []) {
  const garden = await dev(page, g => g.garden())
  // Skip weeds near a loose item or a snail, which a press would grab first.
  const clear = w =>
    [...garden.items, ...garden.snails].every(
      i => Math.hypot(i.lx - w.lx, i.ly - w.ly) > 50
    ) &&
    garden.weeds.every(
      o => o.id === w.id || Math.hypot(o.lx - w.lx, o.ly - w.ly) > 30
    )
  const weeds = garden.weeds
    .filter(w => !avoid.includes(w.id) && w.ly > 160 && w.ly < 520 && clear(w))
    .sort((x, y) => Math.abs(x.ly - 330) - Math.abs(y.ly - 330))
  const weed = weeds[0]
  if (!weed)
    throw new Error(`no mid-lawn weed: ${JSON.stringify(garden.weeds)}`)
  return {
    ...weed,
    client: await dev(page, (g, id) => g.targetClient(id), weed.id)
  }
}

/** Drags from a point straight up at `speedPx` with the mouse or a touch flick. */
function flick(page, from, distancePx, speedPx, touch) {
  const to = { x: from.x, y: from.y - distancePx }
  return touch
    ? touchFlick(page, from, to, speedPx)
    : mouseFlick(page, from, to, speedPx)
}

async function run(browser, size) {
  const touch = size !== 'desktop'
  const { a, b, check, context } = await localPair(browser, { query, size })
  await startMatch(a, b)
  // Weeds sprout on their own schedule, so root a few mid-lawn ones to throw.
  await dev(a, g => {
    for (const patch of [
      7 * 12 + 3,
      8 * 12 + 8,
      9 * 12 + 5,
      6 * 12 + 9,
      7 * 12 + 6,
      8 * 12 + 2,
      9 * 12 + 9,
      8 * 12 + 5,
      7 * 12 + 9,
      9 * 12 + 2
    ])
      g.act.sprout(patch)
  })
  await sleep(400)
  const scale = await a.evaluate(
    () =>
      window.__game.greener.toClient(1, 0).x -
      window.__game.greener.toClient(0, 0).x
  )

  // 1. A fast flick yanks a mid-lawn weed and throws it over the fence. With loss
  // faults on, a lost throw may vanish, so try up to 3 weeds.
  const tried = []
  let weed = null
  let landed = null
  let tookMs = 0
  let speed = 0
  for (let attempt = 0; attempt < (extra ? 3 : 1) && !landed; attempt++) {
    weed = await midWeed(a, tried)
    tried.push(weed.id)
    await flick(a, weed.client, 260 * scale, 1200, touch)
    // The garden applies input at its next tick.
    await sleep(100)
    const thrown = (await dev(a, g => g.events(20))).filter(
      e => e.type === 'throw'
    )
    if (thrown.length !== attempt + 1)
      throw new Error(`${size}: no throw happened on attempt ${attempt + 1}`)
    speed = thrown[thrown.length - 1].detail.speedPx
    const started = Date.now()
    while (Date.now() - started < 2000 && !landed) {
      const g = await dev(b, g => g.garden())
      landed =
        g.items.find(
          i => i.fromNeighbour && i.kind === 'weed' && i.state === 'rest'
        ) ?? null
      if (!landed) await sleep(50)
    }
    tookMs = Date.now() - started
    if (!landed)
      console.log(`${size}: throw ${attempt + 1} vanished over the fence`)
  }
  if (!landed)
    throw new Error(`${size}: no weed landed on the other page within 2s`)
  const ga = await dev(a, g => g.garden())
  if (
    ga.weeds.some(w => w.id === weed.id) ||
    ga.items.some(i => i.kind === 'weed')
  )
    throw new Error(`${size}: the thrower still has the weed`)
  const expectX = 600 - weed.lx
  if (Math.abs(landed.lx - expectX) > 40)
    throw new Error(
      `${size}: landed at lx ${landed.lx.toFixed(0)}, expected about ${expectX.toFixed(0)}`
    )
  console.log(
    `${size}: threw at ${Math.round(speed)} px/s, landed at col ${Math.floor(landed.lx / 50)} (expected ${Math.floor(expectX / 50)}) ly ${landed.ly.toFixed(0)} within ${tookMs} ms`
  )
  await shot(b, `fence-${size}-landed`)

  // 2. A slow release puts the next weed down on your own lawn.
  const slow = await midWeed(a, tried)
  await flick(a, slow.client, 120 * scale, 300, touch)
  await sleep(300)
  const after = await dev(a, g => g.garden())
  const putDown = after.items.find(
    i => i.kind === 'weed' && i.state === 'rest' && !i.fromNeighbour
  )
  if (!putDown)
    throw new Error(
      `${size}: the slow release didn't put the weed down: ${JSON.stringify({ slow, items: after.items, events: (await dev(a, g => g.events(12))).map(e => [e.type, e.detail]) })}`
    )
  const events = (await dev(a, g => g.events(10))).map(e => e.type)
  if (!events.includes('putDown'))
    throw new Error(`${size}: no putDown event: ${events}`)
  console.log(
    `${size}: slow release put the weed down at ly ${putDown.ly.toFixed(0)}`
  )
  await shot(a, `fence-${size}-putdown`)

  if (!touch) await ringShot(a)
  await clipCheck(a, b, size, scale, touch, tried)
  await catchCheck(a, b, size, scale, touch, tried)
  await entryCheck(b, size)
  if (size === 'desktop') await goneCheck(a, b)
  if (extra)
    console.log(
      `${size}: filter drops on the receiver ${JSON.stringify((await dev(b, g => g.net())).drops)}`
    )
  check()
  await context.close()
}

/** Waits until a dev query on `page` returns something truthy, or throws `why`. */
async function until(page, fn, arg, why, timeout = 3000) {
  const start = Date.now()
  for (;;) {
    const value = await dev(page, fn, arg)
    if (value) return value
    if (Date.now() - start > timeout) throw new Error(why)
    await sleep(40)
  }
}

/**
 * 3. A soft swipe clips: it teeters on the thrower's fence and on the other page's, then
 * drops onto the thrower's front rows. The swipe speed adapts until a throw clips.
 */
async function clipCheck(a, b, size, scale, touch, tried) {
  // Aim for the middle of the clip band: the fence at 92% of the throw's distance.
  let factor = 1 / 0.4 / 0.92
  for (let attempt = 0; attempt < 5; attempt++) {
    // Let the arm meter drain, so the throw flies its full distance.
    await sleep(1300)
    const weed = await midWeed(a, tried)
    tried.push(weed.id)
    // The yanked weed stops 100 units ahead of its root, so it launches from there.
    const launch = weed.ly - 100
    const speed = launch * factor
    const since = await dev(a, g => g.state().now)
    await flick(a, weed.client, 260 * scale, speed, touch)
    const outcome = await until(
      a,
      (g, since) =>
        g
          .events(60)
          .find(
            e =>
              e.at >= since &&
              ['clip', 'cross', 'land', 'putDown', 'tired'].includes(e.type)
          )?.type,
      since,
      `${size}: the clip attempt had no outcome`,
      4000
    )
    const events = (await dev(a, g => g.events(80))).filter(e => e.at >= since)
    const thrown = events.find(e => e.type === 'throw')
    const clip = events.find(e => e.type === 'clip')
    if (!thrown) throw new Error(`${size}: no throw for the clip (${outcome})`)
    if (!clip) {
      const crossed = events.some(e => e.type === 'cross')
      console.log(
        `${size}: ${Math.round(thrown.detail.speedPx)} px/s (asked ${Math.round(speed)}) from ly ${launch.toFixed(0)} ${crossed ? 'crossed' : 'fell short'}, adjusting`
      )
      factor *= crossed ? 0.95 : 1.05
      if (crossed) await sleep(1500)
      continue
    }
    // The other page draws the teeter on its fence, mirrored.
    const theirs = await until(
      b,
      g => {
        const n = g.neighbour()
        const c = n.clips[n.clips.length - 1]
        return c && n.now - c.at < 600 ? { ...c, age: n.now - c.at } : null
      },
      undefined,
      `${size}: the other page never showed the clip teeter`
    )
    await Promise.all([
      shot(a, `fence-${size}-clip-a`),
      shot(b, `fence-${size}-clip-b`)
    ])
    const mirrored = 600 - clip.detail.clip.x
    if (Math.abs(theirs.x - mirrored) > 2)
      throw new Error(`${size}: teeter at x ${theirs.x}, expected ${mirrored}`)
    const id = thrown.detail.id
    const teeter = await dev(
      a,
      (g, id) => g.garden().items.find(i => i.id === id),
      id
    )
    if (teeter?.state !== 'teeter' && teeter?.state !== 'fall')
      console.log(`${size}: thrower state after the clip: ${teeter?.state}`)
    const landed = await until(
      a,
      (g, id) => {
        const item = g.garden().items.find(i => i.id === id)
        return item?.state === 'rest' ? item : null
      },
      id,
      `${size}: the clipped weed never landed`
    )
    if (landed.ly > 80)
      throw new Error(
        `${size}: the clip dropped at ly ${landed.ly}, not the front rows`
      )
    const laugh = await dev(a, g => g.neighbour().laughs.length)
    if (!laugh) throw new Error(`${size}: no smug laugh on the thrower's page`)
    console.log(
      `${size}: ${Math.round(thrown.detail.speedPx)} px/s clipped; the other page saw the teeter ${Math.round(theirs.age)} ms in; it dropped at ly ${landed.ly.toFixed(0)}`
    )
    return
  }
  throw new Error(`${size}: no soft swipe clipped in 5 tries`)
}

/**
 * 4. The other page catches a throw with real pointer events while it falls, then flicks
 * it straight back over the fence.
 */
async function catchCheck(a, b, size, scale, touch, tried) {
  await sleep(1500)
  const weed = await midWeed(a, tried)
  tried.push(weed.id)
  const since = await dev(a, g => g.state().now)
  const catcher = b.evaluate(
    async ([pointerType, flickPx]) => {
      const g = window.__game.greener
      const canvas = document.querySelector('canvas')
      const fire = (type, x, y) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 11,
            pointerType,
            isPrimary: true,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1
          })
        )
      const frame = () => new Promise(r => requestAnimationFrame(r))
      const wait = ms => new Promise(r => setTimeout(r, ms))
      const started = performance.now()
      let target = null
      while (!target && performance.now() - started < 6000) {
        await frame()
        const item = g.garden().items.find(i => i.catchable)
        if (item) target = { id: item.id, p: g.targetClient(item.id) }
      }
      if (!target) return { caught: false }
      fire('pointerdown', target.p.x, target.p.y)
      await wait(40)
      const t0 = performance.now()
      let y = target.p.y
      for (;;) {
        await wait(8)
        const d = Math.min(flickPx, (1500 * (performance.now() - t0)) / 1000)
        y = target.p.y - d
        fire('pointermove', target.p.x, y)
        if (d >= flickPx) break
      }
      fire('pointerup', target.p.x, y)
      return { caught: true, id: target.id }
    },
    [touch ? 'touch' : 'mouse', 200 * scale]
  )
  await flick(a, weed.client, 260 * scale, 1400, touch)
  const result = await catcher
  if (!result.caught) throw new Error(`${size}: nothing came over to catch`)
  await sleep(150)
  const bEvents = (await dev(b, g => g.events(40))).map(e => e.type)
  if (!bEvents.includes('catch'))
    throw new Error(`${size}: the press didn't catch: ${bEvents.slice(-12)}`)
  if (!bEvents.includes('throw'))
    throw new Error(
      `${size}: the catch wasn't thrown back: ${bEvents.slice(-12)}`
    )
  // Their head pops up over the fence on the first page as the throw comes back.
  await until(
    a,
    (g, since) => g.neighbour().heads.some(h => h.at >= since),
    since,
    `${size}: no head pop on the thrower's page`
  )
  await sleep(200)
  await shot(a, `fence-${size}-head`)
  const back = await until(
    a,
    (g, since) =>
      g
        .events(60)
        .find(
          e =>
            e.at >= since &&
            e.type === 'land' &&
            e.detail.fromNeighbour &&
            e.detail.landing.kind === 'weed'
        ),
    since,
    `${size}: the caught weed never came back`,
    4000
  )

  console.log(
    `${size}: caught and threw it straight back; it landed on patch ${back.detail.landing.patch}`
  )
}

/** A screenshot of the arm ring round a held gnome, then a slow put-down. */
async function ringShot(a) {
  await dev(a, g => g.act.setArm(0.7))
  const gnome = await dev(a, g => {
    const item = g.garden().items.find(i => i.kind === 'gnome')
    return item && g.targetClient(item.id)
  })
  await a.mouse.move(gnome.x, gnome.y)
  await a.mouse.down()
  await a.mouse.move(gnome.x + 4, gnome.y - 6, { steps: 3 })
  await sleep(150)
  await shot(a, 'fence-desktop-ring')
  await sleep(150)
  await a.mouse.up()
  await dev(a, g => g.act.setArm(0))
}

/** 5. Every arrival on the receiving page entered at or above the fence top. */
async function entryCheck(b, size) {
  const arrivals = (await dev(b, g => g.events(200))).filter(
    e => e.type === 'arrive'
  )
  if (arrivals.length === 0) throw new Error(`${size}: no arrivals logged`)
  for (const e of arrivals)
    if (e.detail.ly - e.detail.h > -FENCE_TOP_H + 0.01)
      throw new Error(
        `${size}: an arrival entered at ly ${e.detail.ly.toFixed(0)} height ${e.detail.h.toFixed(0)}, below the fence top`
      )
  console.log(
    `${size}: ${arrivals.length} arrivals all entered above the fence top (lowest ${Math.max(...arrivals.map(e => e.detail.ly - e.detail.h)).toFixed(0)})`
  )
}

/** 6. A throw at a neighbour who went silent (Away) vanishes over the fence. */
async function goneCheck(a, b) {
  await dev(b, g => g.fault({ offline: true }))
  // Away after 3s of silence in play; the member list keeps them for 30s.
  await waitFor(a, s => s.peer?.away, { label: 'peer away' })
  await dev(a, g => g.act.setArm(0))
  const since = await dev(a, g => g.state().now)
  const gnome = await dev(a, g =>
    g.garden().items.find(i => i.kind === 'gnome')
  )
  // Lawn reports still go to an Away neighbour, but no throw does.
  const throws = await dev(a, g => g.net().sent.pushed.throw ?? 0)
  await dev(a, (g, id) => g.act.throw(id, { speedPx: 2400 }), gnome.id)
  await until(
    a,
    (g, since) => g.events(30).some(e => e.at >= since && e.type === 'vanish'),
    since,
    'desktop: a throw at an Away neighbour did not vanish',
    5000
  )
  await sleep(500)
  if ((await dev(a, g => g.net().sent.pushed.throw ?? 0)) !== throws)
    throw new Error('desktop: the vanished throw was still sent')
  console.log('desktop: a throw at an Away neighbour vanished and sent nothing')
  await dev(b, g => g.fault({ offline: false }))
}

const browser = await launch()
try {
  for (const size of process.env.SIZES?.split(',') ?? [
    'desktop',
    'phone',
    'small'
  ])
    await run(browser, size)
  console.log('fence: ok')
} finally {
  await browser.close()
}
