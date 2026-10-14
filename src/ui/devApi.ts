import { armBlock, armLevel } from '../game/arm'
import { DOG_LIFT } from '../game/biscuit'
import {
  digSoon,
  quietDog,
  dryAll,
  gustSoon,
  setPatch,
  type PatchFields
} from '../game/cheats'
import { gustDir } from '../game/wind'
import { patchCenter } from '../game/grid'
import { ITEM_LIFT } from '../game/items'
import { BAG_CUTS, BAG_POS } from '../game/tuning'
import { jumpedClock } from '../game/match'
import {
  finalReport,
  lawnReport,
  patchHealth,
  patchLength,
  patchTop,
  reportStripes
} from '../game/report'
import { scoreLawn } from '../game/score'
import { GHOST_MS } from '../scenes/ghostFinger'
import { pointerSpot, tipSpotFor } from '../scenes/tipPointer'
import {
  ALL_LINES,
  FETCH_TIPS,
  tipInRound,
  tipKind,
  TIPS,
  WIND_TIPS,
  type TipId
} from '../game/tips'
import { isHeavy, type ItemKind } from '../game/types'
import { LocalTransport } from '../net/localTransport'
import { isHost, tallyOf } from '../net/room'
import type { RoomSession } from '../net/session'
import type { Faults } from '../net/types'
import { Garden } from '../game/garden'
import { TICK_MS } from '../game/tuning'
import { decodeFinal, encodeFinal } from '../net/finalCodec'
import { encodeLawn } from '../net/lawnCodec'
import { Brain } from '../game/brain'
import { PROFILES } from '../game/profiles'
import { BotNeighbour } from '../net/pemberton'
import type { GardenScene } from '../scenes/gardenScene'
import type { RevealScene } from '../scenes/revealScene'
import { LAWN } from '../scenes/layout'
import type { Viewport } from '../shared/canvas'
import { exposeDev, type DevAction } from '../shared/dev'
import type { DevMeters } from './RoomScreen'

/** Cheats for the dev panel, toggled with the backquote key. */
export function devActions(session: RoomSession): DevAction[] {
  const garden = () => session.garden
  return [
    { label: 'Dry Lawn', run: () => dryAll(garden(), 2) },
    { label: 'Empty Can', run: () => (garden().water.can = 0) },
    { label: 'Fill Bag', run: () => (garden().mower.bag = BAG_CUTS) },
    { label: 'Trigger Dig', run: () => digSoon(garden()) },
    { label: 'Trigger Gust', run: () => gustSoon(garden()) },
    { label: 'Open Shed', run: () => garden().openShed() },
    {
      label: 'Pause or Resume',
      run: () => {
        const game = window.__game as Partial<Record<string, () => unknown>>
        if (session.paused) game.resume?.()
        else game.pause?.()
      }
    }
  ]
}

/** A playtest pause or resume starts this long ahead, so every tab hears of it in time. */
const PAUSE_LEAD_MS = 150

/** What the dev channel carries between this browser's tabs of one room. */
/** A fixed tip line's tip, the first round (from 0) it may show in, and whether it's a failure tip. */
interface TipStage {
  id: TipId
  round: number
  failure: boolean
}

type DevMessage =
  | { match: string; at: number }
  | { pause: 'stop' | 'go'; at: number }
  | { pause: 'ask' }
  | {
      pause: 'state'
      state: ReturnType<RoomSession['clock']['pauseState']>
    }

/**
 * Moves a session's match so it started at `at`, as a dev jump. The room state is the
 * reducer's to change, so this edits the current one in place; the next input copies it.
 */
function retime(session: RoomSession, matchId: string, at: number): void {
  const room = session.room
  if (room.match?.id === matchId) room.match = { ...room.match, at }
}

/** Says the page is hidden or shown, as a tab switch would. */
function fakeVisibility(hidden: boolean): void {
  const doc = document as unknown as Record<string, unknown>
  if (hidden) {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden'
    })
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true
    })
  } else {
    delete doc.visibilityState
    delete doc.hidden
  }
  document.dispatchEvent(new Event('visibilitychange'))
}

