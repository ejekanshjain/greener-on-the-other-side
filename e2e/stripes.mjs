// M36 repairable stripes and their cues, on full-length `?local&calm` rounds where A
// hosts on `?first=0` and B is a new player on `?first=1`, both driven by the real mouse
// at 390 by 844 and at 1280 by 800, and by touch at 375 by 667. On each page:
// - a slow rub down a clear column stripes it: the light sweeps down it, with the
//   `stripe` chime;
// - a gnome that landed on that column, with 2 long patches, breaks the stripe: it
//   flickers out;
// - a real flick throws the gnome off, and a second rub brings the stripe back;
// - a rub down a column holding 3 weeds flashes the patches that block it.
// B, the new player, also gets "Weeds or junk block this stripe. Clear them." pointing
// at that column; A gets no tip. `still` runs one page under Reduced Motion: the stripe
// comes and goes with no sweep and no flicker, and the chime stays.
// M43: each striped column gets a chalk tick on the patio's edge, which turns into a red
// cross for 1s when the gnome breaks it, and B also gets "Stripe broken. Clear it and mow
// again." on that column. `look` checks at three sizes that a column halfway through a
// pass shows mow lines on its cut patches, and that even and odd striped columns at
// health 3 and 5 draw lighter and greener than unstriped neighbours as short; `cvd`
// shoots the stripes through both colour-vision filters.
//
// Usage: node e2e/stripes.mjs [phone|desktop|small|still|look|cvd]
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
  touchFlick,
  waitFor,
  watchErrors
} from './lib.mjs'

const ONLY = process.argv[2]
const COLS = 12
/** 390 by 844 with the mouse, as the plan asks, the desktop, and 375 by 667 by touch. */
const VIEWPORTS = {
  phone: { viewport: { width: 390, height: 844 } },
  desktop: { viewport: { width: 1280, height: 800 } },
  small: SIZES.small
}
const BLOCKED_TIP = 'Weeds or junk block this stripe. Clear them.'
const BROKEN_TIP = 'Stripe broken. Clear it and mow again.'

/** A on `?first=0` hosts; B is new with `?first=1`. */
async function pair(browser, options) {
  const context = await browser.newContext(options)
  const code = roomCode()
  const a = await context.newPage()
  const b = await context.newPage()
  const errors = [watchErrors(a, 'A'), watchErrors(b, 'B')]
  const url = `${BASE}/r/${code}?local&calm`
  await a.goto(`${url}&pid=aaaaaaaa36&first=0`)
  await waitFor(a, s => s.admission === 'seated')
  await b.goto(`${url}&pid=zzzzzzzz36&first=1`)
  await waitFor(b, s => s.seats.length === 2)
  await waitFor(b, s => s.bestRtt < 1000, { label: 'clock sync' })
  await dev(a, g => g.ready(true))
  await dev(b, g => g.ready(true))
  for (const p of [a, b])
    await waitFor(p, s => s.matchPhase?.kind === 'play', { label: 'play' })
  return { context, a, b, check: () => errors.forEach(e => e.check()) }
}

/**
 * Clears column `col` for a stripe: no weeds, snails or items on it, every patch long
 * and clean, so one rub cuts it short.
 */
function clearColumn(page, col) {
  return dev(
    page,
    (g, col) => {
      const garden = g.garden()
      g.act.clearItems()
      g.act.pullWeeds(0)
      for (let row = 0; row < 16; row++)
        g.setPatch(row * 12 + col, { length: 3, mess: 0, hole: 0, health: 5 })
      return garden.snails.filter(s => s.patch % 12 === col).length
    },
    col
  )
}

/** Pages at this size press by touch; the others use the real mouse. */
const TOUCH = 'small'

/** A flick by touch or by the real mouse. */
function flick(page, from, to, speedPx, touch, options = {}) {
  return touch
    ? touchFlick(page, from, to, speedPx, options)
    : mouseFlick(page, from, to, speedPx, options)
}

