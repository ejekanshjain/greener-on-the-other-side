// M2 room protocol: seats and host agree, a third tab gets Room Full and leaves the
// member list, reloads keep seats and host, and a 3s clock skew is synced away.
// M6 lobby: the started, link and typed paths with their alone lines, Copy Link, Ready
// and Not Ready on both sides, the pulsing Ready, the live region, Room Full with Try
// Again, and Play Here, at all three sizes. Screen readers get the room code letter by
// letter, a neighbour who goes quiet shows Away on their gate, and a third tab sees Room
// Full without sending a single message.
// M28: What Brenda Counts on every path, How to Play by click and keyboard with its status
// line, the pinned buttons on short phones, and focus on the menu button at the countdown.
// M41: How to Play's 13 lines, and its "More below" cue in the lobby and the menu while
// the last line sits out of view, gone once it shows. Pass `more` to run only that.
import {
  BASE,
  dev,
  launch,
  localPair,
  roomCode,
  shot,
  SHOTS,
  SIZES,
  sleep,
  waitFor,
  watchErrors
} from './lib.mjs'

/** The polite live region's current text. */
const announced = page =>
  page.evaluate(
    () =>
      document.querySelector('[aria-live="polite"].sr-only')?.textContent ?? ''
  )

/** The lobby's Ready button as the accessibility tree has it: name, description, pressed. */
async function readyNode(page) {
  const cdp = await page.context().newCDPSession(page)
  const { nodes } = await cdp.send('Accessibility.getFullAXTree')
  await cdp.detach()
  const button = nodes.find(
    n => n.role?.value === 'button' && /Ready$/.test(n.name?.value ?? '')
  )
  return (
    button && {
      name: button.name.value,
      description: button.description?.value ?? '',
      pressed: button.properties?.find(p => p.name === 'pressed')?.value.value
    }
  )
}

/** Checks What Brenda Counts shows its four lines and its last line. */
async function seesScoreCard(page, label) {
  const card = page.getByTestId('brenda-counts')
  await card.waitFor()
  const text = (await card.textContent()).replace(/\s+/g, ' ')
  for (const want of [
    'What Brenda Counts',
    'Green, up to 50: how healthy your grass is.',
    'Stripes, 2.5 each: a column mown short, fence to patio, with nothing on it at 0:00.',
    'Tidy, up to 20:',
    'Junk, no limit: each gnome on your grass costs 1',
    'Win 2 of 3 rounds. Each round lasts 3 minutes.'
  ])
    if (!text.includes(want))
      throw new Error(`${label}: What Brenda Counts lacks "${want}"`)
}

/** What has keyboard focus: its role and text, or its test id. */
const focused = page =>
  page.evaluate(() => {
    const el = document.activeElement
    return `${el?.tagName.toLowerCase()}:${el?.getAttribute('data-testid') ?? el?.textContent?.trim()}`
  })

/** True when an element sits wholly inside the viewport. */
async function inView(page, locator) {
  const box = await locator.boundingBox()
  const vh = page.viewportSize().height
  return !!box && box.y >= 0 && box.y + box.height <= vh + 0.5
}

/**
 * How to Play by click and by keyboard: it swaps the card for its 13 lines, focuses its
 * heading, keeps the status line, and Back puts focus back on its button.
 */
