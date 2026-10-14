// M39, a friend's first match by link, end to end. One `?local` context with empty
// storage: A starts a room from the home screen on `?first=0` and copies the room link,
// and B opens that link with no override, so B counts as new. Both press Ready, then
// `hand.mjs` plays the whole match: A by mouse at 1280 by 800, B by touch at a phone size
// (or by mouse at `desktop`).
// It checks what a new friend meets and what a veteran never sees:
// - First Match on B's gate on A's screen only, and You in B's top bar;
// - B's tips each shown 3s or more, none on A, and each only from its round;
// - the coach tip first in the countdowns of rounds 2 and 3, matching B's last verdict;
// - the ghost finger and the shed banner on B only, and the same reveal counts on both;
// - the fact saved only once the last reveal ends, no tips in the rematch, and no First
//   Match on B's gate once B leaves, A goes Back to Lobby and B opens the link again.
// `full` plays full-length rounds and also checks B's timed tips by stage. `pusher` runs
// only the lobby over real Pusher, in two contexts with B's storage empty, and checks the
// First Match tag in under 30 client events. Try the Yard leads B's lobby card and is gone
// after the match; `yard` has B finish the yard before Ready, and then the match never
// shows B the weed or mow tip.
// Usage: node e2e/firstmatch.mjs [small|phone|desktop] [fast|full|pusher] [yard]
import { writeFileSync } from 'node:fs'

import { hand } from './hand.mjs'
import {
  BASE,
  dev,
  expectedCoach,
  launch,
  settledBox,
  shot,
  SHOTS,
  SIZES,
  sleep,
  tipNotes,
  waitFor,
  watchErrors
} from './lib.mjs'

const SIZE = process.argv[2] ?? 'small'
const MODE = process.argv[3] ?? 'fast'
const YARD = process.argv[4] === 'yard'
const TAG = `firstmatch-${SIZE}-${MODE}${YARD ? '-yard' : ''}`
/** The round 1 tips a finished yard already taught. */
const YARD_TAUGHT = [
  'Drag the weed out first, then swipe it up.',
  'Mow slowly up and down a whole column.'
]
/** B plays by touch on a phone size, and by mouse at `desktop`. */
const TOUCH = SIZE !== 'desktop'
const FACT = 'greener-finished'
/** What A types on the home screen. */
const A_NAME = 'Gnome Hoarder'

const button = (page, name) =>
  page.getByRole('button', { name, exact: true }).first()
/** Ready and Rematch pulse while the neighbour waits, so presses skip the stillness check. */
const press = (page, name, touch) =>
  touch
    ? button(page, name).tap({ force: true })
    : button(page, name).click({ force: true })

/** The gates a page's lobby tags First Match, by gate text. */
const firstTags = page =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="first-match"]')].map(
      el => el.parentElement?.textContent ?? ''
    )
  )

/** A starts a room from the home screen, then copies its link from the lobby. */
async function startRoom(a, query) {
  await a.goto(`${BASE}/?${query}`)
  const box = a.getByLabel('Your Name')
  await box.waitFor()
  await sleep(300)
  await box.fill(A_NAME)
  await button(a, 'Start a Room').click()
  await a.waitForURL(/\/r\/[a-z0-9]{6}/)
  await waitFor(a, s => s.admission === 'seated', {
    timeout: 20_000,
    label: 'A seated'
  })
  await button(a, 'Copy Link').click()
  const link = await a.evaluate(() => navigator.clipboard.readText())
  if (!link.includes('/r/') || /[?&](first|pid)=/.test(link))
    throw new Error(`the copied link reads ${link}`)
  return link
}

/** Checks the lobby: First Match on B's gate on A's screen only. Returns B's name. */
async function lobby(a, b) {
  await waitFor(b, s => s.seats.length === 2 && s.first.now, {
    timeout: 20_000,
    label: 'B seated as a new player'
  })
  await waitFor(a, s => s.seats.length === 2 && s.first.peer, {
    timeout: 10_000,
    label: "B's First Match flag on A"
  })
  const bName = (await dev(b, g => g.state())).me.name
  await a.getByTestId('first-match').waitFor()
  const onA = await firstTags(a)
  if (onA.length !== 1 || !onA[0].includes(bName))
    throw new Error(`A's lobby tags ${JSON.stringify(onA)}`)
  await sleep(500)
  if ((await firstTags(b)).length)
    throw new Error("B's lobby shows First Match on A's gate")
  if ((await dev(a, g => g.state())).first.now)
    throw new Error('A, on ?first=0, counts as new')
  return bName
}

