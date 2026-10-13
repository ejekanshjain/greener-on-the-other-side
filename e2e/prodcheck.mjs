// A production build's Practice, with no dev hooks: start a match, play a few seconds,
// switch away for 4s and back, and check nothing dev-only answers. Run it against
// `next start` on another port: GREENER_URL=http://localhost:5199 node e2e/prodcheck.mjs
import { BASE, launch, shot, SIZES, sleep, watchErrors } from './lib.mjs'

const browser = await launch()
try {
  const context = await browser.newContext(SIZES.desktop)
  const page = await context.newPage()
  const errors = watchErrors(page, 'prod')
  await page.goto(`${BASE}/practice?fast&local&debug`)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
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
    clock: document.body.innerText.match(/\d:\d\d/)?.[0] ?? null
  }))
  await page.keyboard.press('Backquote')
  const panel = await page.getByText('Dry Lawn').count()
  await shot(page, 'prodcheck-practice')
  if (dev.game !== 'undefined') throw new Error('window.__game exists')
  if (panel > 0) throw new Error('the dev panel opened')
  // ?fast is ignored, so 7s into a 3-minute round the clock reads 2:5x.
  if (!dev.clock?.startsWith('2:5'))
    throw new Error(`the clock reads ${dev.clock}`)
  errors.check()
  console.log(
    `prod: no window.__game, no dev panel, a full-length round (${dev.clock}), clean console`
  )
  await context.close()
} finally {
  await browser.close()
}
