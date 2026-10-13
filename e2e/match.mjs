// M4 match clock: two ?local&fast tabs press Ready and show the same countdown, round
// clock and reveal within 50 ms, also when one tab's clock is 3s off. A guest that
// reloads mid-round rejoins at the right phase (after the desktop leave warning), and
// round 2 starts with no Ready.
//
// M20 match end: the menu (Escape or its button) with Settings, How to Play and Hide
// Tips; a match played to its end screen with both true lawns; Rematch on both pages
// starting a match with a new id and seed; Back on the guest opening the leave question,
// Stay keeping the match, Leave sending the host to the stormed-off screen and Back to
// Lobby. Back from a lobby reached from the home page leaves the room at once.
//
// Usage: node e2e/match.mjs [clock|end] (both by default)
import {
  BASE,
  dev,
  launch,
  noticeText,
  roomCode,
  shot,
  SIZES,
  sleep,
  waitFor,
  waitForNotice,
  watchErrors
} from './lib.mjs'

const ONLY = process.argv[2]

/** When each page thinks the current phase ends, in real machine time. */
async function phaseEnds(a, b) {
  const read = page =>
    dev(page, g => {
      const p = g.state().matchPhase
      return p
        ? { kind: p.kind, round: p.round, endsAt: Date.now() + (p.msLeft ?? 0) }
        : null
    })
  const [x, y] = await Promise.all([read(a), read(b)])
  if (!x || !y) throw new Error('no match phase')
  return { x, y, gap: Math.abs(x.endsAt - y.endsAt) }
}

/** Checks both pages agree on the phase within 50 ms. */
async function agree(a, b, kind, label) {
  for (const p of [a, b])
    await waitFor(p, s => s.matchPhase?.kind === kind, {
      label: kind,
      timeout: 20000
    })
  let worst = 0
  for (let i = 0; i < 4; i++) {
    const { x, y, gap } = await phaseEnds(a, b)
    if (x.kind !== kind || y.kind !== kind) continue
    if (x.round !== y.round)
      throw new Error(`${label}: rounds differ ${x.round} ${y.round}`)
    worst = Math.max(worst, gap)
    await sleep(120)
  }
  if (worst > 50) throw new Error(`${label}: ${kind} differs by ${worst} ms`)
  console.log(`${label}: ${kind} agrees within ${worst} ms`)
}

async function run(browser, { size, skew }) {
  const label = `${size}${skew ? ' skew' : ''}`
  const context = await browser.newContext(SIZES[size])
  const code = roomCode()
  const a = await context.newPage()
  const b = await context.newPage()
  const ea = watchErrors(a, 'A')
  const eb = watchErrors(b, 'B')
  // Fixed pids make A the host, so B is the guest that reloads.
  await a.goto(`${BASE}/r/${code}?local&fast&pid=aaaaaaaa22`)
  await waitFor(a, s => s.admission === 'seated')
  await b.goto(
    `${BASE}/r/${code}?local&fast&pid=zzzzzzzz22${skew ? '&skew=3000' : ''}`
  )
  await waitFor(b, s => s.seats.length === 2)
  await waitFor(b, s => s.bestRtt < 1000, { label: 'clock sync' })

  await dev(a, g => g.ready(true))
  await dev(b, g => g.ready(true))
  await agree(a, b, 'countdown', label)
  await shot(b, `match-${label.replace(' ', '-')}-countdown`)
  await agree(a, b, 'play', label)
  await sleep(1200)
  await shot(b, `match-${label.replace(' ', '-')}-play`)

  // The guest reloads mid-round and lands in the same round. A page you have pressed on
  // asks before it unloads mid-match on desktop.
  if (size === 'desktop') {
    await b.click('[data-testid="menu-button"]')
    await b.keyboard.press('Escape')
  }
  await b.reload()
  if (size === 'desktop' && eb.asked.leave !== 1)
    throw new Error(`the leave warning asked ${eb.asked.leave} times`)
  await waitFor(b, s => s.admission === 'seated' && s.phase === 'match', {
    label: 'rejoined'
  })
  await agree(a, b, 'play', `${label} after reload`)

  // Skip to the end of round 1: the reveal, then round 2's countdown with no Ready.
  await dev(a, g => g.jump(2500))
  await agree(a, b, 'reveal', label)
  await sleep(2500)
  await shot(a, `match-${label.replace(' ', '-')}-reveal`)
  await agree(a, b, 'countdown', `${label} round 2`)
  const s = await waitFor(a, s => s.matchPhase?.kind === 'play', {
    label: 'round 2',
    timeout: 15000
  })
  if (s.matchPhase.round !== 1)
    throw new Error(`expected round 2, got ${s.matchPhase.round + 1}`)
  await agree(a, b, 'play', `${label} round 2`)
  const garden = await dev(b, g => g.garden())
  if (garden.round !== 1)
    throw new Error(`guest garden is for round ${garden.round + 1}`)
  ea.check()
  eb.check()
  await context.close()
}