/**
 * B opens Try the Yard and finishes its 3 steps through the dev hooks, then waits for the
 * lobby card to come back with focus on Ready.
 */
async function finishYard(b) {
  const yard = () => dev(b, g => g.yard())
  const until = async (test, why) => {
    const end = Date.now() + 8000
    for (let y = await yard(); Date.now() < end; y = await yard()) {
      if (test(y)) return y
      await sleep(60)
    }
    throw new Error(`the yard never reached ${why}`)
  }
  await press(b, 'Try the Yard', TOUCH)
  let y = await until(y => y.open, 'open')
  await dev(b, (g, id) => g.act.throw(id, { speedPx: 1600 }), y.id)
  y = await until(y => y.step === 1, 'step 2')
  await dev(b, (g, id) => g.act.yank(id), y.id)
  y = await until(y => y.pulled, 'the pulled weed')
  await dev(b, (g, id) => g.act.throw(id, { speedPx: 2200 }), y.id)
  y = await until(y => y.step === 2, 'step 3')
  await shot(b, `${TAG}-b-yard`)
  await dev(b, (g, c) => g.act.mowColumn(c, 300), y.col)
  y = await until(y => !y.open, 'its end')
  if (!y.last?.finished) throw new Error(`the yard ended ${JSON.stringify(y)}`)
  await b.getByRole('heading', { name: 'The Garden Gate' }).waitFor()
}

/** Accumulates a page's event log, which keeps only its last 200 events. */
function recorder(page) {
  const seen = new Map()
  let newest = -Infinity
  let gaps = 0
  return {
    async pull() {
      const events = await dev(page, g => g.events(200)).catch(() => [])
      if (events.length === 200 && events[0].at > newest) gaps++
      for (const e of events) {
        seen.set(`${e.at}|${e.type}|${JSON.stringify(e.detail)}`, e)
        newest = Math.max(newest, e.at)
      }
    },
    all: () => [...seen.values()].sort((x, y) => x.at - y.at),
    gaps: () => gaps
  }
}

/**
 * Checks both boards show the same counts: the host's own lawn is the guest's neighbour,
 * and the other way round.
 */
function sameCounts(host, guest, label) {
  const mirror = JSON.stringify(host.mine) === JSON.stringify(guest.theirs)
  const back = JSON.stringify(host.theirs) === JSON.stringify(guest.mine)
  if (!mirror || !back || host.mine.length !== 4)
    throw new Error(
      `${label}: counts differ: ${JSON.stringify(host)} and ${JSON.stringify(guest)}`
    )
}

/**
 * Watches both pages while the hands play: screenshots, the coach tip in each countdown,
 * the reveal counts, the shed banner and the stored fact. Resolves at the match end.
 */