/** A slow rub from the fence to the patio down column `col`. */
async function rub(page, col, touch = false) {
  const top = await dev(page, (g, c) => g.toClient(c * 50 + 25, 45), col)
  const bottom = await dev(page, (g, c) => g.toClient(c * 50 + 25, 668), col)
  await flick(page, top, bottom, 600, touch, { holdMs: 0 })
  await sleep(300)
}

/** Waits for a stripe cue of `kind` on column `col` heard after page time `after`. */
async function cue(page, kind, col, after, label) {
  const start = Date.now()
  while (Date.now() - start < 2500) {
    const cues = await dev(page, g => g.cues())
    const found = cues.find(
      c => c.kind === kind && c.id === col && c.heardAt > after && c.shownAt
    )
    if (found) return found
    await sleep(40)
  }
  throw new Error(`${label}: no ${kind} cue on column ${col}`)
}

const pageNow = page => page.evaluate(() => performance.now())

/** Waits until the tip line is empty. */
async function quiet(page) {
  const start = Date.now()
  while (Date.now() - start < 12_000) {
    if (!(await dev(page, g => g.tipNow()))) return
    await sleep(150)
  }
  throw new Error('the tip line never cleared')
}
const striped = (g, col) => ((g.stripes >> col) & 1) === 1

/** What lies on each patch of column `col`, for a failure message. */
function columnState(g, col) {
  return Array.from({ length: 16 }, (_, row) => {
    const p = row * COLS + col
    const on = [
      ...g.weeds.filter(w => w.patch === p).map(() => 'weed'),
      ...g.snails.filter(s => s.patch === p).map(() => 'snail'),
      ...g.items
        .filter(
          i => Math.floor(i.lx / 50) === col && Math.floor(i.ly / 40) === row
        )
        .map(i => `${i.kind}:${i.state}`)
    ]
    return `${row}:L${g.length[p]}M${g.mess[p]}H${g.hole[p]}${on.length ? `[${on}]` : ''}`
  })
}

/** A column that's free of snails, scanning from the middle out. */
async function freeColumn(page, skip = []) {
  const g = await dev(page, g => g.garden())
  for (const col of [5, 6, 4, 7, 3, 8, 2, 9])
    if (!skip.includes(col) && !g.snails.some(s => s.patch % COLS === col))
      return col
  throw new Error('every column has a snail')
}

