// M13 grass bag, compost and heaps, on two ?local pages at three sizes. The bag tip shows
// at 80 cuts. A real press drags the bag onto the compost and holds it there until it
// empties. A real swipe from the patio heaps the other lawn, which shows in the thrower's
// peek strip. Exact swipes check the two acceptance speeds: 1,900 px/s heaps the other
// lawn and 1,700 px/s clips and heaps your own front rows. Mowing a heap clears it.
import {
  dev,
  dragHold,
  launch,
  localPair,
  mouseFlick,
  shot,
  sleep,
  startMatch,
  touchFlick,
  waitForNotice
} from './lib.mjs'

const BAG = { lx: 220, ly: 744 }
const COMPOST = { lx: 360, ly: 706 }
const HEAP = 8

/** Waits until a dev query on `page` returns something truthy, or throws `why`. */
async function until(page, fn, arg, why, timeout = 4000) {
  const start = Date.now()
  for (;;) {
    const value = await dev(page, fn, arg)
    if (value) return value
    if (Date.now() - start > timeout) throw new Error(why)
    await sleep(40)
  }
}

/** The first garden event of `type` on `page` since shared time `since`. */
function event(page, type, since, why, timeout) {
  return until(
    page,
    (g, a) => g.events(120).find(e => e.at >= a.since && e.type === a.type),
    { type, since },
    why,
    timeout
  )
}

const now = page => dev(page, g => g.state().now)
const client = (page, p) => dev(page, (g, p) => g.toClient(p.lx, p.ly), p)

async function run(browser, size) {
  const touch = size !== 'desktop'
  const { a, b, check, context } = await localPair(browser, { size })
  await startMatch(a, b)

  // 1. Crossing 80 cuts shows the bag tip.
  await dev(a, g => g.act.setBag(76))
  await dev(a, g => g.act.mowColumn(5))
  await waitForNotice(a, 'Drag the bag to the compost, or over the fence.')

  // 2. Drag the bag onto the compost bin and hold it there until it empties.
  await dev(a, g => g.act.setBag(90))
  let since = await now(a)
  const from = await client(a, BAG)
  const to = await client(a, COMPOST)
  const holding = dragHold(a, from, to, 300, 1800, touch)
  await sleep(1100)
  await shot(a, `bag-${size}-compost`)
  await holding
  const compost = await event(
    a,
    'compost',
    since,
    `${size}: the bag never emptied`
  )
  const mower = (await dev(a, g => g.garden())).mower
  if (compost.detail.cuts !== 90 || mower.bag !== 0 || mower.bagOff)
    throw new Error(`${size}: compost left ${JSON.stringify(mower)}`)
  console.log(`${size}: the compost emptied ${compost.detail.cuts} cuts`)

  // 3. A real swipe from the patio heaps the other lawn and shows in the peek strip.
  await dev(a, g => g.act.setBag(96))
  await sleep(500)
  since = await now(a)
  const scale =
    (await client(a, { lx: 1, ly: 0 })).x -
    (await client(a, { lx: 0, ly: 0 })).x
  const flickTo = { x: from.x, y: from.y - 260 * scale }
  if (touch) await touchFlick(a, from, flickTo, 2300)
  else await mouseFlick(a, from, flickTo, 2300)
  const thrown = await event(
    a,
    'throw',
    since,
    `${size}: the bag swipe threw nothing`
  )
  const heap = await event(
    b,
    'heap',
    since,
    `${size}: no heap on the other lawn`,
    5000
  )
  const mess = (await dev(b, g => g.garden())).mess
  if (
    !heap.detail.fromNeighbour ||
    heap.detail.patches.some(p => mess[p] !== HEAP)
  )
    throw new Error(
      `${size}: the heap isn't on the other lawn: ${JSON.stringify(heap)}`
    )
  console.log(
    `${size}: a ${Math.round(thrown.detail.speedPx)} px/s swipe heaped patches ${heap.detail.patches} next door`
  )
  await shot(b, `bag-${size}-heap`)

  // 4. Exact swipes: 1,900 px/s crosses from the patio, 1,700 px/s clips onto your own rows.
  await sleep(500)
  since = await now(a)
  await dev(a, g => g.act.setBag(96))
  if (!(await dev(a, g => g.act.swipeBag(1900))))
    throw new Error(`${size}: the bag wouldn't lift`)
  const far = await event(
    b,
    'heap',
    since,
    `${size}: 1,900 px/s didn't heap next door`,
    5000
  )
  // A heap in their front 4 rows shows in the peek strip.
  if (far.detail.patches.some(p => p < 48)) {
    await until(
      a,
      (g, patches) =>
        patches.some(p => p < 48 && g.neighbour().lawn?.top[p] === 5),
      far.detail.patches,
      `${size}: the heap never showed in the peek strip`
    )
    await shot(a, `bag-${size}-peek`)
  }
  await sleep(600)
  since = await now(a)
  await dev(a, g => g.act.setBag(96))
  await dev(a, g => g.act.swipeBag(1700))
  await event(
    b,
    'theirClip',
    since,
    `${size}: the other page didn't see the clip`
  )
  const own = await event(
    a,
    'heap',
    since,
    `${size}: 1,700 px/s didn't heap your front rows`,
    5000
  )
  if (own.detail.fromNeighbour || own.detail.patches.some(p => p >= 36))
    throw new Error(`${size}: the clipped bag burst at ${own.detail.patches}`)
  console.log(
    `${size}: 1,900 px/s heaped ${far.detail.patches} next door; 1,700 px/s clipped onto ${own.detail.patches}`
  )
  await shot(a, `bag-${size}-own-heap`)

  // 5. Mowing a heap clears it a patch at a time, 6 cuts each.
  const col = own.detail.patches[0] % 12
  await dev(a, g => g.act.setBag(0))
  since = await now(a)
  await dev(a, (g, col) => g.act.mowColumn(col), col)
  await sleep(200)
  const cleared = (await dev(a, g => g.events(120))).filter(
    e => e.at >= since && e.type === 'unheap'
  )
  const after = await dev(a, g => g.garden())
  if (
    cleared.length !== 2 ||
    cleared.some(e => after.mess[e.detail.patch] === HEAP)
  )
    throw new Error(`${size}: mowing cleared ${cleared.length} heap patches`)
  console.log(
    `${size}: mowing cleared 2 heap patches; the bag holds ${after.mower.bag}`
  )
  check()
  await context.close()
}

const browser = await launch()
try {
  for (const size of process.env.SIZES?.split(',') ?? [
    'desktop',
    'phone',
    'small'
  ])
    await run(browser, size)
  console.log('bag: ok')
} finally {
  await browser.close()
}