async function howToPlay(page, status, label) {
  const open = page.getByRole('button', { name: 'How to Play' })
  await open.click()
  await page.getByRole('heading', { name: 'How to Play' }).waitFor()
  if ((await focused(page)) !== 'h1:How to Play')
    throw new Error(
      `${label}: How to Play left focus on ${await focused(page)}`
    )
  const lines = await page.getByTestId('how-to-play').locator('li').count()
  if (lines < 13) throw new Error(`${label}: How to Play shows ${lines} lines`)
  if (status) await page.getByTestId('lobby-status').getByText(status).waitFor()
  await shot(page, `lobby-${label}-how-to-play`)
  await page.getByRole('button', { name: 'Back' }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('heading', { name: 'The Garden Gate' }).waitFor()
  if ((await focused(page)) !== 'button:How to Play')
    throw new Error(`${label}: Back left focus on ${await focused(page)}`)
  // Now by keyboard alone, then Back by click.
  await page.keyboard.press('Enter')
  await page.getByRole('heading', { name: 'How to Play' }).waitFor()
  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('heading', { name: 'The Garden Gate' }).waitFor()
  if ((await focused(page)) !== 'button:How to Play')
    throw new Error(
      `${label}: Back by click left focus on ${await focused(page)}`
    )
}

async function walk(browser, size) {
  const context = await browser.newContext(SIZES[size])
  // On the 390 px phone the clipboard refuses, so the link must show as selectable text.
  const copyFails = size === 'phone'
  if (copyFails)
    await context.addInitScript(() => {
      navigator.clipboard.writeText = () =>
        Promise.reject(new Error('clipboard refused'))
    })
  else await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const starter = await context.newPage()
  const es = watchErrors(starter, `${size} starter`)
  await starter.goto(`${BASE}/?local`)
  await starter.getByRole('button', { name: 'Start a Room' }).click()
  await waitFor(starter, s => s.admission === 'seated', {
    label: 'started room'
  })
  await starter.getByText('Send the link to your neighbour.').waitFor()
  await starter.getByText('Come back here after you send it.').waitFor()
  await seesScoreCard(starter, `${size} started`)
  await starter.getByRole('button', { name: 'Copy Link' }).click()
  if (copyFails) await starter.getByText(/\/r\/[a-z0-9]{6}\?local/).waitFor()
  else await starter.getByText('Link copied').waitFor()
  await shot(starter, `lobby-${size}-started`)
  const url = starter.url()
  // Screen readers get the code letter by letter, never the grouped capitals.
  const code = new URL(url).pathname.split('/').pop().toUpperCase()
  const tree = await starter.locator('main, body').first().ariaSnapshot()
  if (!tree.includes(code.split('').join(' ')))
    throw new Error(
      `${size}: no letter-by-letter code in ${tree.slice(0, 300)}`
    )
  if (tree.includes(`${code.slice(0, 3)} ${code.slice(3)}`))
    throw new Error(`${size}: screen readers still get the grouped code`)

  const friend = await context.newPage()
  const ef = watchErrors(friend, `${size} friend`)
  await friend.goto(url)
  await waitFor(starter, s => s.seats.length === 2, { label: 'friend seated' })
  await seesScoreCard(friend, `${size} link`)
  const friendName = (await dev(friend, g => g.state())).me.name
  await waitFor(starter, () => true)
  if (!(await announced(starter)).includes(`${friendName} joined.`))
    throw new Error(`${size}: no joined announcement`)

  await friend.getByRole('button', { name: 'Ready', exact: true }).click()
  await starter.getByText('Ready', { exact: true }).first().waitFor()
  await waitFor(starter, s => s.peer?.ready === true, { label: 'friend ready' })
  if (!(await announced(starter)).includes(`${friendName} is ready.`))
    throw new Error(`${size}: no ready announcement`)
  const readyButton = starter.getByRole('button', {
    name: 'Ready',
    exact: true
  })
  if (!(await readyButton.getAttribute('class')).includes('ready-pulse'))
    throw new Error(`${size}: Ready doesn't pulse`)
  await shot(starter, `lobby-${size}-they-are-ready`)
  await howToPlay(starter, `${friendName} is ready.`, size)
  // Its name says what a press does, and its description says you're ready, so the two
  // never contradict each other. Read it from the browser's accessibility tree, as a
  // screen reader would.
  const notReady = friend.getByRole('button', { name: 'Not Ready' })
  const node = await readyNode(friend)
  if (
    node?.name !== 'Not Ready' ||
    node.pressed !== undefined ||
    !node.description.startsWith('Waiting for ')
  )
    throw new Error(`${size}: Not Ready reads ${JSON.stringify(node)}`)
  console.log(
    `${size}: screen readers hear "${node.name}, button, ${node.description}"`
  )
  await notReady.click()
  const ready = friend.getByRole('button', { name: 'Ready', exact: true })
  if ((await ready.getAttribute('aria-describedby')) !== null)
    throw new Error(`${size}: Ready is still described as waiting`)
  await waitFor(starter, s => s.peer?.ready === false, {
    label: 'friend not ready'
  })

  await readyButton.click()
  await starter.getByText(`Waiting for ${friendName} to press Ready.`).waitFor()
  await shot(starter, `lobby-${size}-you-are-ready`)
  // The friend's phone goes quiet: their gate shows Away until they speak again.
  await dev(friend, g => g.fault({ offline: true }))
  await starter.getByTestId('away').waitFor({ timeout: 9000 })
  await shot(starter, `lobby-${size}-neighbour-away`)
  await dev(friend, g => g.fault({ offline: false }))
  await starter
    .getByTestId('away')
    .waitFor({ state: 'detached', timeout: 5000 })
  await starter.getByRole('button', { name: 'Not Ready' }).click()

  await friend.getByRole('button', { name: 'Leave' }).click()
  await friend.waitForURL(`${BASE}/`)
  await waitFor(starter, s => s.peer === null && s.seats.length === 1, {
    label: 'friend left'
  })
  if (!(await announced(starter)).includes(`${friendName} left.`))
    throw new Error(`${size}: no left announcement`)
  await starter.getByText('Send the link to your neighbour.').waitFor()

  // A link opened alone, and a typed code alone.
  await friend.goto(`${BASE}/r/${roomCode()}?local`)
  await friend
    .getByText('Waiting for your neighbour. Keep this page open.')
    .waitFor()
  await seesScoreCard(friend, `${size} link alone`)
  await friend.goto(`${BASE}/?local`)
  await friend.getByRole('button', { name: 'Join With Code' }).click()
  await friend.getByLabel('Room Code').fill(roomCode())
  await friend
    .getByText("Nobody's here yet. Check the code with your friend.")
    .waitFor()
  await seesScoreCard(friend, `${size} typed`)
  await shot(friend, `lobby-${size}-typed-alone`)
  es.check()
  ef.check()
  await context.close()
  console.log(
    `${size}: started, link and typed paths, Ready, Not Ready and the live region work`
  )
}

/**
 * On short phones the card scrolls while Ready, How to Play, Leave and the waiting line
 * stay in view. A countdown that starts while How to Play is open moves focus to the menu
 * button.
 */
async function pinned(browser, size) {
  const { a, b, context, check } = await localPair(browser, { size })
  await dev(b, g => g.state())
  await a.getByRole('button', { name: 'Ready', exact: true }).click()
  await a.getByTestId('lobby-status').waitFor()
  const card = a
    .locator('section')
    .filter({ has: a.getByTestId('lobby-pinned') })
  const scrolls = await card.evaluate(el => el.scrollHeight > el.clientHeight)
  if (size === 'se' && !scrolls)
    throw new Error(`${size}: the lobby card doesn't scroll`)
  for (const end of ['top', 'bottom']) {
    await card.evaluate((el, e) => {
      el.scrollTop = e === 'top' ? 0 : el.scrollHeight
    }, end)
    for (const target of [
      a.getByRole('button', { name: 'Not Ready' }),
      a.getByRole('button', { name: 'How to Play' }),
      a.getByRole('button', { name: 'Leave' }),
      a.getByTestId('lobby-status')
    ])
      if (!(await inView(a, target)))
        throw new Error(`${size}: ${await target.textContent()} scrolled away`)
    await shot(a, `lobby-${size}-pinned-${end}`)
  }
  // How to Play is open when the countdown starts: focus lands on the menu button.
  await a.getByRole('button', { name: 'How to Play' }).click()
  await a.getByRole('heading', { name: 'How to Play' }).waitFor()
  // B's Ready pulses, so press it through the dev API.
  await dev(b, g => g.ready(true))
  await waitFor(a, s => s.phase === 'match', { label: 'countdown' })
  await a.getByTestId('menu-button').waitFor()
  await a.waitForTimeout(200)
  if ((await focused(a)) !== 'button:menu-button')
    throw new Error(`${size}: the countdown left focus on ${await focused(a)}`)
  check()
  await context.close()
  console.log(
    `${size}: the card ${scrolls ? 'scrolls' : 'fits'} with its buttons and waiting line pinned, and the countdown focuses the menu button`
  )
}

/**
 * Checks one How to Play view's "More below" cue: it shows while the list's last line sits
 * below the visible area, and goes once the list is scrolled to its end. `under` is the
 * element just below the scroll area, whose top ends what you can see. Returns whether
 * the list ran past the fold.
 */
async function checkMoreBelow(page, under, label) {
  const list = page.getByTestId('how-to-play')
  const cue = page.getByTestId('more-below')
  // Fonts and the pop-in settle first.
  await page.waitForTimeout(400)
  const measure = () =>
    list.evaluate((ul, under) => {
      let scroller = ul.parentElement
      while (
        scroller &&
        !/auto|scroll/.test(getComputedStyle(scroller).overflowY)
      )
        scroller = scroller.parentElement
      const lines = [...ul.querySelectorAll('li')]
      const thirteenth = lines[12].getBoundingClientRect()
      const last = lines[lines.length - 1].getBoundingClientRect()
      const end = Math.min(
        scroller.getBoundingClientRect().bottom,
        document.querySelector(under).getBoundingClientRect().top
      )
      return {
        thirteenthOut: thirteenth.bottom > end + 1,
        lastOut: last.bottom > end + 1,
        scrollable: scroller.scrollHeight > scroller.clientHeight + 1
      }
    }, under)
  const before = await measure()
  const shown = await cue.isVisible()
  if (before.thirteenthOut && !shown)
    throw new Error(`${label}: line 13 is out of view with no "More below"`)
  if (!before.lastOut && shown)
    throw new Error(`${label}: "More below" shows with every line in view`)
  if (shown) {
    if ((await cue.textContent()) !== 'More below')
      throw new Error(`${label}: the cue reads ${await cue.textContent()}`)
    await page.screenshot({ path: `${SHOTS}/more-${label}-cue.png` })
  }
  await list.evaluate(ul => {
    let scroller = ul.parentElement
    while (
      scroller &&
      !/auto|scroll/.test(getComputedStyle(scroller).overflowY)
    )
      scroller = scroller.parentElement
    scroller.scrollTop = scroller.scrollHeight
  })
  await page.waitForTimeout(250)
  const after = await measure()
  if (after.lastOut)
    throw new Error(`${label}: the last line stays out of view at the end`)
  if (await cue.isVisible())
    throw new Error(`${label}: "More below" stays once the last line shows`)
  await page.screenshot({ path: `${SHOTS}/more-${label}-end.png` })
  return before.lastOut
}

/**
 * M41: the lobby's and the menu's How to Play show "More below" while their last line sits
 * out of view, and drop it at the end; the lobby keeps Back and its status line in view.
 */
async function moreBelow(browser, size) {
  const { a, b, context, check } = await localPair(browser, { size })
  const peerName = (await dev(b, g => g.state())).me.name
  await dev(b, g => g.ready(true))
  await a.getByRole('button', { name: 'How to Play' }).click()
  await a.getByRole('heading', { name: 'How to Play' }).waitFor()
  await a
    .getByTestId('lobby-status')
    .getByText(`${peerName} is ready.`)
    .waitFor()
  const lobbyFolds = await checkMoreBelow(
    a,
    '[data-testid="lobby-pinned"]',
    `${size}-lobby`
  )
  for (const target of [
    a.getByRole('button', { name: 'Back' }),
    a.getByTestId('lobby-status')
  ])
    if (!(await inView(a, target)))
      throw new Error(`${size}: ${await target.textContent()} scrolled away`)
  await a.getByRole('button', { name: 'Back' }).click()
  await a.getByRole('heading', { name: 'The Garden Gate' }).waitFor()
  await dev(a, g => g.ready(true))
  await waitFor(a, s => s.matchPhase?.kind === 'play', { label: 'play' })
  await a.getByTestId('menu-button').click()
  await a.getByRole('button', { name: 'How to Play' }).click()
  await a.getByTestId('menu-help').waitFor()
  // The menu's cue sits on its footer, under the dialog's scroll area.
  await a.evaluate(() =>
    document
      .querySelector('[data-testid="more-below"]')
      .parentElement.setAttribute('data-more-under', '')
  )
  const menuFolds = await checkMoreBelow(a, '[data-more-under]', `${size}-menu`)
  check()
  await context.close()
  console.log(
    `${size}: How to Play ${lobbyFolds ? 'shows "More below" until its end' : 'fits'} in the lobby, and ${menuFolds ? 'shows it until its end' : 'fits'} in the menu`
  )
}

const ONLY = process.argv[2]
const browser = await launch()
try {
  for (const size of ['se', 'bars', 'small', 'phone', 'desktop'])
    await moreBelow(browser, size)
  if (ONLY === 'more') {
    await browser.close()
    process.exit(0)
  }
  for (const size of ['desktop', 'phone', 'small']) await walk(browser, size)
  for (const size of ['se', 'small', 'desktop']) await pinned(browser, size)

  // Seats, host and Room Full.
  const { a, b, context, check, url } = await localPair(browser)
  const sa = await dev(a, g => g.state())
  const sb = await dev(b, g => g.state())
  if (sa.seats.join() !== sb.seats.join()) throw new Error('seats differ')
  if ([sa.role, sb.role].sort().join() !== 'guest,host')
    throw new Error(`roles: ${sa.role} ${sb.role}`)
  const host = sa.role === 'host' ? sa.me.id : sb.me.id
  console.log(`seated ${sa.seats.join(' ')}, host ${host}`)

  const c = await context.newPage()
  const ec = watchErrors(c, 'C')
  const opened = Date.now()
  await c.goto(url)
  const sc = await waitFor(c, s => s.admission === 'full', {
    label: 'Room Full'
  })
  const fullMs = Date.now() - opened
  const cNet = await dev(c, g => g.net())
  if (cNet.status !== null)
    throw new Error(`third tab still connected: ${cNet.status}`)
  // It finds two players listed, so it leaves without a hello and costs no sync.
  if (cNet.sent.bundles !== 0 || cNet.sent.pushed.hello)
    throw new Error(`third tab sent ${cNet.sent.bundles} bundles`)
  console.log(
    `third tab saw Room Full ${fullMs} ms after opening, sending nothing`
  )
  await c.getByText('Two people are already here.', { exact: false }).waitFor()
  await shot(c, 'lobby-room-full')
  await c.getByRole('button', { name: 'Try Again' }).click()
  await waitFor(c, s => s.admission === 'full', { label: 'Room Full again' })
  await waitFor(a, s => !s.others.includes(sc.me.id), {
    label: 'third tab gone from the member list'
  })
  console.log('third tab saw Room Full and left the member list')
  ec.check()
  await c.close()

  // Reloads keep seats and host.
  for (const page of [b, a]) {
    await page.reload()
    const s = await waitFor(
      page,
      s => s.seats.length === 2 && s.admission === 'seated',
      { label: 'reseated' }
    )
    if (s.seats.join() !== sa.seats.join())
      throw new Error(`seats changed after reload: ${s.seats}`)
    const hostNow =
      s.role === 'host' ? s.me.id : s.seats.find(id => id !== s.me.id)
    if (hostNow !== host) throw new Error('host changed after reload')
  }
  console.log('reloads kept seats and host')

  // The same player in a second tab: already open, then Play Here moves the game.
  const hostPage = sa.role === 'host' ? a : b
  const twin = await context.newPage()
  const et = watchErrors(twin, 'twin')
  const hostPid = sa.role === 'host' ? sa.me.id : sb.me.id
  await hostPage.goto(`${url}&pid=${hostPid}`)
  await waitFor(
    hostPage,
    s => s.admission === 'seated' && s.seats.length === 2,
    { label: 'host back' }
  )
  await twin.goto(`${url}&pid=${hostPid}`)
  await twin.getByText('This room is open in another tab.').waitFor()
  await twin.getByRole('button', { name: 'Play Here' }).click()
  await hostPage.getByText('This game moved to another tab.').waitFor()
  await waitFor(twin, s => s.admission === 'seated' && s.seats.length === 2, {
    label: 'twin seated'
  })
  et.check()
  console.log('a second tab shows already open, and Play Here moves the game')
  check()
  await context.close()

  // A 3s clock skew is synced away, whether the skewed tab hosts or not.
  for (const skewed of ['guest', 'host']) {
    const ctx2 = await browser.newContext(SIZES.desktop)
    const code = roomCode()
    const p1 = await ctx2.newPage()
    const p2 = await ctx2.newPage()
    const e1 = watchErrors(p1, 'P1')
    const e2 = watchErrors(p2, 'P2')
    // The lower id hosts, so the pids pick who is skewed.
    const hostPid = 'aaaaaaaa11'
    const guestPid = 'zzzzzzzz11'
    await p1.goto(
      `${BASE}/r/${code}?local&debug&pid=${skewed === 'guest' ? hostPid : guestPid}`
    )
    await waitFor(p1, s => s.admission === 'seated')
    await p2.goto(
      `${BASE}/r/${code}?local&skew=3000&pid=${skewed === 'guest' ? guestPid : hostPid}`
    )
    await waitFor(p2, s => s.seats.length === 2)
    await sleep(2500)
    let worst = 0
    let detail = ''
    for (let i = 0; i < 5; i++) {
      const [x, y] = await Promise.all([
        dev(p1, g => g.state()),
        dev(p2, g => g.state())
      ])
      worst = Math.max(worst, Math.abs(x.sharedMinusReal - y.sharedMinusReal))
      detail = `${x.role} ${Math.round(x.sharedMinusReal)}, skewed ${y.role} ${Math.round(y.sharedMinusReal)}`
      await sleep(200)
    }
    if (worst > 30)
      throw new Error(
        `clocks differ by ${worst.toFixed(1)} ms with a 3s skew (${detail})`
      )
    console.log(
      `skewed ${skewed}: clocks agree within ${worst.toFixed(1)} ms (${detail})`
    )
    if (skewed === 'guest') await shot(p1, 'lobby-debug-overlay')
    e1.check()
    e2.check()
    await ctx2.close()
  }
  // With Pusher unreachable, the room gives up after 8s and offers Try Again. The socket
  // is mocked and never answers, so this costs no quota.
  const ctx3 = await browser.newContext(SIZES.phone)
  // pusher-js falls back to HTTP streaming, so block that too.
  await ctx3.routeWebSocket(/pusher/, () => {})
  await ctx3.route(/pusher(app)?\.com/, route => route.abort())
  const lonely = await ctx3.newPage()
  const el = watchErrors(lonely, 'unreachable')
  await lonely.goto(`${BASE}/r/${roomCode()}`)
  await lonely
    .getByText("Can't reach the garden.", { exact: false })
    .waitFor({ timeout: 12000 })
  await shot(lonely, 'lobby-unreachable-phone')
  await lonely.getByRole('button', { name: 'Try Again' }).click()
  await lonely
    .getByText('Opening the garden gate', { exact: false })
    .waitFor({ timeout: 3000 })
  console.log('unreachable after 8s, and Try Again reconnects')
  // The blocked requests log network errors on purpose; anything else is a bug.
  const unexpected = el.errors.filter(e => !e.includes('net::ERR_FAILED'))
  if (unexpected.length) throw new Error(unexpected.join('\n'))
  await ctx3.close()
  console.log('lobby: ok')
} finally {
  await browser.close()
}