/** Every stripe cue on one page. */
async function stripes(page, size, who, isNew) {
  const tag = `${size} ${who}`
  const touch = size === TOUCH
  // One real click on the patio unlocks sound, as a player's first tap does.
  await hold(page, await dev(page, g => g.toClient(560, 720)), 60, touch)
  await frames(page, 3)
  const col = await freeColumn(page)
  await clearColumn(page, col)
  const t0 = await pageNow(page)
  const since = await dev(page, g => g.state().now)
  await rub(page, col, touch)
  let g = await dev(page, g => g.garden())
  if (!striped(g, col)) throw new Error(`${tag}: the rub didn't stripe ${col}`)
  await cue(page, 'sweep', col, t0, tag)
  const log = await dev(page, g => g.events(200))
  if (
    !log.some(
      e => e.type === 'sfx' && e.detail.name === 'stripe' && e.at >= since
    )
  )
    throw new Error(`${tag}: no stripe chime`)
  await shot(page, `stripes-${size}-${who}-striped`)
  const ticks = await dev(page, g => g.ticks())
  if (ticks[col] !== 'tick')
    throw new Error(`${tag}: no tick under ${col}: ${JSON.stringify(ticks)}`)

  // Two long patches and a gnome on the stripe break it.
  const t1 = await pageNow(page)
  await dev(
    page,
    (g, col) => {
      g.setPatch(3 * 12 + col, { length: 3 })
      g.setPatch(11 * 12 + col, { length: 3 })
      // A gnome that landed here: it scuffed its patch and lies on it.
      g.setPatch(7 * 12 + col, { mess: 3 })
      g.spawnAt('gnome', col * 50 + 25, 7 * 40 + 20)
    },
    col
  )
  await cue(page, 'flicker', col, t1, tag)
  g = await dev(page, g => g.garden())
  if (striped(g, col)) throw new Error(`${tag}: the gnome didn't break ${col}`)
  const crossed = await dev(page, g => g.ticks())
  if (crossed[col] !== 'cross')
    throw new Error(`${tag}: no red cross under ${col}: ${crossed}`)
  await shot(page, `stripes-${size}-${who}-broken`)
  await sleep(1100)
  if ((await dev(page, g => g.ticks()))[col] !== null)
    throw new Error(`${tag}: the cross under ${col} outlived its 1s`)
  // A new player hears why; the first stripe's tip may still be showing.
  const brokenAt = Date.now()
  let broken = null
  while (Date.now() - brokenAt < 8000 && broken?.id !== 'broken') {
    broken = await dev(page, g => g.tipNow())
    if (!isNew && broken)
      throw new Error(`${tag}: a returning page showed "${broken.text}"`)
    await sleep(100)
  }
  if (isNew) {
    if (broken?.text !== BROKEN_TIP || broken.target?.col !== col)
      throw new Error(`${tag}: the broken tip read ${JSON.stringify(broken)}`)
    await shot(page, `stripes-${size}-${who}-broken-tip`)
  }

  // Throw the gnome off by a real flick, then mow again.
  const gnome = g.items.find(i => i.kind === 'gnome' && i.state === 'rest')
  const at = await dev(page, (g, id) => g.targetClient(id), gnome.id)
  await flick(page, at, { x: at.x, y: at.y - 220 }, 1500, touch)
  await sleep(1500)
  g = await dev(page, g => g.garden())
  if (g.items.some(i => i.id === gnome.id))
    throw new Error(`${tag}: the gnome is still here`)
  // Its scuff and the long grass still block the stripe until the next rub.
  if (striped(g, col)) throw new Error(`${tag}: ${col} striped before mowing`)
  // Weeds sprout on their own schedule; one in this column isn't what's being tested.
  await dev(page, g => g.act.pullWeeds(0))
  const t2 = await pageNow(page)
  await rub(page, col, touch)
  g = await dev(page, g => g.garden())
  if (!striped(g, col))
    throw new Error(
      `${tag}: mowing again didn't repair ${col}: ${JSON.stringify(columnState(g, col))}`
    )
  const sweep = await cue(page, 'sweep', col, t2, tag)
  // Catch the sweep partway down the column.
  await shot(page, `stripes-${size}-${who}-repaired`)

  // A rub down a column holding 3 weeds: the weeds' patches flash. A staged tip, such
  // as the weed tip these weeds earn, can push a new player's failure tip out unseen,
  // so a new player tries once more on a clear line.
  let flash = null
  for (let attempt = 1; attempt <= 3 && !flash; attempt++) {
    const weedy = await freeColumn(page, [col])
    await clearColumn(page, weedy)
    // Row 4 and down: a touch press at the rub's start in row 1 can reach a row 2 weed
    // and pull it instead of mowing.
    const weeds = [4, 8, 13].map(row => row * COLS + weedy)
    await dev(page, (g, ps) => ps.forEach(p => g.act.sprout(p)), weeds)
    await frames(page, 3)
    if (isNew) await quiet(page)
    const t3 = await pageNow(page)
    await rub(page, weedy, touch)
    const seen = await cue(page, 'blocked', weedy, t3, tag)
    if (!weeds.every(p => seen.patches.includes(p)))
      throw new Error(`${tag}: the flash missed a weed: ${seen.patches}`)
    await shot(page, `stripes-${size}-${who}-blocked`)
    if (!isNew) {
      if (await dev(page, g => g.tipNow()))
        throw new Error(`${tag}: a returning page showed a tip`)
      flash = seen
      break
    }
    const start = Date.now()
    let tip = null
    while (Date.now() - start < 3000 && tip?.id !== 'blocked') {
      tip = await dev(page, g => g.tipNow())
      await sleep(50)
    }
    if (tip?.id !== 'blocked') {
      console.log(`${tag}: saw "${tip?.text}" instead of the blocked tip`)
      continue
    }
    if (tip.text !== BLOCKED_TIP || tip.target?.col !== weedy)
      throw new Error(`${tag}: the blocked tip read ${JSON.stringify(tip)}`)
    await shot(page, `stripes-${size}-${who}-blocked-tip`)
    flash = seen
  }
  if (!flash) throw new Error(`${tag}: the blocked tip never showed`)
  console.log(
    `${tag}: sweep, flicker, sweep after the repair (${(sweep.shownAt - t2).toFixed(0)} ms from the rub), and the flash on ${flash.patches.length} patches`
  )
}

