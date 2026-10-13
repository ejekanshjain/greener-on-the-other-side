// Real Pusher reconnects, in the lobby so it stays cheap: B's socket is closed and new
// sockets are refused for 14s, then a second, brief drop. Each time B shows Reconnecting…
// within about a second, and once the line is back B is connected only after its room
// channel subscribed again, and says hello. Spends real quota: about 60 client events.
// It never prints the Pusher secret.
//
// Usage: node e2e/reconnect.mjs
import {
  BASE,
  dev,
  launch,
  roomCode,
  shot,
  SIZES,
  sleep,
  waitFor,
  watchErrors
} from './lib.mjs'

const browser = await launch()
const started = Date.now()
try {
  const code = roomCode()
  const url = `${BASE}/r/${code}`
  const ctxA = await browser.newContext(SIZES.desktop)
  const ctxB = await browser.newContext(SIZES.phone)
  // B's line to Pusher runs through this route, so the script can cut it.
  let blocked = false
  const live = []
  await ctxB.routeWebSocket(/pusher\.com/, ws => {
    if (blocked) return ws.close({ code: 4201, reason: 'blocked' })
    const server = ws.connectToServer()
    live.push({ ws, server })
  })
  await ctxB.route(/sockjs.*pusher\.com/, route =>
    blocked ? route.abort('internetdisconnected') : route.continue()
  )
  const a = await ctxA.newPage()
  const b = await ctxB.newPage()
  const ea = watchErrors(a, 'A')
  const eb = watchErrors(b, 'B')
  await a.goto(url)
  await waitFor(a, s => s.admission === 'seated', { timeout: 20_000 })
  await b.goto(url)
  for (const p of [a, b])
    await waitFor(p, s => s.seats.length === 2, {
      timeout: 20_000,
      label: 'seated together'
    })

  /** Cuts B's socket, keeps new ones out for `ms`, and checks the banner and the hello. */
  async function drop(ms, label) {
    const hellos = (await dev(b, g => g.net())).sent.pushed.hello ?? 0
    blocked = ms > 0
    const cut = Date.now()
    for (const { ws, server } of live.splice(0)) {
      await server.close().catch(() => {})
      await ws.close({ code: 4201, reason: 'cut' }).catch(() => {})
    }
    await waitFor(b, s => s.conn === 'reconnecting', {
      timeout: 3000,
      label: `${label}: B reconnecting`
    })
    await b.getByTestId('reconnecting').waitFor({ timeout: 2000 })
    const bannerMs = Date.now() - cut
    if (ms > 0) {
      await sleep(ms / 2)
      await shot(b, `reconnect-${label}`)
      const mid = await dev(b, g => g.state())
      if (mid.conn !== 'reconnecting')
        throw new Error(`${label}: B reads ${mid.conn} while cut off`)
      await sleep(ms / 2)
      blocked = false
    }
    const back = await waitFor(b, s => s.conn === 'connected', {
      timeout: 30_000,
      label: `${label}: B connected again`
    })
    const net = await dev(b, g => g.net())
    if (net.status !== 'connected')
      throw new Error(`${label}: transport reads ${net.status}`)
    // Give the hello a moment to leave the outbox.
    await sleep(500)
    const after = (await dev(b, g => g.net())).sent.pushed.hello ?? 0
    if (after <= hellos) throw new Error(`${label}: B sent no hello`)
    await b.getByTestId('reconnecting').waitFor({ state: 'detached' })
    await waitFor(a, s => s.peer?.listed && !s.peer.away, {
      label: `${label}: A hears B again`
    })
    console.log(
      `${label}: banner after ${bannerMs} ms, back after ${Math.round((Date.now() - cut) / 1000)}s, ${after - hellos} hello sent, seats ${back.seats.length}`
    )
  }

  await drop(14_000, 'long')
  await drop(0, 'brief')
  let events = 0
  for (const p of [a, b]) {
    const net = await dev(p, g => g.net())
    events += net.sent.bundles + net.clockSends
  }
  // The cut itself fails B's fallback requests to Pusher; nothing else may fail.
  const cutOff = /ERR_INTERNET_DISCONNECTED \(https:\/\/sockjs[^)]*pusher\.com/
  eb.errors.splice(0, Infinity, ...eb.errors.filter(e => !cutOff.test(e)))
  ea.check()
  eb.check()
  console.log(
    `reconnect: ok, ${events} client events, ${Math.round((Date.now() - started) / 1000)}s`
  )
} finally {
  await browser.close()
}