/**
 * Publishes `window.__game.greener` in dev builds, so browser scripts can inspect both
 * players and drive the real input pipeline. Returns a function that removes it.
 */
export function exposeRoomDev(
  session: RoomSession,
  viewport: Viewport,
  scene: GardenScene,
  reveal: RevealScene,
  meters: DevMeters
): () => void {
  const toClient = (lx: number, ly: number, h = 0) => {
    const rect = viewport.canvas?.getBoundingClientRect() ?? { left: 0, top: 0 }
    return {
      x: rect.left + viewport.offsetX + (LAWN.x + lx) * viewport.scale,
      y: rect.top + viewport.offsetY + (LAWN.y + ly - h) * viewport.scale
    }
  }
  const garden = () => session.garden
  // A dev jump on the host, or a playtest pause on any page, reaches the other tab
  // through this channel; tabs of one browser share it, as `?local` tests do.
  const jumps = new BroadcastChannel(`greener-dev-${session.code}`)
  /** This page's sessions: yours, and Mr Pemberton's in Practice. */
  const sessions = () => {
    const bot = session.companion
    return bot instanceof BotNeighbour ? [session, bot.session] : [session]
  }
  const pauseHere = (stop: boolean, at: number) => {
    for (const s of sessions()) {
      if (stop) s.pauseAt(at)
      else s.resumeAt(at)
    }
  }
  /** Pauses or resumes every page of the room a moment from now; null where it can't. */
  const playtestClock = (stop: boolean) => {
    if (!session.pausable) return null
    const at = Math.round(session.clock.shared() + PAUSE_LEAD_MS)
    pauseHere(stop, at)
    jumps.postMessage({ pause: stop ? 'stop' : 'go', at } satisfies DevMessage)
    return at
  }
  jumps.onmessage = (event: MessageEvent<DevMessage>) => {
    const data = event.data
    if ('match' in data) return retime(session, data.match, data.at)
    if (!session.pausable) return
    if (data.pause === 'stop' || data.pause === 'go')
      pauseHere(data.pause === 'stop', data.at)
    else if (data.pause === 'ask')
      jumps.postMessage({
        pause: 'state',
        state: session.clock.pauseState()
      } satisfies DevMessage)
    // A page that loads after a pause takes the room's game time from the others.
    else if (
      data.pause === 'state' &&
      session.clock.heldMs === 0 &&
      !session.paused
    )
      for (const s of sessions()) s.clock.copyPause(data.state)
  }
  jumps.postMessage({ pause: 'ask' } satisfies DevMessage)

  const api = {
    /** Room phase, role, seats, match and clock. */
    state() {
      const s = session.room
      return {
        admission: s.admission,
        conn: s.conn,
        phase: s.phase,
        role: isHost(s) ? 'host' : s.seats.length === 2 ? 'guest' : 'alone',
        me: s.me,
        seats: s.seats,
        peer: s.peer,
        myReady: s.myReady,
        myRematch: s.myRematch,
        match: s.match,
        /** How the last match ended, on the match end screen. */
        over: s.over,
        matchPhase: session.phase(),
        others: s.others,
        now: session.clock.now(),
        /** Shared clock minus this machine's real clock, so two tabs can compare clocks. */
        sharedMinusReal: session.clock.now() - Date.now(),
        offset: session.clock.offset,
        bestRtt: session.clock.bestRtt,
        gardenRound: session.gardenRound,
        /** Round verdicts applied this match, round wins (host first), and the waiting final. */
        results: s.results,
        tally: tallyOf(s),
        pendingFinal: s.pendingFinal && { round: s.pendingFinal.round },
        /** New-player teaching: this page now, this page for the current match, and the neighbour's flag. */
        first: {
          now: session.newPlayerNow(),
          match: session.firstMatch,
          peer: s.peer?.first ?? false
        },
        /** Whether tips show on this page now. */
        tipsOn: session.tipsOn
      }
    },
    /** The garden on screen: patch arrays, items, rooted weeds and the hand. */
    garden() {
      return gardenView(garden(), session.gardenRound)
    },
    /**
     * What you see of the neighbour: their last lawn report (health, length and top
     * state per patch, counts, markers), puffs, clips on the fence, head pops and laughs.
     */
    neighbour() {
      const view = session.neighbour
      const lawn = view.lawn
      return {
        now: session.clock.now(),
        lawnAt: view.lawnAt,
        lawn: lawn && {
          round: lawn.round,
          health: Array.from(lawn.patches, patchHealth),
          length: Array.from(lawn.patches, patchLength),
          top: Array.from(lawn.patches, patchTop),
          counts: { ...lawn.counts },
          blame: { ...lawn.blame },
          chores: { ...lawn.chores },
          markers: lawn.markers.map(m => ({ ...m })),
          stripes: reportStripes(lawn.patches)
        },
        puffs: view.puffs.map(p => ({ ...p })),
        clips: view.clips.map(c => ({ ...c })),
        heads: view.heads.map(h => ({ ...h })),
        laughs: view.laughs.map(l => ({ ...l })),
        fists: view.fists.map(f => ({ ...f })),
        bubbles: view.bubbles.map(b => ({ ...b }))
      }
    },
    /**
     * Both lawns as Brenda judged `round`, as this page draws them, and this page's own
     * final for it: each pack with its score, counts and own faults.
     */
    packs(round: number) {
      const packs = session.revealPacks(round)
      const view = (pack: string | null) => {
        const final = pack ? decodeFinal(pack) : null
        return (
          final && {
            pack,
            score: scoreLawn(final),
            counts: final.counts,
            blame: final.blame
          }
        )
      }
      return (
        packs && {
          mine: view(packs.mine),
          theirs: view(packs.theirs),
          own: view(session.myFinal(round))
        }
      )
    },
    /**
     * Brenda's reveal: the step on screen, her lines and the blame lines per lawn, and the
     * counts beside each score line.
     */
    reveal() {
      return { step: reveal.step, ...reveal.lines(), counts: reveal.counts() }
    },
    /** Transport, clock and send statistics. */
    net() {
      return {
        kind: session.net?.kind ?? null,
        status: session.net?.status() ?? null,
        offset: session.clock.offset,
        bestRtt: session.clock.bestRtt,
        rough: session.clock.rough,
        sent: {
          ...session.outbox.stats,
          recent: session.outbox.stats.recent.length,
          pushed: { ...session.outbox.stats.pushed }
        },
        received: { ...session.received },
        clockSends: session.clockSends,
        drops: { ...session.filter.drops },
        limiter: session.limiter.count(session.clock.now())
      }
    },
    /** The last `n` logged room and garden events. */
    events(n = 30) {
      return session.log.slice(-n)
    },
    /** Client pixels for a lawn point, for real mouse and touch input. */
    toClient,
    /** Client pixels for Biscuit's drawn body, or the centre of the patch he circles. */
    biscuitClient() {
      const dog = garden().biscuit
      if (dog.state === 'circle') {
        const c = patchCenter(dog.patch)
        return toClient(c.lx, c.ly, DOG_LIFT)
      }
      return toClient(dog.x, dog.y, DOG_LIFT)
    },
    /** Client pixels for an item's or rooted weed's drawn centre. */
    targetClient(id: number) {
      const g = garden()
      const item = g.item(id)
      if (item) return toClient(item.lx, item.ly, item.h + ITEM_LIFT[item.kind])
      const weed = g.weeds.find(w => w.id === id)
      if (weed) return toClient(weed.lx, weed.ly, ITEM_LIFT[weed.kind])
      const snail = g.snails.find(s => s.id === id)
      return snail ? toClient(snail.lx, snail.ly, ITEM_LIFT.snailShell) : null
    },
    act: {
      /** Opens the lobby's yard, or closes it as Skip would with `false`. */
      yard(open = true) {
        if (open) session.openYard()
        else session.closeYard()
      },
      /** Throws a loose item at `speedPx`, `angleDeg` off straight at the fence (positive is right). */
      throw(
        id: number,
        { speedPx, angleDeg = 0 }: { speedPx: number; angleDeg?: number }
      ) {
        const g = garden()
        const item = g.item(id)
        if (!item) return false
        const a = (angleDeg * Math.PI) / 180
        g.command({
          type: 'grab',
          target: { type: 'item', id, distance: 0 },
          lx: item.lx,
          ly: item.ly
        })
        // Heavy junk throws only once lifted.
        if (isHeavy(item.kind)) g.command({ type: 'lift' })
        g.command({
          type: 'release',
          release: {
            type: 'throw',
            speedPx,
            dirX: Math.sin(a),
            dirY: -Math.cos(a)
          }
        })
        return true
      },
      /** Roots a weed on a patch at once. */
      sprout(patch: number) {
        garden().command({ type: 'sprout', patch })
      },
      /** Turns the tap on or off. */
      tap() {
        garden().command({ type: 'tap' })
      },
      /** Pours on a patch's centre for `ms`, then stops. */
      water(patch: number, ms: number) {
        const g = garden()
        const { lx, ly } = patchCenter(patch)
        g.command({ type: 'pour', lx, ly })
        setTimeout(() => g.command({ type: 'pourEnd' }), ms)
      },
      /** Runs the mower down a whole column in one tick, at `speedPx`. */
      mowColumn(col: number, speedPx = 600) {
        const g = garden()
        for (let row = 0; row < 16; row++)
          g.command({
            type: 'mow',
            lx: col * 50 + 25,
            ly: row * 40 + 20,
            speedPx
          })
        g.command({ type: 'mowEnd' })
      },
      /** Sets the can's water in ms of pouring, and the bag's cuts. */
      setCan(ms: number) {
        garden().water.can = ms
      },
      setBag(cuts: number) {
        garden().mower.bag = cuts
      },
      /**
       * Lifts the grass bag, drags it its full 100 units toward the fence and swipes it
       * straight at the fence at `speedPx`. Returns false when the bag won't lift.
       */
      swipeBag(speedPx: number) {
        const g = garden()
        if (!g.bagHit(BAG_POS.lx, BAG_POS.ly, 1)) return false
        g.command({ type: 'grabBag', lx: BAG_POS.lx, ly: BAG_POS.ly })
        g.command({ type: 'hold', lx: BAG_POS.lx, ly: BAG_POS.ly - 200 })
        g.command({
          type: 'release',
          release: { type: 'throw', speedPx, dirX: 0, dirY: -1 }
        })
        return true
      },
      /** Taps Biscuit, which sits him if he's circling a patch. */
      biscuit() {
        garden().command({ type: 'pat' })
      },
      /** Adds a dig whose circle starts `inMs` from now, on this garden only. */
      dig(inMs = 3500) {
        digSoon(garden(), inMs)
      },
      /**
       * A gust in this garden's frame: the vane swings now and it blows 2s later. An
       * `over` gust with `dir` 1 is a tailwind here; `along` with 1 blows to your right.
       */
      gust(kind: 'over' | 'along' = 'over', dir: 1 | -1 = 1) {
        return gustSoon(garden(), kind, dir)
      },
      /** Sets Biscuit's fetch cooldown to end `inMs` from now: 0 lets him fetch at once. */
      dogReady(inMs = 0) {
        const g = garden()
        g.biscuit.fetchReadyAt = g.t + inMs
      },
      /** Biscuit neither eyes, fetches nor sets off for a dig for the rest of the round. */
      quietDog() {
        quietDog(garden())
      },
      /** Removes every loose item lying on the lawn or patio or in Biscuit's mouth. */
      clearItems() {
        const g = garden()
        for (let i = g.items.length - 1; i >= 0; i--) {
          const item = g.items[i]
          if (
            item &&
            (item.state === 'rest' ||
              item.state === 'slide' ||
              item.state === 'carried')
          )
            g.items.splice(i, 1)
        }
      },
      /** Pulls rooted weeds, newest first, until `keep` are left. */
      pullWeeds(keep = 0) {
        const g = garden()
        g.weeds.splice(Math.max(0, keep))
      },
      /** Takes every snail off the lawn at once, with no event. */
      clearSnails() {
        garden().snails.length = 0
      },
      /** Sets the arm meter's level now, from 0 to 1. */
      setArm(level: number) {
        const g = garden()
        g.arm.level = Math.max(0, Math.min(1, level))
        g.arm.at = g.t
      },
      /** Drags heavy junk to a patch's centre with no lift, then sets it down there. */
      drag(id: number, patch: number) {
        const g = garden()
        const item = g.item(id)
        if (!item || !isHeavy(item.kind)) return false
        const to = patchCenter(patch)
        g.command({
          type: 'grab',
          target: { type: 'item', id, distance: 0 },
          lx: item.lx,
          ly: item.ly
        })
        g.command({ type: 'hold', lx: to.lx, ly: to.ly })
        g.command({
          type: 'release',
          release: { type: 'putDown', reason: 'slow' }
        })
        return true
      },
      /** Takes hold of heavy junk and lifts it, so a real swipe or `throw` can follow. */
      lift(id: number) {
        const g = garden()
        const item = g.item(id)
        if (!item || !isHeavy(item.kind)) return false
        g.command({
          type: 'grab',
          target: { type: 'item', id, distance: 0 },
          lx: item.lx,
          ly: item.ly
        })
        g.command({ type: 'lift' })
        return true
      },
      /** Opens the shed now on this garden only, as at 0:40. */
      shed() {
        garden().openShed()
      },
      /** Pulls a rooted weed out and holds it. */
      yank(id: number) {
        const g = garden()
        const weed = g.weeds.find(w => w.id === id)
        if (!weed) return false
        g.command({
          type: 'grab',
          target: { type: 'weed', id, distance: 0 },
          lx: weed.lx,
          ly: weed.ly
        })
        g.command({ type: 'hold', lx: weed.lx, ly: weed.ly - 80 })
        return true
      }
    },
    /** Drops a new item on a patch. */
    spawn(kind: ItemKind, patch: number) {
      const { lx, ly } = patchCenter(patch)
      garden().command({ type: 'spawn', kind, lx, ly })
    },
    /** Drops a new item at a lawn point, such as against a hedge for the edge guard check. */
    spawnAt(kind: ItemKind, lx: number, ly: number) {
      garden().command({ type: 'spawn', kind, lx, ly })
    },
    /** Sets health, length, mess or hole on one patch. */
    setPatch(index: number, fields: PatchFields) {
      setPatch(garden(), index, fields)
    },
    /** Takes `steps` health from every patch, like the dev panel's Dry Lawn. */
    dryLawn(steps = 2) {
      dryAll(garden(), steps)
    },
    /**
     * Per-frame costs in ms (mean, p95, worst): the lawn layer with its rows repainted so
     * far, each frame's whole work over the last 10s, and the replay's copies. Also React
     * commits so far and the item stamps cached.
     */
    perf() {
      return {
        lawn: scene.lawn.cost.read(),
        frame: meters.frame.read(),
        capture: meters.capture.read(),
        commits: meters.commits,
        stamps: scene.stampCount
      }
    },
    /** Starts the frame and replay meters afresh. */
    resetPerf() {
      meters.frame.reset()
      meters.capture.reset()
    },
    /** Marks every lawn row for repaint, as the worst case for the perf check. */
    dirtyLawn() {
      scene.lawn.invalidate()
    },
    ready(on = true) {
      session.dispatch({ type: 'ui', action: on ? 'ready' : 'unready' })
    },
    /** Presses Show Tips (`true`) or Hide Tips (`false`) in the menu. */
    tips(on: boolean) {
      if (on) session.showTips()
      else session.hideTips()
    },
    /** True once tip `id` has shown for 3s this match (this round for a failure tip). */
    tipSeen(id: TipId) {
      return session.tipSeen(id)
    },
    /**
     * The tip on show: its words, its spot, its target and, when it has one, where its
     * arrow's point sits on screen. `ruleSpot` is the spot the tip line's rule picks for
     * its target now: the patio strip when the target sits behind the line. Null when no
     * tip shows.
     */
    tipNow() {
      const tip = session.shownTip
      if (!tip) return null
      const at = tip.target ? pointerSpot(session.garden, tip.target) : null
      return {
        id: tip.id,
        text: tip.text,
        spot: tip.spot,
        ruleSpot: tipSpotFor(session.garden, tip.target ?? undefined),
        target: tip.target,
        arrow: at && toClient(at.x - LAWN.x, at.y - LAWN.y)
      }
    },
    /**
     * The ghost finger on show: its object, the move it shows, whether a press stops it,
     * how long it has played and where its object (or column's middle) sits on screen, as
     * `gnome`. Null when none plays.
     */
    ghostNow() {
      const ghost = session.ghost
      if (!ghost) return null
      const elapsed = performance.now() - ghost.startAt
      const g = session.garden
      const at =
        ghost.move === 'mow'
          ? { lx: (ghost.col ?? 0) * 50 + 25, ly: 320 }
          : (g.item(ghost.id) ?? g.weeds.find(w => w.id === ghost.id))
      if (elapsed > GHOST_MS || !at) return null
      return {
        id: ghost.id,
        move: ghost.move ?? 'throw',
        col: ghost.col ?? -1,
        stoppable: ghost.stoppable,
        elapsed,
        gnome: toClient(at.lx, at.ly)
      }
    },
    /**
     * The lobby's yard: whether it's open, its step (from 0, 3 once all are done), which
     * steps are done, the step's object or column, failed tries in a row, how the last
     * visit ended (finished or skipped), whether How to Play covers it, whether this page
     * has finished or skipped it, the step it sends in `sync`, and the round 1 tips its
     * finished steps taught.
     */
    yard() {
      const steps = session.yardSteps
      const hud = session.hud.get()
      return {
        open: session.yardOpen,
        help: hud.yard?.help ?? false,
        yardDone: hud.yardDone,
        sends: steps ? Math.min(steps.step + 1, 3) : 0,
        learned: [...session.yardLearned],
        step: steps?.step ?? null,
        done: steps ? [0, 1, 2].map(k => k < steps.step) : null,
        move: steps?.move ?? null,
        id: steps?.id ?? 0,
        pulled: steps?.pulled ?? false,
        col: steps?.col ?? -1,
        failures: steps?.failures ?? 0,
        last: session.yardEnd && { ...session.yardEnd }
      }
    },
    /**
     * The failure and stripe cues that have shown: their kind, what they're about (an
     * item, a weed or a column), and `performance.now()` when the scene heard of each
     * and first drew it.
     */
    cues() {
      return [
        ...scene.cues.recent.map(c => ({
          kind: c.kind,
          id: c.id,
          heardAt: c.heardAt,
          shownAt: c.shownAt
        })),
        ...scene.stripeCues.recent.map(c => ({
          kind: c.kind,
          id: c.col,
          patches: [...c.patches],
          heardAt: c.heardAt,
          shownAt: c.shownAt
        }))
      ]
    },
    /** The chalk mark under each column on the patio's edge: tick, cross or null. */
    ticks(): ('tick' | 'cross' | null)[] {
      return Array.from({ length: 12 }, (_, col) => scene.ticks.mark(col))
    },
    /** Every tip and toast line, for the width check. */
    tipLines(): readonly string[] {
      return ALL_LINES
    },
    /**
     * Each fixed tip line with its tip, the first round (from 0) it may show in, and
     * whether it's a failure tip, which shows once a round instead of once a match, for
     * stage checks. The wind and fetch tips have one tip for several lines.
     */
    tipStages(): Record<string, TipStage> {
      const stage = (id: TipId): TipStage => ({
        id,
        round: [0, 1, 2].find(r => tipInRound(id, r)) ?? 0,
        failure: tipKind(id).failure
      })
      const out: Record<string, TipStage> = {}
      for (const [id, text] of Object.entries(TIPS))
        out[text] = stage(id as TipId)
      for (const text of Object.values(WIND_TIPS)) out[text] = stage('wind')
      for (const text of FETCH_TIPS) out[text] = stage('fetch')
      return out
    },
    /** Presses Rematch on the match end screen. */
    rematch() {
      session.dispatch({ type: 'ui', action: 'rematch' })
    },
    /** Presses Back to Lobby on the match end screen. */
    toLobby() {
      session.dispatch({ type: 'ui', action: 'lobby' })
    },
    /** Leaves the room without leaving the page: sends `leave` and closes the connection. */
    leave() {
      session.dispatch({ type: 'ui', action: 'leave' })
      session.close()
    },
    /**
     * Acts out a hidden desktop tab for `ms`: the page says it's hidden and frames stop,
     * but timers keep running, as they do about once a second in a background tab.
     */
    hide(ms: number) {
      // An own property shadows the class's update, so frames do nothing until it goes.
      session.update = () => {}
      fakeVisibility(true)
      setTimeout(() => {
        delete (session as { update?: unknown }).update
        fakeVisibility(false)
      }, ms)
    },
    /**
     * Builds this round's garden again from scratch and steps it one tick at a time to
     * the live garden's time, with nobody touching it. Returns whether the two lawns
     * match, as lawn packs and finals, so a catch-up jump can be checked against it.
     */
    twin() {
      const options = session.gardenOptions
      const live = garden()
      if (!options || session.gardenRound < 0) return null
      const twin = new Garden(options)
      for (let tick = 1; tick * TICK_MS <= live.t + 1e-6; tick++)
        twin.advanceTo(tick * TICK_MS)
      const lawn = (g: Garden) => encodeLawn(lawnReport(g, []))
      const final = (g: Garden) => encodeFinal(finalReport(g))
      return {
        t: live.t,
        twinT: twin.t,
        sameLawn: lawn(live) === lawn(twin),
        sameFinal: final(live) === final(twin),
        items: [live.items.length, twin.items.length]
      }
    },
    /** The match's worst moment so far: its caption, the health it cost, its round and frames. */
    worst() {
      const best = session.worst.best
      return (
        best && {
          label: best.label,
          loss: best.loss,
          round: best.round,
          frames: best.clip.frames.length
        }
      )
    },
    /** How this round's garden began: fresh, or rebuilt from the neighbour's copy at `copyT`. */
    start() {
      return session.gardenStart
    },
    /** Hides tips until the page reloads, like the tip line's Hide Tips. */
    hideTips() {
      session.hideTips()
    },
    playHere() {
      session.playHere()
    },
    /**
     * Host only: moves the match so round `toRound` (the current one by default) has
     * `msLeft` left, here, in Mr Pemberton's session and in the guest's tab of this browser.
     */
    jump(msLeft: number, toRound?: number) {
      const match = session.room.match
      const phase = session.phase()
      if (!match || !phase || !isHost(session.room)) return false
      const round =
        toRound ??
        (phase.kind === 'waiting' || phase.kind === 'done' ? 0 : phase.round)
      const at = Math.round(
        jumpedClock(match, round, msLeft, session.clock.now())
      )
      retime(session, match.id, at)
      const bot = session.companion
      if (bot instanceof BotNeighbour) retime(bot.session, match.id, at)
      jumps.postMessage({ match: match.id, at })
      return true
    },
    /** Starts a scripted player (`learner`, `regular`, `expert`, or a Pemberton mood) on this tab's garden, or stops it with null. */
    autopilot(profile: string | null) {
      const chosen = profile ? PROFILES[profile] : undefined
      session.autopilot = chosen
        ? new Brain(chosen, Math.floor(Math.random() * 1e9))
        : null
      return !!session.autopilot
    },
    /** In Practice, Mr Pemberton's side: his garden, room state, mood and events. */
    get bot() {
      const bot = session.companion
      if (!(bot instanceof BotNeighbour)) return null
      return {
        garden: () => gardenView(bot.session.garden, bot.session.gardenRound),
        state: () => ({
          phase: bot.session.room.phase,
          results: bot.session.room.results,
          mood: bot.brain.profile.name
        }),
        /** Fixes his mood (`polite`, `normal`, `petty`), or follows the round again with null. */
        mode: (name: string | null) => {
          bot.forced = name ? (PROFILES[name] ?? null) : null
        },
        events: (n = 30) => bot.session.log.slice(-n)
      }
    },
    /**
     * The playtest clock: whether a pause holds game time still, the ms paused so far,
     * and game time now. `window.__game.pause()` and `resume()` drive it.
     */
    paused() {
      return {
        paused: session.paused,
        heldMs: session.clock.heldMs,
        now: session.clock.now()
      }
    },
    /** Local transport faults at runtime. */
    fault(faults: Partial<Faults>) {
      const net = session.net
      if (!(net instanceof LocalTransport)) return false
      net.setFaults(faults)
      return true
    }
  }
  const unexpose = exposeDev('greener', api)
  // The playtest clock sits at the top, as `__game.pause()` and `__game.resume()`.
  const unpause = exposeDev('pause', () => playtestClock(true))
  const unresume = exposeDev('resume', () => playtestClock(false))
  return () => {
    jumps.close()
    unexpose()
    unpause()
    unresume()
  }
}

