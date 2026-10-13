// M5 home screen, names and codes: real names pass the box and the auth route, blanks
// fail with the helper line, the code box explains bad codes, a pasted link joins,
// capital links switch to lowercase, short links show the bad-link screen, and each way
// in leads to its own lobby line. Screenshots at all three sizes.
import {
  BASE,
  launch,
  roomCode,
  shot,
  SIZES,
  waitFor,
  watchErrors
} from './lib.mjs'

const NAME_HELP = 'Use letters, numbers, spaces, apostrophes, dots or hyphens.'
const CODE_HELP = 'Codes are 6 characters with no 0, O, 1, L or I.'

async function home(context, label) {
  const page = await context.newPage()
  const errors = watchErrors(page, label)
  await page.goto(`${BASE}/?local`)
  await page
    .getByRole('heading', { name: 'Greener on the Other Side' })
    .waitFor()
  return { page, errors }
}

const browser = await launch()
try {
  for (const size of ['desktop', 'phone', 'small']) {
    const context = await browser.newContext(SIZES[size])
    const { page, errors } = await home(context, size)
    const name = page.getByLabel('Your Name')
    const start = page.getByRole('button', { name: 'Start a Room' })
    // The saved or funny name arrives once the page reads storage.
    await page.waitForFunction(() => document.querySelector('input')?.value)
    const initial = await name.inputValue()
    if (!initial) throw new Error(`${size}: the name box starts empty`)
    await shot(page, `home-${size}`)

    for (const good of ['एकांश', 'அருண்']) {
      await name.fill(good)
      if (await start.isDisabled())
        throw new Error(`${size}: "${good}" was refused`)
    }
    for (const bad of ['   ', '...']) {
      await name.fill(bad)
      await page.getByText(NAME_HELP).waitFor()
      if (!(await start.isDisabled()))
        throw new Error(`${size}: "${bad}" was accepted`)
    }
    await shot(page, `home-${size}-bad-name`)
    await name.fill('एकांश')

    await page.getByRole('button', { name: 'Join With Code' }).click()
    const codeBox = page.getByLabel('Room Code')
    await codeBox.fill('k7dm2o')
    await page.getByText(CODE_HELP).waitFor()
    await shot(page, `home-${size}-bad-code`)
    if (size === 'desktop') {
      // Enter on a half-typed code explains the rule.
      await codeBox.fill('K7D')
      await codeBox.press('Enter')
      await page.getByText(CODE_HELP).waitFor()
      // A pasted room link joins, in lowercase.
      await codeBox.fill(`${BASE}/r/K7DM2Q`)
      await page.waitForURL(/\/r\/k7dm2q\?local/)
      await waitFor(page, s => s.admission === 'seated', {
        label: 'joined by link'
      })
      await page
        .getByText('Waiting for your neighbour. Keep this page open.')
        .waitFor()
    }
    errors.check()
    await context.close()
  }
  console.log('names and codes: ok')

  // Each way in gets its own lonely-lobby line.
  const context = await browser.newContext(SIZES.phone)
  const started = await home(context, 'started')
  await started.page.getByRole('button', { name: 'Start a Room' }).click()
  await started.page.waitForURL(/\/r\/[a-z0-9]{6}\?local/)
  await started.page.getByText('Send the link to your neighbour.').waitFor()
  await shot(started.page, 'home-started-lobby')
  const typed = await home(context, 'typed')
  await typed.page.getByRole('button', { name: 'Join With Code' }).click()
  const fresh = roomCode()
  await typed.page
    .getByLabel('Room Code')
    .pressSequentially(fresh.toUpperCase(), { delay: 30 })
  await typed.page.waitForURL(new RegExp(`/r/${fresh}`))
  await typed.page
    .getByText("Nobody's here yet. Check the code with your friend.")
    .waitFor()
  started.errors.check()
  typed.errors.check()
  await context.close()
  console.log('start and typed joins: ok')

  // Capital links switch to lowercase; short ones aren't rooms.
  const links = await browser.newContext(SIZES.desktop)
  const page = await links.newPage()
  const errors = watchErrors(page, 'links')
  await page.goto(`${BASE}/r/K7DM2Q?local`)
  if (!/\/r\/k7dm2q\?local$/.test(page.url()))
    throw new Error(`no lowercase redirect: ${page.url()}`)
  await page.goto(`${BASE}/r/k7dm2`)
  await page.getByText("That link isn't a room.").waitFor()
  await shot(page, 'home-bad-link')
  errors.check()

  // The auth route uses the name box's rule. Signing costs no Pusher quota.
  const auth = async name => {
    const body = new URLSearchParams({
      socket_id: '1234.5678',
      channel_name: 'presence-lawn-k7dm2q',
      player_id: 'abcdefgh12',
      name
    })
    const res = await fetch(`${BASE}/api/pusher/auth`, { method: 'POST', body })
    return res.status
  }
  const statuses = await Promise.all(['एकांश', 'அருண்', '   ', '...'].map(auth))
  if (statuses.join() !== '200,200,400,400')
    throw new Error(`auth statuses ${statuses}`)
  console.log('auth route: real names signed, blanks refused')
  await links.close()
  console.log('home: ok')
} finally {
  await browser.close()
}
