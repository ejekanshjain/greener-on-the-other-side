// M7 lawn: every health level, mess mark, hole and stripe drawn on a real page, also
// through the ?cvd filters; the lawn layer's repaint cost with every row repainted once a
// second (also at 4x CPU throttle, on the GPU); and an idle round that dries both lawns
// the same way.
import { dev, launch, localPair, shot, sleep, startMatch } from './lib.mjs'

/** Rows 2h and 2h + 1 at health h, mess marks down column 11, a hole and two stripes. */
async function paintPattern(page) {
  await dev(page, g => {
    for (let i = 0; i < 192; i++) {
      const row = Math.floor(i / 12)
      const col = i % 12
      g.setPatch(i, {
        health: Math.floor(row / 2),
        length: col === 3 || col === 4 ? 1 : 2,
        mess: col === 11 ? row % 8 : 0,
        hole: 0
      })
    }
    g.setPatch(9 * 12 + 9, { hole: 1 })
  })
}

async function patterns(browser) {
  for (const cvd of ['', 'deutan', 'protan']) {
    const { a, b, check, context } = await localPair(browser, {
      query: ['fast', cvd && `cvd=${cvd}`].filter(Boolean).join('&')
    })
    await startMatch(a, b)
    await sleep(900)
    await paintPattern(a)
    await sleep(300)
    const g = await dev(a, g => g.garden())
    // Columns 3 and 4 are short and clean on every row; a weed or gnome may break one.
    console.log(
      `pattern ${cvd || 'normal'}: stripes mask ${g.stripes.toString(2)}`
    )
    await shot(a, `lawn-levels${cvd ? `-${cvd}` : ''}`)
    check()
    await context.close()
  }
}

async function cost(browser, size, throttle) {
  const { a, b, check, context } = await localPair(browser, {
    query: 'fast',
    size
  })
  await startMatch(a, b)
  const cdp = await context.newCDPSession(a)
  if (throttle)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
  const before = await dev(a, g => g.perf().lawn)
  for (let k = 0; k < 6; k++) {
    await dev(a, g => g.dirtyLawn())
    await sleep(1000)
  }
  const after = await dev(a, g => g.perf().lawn)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  const label = `${size}${throttle ? ` at ${throttle}x throttle` : ''}`
  console.log(
    `cost ${label}: lawn draw mean ${after.mean.toFixed(2)} ms, p95 ${after.p95.toFixed(2)} ms, worst ${after.max.toFixed(2)} ms over ${after.frames} frames; ${after.rows - before.rows} rows repainted`
  )
  if (after.max > 4)
    throw new Error(`${label}: lawn drawing took ${after.max.toFixed(2)} ms`)
  check()
  await context.close()
}

async function idleRound(browser, size) {
  const { a, b, check, context } = await localPair(browser, {
    query: 'fast',
    size
  })
  await startMatch(a, b)
  // The host jumps to 1s left; both gardens catch up through every tick.
  const host = (await dev(a, g => g.state().role)) === 'host' ? a : b
  await dev(host, g => g.jump(1000))
  await sleep(600)
  // Each page steps on its own frames, so compare them at the same garden time.
  let ga
  let gb
  for (let tries = 0; tries < 20 && (!ga || ga.t !== gb.t); tries++)
    [ga, gb] = await Promise.all([
      dev(a, g => g.garden()),
      dev(b, g => g.garden())
    ])
  if (ga.t !== gb.t) throw new Error(`${size}: the two gardens never lined up`)
  const counts = h =>
    h.reduce((acc, v) => ((acc[v] = (acc[v] ?? 0) + 1), acc), {})
  console.log(
    `idle ${size}: health counts A ${JSON.stringify(counts(ga.health))}, B ${JSON.stringify(counts(gb.health))}`
  )
  // A round holds about 1.5 drying periods, so each patch dries once or twice from 5.
  // Weeds, snails and resting gnomes take more from a few.
  const dried = ga.health.filter(h => h === 3 || h === 4).length
  if (dried < 120 || ga.health.some(h => h > 4))
    throw new Error(`${size}: idle patches dried by an unexpected amount`)
  if (JSON.stringify(ga.health) !== JSON.stringify(gb.health))
    throw new Error(`${size}: the two lawns dried differently`)
  await shot(a, `lawn-idle-${size}`)
  check()
  await context.close()
}

const browser = await launch()
try {
  if (!process.argv.includes('--cost')) await patterns(browser)
  if (!process.argv.includes('--cost'))
    for (const size of ['desktop', 'phone', 'small'])
      await idleRound(browser, size)
} finally {
  await browser.close()
}
// Cost runs on the GPU like a phone: software raster slows 4x-throttled frames so much
// that few rows ever repaint.
const gpu = await launch({ gpu: true })
try {
  await cost(gpu, 'desktop', 0)
  await cost(gpu, 'phone', 0)
  await cost(gpu, 'phone', 4)
  console.log('lawn: ok')
} finally {
  await gpu.close()
}
