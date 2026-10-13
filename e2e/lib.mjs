// Shared helpers for the two-player browser scripts. Run scripts with `node e2e/<name>.mjs`
// while the dev server runs on port 5176.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

export const BASE = process.env.GREENER_URL ?? 'http://localhost:5176'
export const SHOTS = '/tmp/greener-shots'
mkdirSync(SHOTS, { recursive: true })

/** Launches the system Chromium. `gpu` uses the machine's GPU instead of software raster. */
export function launch({ gpu = false } = {}) {
  return chromium.launch({
    executablePath: '/usr/bin/chromium',
    args: [
      '--no-sandbox',
      ...(gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : [])
    ]
  })
}

/** A random valid room code. */
export function roomCode() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 6; i++)
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

/** Desktop and phone contexts. Phones get touch and a mobile viewport. */
export const SIZES = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  },
  small: {
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  },
  /** An iPhone SE in Safari: 375 by 548 px left under the browser's bars. */
  se: {
    viewport: { width: 375, height: 548 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  }
}

/**
 * Collects console errors and page errors; `check()` throws if any arrived. It also
 * confirms the desktop leave warning, as a player would, and counts how often it asked.
 */
export function watchErrors(page, label) {
  const errors = []
  const asked = { leave: 0 }
  page.on('dialog', dialog => {
    if (dialog.type() === 'beforeunload') {
      asked.leave++
      void dialog.accept()
    } else void dialog.dismiss()
  })
  page.on('console', msg => {
    if (msg.type() === 'error')
      errors.push(
        `${label} console: ${msg.text()} (${msg.location()?.url ?? ''})`
      )
  })
  page.on('pageerror', err => errors.push(`${label} pageerror: ${err.message}`))
  return {
    errors,
    asked,
    check() {
      if (errors.length)
        throw new Error(`Console errors:\n${errors.join('\n')}`)
    }
  }
}

/**
 * Two pages in ONE context on the same ?local room, so BroadcastChannel joins them.
 * Returns { context, a, b, code, errors }. `a` opens first.
 */
export async function localPair(
  browser,
  { query = '', size = 'desktop', code = roomCode() } = {}
) {
  const context = await browser.newContext(SIZES[size])
  const a = await context.newPage()
  const b = await context.newPage()
  const ea = watchErrors(a, 'A')
  const eb = watchErrors(b, 'B')
  const url = `${BASE}/r/${code}?local${query ? `&${query}` : ''}`
  await a.goto(url)
  await waitFor(a, s => s.admission === 'seated')
  await b.goto(url)
  await waitFor(a, s => s.seats.length === 2)
  await waitFor(b, s => s.seats.length === 2)
  return { context, a, b, code, url, check: () => (ea.check(), eb.check()) }
}

/** Polls `window.__game.greener.state()` until `predicate(state)` holds. */
export async function waitFor(
  page,
  predicate,
  { timeout = 15000, label = 'state' } = {}
) {
  const start = Date.now()
  let last
  while (Date.now() - start < timeout) {
    last = await page
      .evaluate(() => window.__game?.greener?.state() ?? null)
      .catch(() => null)
    if (last && predicate(last)) return last
    await page.waitForTimeout(100)
  }
  throw new Error(
    `Timed out waiting for ${label}. Last state: ${JSON.stringify(last)?.slice(0, 600)}`
  )
}

/** Runs `fn` against a page's dev API and returns its result. */
export function dev(page, fn, arg) {
  return page.evaluate(
    ([source, a]) =>
      new Function('g', 'a', `return (${source})(g, a)`)(
        window.__game.greener,
        a
      ),
    [fn.toString(), arg]
  )
}

/** Presses Ready on both pages and waits until round `round` is in play on both. */
export async function startMatch(a, b, round = 0) {
  await dev(a, g => g.ready(true))
  await dev(b, g => g.ready(true))
  for (const p of [a, b])
    await waitFor(
      p,
      s => s.matchPhase?.kind === 'play' && s.matchPhase.round === round,
      { label: 'play' }
    )
}

/**
 * Waits for the match end on both pages, presses Rematch on both and waits until the new
 * match's round 1 is in play.
 */
export async function rematch(a, b, timeout = 40_000) {
  for (const p of [a, b])
    await waitFor(p, s => s.phase === 'over', { label: 'match end', timeout })
  await dev(a, g => g.rematch())
  await dev(b, g => g.rematch())
  for (const p of [a, b])
    await waitFor(
      p,
      s => s.matchPhase?.kind === 'play' && s.matchPhase.round === 0,
      { label: 'rematch play' }
    )
}

/** Writes a screenshot to /tmp/greener-shots/<name>.png. */
export function shot(page, name) {
  return page.screenshot({ path: `${SHOTS}/${name}.png` })
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * A real mouse drag from `from` to `to` (client pixels): press, wait `holdMs`, then move
 * at `speedPx` pixels per second of real time and release while still moving. Positions
 * follow the clock, so slow automation round trips don't slow the swipe.
 */
export async function mouseFlick(
  page,
  from,
  to,
  speedPx,
  { holdMs = 60, stepMs = 8 } = {}
) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await sleep(holdMs)
  const dist = Math.hypot(to.x - from.x, to.y - from.y)
  const t0 = performance.now()
  for (;;) {
    await sleep(stepMs)
    const d = Math.min(dist, (speedPx * (performance.now() - t0)) / 1000)
    await page.mouse.move(
      from.x + ((to.x - from.x) * d) / dist,
      from.y + ((to.y - from.y) * d) / dist
    )
    if (d >= dist) break
  }
  await page.mouse.up()
}