/** A plain copy of a garden for scripts: patch arrays, items, weeds, snails and the rest. */
function gardenView(g: Garden, round: number) {
  return {
    round,
    t: g.t,
    health: Array.from(g.grid.health),
    length: Array.from(g.grid.length),
    mess: Array.from(g.grid.mess),
    hole: Array.from(g.grid.hole),
    stripes: g.stripes(),
    /** How far the rooted weed in your hand is pulled, 0 to 1, or -1. */
    pull: g.pullProgress(),
    blame: { ...g.blame },
    arm: {
      level: armLevel(g.arm, g.t),
      block: armBlock(g.arm, g.t),
      lockUntil: g.arm.lockUntil,
      lastThrowAt: g.arm.lastThrowAt
    },
    water: {
      can: g.water.can,
      tapOn: g.water.tapOn,
      tapRunMs: g.water.tapRunMs,
      pour: g.water.pour && { ...g.water.pour }
    },
    mower: {
      bag: g.mower.bag,
      bagOff: g.mower.bagOff,
      compostSince: g.compostSince,
      at: g.mower.at && { ...g.mower.at },
      speedPx: g.mower.speedPx,
      /** The mower's item id once the shed opens, and whether you threw it. */
      id: g.mowerId,
      gone: g.mowerGone
    },
    /** The finale: when the shed opens, whether it has, and heavy junk you threw. */
    shed: {
      at: g.shedAt,
      open: g.shedOpen,
      heaviesThrown: g.heaviesThrown,
      runs: g.runs.map(run => ({ ...run, path: [...run.path] }))
    },
    items: g.items.map(i => ({
      id: i.id,
      kind: i.kind,
      lx: i.lx,
      ly: i.ly,
      h: i.h,
      state: i.state,
      look: i.look,
      fromNeighbour: i.fromNeighbour,
      back: i.back,
      catchable: g.catchable(i)
    })),
    weeds: g.weeds.map(w => ({
      id: w.id,
      patch: w.patch,
      lx: w.lx,
      ly: w.ly,
      kind: w.kind,
      bornAt: w.bornAt,
      clockAt: w.clockAt
    })),
    seeds: g.seeds.map(seed => ({ ...seed })),
    snails: g.snails.map(s => ({
      id: s.id,
      lx: s.lx,
      ly: s.ly,
      dir: s.dir
    })),
    biscuit: { ...g.biscuit, digAt: [...g.digSchedule] },
    /** The wind now and the round's gusts, both in this garden's frame. */
    wind: {
      ...g.wind,
      host: g.host,
      gusts: g.gusts.map(gust => ({
        ...gust,
        dir: gustDir(gust, g.host)
      }))
    },
    held: g.held
  }
}