async function watch(a, b, logs, shots) {
  const coach = new Map()
  const counted = new Set()
  let bannerOnA = false
  let factEarly = null
  for (;;) {
    await Promise.all([logs.a.pull(), logs.b.pull()])
    const [sa, sb] = await Promise.all([a, b].map(p => dev(p, g => g.state())))
    if (sa.phase === 'over' && sb.phase === 'over') break
    const phase = sb.matchPhase
    // Both pages share storage, so a fact stored before the last reveal's final moments
    // came early from either page. Read together, so no save falls between two reads.
    const now = await b.evaluate(
      k => ({
        fact: localStorage.getItem(k),
        phase: window.__game.greener.state().matchPhase
      }),
      FACT
    )
    const mp = now.phase
    const before =
      mp &&
      (mp.kind === 'play' ||
        mp.kind === 'countdown' ||
        (mp.kind === 'reveal' && (!mp.last || mp.msLeft > 500)))
    if (before && now.fact !== null && !factEarly) factEarly = mp
    if (phase?.kind === 'countdown' && phase.round > 0) {
      const tip = await dev(b, g => g.tipNow())
      if (tip?.id === 'coach' && !coach.has(phase.round)) {
        coach.set(phase.round, tip.text)
        if (!shots.coach) {
          shots.coach = true
          await settledBox(b, '[data-testid="tip"]').catch(() => null)
          await shot(b, `${TAG}-b-coach`)
        }
      }
    }
    // The start tip's arrow hides while the ghost finger plays, so take a later one.
    if (phase?.kind === 'play' && !shots.pointer) {
      const tip = await dev(b, g => g.tipNow())
      if (tip?.arrow && tip.id !== 'start') {
        shots.pointer = true
        await shot(b, `${TAG}-b-pointer`)
        console.log(`pointer: "${tip.text}" on ${JSON.stringify(tip.target)}`)
      }
    }
    if (!shots.banner && (await b.getByTestId('shed-banner').count())) {
      shots.banner = true
      await settledBox(b, '[data-testid="shed-banner"]').catch(() => null)
      await shot(b, `${TAG}-b-shed-banner`)
    }
    if (await a.getByTestId('shed-banner').count()) bannerOnA = true
    // Brenda's board shows its counts from the count step on.
    if (
      phase?.kind === 'reveal' &&
      sa.matchPhase?.kind === 'reveal' &&
      !counted.has(phase.round)
    ) {
      const [ra, rb] = await Promise.all(
        [a, b].map(p => dev(p, g => g.reveal()))
      )
      if (
        ['count', 'rosette'].includes(ra.step) &&
        ['count', 'rosette'].includes(rb.step) &&
        ra.counts.mine.length &&
        rb.counts.mine.length
      ) {
        const [host, guest] = sa.role === 'host' ? [ra, rb] : [rb, ra]
        sameCounts(host.counts, guest.counts, `round ${phase.round + 1}`)
        counted.add(phase.round)
        if (rb.step === 'rosette' || counted.size === 1) {
          await shot(b, `${TAG}-b-reveal-${phase.round + 1}`)
          console.log(
            `round ${phase.round + 1} counts on B: ${rb.counts.mine.join(' / ')} against ${rb.counts.theirs.join(' / ')}`
          )
        }
      }
    }
    await sleep(250)
  }
  return { coach, counted, bannerOnA, factEarly }
}

/**
 * Checks B's tips round by round from its event log: each shown 3s or more, each only
 * from its round, the start tip first in round 1 and the coach tip first in rounds 2 and
 * 3, matching the last verdict. In full-length rounds the water tip waits until 25s in.
 */