/**
 * A touch flick through dispatched PointerEvents with pointerType 'touch': press, wait
 * `holdMs`, then move at `speedPx` and lift while moving. Timing runs inside the page.
 */
export function touchFlick(
  page,
  from,
  to,
  speedPx,
  { holdMs = 60, stepMs = 8 } = {}
) {
  return page.evaluate(
    async ([f, t, speed, hold, gap]) => {
      const canvas = document.querySelector('canvas')
      const fire = (type, x, y) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 7,
            pointerType: 'touch',
            isPrimary: true,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1
          })
        )
      const wait = ms => new Promise(r => setTimeout(r, ms))
      fire('pointerdown', f.x, f.y)
      await wait(hold)
      const dist = Math.hypot(t.x - f.x, t.y - f.y)
      const t0 = performance.now()
      let x = f.x
      let y = f.y
      for (;;) {
        await wait(gap)
        const d = Math.min(dist, (speed * (performance.now() - t0)) / 1000)
        x = f.x + ((t.x - f.x) * d) / dist
        y = f.y + ((t.y - f.y) * d) / dist
        fire('pointermove', x, y)
        if (d >= dist) break
      }
      fire('pointerup', x, y)
    },
    [from, to, speedPx, holdMs, stepMs]
  )
}

/**
 * A touch swipe through dispatched PointerEvents with pointerType 'touch', since
 * page.touchscreen only taps. `points` are client pixels; `stepMs` apart.
 */
export async function touchSwipe(page, points, { stepMs = 12 } = {}) {
  await page.evaluate(
    async ([pts, gap]) => {
      const canvas = document.querySelector('canvas')
      const fire = (type, p) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 7,
            pointerType: 'touch',
            isPrimary: true,
            clientX: p.x,
            clientY: p.y,
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1
          })
        )
      fire('pointerdown', pts[0])
      for (const p of pts.slice(1)) {
        await new Promise(r => setTimeout(r, gap))
        fire('pointermove', p)
      }
      fire('pointerup', pts[pts.length - 1])
    },
    [points, stepMs]
  )
}

/** Line of `n + 1` points from `from` to `to`. */
export function line(from, to, n) {
  return Array.from({ length: n + 1 }, (_, i) => ({
    x: from.x + ((to.x - from.x) * i) / n,
    y: from.y + ((to.y - from.y) * i) / n
  }))
}

export { sleep }

/**
 * Presses at a client point, holds still for `ms`, then lets go. Touch presses go through
 * dispatched PointerEvents with pointerType 'touch'; mouse presses use page.mouse.
 */
export async function hold(page, point, ms, touch = false) {
  if (!touch) {
    await page.mouse.move(point.x, point.y)
    await page.mouse.down()
    await sleep(ms)
    await page.mouse.up()
    return
  }
  await page.evaluate(
    async ([p, wait]) => {
      const canvas = document.querySelector('canvas')
      const fire = type =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 9,
            pointerType: 'touch',
            isPrimary: true,
            clientX: p.x,
            clientY: p.y,
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1
          })
        )
      fire('pointerdown')
      await new Promise(r => setTimeout(r, wait))
      fire('pointerup')
    },
    [point, ms]
  )
}

/** The text of the line over the patio, or '' when none shows. */
export function noticeText(page) {
  return page.evaluate(
    () => document.querySelector('[data-testid="notice"]')?.textContent ?? ''
  )
}

/** Waits until the line over the patio reads `text`; throws with the last text seen. */
export async function waitForNotice(page, text, timeout = 4000) {
  const start = Date.now()
  let seen = ''
  while (Date.now() - start < timeout) {
    seen = await noticeText(page)
    if (seen === text) return
    await sleep(100)
  }
  throw new Error(`Expected the notice "${text}", saw "${seen}"`)
}

/**
 * Presses at `from`, slides to `to` over `moveMs`, holds still there for `holdMs`, then
 * lets go. Mouse presses use page.mouse; touch presses dispatch PointerEvents.
 */
export async function dragHold(page, from, to, moveMs, holdMs, touch = false) {
  if (!touch) {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, {
      steps: Math.max(2, Math.round(moveMs / 16))
    })
    await sleep(holdMs)
    await page.mouse.up()
    return
  }
  await page.evaluate(
    async ([f, t, move, wait]) => {
      const canvas = document.querySelector('canvas')
      const fire = (type, x, y) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 13,
            pointerType: 'touch',
            isPrimary: true,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1
          })
        )
      const pause = ms => new Promise(r => setTimeout(r, ms))
      fire('pointerdown', f.x, f.y)
      const steps = Math.max(2, Math.round(move / 16))
      for (let k = 1; k <= steps; k++) {
        await pause(16)
        fire(
          'pointermove',
          f.x + ((t.x - f.x) * k) / steps,
          f.y + ((t.y - f.y) * k) / steps
        )
      }
      await pause(wait)
      fire('pointerup', t.x, t.y)
    },
    [from, to, moveMs, holdMs]
  )
}
