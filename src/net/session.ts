import { arrivalFlight } from '../game/flight'
import { Garden, type GardenOptions } from '../game/garden'
import { playStart, type MatchPhase } from '../game/match'
import { roundSeed } from '../game/seed'
import { rebuildGarden } from '../game/rebuild'
import { finalReport, lawnReport, type Marker } from '../game/report'
import {
  ARRIVAL_FAST_FORWARD_MS,
  COLS,
  FIST_COOLDOWN_MS,
  HEATWAVE_ROUND,
  LANDING_CAP,
  LAST_TICKS_MS,
  LAWN_EVERY_MS,
  LAWN_W
} from '../game/tuning'
import { tipFor, TIPS, TOASTS, type TipId } from '../game/tips'
import {
  itemFromCode,
  type ClipRecord,
  type Crossing,
  type GardenEvent
} from '../game/types'
import type { Brain } from '../game/brain'
import { playEvent, SoundLoops } from '../scenes/sounds'
import { WorstReplay } from '../scenes/worstReplay'
import { sfx, vibrate, type PlayOptions, type SfxName } from '../shared/audio'
import { clamp, hash01 } from '../shared/math'
import { createStore, shallowEqual, type Store } from '../shared/store'
import { ClockSync, JOIN_PINGS, PING_GAP_MS, sampleOf } from './clockSync'
import { netFlags } from './devNet'
import { decodeBundle, newSessionId, StaleFilter } from './envelope'
import { encodeFinal } from './finalCodec'
import type { RoundResult } from './judge'
import { randomId } from './ids'
import { decodeLawn, encodeLawn } from './lawnCodec'
import { Limiter } from './limiter'
import { Listeners } from './listeners'
import { NeighbourView } from './neighbour'
import { Outbox } from './outbox'
import { isClockMsg, type MatchInfo, type Msg } from './protocol'
import {
  initialRoom,
  hostSide,
  isHost,
  matchPhase,
  peerHere,
  roomStep,
  tallyOf,
  type ArrivalKind,
  type RoomEffect,
  type RoomEnv,
  type RoomInput,
  type RoomState
} from './room'
import {
  decodeThrowItem,
  encodeClip,
  encodeCrossing,
  throwId
} from './throwCodec'
import type { ConnStatus, PayloadKind, Transport } from './types'

/** What React shows about the room. It changes on events, never per frame. */
export interface RoomView {
  admission: RoomState['admission']
  reason: string
  conn: ConnStatus
  meName: string
  seats: string[]
  host: boolean
  peer: {
    id: string
    name: string
    ready: boolean
    rematch: boolean
    listed: boolean
    /** Shared time they left the member list, or -1, for the Gone countdown. */
    unlistedSince: number
    away: boolean
  } | null
  myReady: boolean
  myRematch: boolean
  phase: RoomState['phase']
  match: MatchInfo | null
  /** How the last match ended, on the match end screen. */
  over: RoomState['over']
  arrival: ArrivalKind
  /** Round verdicts applied in this match, and round wins so far (host first). */
  results: RoundResult[]
  tally: [number, number]
  /** The latest line for the polite live region. */
  announce: string
  /** True in Practice, against Mr Pemberton. */
  practice: boolean
}

/** One line over the patio: a first-time tip or a toast. */
export interface Note {
  id: number
  text: string
  kind: 'tip' | 'toast'
}

/** How a session behaves beyond the room flow. */
export interface SessionOptions {
  /** Plays no sounds: Mr Pemberton's own session in Practice. */
  muted?: boolean
  /** Practice: tips in every round, and Mr Pemberton laughs at your clips himself. */
  practice?: boolean
}

/** Something that runs alongside a session each frame and closes with it: Mr Pemberton. */
export interface Companion {
  update(): void
  close(): void
}

/** Creates the transport for a room. `local` marks the dev transport, whose tabs share one browser. */
export interface TransportFactory {
  (code: string, me: { id: string; name: string }): Transport
  local?: boolean
}

const PUMP_MS = 50
/** How long each kind of line over the patio stays up. */
const NOTE_MS = { tip: 5000, toast: 2600 } as const
/** A tip stays up at least this long before a newer tip replaces it. */
const NOTE_MIN_MS = 1500
const TICK_MS = 250
const JOIN_BATCH_WAIT_MS = 1000
const JOIN_RETRY_MS = 2000
const EVENT_LOG = 200
/** Room Full and Leave close the connection this long after the last flush. */
const CLOSE_DELAY_MS = 120
/** Their laugh at your clip starts this long after the fence creaks. */
const LAUGH_DELAY_MS = 350
/** A garden this far behind the clock logs how long it took to catch up. */
const CATCH_UP_LOG_MS = 1000
/**
 * With no frame for this long the page is hidden, and its timer, which a hidden tab still
 * runs about once a second, steps the garden instead.
 */
const FRAMELESS_MS = 1000
/** A step from the timer sends the lawn this much early, so a 1s timer never skips a beat. */
const FRAMELESS_LAWN_EARLY_MS = 250

/** One logged event, for the dev `events()` hook. */
export interface LoggedEvent {
  at: number
  type: string
  detail?: unknown
}

/**
 * The one session per room code. It owns the transport, the shared clock, the outbox and
 * limiter, the stale filter, the room reducer and the round's garden. React only reads
 * its stores; it never creates or closes anything.
 */