async function run(browser, size) {
  const { context, a, b, check } = await pair(browser, VIEWPORTS[size])
  await stripes(b, size, 'new', true)
  await stripes(a, size, 'returning', false)
  const tips = (await dev(a, g => g.events(300))).filter(
    e => e.type === 'note' && e.detail.kind === 'tip'
  )
  if (tips.length)
    throw new Error(`${size}: A saw tips: ${JSON.stringify(tips)}`)
  check()
  await context.close()
}

/** Under Reduced Motion the stripe comes and goes with no sweep or flicker; the chime stays. */
async function still(browser) {
  const { context, a, check } = await pair(browser, {
    ...VIEWPORTS.phone,
    reducedMotion: 'reduce'
  })
  await hold(a, await dev(a, g => g.toClient(560, 720)), 60)
  const col = await freeColumn(a)
  await clearColumn(a, col)
  const since = await dev(a, g => g.state().now)
  await rub(a, col)
  await dev(
    a,
    (g, col) => {
      for (const row of [5, 6, 7]) g.setPatch(row * 12 + col, { length: 3 })
    },
    col
  )
  await sleep(500)
  const log = await dev(a, g => g.events(200))
  const changes = log.filter(e => e.type === 'stripes' && e.at >= since)
  if (changes.length < 2)
    throw new Error(
      `still: the stripe didn't come and go: ${JSON.stringify(changes)}`
    )
  if (
    !log.some(
      e => e.type === 'sfx' && e.detail.name === 'stripe' && e.at >= since
    )
  )
    throw new Error('still: no stripe chime under Reduced Motion')
  const cues = await dev(a, g => g.cues())
  if (cues.some(c => c.kind === 'sweep' || c.kind === 'flicker'))
    throw new Error(`still: a stripe cue played: ${JSON.stringify(cues)}`)
  check()
  await context.close()
  console.log('still: the stripe came and went with its chime and no sweep')
}

/** Mean CIE L* and greenness (green over the mean of red and blue) of a canvas region. */
function regionStats(page, from, to) {
  return page.evaluate(
    ([from, to]) => {
      const canvas = document.querySelector('canvas')
      const box = canvas.getBoundingClientRect()
      const k = canvas.width / box.width
      const x = Math.round((from.x - box.left) * k)
      const y = Math.round((from.y - box.top) * k)
      const w = Math.round((to.x - from.x) * k)
      const h = Math.round((to.y - from.y) * k)
      const data = canvas.getContext('2d').getImageData(x, y, w, h).data
      const lin = c => {
        const v = c / 255
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      }
      let light = 0
      let green = 0
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
        const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
        light += Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y
        green += g - (r + b) / 2
      }
      const n = data.length / 4
      return { light: light / n, green: green / n }
    },
    [from, to]
  )
}

/**
 * Paints a lawn for the stripe look: columns 0 to 5 at health 3 and 6 to 11 at health 5,
 * every patch short and clean, columns 2, 3, 8 and 9 striped, and the other columns kept
 * from striping by 3 long patches at the patio end. Returns the patches a snail sits on.
 */
function stripeLawn(page) {
  return dev(page, g => {
    g.act.clearItems()
    g.act.pullWeeds(0)
    for (let col = 0; col < 12; col++)
      for (let row = 0; row < 16; row++) {
        const stripe = [2, 3, 8, 9].includes(col)
        g.setPatch(row * 12 + col, {
          health: col < 6 ? 3 : 5,
          length: stripe || row < 13 ? 1 : 3,
          mess: 0,
          hole: 0
        })
      }
    return g.garden().snails.map(s => s.patch)
  })
}

/**
 * M43's stripe look at one size: a column halfway through a mowing pass shows mow lines
 * on its cut patches; then even and odd striped columns at health 3 and 5 draw lighter
 * and greener than their unstriped neighbours, which are just as short; and the tick row
 * shows a tick under each striped column with nothing hiding it.
 */