function checkTips(events, s, me, stages, coachSeen) {
  const frames = events.filter(e => e.type === 'liveFrame')
  const starts = [0, 1, 2].map(
    r => frames.find(e => e.detail.round === r)?.at ?? Infinity
  )
  const notes = tipNotes(events)
  const roundOf = at => starts.filter(start => at >= start).length - 1
  const short = events.filter(
    e =>
      e.type === 'noteEnd' && e.detail.why === 'done' && e.detail.shownMs < 3000
  )
  if (short.length) throw new Error(`tips under 3s: ${JSON.stringify(short)}`)
  const byRound = [[], [], []]
  for (const note of notes) byRound[roundOf(note.at)]?.push(note)
  // A tip counts as seen once it has shown for 3s, or through its whole moment, such as
  // the wind tip's 2s warning; a tip cut or cleared sooner comes back. The wind and fetch
  // tips each have several lines, so seen goes by tip, not by line.
  const tipOf = text => stages[text]?.id ?? text
  const seenAt = new Map()
  for (const end of events)
    if (
      end.type === 'noteEnd' &&
      (end.detail.seen || end.detail.shownMs >= 3000) &&
      !seenAt.has(tipOf(end.detail.text))
    )
      seenAt.set(tipOf(end.detail.text), end.at)
  for (const [round, list] of byRound.entries()) {
    for (const note of list) {
      const text = note.detail.text
      const stage = stages[text]
      if (!stage) {
        if (round === 0 || !/cost you|No stripes/.test(text))
          throw new Error(`round ${round + 1}: unknown tip "${text}"`)
        continue
      }
      if (stage.round > round)
        throw new Error(
          `round ${round + 1}: "${text}" belongs to round ${stage.round + 1}`
        )
      // A staged tip shows until seen once a match; a failure tip once a round.
      const seen = seenAt.get(stage.id) ?? Infinity
      const again = stage.failure
        ? seen < note.at && roundOf(seen) === round
        : seen < note.at
      if (again) throw new Error(`round ${round + 1}: "${text}" showed again`)
    }
  }
  if (byRound[0][0]?.detail.text !== 'Throw the gnomes over the fence.')
    throw new Error(`round 1 began with ${byRound[0][0]?.detail.text}`)
  for (const round of [1, 2]) {
    const last = s.results.find(r => r.round === round - 1)
    // No coach tip for a round that never came.
    if (!last || last.over) continue
    const want = expectedCoach(last.scores[me], last.counts[me])
    const firstTip = byRound[round][0]?.detail.text
    if (want === null) {
      if (coachSeen.has(round))
        throw new Error(`round ${round + 1}: a coach tip with nothing to coach`)
      continue
    }
    if (firstTip !== want || coachSeen.get(round) !== want)
      throw new Error(
        `round ${round + 1}: the first tip was "${firstTip}" (countdown "${coachSeen.get(round)}"), not "${want}"`
      )
  }
  if (MODE === 'full') {
    const match = s.match
    const water = notes.find(
      n => n.detail.text === 'Hold still on brown grass until it sparkles.'
    )
    if (water) {
      const r = roundOf(water.at)
      const played =
        water.at - (match.at + r * (match.roundMs + match.revealMs))
      if (played < 25_000)
        throw new Error(`the water tip came ${played} ms into round ${r + 1}`)
    }
    const stripes = notes.find(
      n => n.detail.text === 'Mow columns now. Stripes count at 0:00.'
    )
    if (stripes) {
      const r = roundOf(stripes.at)
      const end =
        match.at + r * (match.roundMs + match.revealMs) + match.roundMs
      if (end - stripes.at > 40_000)
        throw new Error(
          `the stripes tip came ${end - stripes.at} ms before 0:00`
        )
    }
  }
  return byRound.map(list => list.map(n => n.detail.text))
}