export class RoomSession {
  readonly sessionId = newSessionId()
  readonly view: Store<RoomView>
  /** The line over the patio, and when Shake Fist works again (real time). It changes on events, never per frame. */
  readonly hud: Store<{ note: Note | null; fistUntil: number }> = createStore<{
    note: Note | null
    fistUntil: number
  }>({
    note: null,
    fistUntil: 0
  })
  readonly clock = new ClockSync(() => Date.now() + netFlags.skew)
  readonly limiter = new Limiter()
  readonly filter = new StaleFilter()
  /** Their clips, head pops and laughs, for the scene. */
  readonly neighbour = new NeighbourView()
  readonly outbox: Outbox
  /** The garden on screen: the current round's, or a still preview in the lobby. */
  garden: Garden
  /** Shared-clock time at the garden's t = 0. */
  gardenOrigin = 0
  /** The round the garden belongs to, or -1 for the lobby preview. */
  gardenRound = -1
  gardenMatch = ''
  readonly received = { bundles: 0, bad: 0, ignored: 0 }
  /** Pings and pongs sent, which skip the outbox but still count against Pusher's quota. */
  clockSends = 0
  readonly log: LoggedEvent[] = []
  private state: RoomState
  /** The last `phase()` answer, for the clock reading and room state it came from. */
  private phaseNow = NaN
  private phaseState: RoomState | null = null
  private phaseCache: MatchPhase | null = null
  private transport: Transport | null = null
  private readonly unsubs: (() => void)[] = []
  private pumpTimer: ReturnType<typeof setInterval> | null = null
  private lastTickAt = 0
  private throwCounter = 0
  private pingCounter = 0
  /** Shared time the next lawn report goes out, during play. */
  private nextLawnAt = 0
  /** Their throws that landed here since the last lawn report. */
  private readonly landings: Marker[] = []
  private readonly pings = new Map<number, number>()
  private joinBatch: { attempt: number; endsAt: number } | null = null
  private readonly gardenEvents = new Listeners<[readonly GardenEvent[]]>()
  private closed = false
  private opening = false
  /** The match and round whose reveal already had its resample ping. */
  private resampledAt = ''
  private releaseLock: (() => void) | null = null
  /** Your worst moment this match, recorded for the slow-motion replay at the match end. */
  readonly worst = new WorstReplay()
  /** The looping sounds that follow the garden: mowing, pouring, the tap and the wind. */
  private readonly loops = new SoundLoops(name =>
    this.logEvent('sfx', { name })
  )
  /** The match, round and second of the last countdown tick, and the round that rang "Mow!". */
  private countedAt = ''
  private rangAt = ''
  /** The match, round and second of the last tick in the final 10s. */
  private tickedAt = ''
  /** The match and round whose final already went to the room flow. */
  private finalAt = ''
  /** Your own final packs by round, for the reveal, and the match they belong to. */
  private readonly myFinals = new Map<number, string>()
  private myFinalsMatch = ''
  /**
   * The neighbour's last lawn pack in each round of `peerLawnsMatch` and the shared time
   * it arrived: scored if their final never comes, and the copy in your `sync`.
   */
  private readonly peerLawns: ({ pack: string; at: number } | null)[] = []
  private peerLawnsMatch = ''
  /** Their last copies of your lawn by round, from their `sync`, for a rebuild after a reload. */
  private readonly copies = new Map<number, { pack: string; at: number }>()
  private copiesMatch = ''
  /** Host only: rounds the guest still waits on that this page never finished. */
  private readonly missed = new Set<number>()
  /** Host only: the guest's last rebuilt final, keyed by match, round and the lawn it came from. */
  private rebuilt: { key: string; pack: string } | null = null
  /** The current round garden's options, so dev tools can build its twin. */
  gardenOptions: GardenOptions | null = null
  /** How the current round's garden began: fresh, or rebuilt from a copy (for dev tools). */
  gardenStart: {
    round: number
    at: number
    copy: string | null
    copyT: number
  } | null = null
  /** Real time of the last frame, so a hidden page's timer knows to step the garden. */
  private lastFrameAt = 0
  private noteId = 0
  private nextNote: Note | null = null
  private noteShownAt = 0
  /** Tips already shown in this match, and the match they belong to. */
  private readonly tipsShown = new Set<TipId>()
  private tipsMatch = ''
  /** Hide Tips turns tips off until the page reloads. */
  tipsHidden = false
  /** Mr Pemberton in Practice, run each frame after this session's own update. */
  companion: Companion | null = null
  /** A bot playing this session's garden: Mr Pemberton's hands, or dev autopilot. */
  autopilot: Brain | null = null
  /** Their clip records as they arrive, at `x` in your frame. */
  readonly theirClips = new Listeners<[number]>()
  /** Room screens showing this session; the last one to go leaves the room. */
  private holders = 0

  constructor(
    readonly code: string,
    readonly me: { id: string; name: string },
    arrival: ArrivalKind,
    private readonly makeTransport: TransportFactory,
    private readonly options: SessionOptions = {}
  ) {
    this.neighbour.pemberton = options.practice === true
    this.state = initialRoom(me, arrival, this.clock.now())
    this.view = createStore<RoomView>(this.toView(''))
    this.garden = this.previewGarden()
    this.outbox = new Outbox({
      send: bundle => this.transport?.send('b', bundle) ?? 'offline',
      connected: () => this.transport?.status() === 'connected',
      header: () => ({
        s: this.sessionId,
        m: this.state.match?.id ?? '',
        r: this.currentRound()
      }),
      limiter: this.limiter
    })
  }

  /**
   * Takes the room's Web Lock, then opens the transport and starts the session's timers.
   * When another tab of this browser holds the room, the transport never opens. Safe to
   * call twice.
   */
  open(): void {
    if (this.opening || this.transport || this.closed) return
    this.opening = true
    window.addEventListener('pagehide', this.onPageHide)
    document.addEventListener('visibilitychange', this.onVisibility)
    window.addEventListener('pageshow', this.onPageShow)
    this.pumpTimer ??= setInterval(() => this.pump(), PUMP_MS)
    if (document.visibilityState !== 'visible')
      this.dispatch({ type: 'visible', visible: false })
    this.takeLock(false)
  }

