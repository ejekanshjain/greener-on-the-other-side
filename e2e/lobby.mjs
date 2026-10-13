// M2 room protocol: seats and host agree, a third tab gets Room Full and leaves the
// member list, reloads keep seats and host, and a 3s clock skew is synced away.
// M6 lobby: the started, link and typed paths with their alone lines, Copy Link, Ready
// and Not Ready on both sides, the pulsing Ready, the live region, Room Full with Try
// Again, and Play Here, at all three sizes. Screen readers get the room code letter by
// letter, a neighbour who goes quiet shows Away on their gate, and a third tab sees Room
// Full without sending a single message.
import {
  BASE,
  dev,
  launch,
  localPair,
  roomCode,
  shot,
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
  await friend.goto(`${BASE}/?local`)
  await friend.getByRole('button', { name: 'Join With Code' }).click()
  await friend.getByLabel('Room Code').fill(roomCode())
  await friend
    .getByText("Nobody's here yet. Check the code with your friend.")
    .waitFor()
  await shot(friend, `lobby-${size}-typed-alone`)
  es.check()
  ef.check()
  await context.close()
  console.log(
    `${size}: started, link and typed paths, Ready, Not Ready and the live region work`
  )
}

const browser = await launch()
try {
  for (const size of ['desktop', 'phone', 'small']) await walk(browser, size)

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
