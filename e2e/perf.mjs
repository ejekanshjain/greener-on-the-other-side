// M26 performance on a ?local pair at 390 by 844 with page A hosting. Page A's lawn gets
// 30 gnomes, a trampoline, a sunk bin with its litter, 40 weeds and 12 snails, while page
// B plays petty on autopilot and throws at it. Then, with the CPU throttled 4x:
// - each frame's work (updates and drawing), the lawn layer, the replay's copies and the
//   animation frame gaps, as mean, p95 and worst;
// - React commits per second during play, item stamps cached and lawn rows repainted;
// - the JavaScript allocated per second in the frame path, by function;
// - the catch-up of the busy garden after a jump, a whole fresh round's catch-up, and a
//   guest reload late in round 3 that rebuilds from the host's copy;
// - Practice, which runs Mr Pemberton's garden in the same page.
// A petty bot match on ?fast then checks the outbox peaks at 6 bundles a second or fewer
// and bundles stay under 3.5 KB.
//
// Usage: node e2e/perf.mjs [busy|bots|practice]
import {
  BASE,
  dev,
  launch,
  roomCode,
  SIZES,
  sleep,
  waitFor,
  watchErrors
} from './lib.mjs'

const ONLY = process.argv[2]
const THROTTLE = 4
const fmt = c =>
  `mean ${c.mean.toFixed(2)} ms, p95 ${c.p95.toFixed(2)} ms, worst ${c.max.toFixed(2)} ms over ${c.frames}`

/** Two ?local pages with fixed ids: `a` sorts first, so it hosts. */
async function pair(browser, size, query) {
  const context = await browser.newContext(SIZES[size])
  const code = roomCode()
  const tag = Math.random().toString(36).slice(2, 8).padEnd(6, '0')
  const errors = []
  const open = async (id, label) => {
    const p = await context.newPage()
    errors.push(watchErrors(p, label))
    await p.goto(`${BASE}/r/${code}?local&pid=${id}${query ? `&${query}` : ''}`)
    await waitFor(p, s => s.admission === 'seated')
    return p
  }
  const a = await open(`aa${tag}xx`, 'A')
  const b = await open(`bb${tag}xx`, 'B')
  for (const p of [a, b]) await waitFor(p, s => s.seats.length === 2)
  return { context, a, b, check: () => errors.forEach(e => e.check()) }
}

function inPlay(page, round) {
  return waitFor(
    page,
    s => s.matchPhase?.kind === 'play' && s.matchPhase.round === round,
    { label: `round ${round + 1} play`, timeout: 60_000 }
  )
}

/** The newest logged event of `type` after `since` (shared time), waiting up to 5s. */
async function nextEvent(page, type, since) {
  const started = Date.now()
  while (Date.now() - started < 5000) {
    const found = (await dev(page, g => g.events(200)))
      .filter(e => e.type === type && e.at >= since)
      .pop()
    if (found) return found
    await sleep(100)
  }
  throw new Error(`no ${type} event`)
}

/** Animation frame gaps in this page over `ms`, as mean, p95 and worst. */
function frameGaps(page, ms) {
  return page.evaluate(
    ms =>
      new Promise(resolve => {
        const gaps = []
        let last = performance.now()
        const end = last + ms
        requestAnimationFrame(function tick(t) {
          gaps.push(t - last)
          last = t
          if (t < end) requestAnimationFrame(tick)
          else {
            gaps.sort((x, y) => x - y)
            resolve({
              frames: gaps.length,
              mean: gaps.reduce((s, g) => s + g, 0) / gaps.length,
              p95: gaps[Math.floor(gaps.length * 0.95)],
              max: gaps[gaps.length - 1]
            })
          }
        })
      }),
    ms
  )
}

/** Samples allocations for `ms` and sums them by function, biggest first. */
async function allocations(cdp, ms) {
  await cdp.send('HeapProfiler.enable')
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 256 })
  await sleep(ms)
  const { profile } = await cdp.send('HeapProfiler.stopSampling')
  const sites = new Map()
  const walk = (node, parentName) => {
    const frame = node.callFrame
    const file = frame.url.split('/').pop()?.split('?')[0] ?? ''
    const name = `${frame.functionName || '(anonymous)'} ${file}:${frame.lineNumber + 1}`
    if (node.selfSize > 0)
      sites.set(name, (sites.get(name) ?? 0) + node.selfSize)
    for (const child of node.children) walk(child, name)
  }
  walk(profile.head, '')
  const total = [...sites.values()].reduce((s, v) => s + v, 0)
  return {
    perSecond: total / (ms / 1000),
    top: [...sites.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12)
  }
}