  /** Play Here: takes the room from the other tab, which then shows that the game moved. */
  playHere(): void {
    if (this.closed || this.transport) return
    this.dispatch({ type: 'lock', state: 'taken' })
    this.takeLock(true)
  }

  private takeLock(steal: boolean): void {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
    if (!locks) {
      this.openTransport()
      return
    }
    // Local test tabs share one browser, so each local player id gets its own lock.
    const name = `greener-room-${this.code}${this.makeTransport.local ? `-${this.me.id}` : ''}`
    locks
      .request(name, steal ? { steal: true } : { ifAvailable: true }, lock => {
        if (!lock) {
          this.opening = false
          this.dispatch({ type: 'lock', state: 'busy' })
          return
        }
        this.openTransport()
        return new Promise<void>(resolve => {
          this.releaseLock = resolve
        })
      })
      .catch((error: unknown) => {
        // Another tab pressed Play Here: the browser aborts our hold on the lock.
        if (
          this.closed ||
          (error instanceof DOMException && error.name !== 'AbortError')
        )
          return
        this.releaseLock = null
        this.dispatch({ type: 'lock', state: 'stolen' })
      })
  }

  private openTransport(): void {
    this.opening = false
    if (this.transport || this.closed) return
    const transport = this.makeTransport(this.code, this.me)
    this.transport = transport
    this.unsubs.push(
      transport.onMembers(event => {
        if (event.type === 'snapshot')
          this.logEvent('snapshot', { members: event.members.length })
        this.dispatch({ type: 'members', event })
      }),
      transport.onStatus((status, reason) =>
        this.dispatch({ type: 'status', status, reason })
      ),
      transport.onMessage((from, kind, payload) =>
        this.receive(from, kind, payload)
      )
    )
    transport.open()
  }

  /**
   * Marks a room screen as showing this session. The returned release runs when it goes;
   * once no screen shows it (Back from the lobby to the home page, say), you leave the
   * room. A screen that remounts at once, as in development, keeps the session.
   */
  hold(): () => void {
    this.holders++
    let released = false
    return () => {
      if (released) return
      released = true
      this.holders--
      setTimeout(() => {
        if (this.holders > 0 || this.closed) return
        this.dispatch({ type: 'ui', action: 'leave' })
        this.close()
      }, 0)
    }
  }