async function look(browser, size, cvd = '') {
  const context = await browser.newContext(VIEWPORTS[size])
  const a = await context.newPage()
  const b = await context.newPage()
  const errors = [watchErrors(a, 'A'), watchErrors(b, 'B')]
  const url = `${BASE}/r/${roomCode()}?local&calm${cvd ? `&cvd=${cvd}` : ''}`
  await a.goto(`${url}&pid=aaaaaaaa43&first=0`)
  await waitFor(a, s => s.admission === 'seated')
  await b.goto(`${url}&pid=zzzzzzzz43&first=0`)
  await waitFor(a, s => s.seats.length === 2)
  await dev(a, g => g.ready(true))
  await dev(b, g => g.ready(true))
  await waitFor(a, s => s.matchPhase?.kind === 'play', { label: 'play' })
  await frames(a, 3)
  const tag = cvd ? `${size}-${cvd}` : size
  if (!cvd) {
    // Halfway through a pass: rows 0 to 7 of column 6 cut, the rest still long.
    await dev(a, g => {
      g.act.clearItems()
      g.act.pullWeeds(0)
      for (let row = 0; row < 16; row++)
        g.setPatch(row * 12 + 6, { length: row < 8 ? 1 : 2, mess: 0 })
    })
    await frames(a, 12)
    await shot(a, `stripes-${tag}-half-pass`)
  }
  const snails = await stripeLawn(a)
  await frames(a, 14)
  const g = await dev(a, g => g.garden())
  if (g.stripes !== 0b1100001100)
    throw new Error(`${tag}: stripes ${g.stripes.toString(2)}`)
  await shot(a, `stripes-${tag}-look`)
  const ticks = await dev(a, g => g.ticks())
  const want = [2, 3, 8, 9]
  if (ticks.some((t, col) => (t === 'tick') !== want.includes(col)))
    throw new Error(`${tag}: ticks ${JSON.stringify(ticks)}`)
  if (!cvd) {
    // Rows 1 to 11 of each striped column against its neighbour, skipping snails' rows.
    const rows = [...Array(11).keys()]
      .map(r => r + 1)
      .filter(r => !snails.some(p => Math.floor(p / 12) === r))
    const column = async col => {
      const out = { light: 0, green: 0 }
      for (const row of rows) {
        const from = await dev(
          a,
          (g, p) => g.toClient(p.col * 50 + 4, p.row * 40 + 2),
          { col, row }
        )
        const to = await dev(
          a,
          (g, p) => g.toClient(p.col * 50 + 46, p.row * 40 + 38),
          { col, row }
        )
        const s = await regionStats(a, from, to)
        out.light += s.light / rows.length
        out.green += s.green / rows.length
      }
      return out
    }
    const report = []
    for (const [stripe, plain, health] of [
      [2, 1, 3],
      [3, 4, 3],
      [8, 7, 5],
      [9, 10, 5]
    ]) {
      const [s, p] = [await column(stripe), await column(plain)]
      report.push(
        `col ${stripe} at health ${health}: L* ${s.light.toFixed(1)} vs ${p.light.toFixed(1)}, green ${s.green.toFixed(1)} vs ${p.green.toFixed(1)}`
      )
      if (s.light <= p.light || s.green <= p.green)
        throw new Error(`${tag}: ${report.at(-1)}`)
    }
    console.log(`${tag}: ${report.join('; ')}`)
  }
  errors.forEach(e => e.check())
  await context.close()
  console.log(`${tag}: the stripe look and the tick row check out`)
}

const browser = await launch()
try {
  if (!ONLY || ONLY === 'look')
    for (const size of ['small', 'phone', 'desktop']) await look(browser, size)
  if (!ONLY || ONLY === 'cvd')
    for (const cvd of ['deutan', 'protan']) await look(browser, 'phone', cvd)
  for (const size of ['phone', 'desktop', 'small'])
    if (!ONLY || ONLY === size) await run(browser, size)
  if (!ONLY || ONLY === 'still') await still(browser)
  console.log('stripes: ok')
} finally {
  await browser.close()
}