/** The whole first match by link in one `?local` context. */
async function local() {
  const browser = await launch()
  try {
    const started = Date.now()
    const context = await browser.newContext({ ...SIZES[SIZE], fresh: true })
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: BASE
    })
    const a = await context.newPage()
    await a.setViewportSize(SIZES.desktop.viewport)
    const b = await context.newPage()
    const errors = [watchErrors(a, 'A'), watchErrors(b, 'B')]
    const query = ['local', 'first=0', MODE === 'full' ? '' : 'fast']
      .filter(Boolean)
      .join('&')
    const link = await startRoom(a, query)
    // The tabs share storage, so B could pick up A's typed name; a dev name keeps them
    // apart, as a friend's own browser would.
    const bLink = `${link}${link.includes('?') ? '&' : '?'}name=Compost%20Mentis`
    await b.goto(bLink)
    const bName = await lobby(a, b)
    await shot(b, `${TAG}-b-lobby`)
    await shot(a, `${TAG}-a-lobby`)
    await button(b, 'Try the Yard').waitFor()
    if (await button(a, 'Try the Yard').count())
      throw new Error('A, on ?first=0, sees Try the Yard')
    if (YARD) await finishYard(b)

    await press(a, 'Ready', false)
    await press(b, 'Ready', TOUCH)
    for (const p of [a, b])
      await waitFor(p, s => s.matchPhase?.kind === 'countdown', {
        label: 'countdown'
      })
    // The ghost finger plays on B's nearest gnome in the countdown.
    const until = Date.now() + 3000
    let ghost = null
    while (Date.now() < until && !(ghost?.elapsed >= 700)) {
      ghost = await dev(b, g => g.ghostNow())
      await sleep(40)
    }
    if (!ghost) throw new Error('B saw no ghost finger in the countdown')
    await shot(b, `${TAG}-b-ghost`)
    for (const p of [a, b])
      await waitFor(p, s => s.matchPhase?.kind === 'play', { label: 'play' })
    const tagA = await a.getByTestId('my-name').textContent()
    const tagB = await b.getByTestId('my-name').textContent()
    if (tagB !== 'You' || tagA !== 'You')
      throw new Error(`top bar names: A "${tagA}", B "${tagB}"`)

    const logs = { a: recorder(a), b: recorder(b) }
    const shots = {}
    const hands = [hand(a, 'A', false), hand(b, 'B', TOUCH)]
    const [seen] = await Promise.all([
      watch(a, b, logs, shots),
      ...hands.map(h => h.play())
    ])
    for (const p of [a, b])
      await waitFor(p, s => s.phase === 'over', {
        label: 'match end',
        timeout: 60_000
      })
    await Promise.all([logs.a.pull(), logs.b.pull()])
    await sleep(1500)
    await shot(b, `${TAG}-b-match-end`)
    await shot(a, `${TAG}-a-match-end`)

    // The fact: saved only once the last reveal ended, on B's own page too.
    if (seen.factEarly)
      throw new Error(
        `the fact was stored during the match: ${JSON.stringify(seen.factEarly)}`
      )
    const fact = await b.evaluate(k => localStorage.getItem(k), FACT)
    const bEvents = logs.b.all()
    const saved = bEvents.find(e => e.type === 'finished')
    if (fact !== '1' || !saved)
      throw new Error(`no saved fact after the match: ${fact}`)
    const sb = await dev(b, g => g.state())
    const me = sb.role === 'host' ? 0 : 1
    const rounds = sb.results.length
    // B's own save comes as its last reveal ends.
    const m = sb.match
    const lastEnd =
      m.at +
      (rounds - 1) * (m.roundMs + m.revealMs) +
      m.roundMs +
      m.lastRevealMs
    if (saved.at < lastEnd - 50)
      throw new Error(`B saved the fact ${lastEnd - saved.at} ms early`)
    if (seen.counted.size !== rounds)
      throw new Error(`compared counts for ${seen.counted.size} of ${rounds}`)
    const aEvents = logs.a.all()
    if (tipNotes(aEvents).length)
      throw new Error(`A saw tips: ${JSON.stringify(tipNotes(aEvents))}`)
    if (aEvents.some(e => e.type === 'ghost' || e.type === 'banner'))
      throw new Error('A, a returning player, saw the finger or the banner')
    if (seen.bannerOnA) throw new Error('A showed the shed banner')
    if (!bEvents.some(e => e.type === 'ghost'))
      throw new Error('B logged no ghost finger')
    if (!bEvents.some(e => e.type === 'banner'))
      throw new Error('B logged no shed banner')
    writeFileSync(`${SHOTS}/${TAG}-b-events.json`, JSON.stringify(bEvents))
    const stages = await dev(b, g => g.tipStages())
    const byRound = checkTips(bEvents, sb, me, stages, seen.coach)
    const taught = tipNotes(bEvents).filter(n =>
      YARD_TAUGHT.includes(n.detail.text)
    )
    if (YARD && taught.length)
      throw new Error(`B's yard tips came back: ${JSON.stringify(taught)}`)
    for (const [r, list] of byRound.entries())
      if (r < rounds)
        console.log(`B's round ${r + 1} tips: ${list.join(' / ')}`)
    for (const r of sb.results) {
      const line = x =>
        `green ${x.green} stripes ${x.stripes} tidy ${x.tidy} junk ${x.junk} = ${x.total}`
      console.log(
        `round ${r.round + 1}: host ${line(r.scores[0])} | guest ${line(r.scores[1])} | winner ${r.winner}`
      )
    }

    // The rematch: B has finished a match now, so no tips and no finger.
    const host = sb.role === 'host' ? b : a
    await press(a, 'Rematch', false)
    await press(b, 'Rematch', TOUCH)
    for (const p of [a, b])
      await waitFor(p, s => s.phase === 'match' && s.results.length === 0, {
        label: 'rematch',
        timeout: 20_000
      })
    const rematchAt = await dev(b, g => g.state().now)
    await waitFor(b, s => s.matchPhase?.kind === 'play', {
      label: 'rematch play'
    })
    await sleep(6000)
    const again = await dev(b, g => g.events(200))
    const late = again.filter(
      e =>
        e.at >= rematchAt &&
        ((e.type === 'note' && e.detail.kind === 'tip') ||
          e.type === 'ghost' ||
          e.type === 'banner')
    )
    if (late.length || (await dev(b, g => g.state())).first.match)
      throw new Error(
        `B is still taught in the rematch: ${JSON.stringify(late)}`
      )
    // Finish the rematch fast, then both go back to the lobby.
    for (let round = 0; round < 3; round++) {
      const s = await dev(host, g => g.state())
      if (s.phase !== 'match') break
      await dev(host, (g, r) => g.jump(800, r), round)
      await waitFor(
        host,
        (st, r = round) =>
          st.phase === 'over' || st.results.some(x => x.round === r),
        { label: `rematch verdict ${round + 1}`, timeout: 40_000 }
      )
      await sleep(500)
    }
    for (const p of [a, b])
      await waitFor(p, s => s.phase === 'over', {
        label: 'rematch end',
        timeout: 60_000
      })
    // B leaves, A goes back to the lobby, and B opens the link again.
    await press(b, 'Leave', TOUCH)
    await b.waitForURL(`${BASE}/`)
    await button(a, 'Back to Lobby').click()
    await waitFor(a, s => s.phase === 'lobby', { label: 'A in the lobby' })
    await b.goto(bLink)
    for (const p of [a, b])
      await waitFor(p, s => s.phase === 'lobby' && s.seats.length === 2, {
        label: 'both in the lobby'
      })
    await sleep(2500)
    if ((await firstTags(a)).length)
      throw new Error("A still shows First Match on B's gate")
    if ((await dev(b, g => g.state())).first.now)
      throw new Error('B counts as new after finishing a match')
    if (await button(b, 'Try the Yard').count())
      throw new Error("B's card still shows Try the Yard")
    await shot(a, `${TAG}-a-back-to-lobby`)
    errors.forEach(e => e.check())
    await context.close()
    console.log(
      `hands: A ${JSON.stringify(hands[0].counts)}, B ${JSON.stringify(hands[1].counts)}; event log gaps A ${logs.a.gaps()}, B ${logs.b.gaps()}`
    )
    console.log(
      `${TAG}: ${bName} joined by link as new and finished the match in ${((Date.now() - started) / 60_000).toFixed(1)} min`
    )
  } finally {
    await browser.close()
  }
}