  /** Closes the transport and stops every timer. The session can't reopen. */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.loops.stop()
    this.outbox.flush(this.clock.now())
    this.dropTransport()
    this.releaseLock?.()
    this.releaseLock = null
    if (this.pumpTimer) clearInterval(this.pumpTimer)
    window.removeEventListener('pagehide', this.onPageHide)
    document.removeEventListener('visibilitychange', this.onVisibility)
    window.removeEventListener('pageshow', this.onPageShow)
    if (sessions.get(this.code) === this) sessions.delete(this.code)
    this.companion?.close()
  }

  /** The transport, for dev fault injection and stats. */
  get net(): Transport | null {
    return this.transport
  }

  /** The reducer's current state. */
  get room(): RoomState {
    return this.state
  }

  /** The match phase now, or null outside a match. */
  phase(now = this.clock.now()): MatchPhase | null {
    // Many readers ask each frame, and the answer changes only with the clock or the room.
    if (now !== this.phaseNow || this.state !== this.phaseState) {
      this.phaseNow = now
      this.phaseState = this.state
      this.phaseCache = matchPhase(this.state, now)
    }
    return this.phaseCache
  }

  /** The garden when its round is in play, else null, so input does nothing. */
  playableGarden(): Garden | null {
    const phase = this.phase()
    return phase?.kind === 'play' && phase.round === this.gardenRound
      ? this.garden
      : null
  }

  /** Listens for garden events after each update, for the scene. */
  onGardenEvents(fn: (events: readonly GardenEvent[]) => void): () => void {
    return this.gardenEvents.add(fn)
  }

  /** Runs one room input through the reducer and carries out its messages and effects. */
  dispatch(input: RoomInput): void {
    const now = this.clock.now()
    const step = roomStep(this.state, input, now, this.env)
    const was = this.state.phase
    this.state = step.state
    if (was !== 'over' && step.state.phase === 'over') this.sting()
    for (const msg of step.out) {
      this.outbox.push(msg, now)
      if (msg.k === 'sync' && msg.copy)
        this.logEvent('copySent', { pack: msg.copy, at: msg.copyAt })
    }
    for (const effect of step.effects) this.runEffect(effect)
    if (step.out.some(msg => msg.k === 'leave' || msg.k === 'start'))
      this.outbox.pump(now)
    this.publish(step.effects)
  }

  /** Advances the round's garden to the shared clock and sends what crossed the fence. Call it every frame. */
  update(): void {
    this.lastFrameAt = Date.now()
    this.step(false)
  }

  /**
   * One step of the round: the garden catches up to the shared clock, its events go out,
   * and the lawn goes out every 1s. Frames run it, and so does the timer while the page is
   * `hidden`, which plays no sounds and sends the lawn a little early.
   */
  private step(hidden: boolean): void {
    const now = this.clock.now()
    this.followMatch(now)
    const playing = this.playableGarden()
    if (playing) this.autopilot?.step(playing)
    if (this.gardenRound >= 0) {
      const garden = this.garden
      const target = Math.max(0, now - this.gardenOrigin)
      // A page back from the background or a reload catches up in one frame; log its cost.
      const behind = Math.min(target, garden.endMs) - garden.t
      const started = behind >= CATCH_UP_LOG_MS ? performance.now() : 0
      garden.advanceTo(target)
      if (started)
        this.logEvent('catchUp', {
          gameMs: Math.round(behind),
          ms: performance.now() - started
        })
      if (garden.t > 0) this.tip('start')
    }
    this.finalStep(now)
    const events = this.garden.drainEvents()
    if (playing) this.autopilot?.observe(events)
    if (playing && !this.muted)
      this.worst.track(playing, events, this.gardenRound, performance.now())
    for (const event of events) {
      // Drying is routine; logging it would push everything else out of the dev log.
      if (event.type !== 'dry') this.logEvent(event.type, event)
      this.noteFor(event)
      if (playing && !hidden) playEvent(event, this.garden, this.play)
      if (event.type === 'cross') this.sendCrossing(event.crossing, now)
      else if (event.type === 'clip') this.sendClip(event.clip, now)
      else if (event.type === 'land' && event.fromNeighbour) {
        this.landings.push(event.landing)
        if (this.landings.length > LANDING_CAP) this.landings.shift()
      } else if (
        event.type === 'sink' &&
        event.fromNeighbour &&
        !this.muted &&
        !hidden
      )
        vibrate(80)
    }
    this.sendLawn(now, hidden ? FRAMELESS_LAWN_EARLY_MS : 0)
    if (!hidden) {
      this.countdownSounds(now)
      this.lastTicks(now)
    }
    if (events.length > 0) this.gardenEvents.emit(events)
    // Loops follow the garden only during play on a showing page.
    if (!this.muted) this.loops.sync(hidden ? null : playing)
    this.companion?.update()
  }

  /**
   * Plays a sound unless this session is muted, and logs it for the dev `events()` hook.
   * Nothing plays, or logs, before the first tap unlocks audio.
   */
  readonly play = (name: SfxName, options?: PlayOptions): void => {
    if (this.muted || !sfx.unlocked) return
    this.logEvent('sfx', { name })
    sfx.play(name, options)
  }

  /** The match end's sting: a bell when you win, a raspberry when you lose, a buzz otherwise. */
  private sting(): void {
    const winner = this.state.over?.winner
    if (winner === this.me.id) {
      this.play('bell', { pitch: 1.2 })
      if (!this.muted) vibrate([60, 40, 120])
    } else if (winner) this.play('fail', { pitch: 0.8 })
    else this.play('buzz')
  }

  /** "3, 2, 1" ticks once a second through a round's countdown, then the bell rings on "Mow!". */
  private countdownSounds(now: number): void {
    const phase = this.phase(now)
    if (!phase) return
    const key = `${this.state.match?.id}:${phase.round}`
    if (phase.kind === 'countdown') {
      const second = `${key}:${Math.ceil(phase.msLeft / 1000)}`
      if (second === this.countedAt) return
      this.countedAt = second
      this.play('tick', { pitch: 1.2 })
    } else if (
      phase.kind === 'play' &&
      phase.elapsed < 1000 &&
      this.rangAt !== key
    ) {
      this.rangAt = key
      this.play('bell')
    }
  }

  /**
   * Shake Fist: pops your fist up over their fence, at most once every 3s, during play.
   * Returns false when it can't go yet.
   */
  shakeFist(): boolean {
    if (!this.playableGarden() || Date.now() < this.hud.get().fistUntil)
      return false
    this.hud.set({ fistUntil: Date.now() + FIST_COOLDOWN_MS })
    // Anywhere along their fence, so a run of fists doesn't stack on one spot.
    this.sendFist(LAWN_W / 2 + (Math.random() - 0.5) * LAWN_W * 0.6)
    this.play('hammer')
    vibrate(30)
    this.logEvent('shakeFist')
    return true
  }

  private get muted(): boolean {
    return this.options.muted === true
  }

  /** Shakes your fist over the fence at `x` in your garden's frame. */
  sendFist(x: number): void {
    if (!this.playableGarden() || !this.neighbourHere()) return
    this.outbox.push({ k: 'fist', x: Math.round(x) }, this.clock.now())
  }

  /** Ticks the clock once a second through the last 10s of play. */
  private lastTicks(now: number): void {
    const phase = this.phase(now)
    if (phase?.kind !== 'play' || phase.msLeft > LAST_TICKS_MS) return
    const second = Math.ceil(phase.msLeft / 1000)
    const key = `${this.gardenMatch}:${phase.round}:${second}`
    if (key === this.tickedAt) return
    this.tickedAt = key
    this.play('tick')
    this.logEvent('tick', { second })
  }

  /**
   * Sends your lawn every 1s during play, with the landings since the last one. It
   * also tells your neighbour you're still here, so it goes out even when nothing changed.
   */
  private sendLawn(now: number, earlyMs: number): void {
    if (now < this.nextLawnAt - earlyMs || !this.playableGarden()) return
    this.nextLawnAt = now + LAWN_EVERY_MS
    // An Away neighbour still gets your lawn: it's how they catch up when they're back.
    if (!this.state.peer?.listed) return
    const report = lawnReport(
      this.garden,
      this.landings,
      isHost(this.state) ? tallyOf(this.state) : [0, 0]
    )
    this.landings.length = 0
    this.outbox.push({ k: 'lawn', g: encodeLawn(report) }, now)
  }

  /** Takes their lawn report for the peek strip, with a thud for each landing. */
  private onLawn(from: string, msg: Extract<Msg, { k: 'lawn' }>): void {
    if (this.state.peer?.id !== from || !this.playableGarden()) {
      this.received.ignored++
      return
    }
    const report = decodeLawn(msg.g)
    if (!report || report.round !== this.gardenRound) {
      this.received.bad++
      return
    }
    this.neighbour.applyLawn(report, this.clock.now())
    this.peerLawns[report.round] = { pack: msg.g, at: this.clock.now() }
    for (const landing of report.landings) {
      // Further away sounds quieter and lower.
      const row = Math.floor(landing.patch / COLS)
      this.play('thud', { volume: 0.8 - row * 0.03, pitch: 1 - row * 0.02 })
    }
    if (report.landings.length > 0)
      this.logEvent('landed', { landings: report.landings })
  }

  /** True while your neighbour can hear you: listed and not Away, so throws can reach them. */
  private neighbourHere(): boolean {
    return peerHere(this.state)
  }

  /** Sends an item that crossed the fence. It vanishes when your neighbour is Away or Gone. */
  private sendCrossing(crossing: Crossing, now: number): void {
    if (!this.neighbourHere()) {
      this.logEvent('vanish', { kind: crossing.kind })
      return
    }
    const id = throwId(this.sessionId, ++this.throwCounter)
    const item = encodeCrossing(crossing, id, this.gardenOrigin + crossing.at)
    this.outbox.push({ k: 'throw', items: [item], clips: [] }, now)
  }

  /** Sends a clip record so your neighbour sees it teeter, and their smug laugh plays here. */
  private sendClip(clip: ClipRecord, now: number): void {
    const at = this.gardenOrigin + clip.at
    // Mr Pemberton laughs at your clips himself, in his own words.
    if (!this.options.practice) this.neighbour.laugh(clip.x, at)
    // The laugh comes just after the fence's creak.
    setTimeout(() => this.play('laugh'), LAUGH_DELAY_MS)
    if (!this.muted) vibrate(30)
    if (!this.neighbourHere()) return
    const id = throwId(this.sessionId, ++this.throwCounter)
    this.outbox.push(
      { k: 'throw', items: [], clips: [encodeClip(clip, id, at)] },
      now
    )
  }

  /**
   * Shows a line over the patio. A toast shows at once. A tip replaces the line on show
   * once that has had 1.5s; until then it waits, and only the newest waiting tip is kept.
   */
  showNote(text: string, kind: Note['kind']): void {
    const note = { id: ++this.noteId, text, kind }
    this.logEvent('note', { text, kind })
    if (kind === 'toast' || !this.hud.get().note) this.putNote(note)
    else this.nextNote = note
  }

  private putNote(note: Note | null): void {
    this.hud.set({ note })
    this.noteShownAt = Date.now()
  }

  /** Swaps in the waiting tip, or clears the line once its time is up. */
  private noteStep(): void {
    const note = this.hud.get().note
    if (!note) return
    const shownFor = Date.now() - this.noteShownAt
    const minMs = note.kind === 'tip' ? NOTE_MIN_MS : NOTE_MS.toast
    if (this.nextNote && shownFor >= minMs) {
      this.putNote(this.nextNote)
      this.nextNote = null
    } else if (shownFor >= NOTE_MS[note.kind]) this.putNote(null)
  }

  /** Tips show the first time each thing happens in round 1; toasts show every time. */
  private noteFor(event: GardenEvent): void {
    if (event.type === 'canEmpty')
      return this.showNote(TOASTS.canEmpty, 'toast')
    if (event.type === 'noMower') return this.showNote(TOASTS.noMower, 'toast')
    if (event.type === 'mowerPoke')
      return this.showNote(TOASTS.mowerPoke, 'toast')
    const tip = tipFor(event)
    if (tip) this.tip(tip)
  }

  /** Hide Tips: clears the tip on show and shows no more until the page reloads. */
  hideTips(): void {
    this.tipsHidden = true
    this.nextNote = null
    if (this.hud.get().note?.kind === 'tip') this.putNote(null)
  }

  private tip(id: TipId): void {
    // Catch-up after play stops replays events, but tips belong to play.
    // Online, tips show in round 1 of each match; Practice shows them in every round.
    if (
      this.tipsHidden ||
      this.muted ||
      (this.gardenRound !== 0 && !this.options.practice) ||
      this.phase()?.kind !== 'play'
    )
      return
    if (this.tipsMatch !== this.gardenMatch) {
      this.tipsMatch = this.gardenMatch
      this.tipsShown.clear()
    }
    if (this.tipsShown.has(id)) return
    this.tipsShown.add(id)
    this.showNote(TIPS[id], 'tip')
  }

  /** Records an event for the dev `events()` hook. */
  logEvent(type: string, detail?: unknown): void {
    this.log.push({ at: Math.round(this.clock.now()), type, detail })
    if (this.log.length > EVENT_LOG) this.log.shift()
  }

  private get env(): RoomEnv {
    return {
      newMatchId: () => randomId(6),
      newSeed: () => netFlags.seed ?? Math.floor(Math.random() * 0x7fffffff),
      fast: netFlags.fast,
      peerLawn: round => this.peerLawn(round),
      peerFinal: round => this.rebuiltPeerFinal(round),
      myFinal: round => this.myFinal(round)
    }
  }

  private currentRound(): number {
    const phase = this.phase()
    if (!phase || phase.kind === 'waiting' || phase.kind === 'done') return -1
    return phase.round
  }

  private readonly onPageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) this.close()
  }

  private readonly onVisibility = () => {
    this.dispatch({
      type: 'visible',
      visible: document.visibilityState === 'visible'
    })
  }

  /** A page restored from the back-forward cache rejoins and says hello. */
  private readonly onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return
    this.transport?.resume?.()
    this.dispatch({ type: 'visible', visible: true })
  }

  private pump(): void {
    this.noteStep()
    this.followClock()
    const now = this.clock.now()
    if (now - this.lastTickAt >= TICK_MS) {
      this.lastTickAt = now
      this.dispatch({ type: 'tick' })
      // A hidden page runs no frames, so the timer keeps its garden and lawn going: your
      // neighbour still hears you, and their throws still land.
      if (Date.now() - this.lastFrameAt >= FRAMELESS_MS) this.step(true)
      this.followMatch(now)
      this.finalStep(now)
      this.pingStep(now)
    }
    this.outbox.pump(now)
  }

  private receive(from: string, kind: PayloadKind, payload: unknown): void {
    if (kind === 'p') return this.onClockMsg(from, payload)
    const bundle = decodeBundle(payload)
    if (!bundle) {
      this.received.bad++
      return
    }
    this.received.bundles++
    let heard = false
    // Each message is filtered against the room as the ones before it left it.
    this.filter.each(
      from,
      bundle,
      () => ({
        matchId: this.state.match?.id ?? '',
        round: this.currentRound(),
        now: this.clock.now()
      }),
      msg => {
        // Anything from your neighbour's current page proves they're still there.
        if (!heard && from === this.state.peer?.id) {
          heard = true
          this.dispatch({ type: 'heard', from })
        }
        if (msg.k === 'throw') this.onThrow(from, msg)
        else if (msg.k === 'lawn') this.onLawn(from, msg)
        else if (msg.k === 'fist') this.onFist(from, msg.x)
        else this.dispatch({ type: 'msg', from, msg })
      }
    )
  }

  /** Their fist pops up over the fence, mirrored into your frame. */
  private onFist(from: string, x: number): void {
    if (this.state.peer?.id !== from || !this.playableGarden()) {
      this.received.ignored++
      return
    }
    const now = this.clock.now()
    this.neighbour.fist(clamp(LAWN_W - x, 20, LAWN_W - 20), now)
    this.play('hammer')
    if (!this.muted) vibrate([40, 40, 40])
    this.logEvent('fist', { x })
  }

  private onThrow(from: string, msg: Extract<Msg, { k: 'throw' }>): void {
    // Only the seated neighbour can throw into your garden, and only during play.
    if (this.state.peer?.id !== from || !this.playableGarden()) {
      this.received.ignored++
      return
    }
    const now = this.clock.now()
    for (const item of msg.items) {
      const arrival = decodeThrowItem(item)
      if (!arrival) continue
      const ffMs = Math.min(ARRIVAL_FAST_FORWARD_MS, Math.max(0, now - item.c))
      this.garden.command({ type: 'arrive', arrival, ffMs })
      // Their head pops up over the fence where the throw left their hand. Seeds come
      // on the wind and bounces come off a trampoline, so nobody pops up for them.
      const handX = arrivalFlight(arrival, 0).x0
      if (arrival.kind !== 'seed' && !arrival.bounced) {
        this.neighbour.popHead(clamp(handX, 20, LAWN_W - 20), now)
        this.play('pop', { pitch: 1.4, volume: 0.5 })
      }
      this.logEvent('received', {
        id: item.id,
        kind: arrival.kind,
        lateMs: Math.round(now - item.c)
      })
    }
    for (const clip of msg.clips) {
      const kind = itemFromCode(clip.ty)
      if (!kind) continue
      this.neighbour.addClip({ kind, x: LAWN_W - clip.x, at: clip.c })
      this.theirClips.emit(LAWN_W - clip.x)
      this.logEvent('theirClip', { id: clip.id, kind })
    }
  }

  /** Tells the room flow when the clock starts or stops agreeing with the host's. */
  private followClock(): void {
    if (this.clock.synced !== this.state.clockSynced)
      this.dispatch({ type: 'clock', synced: this.clock.synced })
  }

  private onClockMsg(from: string, payload: unknown): void {
    if (!isClockMsg(payload) || !this.state.seats.includes(from)) return
    if (payload.k === 'ping') {
      // Answer at once and straight to the transport, so queueing never skews the sample.
      if (!this.limiter.tryTake(this.clock.now())) return
      this.clockSends++
      this.transport?.send('p', {
        k: 'pong',
        id: payload.id,
        t0: payload.t0,
        th: this.clock.now()
      })
      return
    }
    const sentAt = this.pings.get(payload.id)
    if (sentAt === undefined || sentAt !== payload.t0) return
    this.pings.delete(payload.id)
    const sample = sampleOf(payload.t0, payload.th, this.clock.local())
    if (this.joinBatch) this.clock.addJoinSample(sample)
    else this.clock.addResample(sample)
    this.logEvent('pong', { rtt: Math.round(sample.rtt) })
    this.followClock()
  }

  private startJoinBatch(attempt: number): void {
    this.joinBatch = {
      attempt,
      endsAt: this.clock.local() + JOIN_PINGS * PING_GAP_MS + JOIN_BATCH_WAIT_MS
    }
    for (let i = 0; i < JOIN_PINGS; i++)
      setTimeout(() => this.sendPing(), i * PING_GAP_MS)
  }

  private sendPing(): void {
    if (
      this.closed ||
      isHost(this.state) ||
      !this.limiter.tryTake(this.clock.now())
    )
      return
    const id = ++this.pingCounter
    const t0 = this.clock.local()
    this.pings.set(id, t0)
    this.clockSends++
    this.transport?.send('p', { k: 'ping', id, t0 })
  }

  /** Ends join batches when due, and sends the guest's one resample ping at each reveal. */
  private pingStep(now: number): void {
    const phase = this.phase(now)
    if (
      phase?.kind === 'reveal' &&
      this.state.match &&
      this.clock.synced &&
      !this.joinBatch &&
      this.state.seats.length === 2 &&
      !isHost(this.state)
    ) {
      const key = `${this.state.match.id}:${phase.round}`
      if (this.resampledAt !== key) {
        this.resampledAt = key
        this.sendPing()
      }
    }
    const batch = this.joinBatch
    if (!batch || this.clock.local() < batch.endsAt) return
    this.joinBatch = null
    if (this.clock.endJoinBatch(batch.attempt >= 2)) return
    setTimeout(() => this.startJoinBatch(batch.attempt + 1), JOIN_RETRY_MS)
  }

  /**
   * Once a round's play is over, catches its garden up to the end and hands its final to
   * the room flow, once per match and round. The pump calls this too, so a hidden tab
   * still sends its final.
   */
  private finalStep(now: number): void {
    for (const round of this.missed) this.missedFinal(round)
    this.missed.clear()
    const phase = this.phase(now)
    if (!phase || this.gardenRound < 0) return
    const over =
      phase.kind === 'done' ||
      (phase.kind === 'reveal' && phase.round >= this.gardenRound) ||
      (phase.kind === 'countdown' && phase.round > this.gardenRound)
    if (over) this.sendFinal()
  }

  /** Your own final pack for a round of the current match, once that round has ended. */
  myFinal(round: number): string | null {
    return this.myFinalsMatch === this.state.match?.id
      ? (this.myFinals.get(round) ?? null)
      : null
  }

  /**
   * Both lawns' packs for a judged round, as Brenda judged them, for her reveal and the
   * match end. The host's lawn is the final in the verdict; the guest's is its own final
   * on the guest, and the final or last lawn the host judged on the host.
   */
  revealPacks(
    round: number
  ): { mine: string | null; theirs: string | null } | null {
    const result = this.state.results.find(r => r.round === round)
    if (!result) return null
    return hostSide(this.state)
      ? {
          mine: result.hostFinal,
          theirs: this.state.peerFinals[round] ?? null
        }
      : {
          mine: result.guestFinal ?? this.myFinal(round),
          theirs: result.hostFinal
        }
  }

  /** The neighbour's last lawn pack in `round` of the current match, and when it arrived. */
  private peerLawn(round: number): { pack: string; at: number } | null {
    return this.peerLawnsMatch === this.state.match?.id
      ? (this.peerLawns[round] ?? null)
      : null
  }

  /**
   * Host only: the guest's final for `round` when its own never came. Its garden is
   * rebuilt from its last lawn pack, or starts fresh, and catches up to the round's end
   * the way a reload would, so being away never rescues a bad lawn.
   */
  private rebuiltPeerFinal(round: number): string | null {
    const match = this.state.match
    if (!match) return null
    const last = this.peerLawn(round)
    const key = `${match.id}:${round}:${last?.at ?? -1}`
    if (this.rebuilt?.key === key) return this.rebuilt.pack
    const started = performance.now()
    const options = { ...this.roundOptions(match, round), host: false }
    const built = gardenFrom(options, last, playStart(match, round))
    built.garden.advanceTo(built.garden.endMs)
    const pack = encodeFinal(finalReport(built.garden))
    this.rebuilt = { key, pack }
    this.logEvent('peerFinalBuilt', {
      round,
      copy: built.copy !== null,
      copyT: Math.round(built.copyT),
      ms: performance.now() - started
    })
    return pack
  }

  private sendFinal(): void {
    const key = `${this.gardenMatch}:${this.gardenRound}`
    if (this.finalAt === key) return
    this.finalAt = key
    const garden = this.garden
    garden.advanceTo(garden.endMs)
    const pack = encodeFinal(finalReport(garden))
    this.keepFinal(this.gardenMatch, this.gardenRound, pack)
    this.logEvent('final', { round: this.gardenRound, bytes: pack.length })
    // Play is over: the tip line clears for Brenda.
    this.nextNote = null
    this.putNote(null)
    this.dispatch({ type: 'final', round: this.gardenRound, pack })
  }

  private keepFinal(match: string, round: number, pack: string): void {
    if (this.myFinalsMatch !== match) {
      this.myFinalsMatch = match
      this.myFinals.clear()
    }
    this.myFinals.set(round, pack)
  }

  /**
   * Host only: this page was closed when `round` ended, and the guest still waits for
   * its verdict. Builds this page's final for it the way a reload during that round's
   * reveal would, from the guest's copy of your lawn or a fresh lawn, caught up to the
   * round's end, and hands it to the room flow.
   */
  private missedFinal(round: number): void {
    const match = this.state.match
    if (!match || !isHost(this.state)) return
    let pack = this.myFinal(round)
    if (!pack) {
      const started = performance.now()
      const origin = playStart(match, round)
      const options = this.roundOptions(match, round)
      const built = this.lateGarden(options, match.id, round, origin)
      built.garden.advanceTo(built.garden.endMs)
      pack = encodeFinal(finalReport(built.garden))
      this.keepFinal(match.id, round, pack)
      this.logEvent('finalBuilt', {
        round,
        copy: built.copy !== null,
        ms: performance.now() - started
      })
    }
    this.dispatch({ type: 'final', round, pack })
  }

  /** Swaps in the right garden for the match phase: a fresh one at each round's countdown. */
  private followMatch(now: number): void {
    const match = this.state.match
    const phase = this.phase(now)
    if (!match || !phase || phase.kind === 'waiting' || phase.kind === 'done') {
      if (this.gardenRound !== -1) {
        this.gardenRound = -1
        this.gardenMatch = ''
        this.garden = this.previewGarden()
      }
      return
    }
    // Re-read every time: a dev jump moves the match clock under a running round.
    this.gardenOrigin = playStart(match, phase.round)
    if (this.gardenRound === phase.round && this.gardenMatch === match.id)
      return
    // A round left behind without its final (a hidden tab) sends it before it goes.
    if (this.gardenRound >= 0 && this.gardenMatch === match.id) this.sendFinal()
    this.gardenRound = phase.round
    this.gardenMatch = match.id
    this.neighbour.clear()
    this.neighbour.headSeed = seedOf(this.state.peer?.id ?? '')
    this.landings.length = 0
    if (this.peerLawnsMatch !== match.id) {
      this.peerLawnsMatch = match.id
      this.peerLawns.length = 0
    }
    this.nextLawnAt = 0
    const options = this.roundOptions(match, phase.round)
    this.gardenOptions = options
    this.garden = this.roundGarden(options, match.id, phase.round, now)
    this.logEvent('round', { round: phase.round })
  }

  private roundOptions(match: MatchInfo, round: number): GardenOptions {
    return {
      seed: roundSeed(match.seed, round),
      round,
      roundMs: match.roundMs,
      heatwave: round === HEATWAVE_ROUND,
      host: isHost(this.state),
      calm: netFlags.calm
    }
  }

  /**
   * A fresh garden for a round, or, when this page joins a round already in play (a
   * reload), one rebuilt from the neighbour's copy of your lawn. With no copy you get a
   * fresh lawn. Either way the next frame catches it up to now.
   */
  private roundGarden(
    options: GardenOptions,
    matchId: string,
    round: number,
    now: number
  ): Garden {
    if (now <= this.gardenOrigin) {
      this.gardenStart = { round, at: now, copy: null, copyT: 0 }
      return new Garden(options)
    }
    const started = performance.now()
    const built = this.lateGarden(options, matchId, round, this.gardenOrigin)
    this.gardenStart = {
      round,
      at: now,
      copy: built.copy,
      copyT: built.copyT
    }
    this.logEvent(
      'rebuild',
      built.copy
        ? {
            round,
            copy: true,
            copyT: Math.round(built.copyT),
            ms: performance.now() - started
          }
        : { round, copy: false }
    )
    return built.garden
  }

  /**
   * The garden of a round that started at shared time `origin` before this page joined
   * it: rebuilt from the neighbour's copy of your lawn in that round, else fresh.
   */
  private lateGarden(
    options: GardenOptions,
    matchId: string,
    round: number,
    origin: number
  ): Built {
    const copy = this.copiesMatch === matchId ? this.copies.get(round) : null
    return gardenFrom(options, copy, origin)
  }

  private previewGarden(): Garden {
    return new Garden({
      seed: Math.floor(hash01(seedOf(this.code), 1) * 0x7fffffff),
      endMs: 0
    })
  }

  private runEffect(effect: RoomEffect): void {
    this.logEvent(effect.type, effect)
    switch (effect.type) {
      case 'disconnect':
        this.outbox.flush(this.clock.now())
        this.dropTransport()
        return
      case 'reconnect':
        this.dropTransport()
        if (this.releaseLock) this.openTransport()
        else this.takeLock(false)
        return
      case 'role':
        this.pings.clear()
        if (effect.host) {
          this.joinBatch = null
          this.clock.becomeHost()
        } else {
          this.clock.reset()
          this.startJoinBatch(1)
        }
        return
      case 'copy': {
        // Each copy names its own round, so a copy of a finished round can wait beside
        // the current one.
        const round = decodeLawn(effect.pack)?.round
        if (round === undefined) return
        if (this.copiesMatch !== effect.match) {
          this.copiesMatch = effect.match
          this.copies.clear()
        }
        this.copies.set(round, { pack: effect.pack, at: effect.at })
        return
      }
      case 'missedFinal':
        this.missed.add(effect.round)
        return
      case 'matchStarted':
        this.worst.reset()
        return
      case 'announce':
        return
    }
  }

  /**
   * Stops listening and closes the transport a moment later: Pusher sends on the next
   * tick, so the last flush must get out before the socket closes.
   */
  private dropTransport(): void {
    for (const unsub of this.unsubs.splice(0)) unsub()
    const transport = this.transport
    this.transport = null
    if (transport) setTimeout(() => transport.close(), CLOSE_DELAY_MS)
  }

  private publish(effects: readonly RoomEffect[]): void {
    const prev = this.view.get()
    let announce = prev.announce
    for (const effect of effects)
      if (effect.type === 'announce') announce = effect.text
    const next = this.toView(announce)
    // Keep the old objects when nothing in them changed, so React skips the render.
    if (shallowEqual(prev.peer, next.peer)) next.peer = prev.peer
    if (shallowEqual(prev.tally, next.tally)) next.tally = prev.tally
    this.view.set(next)
  }

  private toView(announce: string): RoomView {
    const s = this.state
    return {
      admission: s.admission,
      reason: s.reason,
      conn: s.conn,
      meName: s.me.name,
      seats: s.seats,
      host: hostSide(s),
      peer: s.peer
        ? {
            id: s.peer.id,
            name: s.peer.name,
            ready: s.peer.ready,
            rematch: s.peer.rematch,
            listed: s.peer.listed,
            unlistedSince: s.peer.unlistedSince,
            away: s.peer.away
          }
        : null,
      myReady: s.myReady,
      myRematch: s.myRematch,
      phase: s.phase,
      match: s.match,
      over: s.over,
      arrival: s.arrival,
      results: s.results,
      tally: tallyOf(s),
      announce,
      practice: this.options.practice === true
    }
  }
}

