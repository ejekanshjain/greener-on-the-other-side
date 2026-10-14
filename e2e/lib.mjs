// Shared helpers for the two-player browser scripts. Run scripts with `node e2e/<name>.mjs`
// while the dev server runs on port 5176.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

export const BASE = process.env.GREENER_URL ?? 'http://localhost:5176'
export const SHOTS = '/tmp/greener-shots'
mkdirSync(SHOTS, { recursive: true })

/**
 * Launches the system Chromium. `gpu` uses the machine's GPU instead of software raster.
 * Every context it makes starts as a returning player, with the finished-match fact in
 * storage, so scripts keep the game a veteran sees. Pass `fresh: true` to
 * `browser.newContext()` for empty storage, or `?first=1` in a page's address.
 */
export async function launch({ gpu = false } = {}) {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    args: [
      '--no-sandbox',
      ...(gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : [])
    ]
  })
  const newContext = browser.newContext.bind(browser)
  browser.newContext = async ({ fresh = false, ...options } = {}) => {
    const context = await newContext(options)
    if (!fresh)
      await context.addInitScript(() => {
        try {
          localStorage.setItem('greener-finished', '1')
        } catch {
          // about:blank has no storage.
        }
      })
    return context
  }
  return browser
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
  /** A 390 by 844 phone with its browser's bars showing: 390 by 664 px left. */
  bars: {
    viewport: { width: 390, height: 664 },
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

/**
 * Pauses game time on every page of a `?local` room, or a Practice page, through the
 * playtest clock: the first page asks, the dev channel tells the rest, and this waits
 * until each page stands still. Returns the shared time the pause began.
 */
export async function pauseAll(pages) {
  const at = await pages[0].evaluate(() => window.__game.pause())
  if (at === null) throw new Error('this room ignores the playtest clock')
  for (const page of pages)
    await waitUntil(page, () => window.__game.greener.paused().paused, 'paused')
  return at
}

/** Runs game time again on every page that `pauseAll` stopped, and waits until each runs. */
export async function resumeAll(pages) {
  const at = await pages[0].evaluate(() => window.__game.resume())
  for (const page of pages)
    await waitUntil(
      page,
      () => !window.__game.greener.paused().paused,
      'resumed'
    )
  return at
}

/** Polls `test` in the page until it returns true, for up to 3s. */
async function waitUntil(page, test, label) {
  const start = Date.now()
  while (Date.now() - start < 3000) {
    if (await page.evaluate(test)) return
    await page.waitForTimeout(25)
  }
  throw new Error(`a page never ${label}`)
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

/**
 * Waits for `n` animation frames on `page`. A dev jump's long catch-up stalls a page's
 * frames for about 1s, and real input pressed in that gap lands before any live frame.
 */
export function frames(page, n = 3) {
  return page.evaluate(
    n =>
      new Promise(done => {
        const next = k =>
          k <= 0 ? done() : requestAnimationFrame(() => next(k - 1))
        next(n)
      }),
    n
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

/**
 * One pointer held across several steps, so a script can look at the screen mid-press:
 * the mouse, or dispatched touch PointerEvents. Points are client pixels. `move` runs at
 * a steady speed by the clock, so it takes `ms` however slow the automation is, and an
 * `up` straight after it lets go while still moving.
 */
export function heldPointer(page, touch) {
  if (!touch)
    return {
      down: async p => {
        await page.mouse.move(p.x, p.y)
        await page.mouse.down()
      },
      move: async (from, to, ms) => {
        const t0 = performance.now()
        for (;;) {
          await sleep(8)
          const k = Math.min(1, (performance.now() - t0) / ms)
          await page.mouse.move(
            from.x + (to.x - from.x) * k,
            from.y + (to.y - from.y) * k
          )
          if (k >= 1) break
        }
      },
      up: () => page.mouse.up()
    }
  const fire = (type, p) =>
    page.evaluate(
      ([type, p]) =>
        document.querySelector('canvas').dispatchEvent(
          new PointerEvent(type, {
            pointerId: 31,
            pointerType: 'touch',
            isPrimary: true,
            clientX: p.x,
            clientY: p.y,
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1
          })
        ),
      [type, p]
    )
  let at = null
  return {
    down: async p => {
      at = p
      await fire('pointerdown', p)
    },
    move: async (from, to, ms) => {
      await page.evaluate(
        async ([f, t, ms]) => {
          const canvas = document.querySelector('canvas')
          const t0 = performance.now()
          for (;;) {
            await new Promise(r => setTimeout(r, 8))
            const k = Math.min(1, (performance.now() - t0) / ms)
            canvas.dispatchEvent(
              new PointerEvent('pointermove', {
                pointerId: 31,
                pointerType: 'touch',
                isPrimary: true,
                clientX: f.x + (t.x - f.x) * k,
                clientY: f.y + (t.y - f.y) * k,
                bubbles: true,
                cancelable: true,
                button: 0,
                buttons: 1
              })
            )
            if (k >= 1) break
          }
        },
        [from, to, ms]
      )
      at = to
    },
    up: () => fire('pointerup', at)
  }
}

/**
 * The text of a new player's tip and of the toast, joined by " | ", or '' when neither
 * shows. `waitForNotice` matches either line on its own.
 */
export function noticeText(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-notice]')]
      .map(el => el.textContent)
      .join(' | ')
  )
}

/**
 * The box of the first element matching `selector` once its animations have finished,
 * such as a tip's pop-in, which scales it past its size. Null if it never settles in 2s.
 */
export function settledBox(page, selector) {
  return page.evaluate(async selector => {
    for (let k = 0; k < 40; k++) {
      const el = document.querySelector(selector)
      if (el && el.getAnimations().length === 0) {
        const r = el.getBoundingClientRect()
        return { x: r.x, y: r.y, width: r.width, height: r.height }
      }
      await new Promise(done => setTimeout(done, 50))
    }
    return null
  }, selector)
}

/** Waits until the tip line or the toast reads `text`; throws with the last text seen. */
export async function waitForNotice(page, text, timeout = 4000) {
  const start = Date.now()
  let seen = ''
  while (Date.now() - start < timeout) {
    seen = await noticeText(page)
    if (seen.split(' | ').includes(text)) return
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

/**
 * What a screen reader hears from the first element matching `selector`, read from
 * Chromium's accessibility tree (CDP `Accessibility.getFullAXTree`): its role and the text
 * of every node under it that isn't hidden, joined by spaces.
 */
export async function spokenText(page, selector) {
  const cdp = await page.context().newCDPSession(page)
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
    const { nodeId } = await cdp.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector
    })
    if (!nodeId) return null
    const { node } = await cdp.send('DOM.describeNode', { nodeId })
    const { nodes } = await cdp.send('Accessibility.getFullAXTree')
    const byId = new Map(nodes.map(n => [n.nodeId, n]))
    const start = nodes.find(n => n.backendDOMNodeId === node.backendNodeId)
    const text = []
    const walk = n => {
      if (!n) return
      if (!n.ignored && n.role?.value === 'StaticText') text.push(n.name.value)
      for (const id of n.childIds ?? []) walk(byId.get(id))
    }
    walk(start)
    return { role: start?.role?.value ?? null, text: text.join(' ').trim() }
  } finally {
    await cdp.detach()
  }
}

/** The tips a page's event log shows, from shared time `since` on. */
export const tipNotes = (events, since = 0) =>
  events.filter(
    e => e.type === 'note' && e.detail.kind === 'tip' && e.at >= since
  )

/** `DESIGN.md`'s coach tip for one lawn's verdict, worked out from its table. */
export function expectedCoach(score, c) {
  const junk = Math.max(0, -score.junk - c.theirJunk)
  const tidy = Math.max(0, 20 - score.tidy)
  const green = Math.max(0, 36 - score.green)
  const worst = Math.max(junk, tidy, green)
  if (worst < 3)
    return c.stripes ? null : 'No stripes. Mow a whole column slowly.'
  if (junk === worst)
    return junk > c.gnomes
      ? `Junk cost you ${junk}. Throw it from halfway up.`
      : `Gnomes cost you ${junk}. Throw them all over.`
  if (tidy === worst) {
    const kinds = [c.weeds + c.snails, c.holes, c.litter + c.clippings]
    const most = kinds.indexOf(Math.max(...kinds))
    return [
      `Weeds and snails cost you ${tidy}. Throw them.`,
      `Holes cost you ${tidy}. Press Biscuit as he circles.`,
      `Litter and clippings cost you ${tidy}. Clear them.`
    ][most]
  }
  return `Dry grass cost you ${green}. Water brown grass.`
}