/** The lobby over real Pusher: First Match on B's gate, in under 30 client events. */
async function pusher() {
  const browser = await launch()
  try {
    const ctxA = await browser.newContext({ ...SIZES.desktop })
    const ctxB = await browser.newContext({ ...SIZES[SIZE], fresh: true })
    await ctxA.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: BASE
    })
    const a = await ctxA.newPage()
    const b = await ctxB.newPage()
    const errors = [watchErrors(a, 'A'), watchErrors(b, 'B')]
    const link = await startRoom(a, 'first=0')
    await b.goto(link)
    const bName = await lobby(a, b)
    await shot(a, `${TAG}-a-lobby`)
    await shot(b, `${TAG}-b-lobby`)
    let sent = 0
    for (const p of [a, b]) {
      const net = await dev(p, g => g.net())
      if (net.kind !== 'pusher') throw new Error(`a page used ${net.kind}`)
      sent += net.sent.bundles + net.clockSends
    }
    if (sent >= 30) throw new Error(`the lobby spent ${sent} client events`)
    for (const p of [a, b]) await dev(p, g => g.leave())
    errors.forEach(e => e.check())
    console.log(
      `${TAG}: ${bName}'s First Match tag showed on A over real Pusher, ${sent} client events`
    )
  } finally {
    await browser.close()
  }
}

if (MODE === 'pusher') await pusher()
else await local()