/** A garden built for a round already under way, and the copy it came from. */
interface Built {
  garden: Garden
  copy: string | null
  copyT: number
}

/**
 * A round's garden rebuilt from `copy`, a lawn pack that arrived at shared time `at`, in a
 * round whose play started at `origin`. With no copy for that round it starts fresh.
 * Either way it still has to catch up.
 */
function gardenFrom(
  options: GardenOptions,
  copy: { pack: string; at: number } | null | undefined,
  origin: number
): Built {
  const report = copy ? decodeLawn(copy.pack) : null
  if (!copy || !report || report.round !== options.round)
    return { garden: new Garden(options), copy: null, copyT: 0 }
  const copyT = clamp(copy.at - origin, 0, options.roundMs ?? 0)
  return {
    garden: rebuildGarden(options, report, copyT),
    copy: copy.pack,
    copyT
  }
}

/** A stable number from a string, for seeded looks. */
function seedOf(text: string): number {
  let seed = 0
  for (const ch of text) seed = (seed * 31 + ch.charCodeAt(0)) | 0
  return seed
}

const sessions = new Map<string, RoomSession>()

/**
 * The one session for a room code, created and opened on first call. React calls this
 * during render; the module-level map keeps StrictMode's double render to one session.
 */
export function getRoomSession(
  code: string,
  create: () => RoomSession
): RoomSession {
  let session = sessions.get(code)
  if (!session) {
    session = create()
    sessions.set(code, session)
    session.open()
  }
  return session
}
