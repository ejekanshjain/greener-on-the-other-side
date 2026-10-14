// M19 Brenda's reveal on two ?local&fast&calm pages at three sizes. The guest drowns two
// spots of its own lawn, so it loses round 1 with the drowned line under its score, while
// both lawns, carrying the crate's gnomes, get Brenda's gnome line with the right count.
// Both pages enter every step of the reveal within 100 ms of each other, allowing for a
// frame the script's own screenshot holds up. Round 2's reveal gets a screenshot of each
// step. The guest loses round 2 the same way, which ends the match: the last reveal ends
// with Brenda's walk home across her plastic lawn and the match line. Both boards show
// the same counts beside each score line, also after the guest reloads mid-reveal, and
// the reloaded guest still enters each later step within 100 ms.
import { dev, frames, launch, localPair, shot, sleep, waitFor } from './lib.mjs'

const STEPS = ['timesUp', 'peel', 'count', 'rosette']

/** The host page and the guest page. */
async function roles(a, b) {
  const s = await dev(a, g => g.state())
  return s.role === 'host' ? [a, b] : [b, a]
}

/** Moves `round` to its last 1.5s on both pages, repeating the jump until the guest agrees. */
async function jumpTo(host, guest, round, msLeft) {
  const end = Date.now() + msLeft
  for (let tries = 0; tries < 10; tries++) {
    await dev(host, (g, a) => g.jump(a.left, a.round), {
      left: Math.max(0, end - Date.now()),
      round
    })
    await sleep(300)
    const [h, g] = await Promise.all(
      [host, guest].map(p => dev(p, g => g.state()))
    )
    if (h.match.at === g.match.at && g.gardenRound === round) return
  }
  throw new Error(`the guest never followed the jump to round ${round + 1}`)
}

/** Pours on each patch long enough to drown the plus of patches round it. */
async function drown(page, patches) {
  for (const patch of patches) {
    await dev(page, (g, p) => g.act.water(p, 2900), patch)
    await sleep(3100)
  }
  return (await dev(page, g => g.garden())).blame.drowned
}

/** Throws 2 gnomes from the host into the guest's lawn, so the guest loses by at least 2. */
async function pelt(host) {
  for (const patch of [5 * 12 + 2, 5 * 12 + 9]) {
    await dev(host, (g, p) => g.spawn('gnome', p), patch)
    await sleep(100)
    await dev(
      host,
      (g, p) => {
        g.act.setArm(0)
        const item = g
          .garden()
          .items.filter(i => i.kind === 'gnome' && i.state === 'rest')
          .reduce((a, b) => (b.id > a.id ? b : a))
        return g.act.throw(item.id, { speedPx: 1500 })
      },
      patch
    )
    await sleep(450)
  }
}

/**
 * Checks both boards show the same counts: the host's own lawn is the guest's neighbour,
 * and the other way round. Every line but a Tidy of 20 or a Junk of 0 has one.
 */
function sameCounts(host, guest, label) {
  const mirror = JSON.stringify(host.mine) === JSON.stringify(guest.theirs)
  const back = JSON.stringify(host.theirs) === JSON.stringify(guest.mine)
  if (!mirror || !back || host.mine.length !== 4)
    throw new Error(
      `${label}: counts differ: ${JSON.stringify(host)} and ${JSON.stringify(guest)}`
    )
  if (host.mine[0] !== 'of 50' || !/column/.test(host.mine[1]))
    throw new Error(`${label}: odd counts ${JSON.stringify(host.mine)}`)
}

/**
 * Starts logging when the page enters each reveal step, by the wall clock: each entry is
 * the step, the frame that first showed it, and the frame before.
 */
function logSteps(page) {
  return page.evaluate(() => {
    window.__steps = []
    let last = ''
    let before = Date.now()
    const tick = () => {
      const now = Date.now()
      const step = window.__game.greener.reveal().step
      if (step !== last) {
        window.__steps.push([step, now, before])
        last = step
      }
      before = now
      window.__stepFrame = requestAnimationFrame(tick)
    }
    tick()
  })
}