/**
 * Presses a control by touch on phones and by mouse on desktop. Forced, because a pulsing
 * button never holds still long enough for Playwright's stability check.
 */
function press(page, size, selector) {
  return size === 'desktop'
    ? page.click(selector, { force: true })
    : page.tap(selector, { force: true })
}

/** The open dialog's title and body text, or null. */
function dialogText(page) {
  return page.evaluate(
    () => document.querySelector('[role="dialog"]')?.innerText ?? null
  )
}

/** The centred card's text: the match end, stormed off or the lobby. */
function cardText(page) {
  return page.evaluate(() => document.querySelector('section')?.innerText ?? '')
}

/** Moves `round` to its last 2.5s; only the host's jump counts, so both pages try. */
async function jumpToEnd(a, b, round) {
  const end = Date.now() + 2500
  for (let tries = 0; tries < 12; tries++) {
    for (const p of [a, b])
      await dev(p, (g, x) => g.jump(x.left, x.round), {
        left: Math.max(0, end - Date.now()),
        round
      })
    await sleep(300)
    const [x, y] = await Promise.all([a, b].map(p => dev(p, g => g.state())))
    if (x.match.at === y.match.at && x.gardenRound === round) return
  }
  throw new Error(`the pages never agreed on the jump to round ${round + 1}`)
}

/** True when a lawn picture on the match end has paint on it. */
function lawnsPainted(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('section canvas')].map(c => {
      const ctx = c.getContext('2d')
      const { data } = ctx.getImageData(0, 0, c.width, c.height)
      let painted = 0
      for (let i = 3; i < data.length; i += 4 * 97) if (data[i] > 0) painted++
      return painted > 50
    })
  )
}

/** The menu: Settings with only sound, volume and Reduced Motion, How to Play, Hide Tips. */
async function checkMenu(page, size) {
  if (size === 'desktop') await page.keyboard.press('Escape')
  else await press(page, size, '[data-testid="menu-button"]')
  const menu = await dialogText(page)
  if (!menu?.includes('The round keeps going while this is open.'))
    throw new Error(`${size}: menu shows ${menu}`)
  const before = (await dev(page, g => g.state())).matchPhase.msLeft
  await shot(page, `match-end-${size}-menu`)
  await press(page, size, 'role=button[name="Settings"]')
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"] input')].map(
      i => i.closest('label, div')?.innerText.split('\n')[0]
    )
  )
  if (labels.join() !== 'Sound,Volume,Reduced Motion')
    throw new Error(`${size}: settings show ${labels}`)
  await shot(page, `match-end-${size}-settings`)
  await press(page, size, 'role=button[name="Back"]')
  await press(page, size, 'role=button[name="How to Play"]')
  const help = await dialogText(page)
  if (!help?.includes('Win 2 rounds to take the match.'))
    throw new Error(`${size}: How to Play shows ${help}`)
  await shot(page, `match-end-${size}-help`)
  await press(page, size, 'role=button[name="Back"]')
  // Hide Tips closes the menu and clears the tip line; a new tip never shows.
  await press(page, size, 'role=button[name="Hide Tips"]')
  if (await dialogText(page)) throw new Error(`${size}: menu still open`)
  const after = (await dev(page, g => g.state())).matchPhase.msLeft
  if (after >= before) throw new Error(`${size}: the round stopped in the menu`)
  if (await noticeText(page))
    throw new Error(`${size}: a tip shows after Hide Tips`)
  await dev(page, g => g.act.gust('over', 1))
  await sleep(2500)
  const tips = (await dev(page, g => g.events(40))).filter(
    e =>
      e.type === 'note' && e.detail.kind === 'tip' && e.at > Date.now() - 2600
  )
  if (tips.length || (await noticeText(page)))
    throw new Error(`${size}: tips after Hide Tips: ${JSON.stringify(tips)}`)
  const vane = (await dev(page, g => g.events(40))).some(e => e.type === 'vane')
  if (!vane) throw new Error(`${size}: the test gust never swung the vane`)
  console.log(`${size}: menu, settings, How to Play and Hide Tips ok`)
}