/** Fills A's lawn: B throws its bin and trampoline over, then gnomes, weeds and snails. */
async function busyLawn(a, b) {
  await dev(b, g => g.act.shed())
  await sleep(2500)
  const junk = (await dev(b, g => g.garden())).items.filter(
    i => i.kind === 'bin' || i.kind === 'trampoline'
  )
  for (const [k, item] of junk.entries()) {
    await dev(
      b,
      (g, a) => {
        g.act.drag(a.id, a.patch)
        g.act.throw(a.id, { speedPx: 2500 })
      },
      { id: item.id, patch: 2 * 12 + 3 + k * 5 }
    )
    await sleep(700)
  }
  await dev(a, g => g.act.shed())
  await sleep(2500)
  await dev(a, g => {
    const garden = g.garden()
    const gnomes = garden.items.filter(i => i.kind === 'gnome').length
    for (let k = 0; k < 30 - gnomes; k++) g.spawn('gnome', (k * 7 + 13) % 192)
    for (let k = 0; k < 40; k++) g.act.sprout((k * 11 + 5) % 192)
    for (let k = 0; k < 12; k++) g.spawn('snailShell', 24 + k * 13)
  })
  await sleep(3800)
  const g = await dev(a, g => g.garden())
  const count = kind => g.items.filter(i => i.kind === kind).length
  return {
    gnomes: count('gnome'),
    weeds: g.weeds.length,
    snails: g.snails.length,
    litter: count('litter'),
    bins: count('bin'),
    trampolines: count('trampoline'),
    items: g.items.length
  }
}

async function busy(browser) {
  const { a, b, check, context } = await pair(browser, 'phone', '')
  await dev(a, g => g.ready(true))
  await dev(b, g => g.ready(true))
  for (const p of [a, b]) await inPlay(p, 0)
  const scene = await busyLawn(a, b)
  console.log(`busy lawn on A: ${JSON.stringify(scene)}`)
  if (
    scene.gnomes < 30 ||
    scene.weeds < 40 ||
    scene.snails < 12 ||
    scene.litter < 4 ||
    scene.trampolines < 1
  )
    throw new Error('the busy lawn is missing something')
  // With nobody touching either garden, whatever allocates runs every frame.
  const cdp = await context.newCDPSession(a)
  const alloc = await allocations(cdp, 5000)
  console.log(
    `idle frame path allocations: ${(alloc.perSecond / 1024).toFixed(1)} KB/s; top sites:`
  )
  for (const [site, bytes] of alloc.top)
    console.log(`  ${(bytes / 1024 / 5).toFixed(2)} KB/s ${site}`)
  await dev(b, g => g.autopilot('petty'))

  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
  await sleep(1000)
  await dev(a, g => g.resetPerf())
  const before = await dev(a, g => g.perf())
  const gaps = await frameGaps(a, 10_000)
  const after = await dev(a, g => g.perf())
  const commitsPerSecond = (after.commits - before.commits) / 10
  console.log(`${THROTTLE}x throttle, busy lawn, 10s of play:`)
  console.log(`  frame work ${fmt(after.frame)}`)
  console.log(`  frame gaps ${fmt(gaps)}`)
  console.log(`  lawn layer ${fmt(after.lawn)}`)
  console.log(`  replay copies ${fmt(after.capture)}`)
  console.log(
    `  ${commitsPerSecond.toFixed(1)} React commits a second, ${after.stamps} stamps cached (${before.stamps} before), ${after.lawn.rows - before.lawn.rows} lawn rows repainted`
  )
  if (after.frame.p95 >= 16.7)
    throw new Error(`frame work p95 ${after.frame.p95.toFixed(2)} ms`)
  if (commitsPerSecond >= 1)
    throw new Error(`${commitsPerSecond} React commits a second`)
  if (after.stamps !== before.stamps)
    throw new Error('stamps were still being made during the measurement')

  // The busy garden catches up the rest of round 1 in one frame.
  const now = (await dev(a, g => g.state())).now
  await dev(a, g => g.jump(1000))
  const busyCatch = await nextEvent(a, 'catchUp', now)
  console.log(
    `  busy catch-up: ${(busyCatch.detail.gameMs / 1000).toFixed(1)}s of play in ${busyCatch.detail.ms.toFixed(1)} ms`
  )
  // A whole fresh round caught up at once, as after a hidden tab.
  await dev(b, g => g.autopilot(null))
  await inPlay(a, 1)
  const start = (await dev(a, g => g.state())).now
  await dev(a, g => g.jump(500))
  const roundCatch = await nextEvent(a, 'catchUp', start)
  console.log(
    `  fresh round catch-up: ${(roundCatch.detail.gameMs / 1000).toFixed(1)}s of play in ${roundCatch.detail.ms.toFixed(1)} ms`
  )
  // The plan's 50 ms is for a whole round of an ordinary lawn; the crowded lawn gets a
  // looser guard against regressions.
  if (roundCatch.detail.ms >= 50 || busyCatch.detail.ms >= 100)
    throw new Error('a catch-up took too long')

  // A guest reload 10s before the end of round 3 rebuilds from the host's copy, throttled.
  await inPlay(a, 2)
  await dev(a, g => g.jump(10_000))
  await sleep(2500)
  const bcdp = await context.newCDPSession(b)
  await bcdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
  await b.reload()
  await waitFor(b, s => s.matchPhase?.kind === 'play' && s.gardenRound === 2, {
    label: 'reloaded round 3'
  })
  const rebuild = await nextEvent(b, 'rebuild', 0)
  const caught = await nextEvent(b, 'catchUp', 0).catch(() => null)
  console.log(
    `  guest reload at ${(rebuild.detail.copyT / 1000).toFixed(1)}s into round 3: rebuild ${rebuild.detail.ms?.toFixed(1)} ms, then catch-up ${caught ? `${(caught.detail.gameMs / 1000).toFixed(1)}s in ${caught.detail.ms.toFixed(1)} ms` : 'none'}`
  )
  if (!rebuild.detail.copy) throw new Error('the reload had no copy')
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  await bcdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  check()
  await context.close()
}