/**
 * How far apart two pages entered a step, in ms. Each page entered it after its frame
 * before and by the frame that showed it. A frame held up, such as by a screenshot, so
 * widens that page's span instead of counting as drift.
 */
function apart([, th, hb], [, tg, gb]) {
  return Math.max(0, Math.max(hb, gb) - Math.min(th, tg))
}

const steps = page =>
  page.evaluate(() => {
    cancelAnimationFrame(window.__stepFrame)
    return window.__steps
  })

/** Waits until the host's reveal is `ms` in, then screenshots both pages. */
async function shoot(host, guest, ms, name) {
  await waitFor(
    host,
    s => s.matchPhase?.kind !== 'reveal' || s.matchPhase.elapsed >= ms,
    { label: name, timeout: 30_000 }
  )
  await Promise.all([shot(host, `${name}-host`), shot(guest, `${name}-guest`)])
}

async function run(browser, size) {
  const { a, b, check, context } = await localPair(browser, {
    size,
    query: 'fast&calm'
  })
  await dev(a, g => g.ready(true))
  await dev(b, g => g.ready(true))
  for (const p of [a, b])
    await waitFor(p, s => s.matchPhase?.kind === 'play', { label: 'play' })
  const [host, guest] = await roles(a, b)

  // Round 1: the guest drowns its own lawn, takes 2 gnomes and loses.
  await pelt(host)
  const drowned = await drown(guest, [5 * 12 + 3, 9 * 12 + 8])
  await Promise.all([logSteps(host), logSteps(guest)])
  await jumpTo(host, guest, 0, 1500)
  // No screenshots here: capturing one page can hold back its next frame.
  await waitFor(host, s => s.matchPhase?.kind === 'countdown', {
    label: 'countdown',
    timeout: 20_000
  })
  const [hs, gs] = await Promise.all([steps(host), steps(guest)])
  const gaps = STEPS.map(step => {
    const h = hs.find(([s]) => s === step)
    const g = gs.find(([s]) => s === step)
    if (!h || !g || apart(h, g) > 100)
      throw new Error(
        `${size}: step ${step} at ${JSON.stringify(h)} and ${JSON.stringify(g)}`
      )
    return apart(h, g)
  })
  console.log(`${size}: steps in step, gaps ${gaps.join(', ')} ms`)

  // Brenda's lines: the gnome count on both lawns, and the drowned line under the loser.
  const state = await dev(host, g => g.state())
  const result = state.results[0]
  if (result.winner !== 'h')
    throw new Error(
      `${size}: the drowned guest didn't lose: ${JSON.stringify(result.scores)}`
    )
  const margin = result.scores[0].total - result.scores[1].total
  const name = state.peer.name
  const [hl, gl] = await Promise.all(
    [host, guest].map(p => dev(p, g => g.reveal()))
  )
  const gnomeLine = junk => `"I count ${-junk} gnomes. Are they breeding?"`
  const expect = (lines, text, who) => {
    if (!lines.join(' ').includes(text))
      throw new Error(
        `${size}: ${who} lacks "${text}": ${JSON.stringify(lines)}`
      )
  }
  expect(hl.mine, gnomeLine(result.scores[0].junk), 'host mine')
  expect(hl.theirs, gnomeLine(result.scores[1].junk), 'host theirs')
  expect(
    gl.mine,
    `You lost by ${margin}. You drowned ${drowned} patches yourself.`,
    'guest mine'
  )
  expect(
    hl.theirs,
    `lost by ${margin}. They drowned ${drowned} patches themselves.`,
    'host theirs'
  )
  console.log(`${size}: ${gl.mine.join(' ')} | ${name}`)
  sameCounts(hl.counts, gl.counts, `${size} round 1`)
  console.log(`${size}: counts ${JSON.stringify(hl.counts)}`)
  // Screen readers hear each score with what Brenda counted.
  const spoken = await guest.evaluate(
    () => document.querySelector('[data-testid="verdict"]')?.textContent ?? ''
  )
  for (const count of [...gl.counts.mine, ...gl.counts.theirs].filter(Boolean))
    if (!spoken.includes(count.split(', ')[0]))
      throw new Error(`${size}: the verdict text lacks "${count}": ${spoken}`)

  // Round 2: the guest drowns again, loses, and the match ends with Brenda's walk home.
  await jumpTo(host, guest, 1, 20_000)
  await pelt(host)
  const again = await drown(guest, [6 * 12 + 4, 10 * 12 + 7])
  await logSteps(host)
  await jumpTo(host, guest, 1, 1500)
  const over = await waitFor(host, s => s.results?.length === 2, {
    label: 'round 2 verdict',
    timeout: 15_000
  })
  if (!over.results[1].over)
    throw new Error(
      `${size}: round 2 didn't end the match (drowned ${again}): ${JSON.stringify(over.results[1].scores)} ${over.results[1].winner}`
    )
  await waitFor(
    host,
    s => s.matchPhase?.kind === 'reveal' && s.matchPhase.last,
    {
      label: 'last reveal'
    }
  )
  await shoot(host, guest, 300, `reveal-${size}-1-timesup`)
  await shoot(host, guest, 1700, `reveal-${size}-2-peel`)
  // The guest reloads mid-reveal and draws the same counts from the verdict.
  await guest.reload()
  await waitFor(guest, s => s.matchPhase?.kind === 'reveal', {
    label: 'guest back in the reveal'
  })
  // A reloaded page follows the shared clock closely once a quick ping is back.
  await waitFor(guest, s => s.bestRtt < 60, { label: 'guest clock sync' })
  // A reloaded page's catch-up can hold its frames for about 1s; log once they flow.
  await frames(guest, 10)
  await logSteps(guest)
  await shoot(host, guest, 4600, `reveal-${size}-3-count`)
  const [hc, gc] = await Promise.all(
    [host, guest].map(p => dev(p, g => g.reveal().counts))
  )
  sameCounts(hc, gc, `${size} round 2 after a reload`)
  await shoot(host, guest, 6200, `reveal-${size}-4-rosette`)
  await shoot(host, guest, 9000, `reveal-${size}-5-walk`)
  await shoot(host, guest, 13_000, `reveal-${size}-6-ending`)
  const [after, logged] = await Promise.all([steps(guest), steps(host)])
  // The host's log starts in play, where the step still reads round 1's last one.
  const hostSteps = logged.slice(logged.findIndex(([s]) => s === 'timesUp'))
  // The guest logs from mid-step, so check the steps it entered afterwards.
  const fresh = after.slice(1)
  // The script's own screenshots can hold a page's frame, so each span covers the hold.
  const held = []
  for (const g of fresh) {
    const h = hostSteps.find(([s]) => s === g[0])
    if (!h || apart(h, g) > 100)
      throw new Error(
        `${size}: after a reload, step ${g[0]} host ${JSON.stringify(h)} guest ${JSON.stringify(g)}; host ${JSON.stringify(hostSteps)}, guest ${JSON.stringify(after)}`
      )
    const hold = Math.max(h[1] - h[2], g[1] - g[2])
    if (hold > 50) held.push(`${g[0]} ${hold} ms`)
  }
  console.log(
    `${size}: after the guest's reload, ${fresh.map(([s]) => s).join(', ')} in step${held.length ? `; frames held by screenshots: ${held.join(', ')}` : ''}`
  )
  const ending = await Promise.all(
    [host, guest].map(p => dev(p, g => g.reveal().step))
  )
  if (ending.some(step => step !== 'ending'))
    throw new Error(`${size}: the last reveal shows ${ending}`)
  check()
  await context.close()
}

const browser = await launch()
try {
  const only = process.argv[2]
  for (const size of ['desktop', 'phone', 'small'])
    if (!only || only === size) await run(browser, size)
  console.log('reveal: all checks passed')
} finally {
  await browser.close()
}