/** M20 on one screen size: menu, match end, rematch, Back, stormed off, Back to Lobby. */
async function end(browser, size) {
  const context = await browser.newContext(SIZES[size])
  const code = roomCode()
  const a = await context.newPage()
  const b = await context.newPage()
  const ea = watchErrors(a, 'A')
  const eb = watchErrors(b, 'B')
  // Fixed pids make A the host.
  await a.goto(`${BASE}/r/${code}?local&fast&calm&pid=aaaaaaaa23`)
  await waitFor(a, s => s.admission === 'seated')
  await b.goto(`${BASE}/r/${code}?local&fast&calm&pid=zzzzzzzz23`)
  await waitFor(b, s => s.seats.length === 2)
  await waitFor(b, s => s.bestRtt < 1000, { label: 'clock sync' })
  const hostName = (await dev(a, g => g.state())).me.name
  const guestName = (await dev(b, g => g.state())).me.name
  await dev(a, g => g.ready(true))
  await dev(b, g => g.ready(true))
  for (const p of [a, b])
    await waitFor(p, s => s.matchPhase?.kind === 'play', { label: 'play' })
  await waitForNotice(b, 'Throw the gnome over the fence.', 6000)
  await checkMenu(b, size)

  // The host wins 2 rounds to 0: the guest's lawn dries before each verdict.
  for (const round of [0, 1]) {
    await jumpToEnd(a, b, round)
    await dev(b, g => g.dryLawn(3))
    for (const p of [a, b])
      await waitFor(p, s => s.results.length === round + 1, {
        label: `verdict ${round + 1}`,
        timeout: 20_000
      })
  }
  for (const p of [a, b])
    await waitFor(p, s => s.phase === 'over', {
      label: 'over',
      timeout: 30_000
    })
  await sleep(400)
  const [hostCard, guestCard] = await Promise.all([cardText(a), cardText(b)])
  if (!hostCard.startsWith('You Win the Match'))
    throw new Error(`${size}: host card ${hostCard}`)
  if (!guestCard.startsWith(`${hostName} Wins the Match`))
    throw new Error(`${size}: guest card ${guestCard}`)
  if (!hostCard.includes('You won 2 rounds to 0.'))
    throw new Error(`${size}: host summary ${hostCard}`)
  for (const p of [a, b]) {
    const painted = await lawnsPainted(p)
    if (painted.length !== 2 || !painted.every(Boolean))
      throw new Error(`${size}: lawns painted ${painted}`)
  }
  await shot(a, `match-end-${size}-host`)
  await shot(b, `match-end-${size}-guest`)

  // Rematch: the guest first, then the host. A new match starts with a new seed.
  const first = (await dev(a, g => g.state())).match
  await press(b, size, 'role=button[name="Rematch"]')
  await waitFor(a, s => s.peer?.rematch, { label: 'their rematch' })
  await sleep(200)
  const asked = await cardText(a)
  if (!asked.includes(`${guestName} wants a rematch.`))
    throw new Error(`${size}: host card ${asked}`)
  if (!(await cardText(b)).includes(`Waiting for ${hostName}.`))
    throw new Error(`${size}: guest card ${await cardText(b)}`)
  if (await b.$('role=button[name="Rematch"]'))
    throw new Error(`${size}: Rematch still shows after pressing it`)
  await shot(a, `match-end-${size}-asked`)
  await press(a, size, 'role=button[name="Rematch"]')
  for (const p of [a, b])
    await waitFor(p, s => s.phase === 'match' && s.match.id !== first.id, {
      label: 'rematch'
    })
  const second = (await dev(b, g => g.state())).match
  if (second.seed === first.seed)
    throw new Error(`${size}: the rematch kept seed ${first.seed}`)
  for (const p of [a, b])
    await waitFor(p, s => s.matchPhase?.kind === 'play', { label: 'play 2' })
  console.log(
    `${size}: match end and rematch ok (seed ${first.seed} then ${second.seed})`
  )

  // Back on the guest asks first. Stay keeps the match; Leave storms off.
  const url = b.url()
  await b.evaluate(() => history.back())
  await b.waitForSelector('[data-testid="leave-dialog"]')
  const question = await dialogText(b)
  if (
    !question.includes('Leave the Match?') ||
    !question.includes('Your neighbour wins.')
  )
    throw new Error(`${size}: leave question ${question}`)
  await sleep(400)
  await shot(b, `match-end-${size}-leave`)
  await press(b, size, 'role=button[name="Stay"]')
  await sleep(300)
  if (b.url() !== url || (await dev(b, g => g.state())).phase !== 'match')
    throw new Error(`${size}: Stay left the match`)
  await b.evaluate(() => history.back())
  await b.waitForSelector('[data-testid="leave-dialog"]')
  await press(b, size, '[role="dialog"] >> role=button[name="Leave"]')
  await b.waitForURL(`${BASE}/`)
  await waitFor(a, s => s.over?.reason === 'stormedOff', {
    label: 'stormed off'
  })
  await sleep(300)
  const stormed = await cardText(a)
  if (!stormed.includes(`${guestName} stormed off. You win.`))
    throw new Error(`${size}: stayer card ${stormed}`)
  await shot(a, `match-end-${size}-stormed`)
  await press(a, size, 'role=button[name="Back to Lobby"]')
  await waitFor(a, s => s.phase === 'lobby' && s.seats.length === 1, {
    label: 'lobby alone'
  })
  console.log(`${size}: Back, Stay, Leave and stormed off ok`)
  ea.check()
  eb.check()
  await context.close()
}

