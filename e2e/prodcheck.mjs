// A production build's Practice, with no dev hooks. From empty storage, a new player's
// lobby leads with Try the Yard, whose yard opens and skips, and a new player's tips show
// even with `?first=0`, which production ignores. No playtest pause exists. A tab switch keeps the round,
// nothing dev-only answers, and the finished-match fact is saved once the match ends.
// Then a context that holds the fact gets no tips, even with `?first=1`. Run it against
// `next start` on another port: GREENER_URL=http://localhost:5199 node e2e/prodcheck.mjs
// It sits through a whole full-length Practice match, about 7 to 11 minutes.
import { BASE, launch, shot, SIZES, sleep, watchErrors } from './lib.mjs'

const START_TIP = 'Throw the gnomes over the fence.'
const FACT = 'greener-finished'

/** The tip line's words, or null when no tip shows. */
const tipText = page =>
  page
    .locator('[data-testid="tip"]')
    .first()
    .textContent({ timeout: 200 })
    .catch(() => null)

/** Presses Start on Practice's lobby card; it may pulse, so the press skips the stillness check. */
const start = page =>
  page
    .getByRole('button', { name: 'Start', exact: true })
    .click({ force: true })

const browser = await launch()
try {
  const context = await browser.newContext({ ...SIZES.desktop, fresh: true })
  const page = await context.newPage()
  const errors = watchErrors(page, 'prod')
  await page.goto(`${BASE}/practice?fast&local&debug&first=0`)
  // A new player's card leads with Try the Yard; the yard opens, and Skip closes it.
  await page.getByRole('button', { name: 'Try the Yard' }).click()
  await page.getByRole('heading', { name: 'The Yard' }).waitFor()
  await shot(page, 'prodcheck-yard')
  await page.getByRole('button', { name: 'Skip' }).click()
  await page
    .getByRole('heading', { name: 'Practice With Mr Pemberton' })
    .waitFor()
  await start(page)
  // Empty storage makes this page new, whatever `?first` says.
  let tip = null
  const until = Date.now() + 10_000
  while (Date.now() < until && tip !== START_TIP) {
    tip = await tipText(page)
    await sleep(100)
  }
  if (tip !== START_TIP) throw new Error(`a new player's first tip: ${tip}`)
  await page.getByText('Mow!').first().waitFor({ timeout: 15_000 })
  await sleep(2000)
  // A tab switch: hidden for 4s, during which only timers run.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden'
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await sleep(4000)
  await page.evaluate(() => {
    delete document.visibilityState
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await sleep(1000)
  const dev = await page.evaluate(() => ({
    game: typeof window.__game,
    pause: typeof window.__game?.pause,
    clock: document.body.innerText.match(/\d:\d\d/)?.[0] ?? null
  }))
  await page.keyboard.press('Backquote')
  const panel = await page.getByText('Dry Lawn').count()
  await shot(page, 'prodcheck-practice')
  if (dev.game !== 'undefined') throw new Error('window.__game exists')
  if (dev.pause !== 'undefined') throw new Error('the playtest pause exists')
  if (panel > 0) throw new Error('the dev panel opened')
  // ?fast is ignored, so 7s into a 3-minute round the clock reads 2:5x.
  if (!dev.clock?.startsWith('2:5'))
    throw new Error(`the clock reads ${dev.clock}`)
  const early = await page.evaluate(k => localStorage.getItem(k), FACT)
  if (early !== null) throw new Error(`the fact was stored mid-match: ${early}`)

  // Mr Pemberton takes the idle lawn's rounds; the fact is saved at the match end.
  await page
    .getByRole('button', { name: 'Rematch', exact: true })
    .waitFor({ timeout: 13 * 60_000 })
  const fact = await page.evaluate(k => localStorage.getItem(k), FACT)
  if (fact !== '1') throw new Error(`no fact after the match: ${fact}`)
  await shot(page, 'prodcheck-match-end')
  errors.check()
  await context.close()

  // With the fact stored, `?first=1` is ignored too: no tips.
  const returning = await browser.newContext(SIZES.desktop)
  const again = await returning.newPage()
  const errorsAgain = watchErrors(again, 'prod returning')
  await again.goto(`${BASE}/practice?first=1`)
  await again.getByRole('button', { name: 'Start', exact: true }).waitFor()
  if (await again.getByRole('button', { name: 'Try the Yard' }).count())
    throw new Error('a returning player sees Try the Yard')
  await start(again)
  // The countdown, "Mow!" and the first seconds of play.
  const quiet = Date.now() + 10_000
  while (Date.now() < quiet) {
    const text = await tipText(again)
    if (text) throw new Error(`a returning player saw the tip "${text}"`)
    await sleep(150)
  }
  errorsAgain.check()
  await returning.close()
  console.log(
    `prod: Try the Yard and a new player's tips from empty storage despite ?first=0, no playtest pause, the fact saved at the match end, no tips with the fact despite ?first=1, no window.__game, no dev panel, a full-length round (${dev.clock}), clean consoles`
  )
} finally {
  await browser.close()
}