/** Practice runs Mr Pemberton's garden and brain in the same page. */
async function practice(browser) {
  const context = await browser.newContext(SIZES.phone)
  const page = await context.newPage()
  const errors = watchErrors(page, 'practice')
  await page.goto(`${BASE}/practice`)
  await page.getByRole('button', { name: 'Start' }).click()
  await inPlay(page, 0)
  await sleep(8000)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
  await sleep(1000)
  await dev(page, g => g.resetPerf())
  await sleep(8000)
  const perf = await dev(page, g => g.perf())
  console.log(
    `practice at ${THROTTLE}x throttle with Mr Pemberton playing: frame work ${fmt(perf.frame)}`
  )
  if (perf.frame.p95 >= 16.7)
    throw new Error(`practice frame work p95 ${perf.frame.p95.toFixed(2)} ms`)
  errors.check()
  await context.close()
}

/** A whole petty bot match on ?fast: the outbox's peak and its largest bundle. */
async function bots(browser) {
  const { a, b, check, context } = await pair(
    browser,
    'desktop',
    'fast&bot=petty'
  )
  await dev(a, g => g.ready(true))
  await dev(b, g => g.ready(true))
  for (const p of [a, b])
    await waitFor(p, s => s.phase === 'over', {
      label: 'match end',
      timeout: 240_000
    })
  for (const [name, p] of [
    ['host', a],
    ['guest', b]
  ]) {
    const net = await dev(p, g => g.net())
    console.log(
      `bots ${name}: ${net.sent.bundles} bundles, peak ${net.sent.peakPerSecond} a second, largest ${net.sent.largest} B, ${(net.sent.bytes / 1024).toFixed(1)} KB in all; queued ${JSON.stringify(net.sent.pushed)}`
    )
    if (net.sent.peakPerSecond > 6)
      throw new Error(`${name} sent ${net.sent.peakPerSecond} bundles in 1s`)
    if (net.sent.largest >= 3500)
      throw new Error(`${name} sent a ${net.sent.largest} B bundle`)
  }
  check()
  await context.close()
}

// Phones draw the canvas on the GPU; headless Chromium's default software raster made
// 4x-throttled frames take 270 ms in compositing alone, which no phone pays.
const browser = await launch({ gpu: true })
try {
  if (!ONLY || ONLY === 'busy') await busy(browser)
  if (!ONLY || ONLY === 'practice') await practice(browser)
  if (!ONLY || ONLY === 'bots') await bots(browser)
} finally {
  await browser.close()
}