/** Back from a lobby the home page opened leaves the room, so the neighbour sees it at once. */
async function backFromLobby(browser) {
  const context = await browser.newContext(SIZES.desktop)
  const a = await context.newPage()
  const b = await context.newPage()
  const ea = watchErrors(a, 'A')
  const eb = watchErrors(b, 'B')
  await a.goto(`${BASE}/?local`)
  await a.click('role=button[name="Start a Room"]')
  await a.waitForURL(/\/r\/[a-z0-9]{6}/)
  await waitFor(a, s => s.admission === 'seated')
  const code = new URL(a.url()).pathname.split('/')[2]
  await b.goto(`${BASE}/r/${code}?local`)
  await waitFor(b, s => s.peer?.listed, { label: 'seated together' })
  await a.goBack()
  await a.waitForURL(`${BASE}/?local`)
  await waitFor(b, s => s.seats.length === 1, {
    label: 'seat freed',
    timeout: 3000
  })
  console.log('Back from the lobby leaves the room at once')
  ea.check()
  eb.check()
  await context.close()
}

const browser = await launch()
try {
  if (ONLY !== 'end') {
    await run(browser, { size: 'desktop', skew: false })
    await run(browser, { size: 'phone', skew: true })
    await run(browser, { size: 'small', skew: false })
  }
  if (ONLY !== 'clock') {
    await backFromLobby(browser)
    for (const size of ['desktop', 'phone', 'small']) await end(browser, size)
  }
  console.log('match: ok')
} finally {
  await browser.close()
}
