// M19 Brenda's reveal on two ?local&fast&calm pages at three sizes. The guest drowns two
// spots of its own lawn, so it loses round 1 with the drowned line under its score, while
// both lawns, carrying the crate's gnomes, get Brenda's gnome line with the right count.
// Both pages enter every step of the reveal within 100 ms of each other. Round 2's
// reveal gets a screenshot of each step. The guest loses round 2 the same way, which ends the match: the last
// reveal ends with Brenda's walk home across her plastic lawn and the match line.
import { dev, launch, localPair, shot, sleep, waitFor } from './lib.mjs'

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

/** Starts logging when the page enters each reveal step, by the wall clock. */
function logSteps(page) {
  return page.evaluate(() => {
    window.__steps = []
    let last = ''
    const tick = () => {
      const step = window.__game.greener.reveal().step
      if (step !== last) {
        window.__steps.push([step, Date.now()])
        last = step
      }
      window.__stepFrame = requestAnimationFrame(tick)
    }
    tick()
  })
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
  for (const step of STEPS) {
    const th = hs.find(([s]) => s === step)?.[1]
    const tg = gs.find(([s]) => s === step)?.[1]
    if (th === undefined || tg === undefined || Math.abs(th - tg) > 100)
      throw new Error(`${size}: step ${step} at ${th} and ${tg}`)
  }
  const gaps = STEPS.map(step => {
    const th = hs.find(([s]) => s === step)[1]
    const tg = gs.find(([s]) => s === step)[1]
    return Math.abs(th - tg)
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

  // Round 2: the guest drowns again, loses, and the match ends with Brenda's walk home.
  await jumpTo(host, guest, 1, 20_000)
  await pelt(host)
  const again = await drown(guest, [6 * 12 + 4, 10 * 12 + 7])
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
  await shoot(host, guest, 4600, `reveal-${size}-3-count`)
  await shoot(host, guest, 6200, `reveal-${size}-4-rosette`)
  await shoot(host, guest, 9000, `reveal-${size}-5-walk`)
  await shoot(host, guest, 13_000, `reveal-${size}-6-ending`)
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
