import { coachLine } from '../game/counts'
import { arrivalFlight } from '../game/flight'
import { Garden, type GardenOptions } from '../game/garden'
import { playStart, type MatchPhase } from '../game/match'
import { roundSeed } from '../game/seed'
import { StripeWatch } from '../game/stripeWatch'
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
import {
  freshRound,
  liveStep,
  TipQueue,
  type ShownTip,
  type TipRequest,
  type TipSpot
} from '../game/tipQueue'
import { SHED_BANNER, tipKind, TOASTS, type TipId } from '../game/tips'
import { nearestGnome, SHED_BANNER_MS, TipTriggers } from '../game/tipTriggers'
import type { FingerPlay } from '../scenes/ghostFinger'
import { tipSpotFor } from '../scenes/tipPointer'
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
import { isNewPlayer, saveFinishedMatch } from './identity'
import { decodeBundle, newSessionId, StaleFilter } from './envelope'
import { encodeFinal } from './finalCodec'
import type { RoundResult } from './judge'
import { randomId } from './ids'
import { decodeLawn, encodeLawn } from './lawnCodec'
import { Limiter } from './limiter'
import { Listeners } from './listeners'
import { NeighbourView } from './neighbour'
import { Outbox } from './outbox'
import { YardRun } from './yardRun'
import { isClockMsg, type MatchInfo, type Msg } from './protocol'
import {
  decidedMatchEnd,
  initialRoom,
  hostSide,
  isHost,
  matchPhase,
  peerHere,
  peerYard,
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

/** The session's small heads-up store. */
export interface Hud {
  /** A new player's tip on show, at its spot. */
  tip: Line | null
  /** A toast in the patio strip, for every player. */
  toast: Line | null
  /** The shed banner over the peek strip in round 1 of a first match. */
  banner: Banner | null
  tips: TipsChoice
  /** When Shake Fist works again, in real time. */
  fistUntil: number
  /** The lobby's yard while it's open: its step, from 0, or 3 once done, and whether How to Play covers it. */
  yard: { step: number; help: boolean } | null
  /** True once you've finished or skipped the yard on this page. */
  yardDone: boolean
}

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
    /** They're a new player, so their lobby gate shows First Match. */
    first: boolean
    /** Their yard step, 1 to 3, while they try the yard and aren't Ready, else 0. */
    yard: number
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
  /** Whether this page counts as a new player right now, from the stored fact. */
  newPlayer: boolean
  /** Whether this page teaches the current match as a new player's first. */
  firstMatch: boolean
}

/** A line on screen: a new player's tip at its spot, or a toast in the patio strip. */
export interface Line {
  key: number
  text: string
  spot: TipSpot
}

/** A banner's one line on screen and the sentence screen readers hear. */
export interface Banner {
  key: number
  text: string
  spoken: string
}

/** Whether tips show: a new player's default, or the menu's Show Tips or Hide Tips. */
export type TipsChoice = 'auto' | 'on' | 'off'

/** How a session behaves beyond the room flow. */
export interface SessionOptions {
  /** Plays no sounds: Mr Pemberton's own session in Practice. */
  muted?: boolean
  /** Practice: Mr Pemberton laughs at your clips himself. */
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
/** The shed banner's line, and the sentence screen readers hear instead. */
const shedBanner = { text: SHED_BANNER.line, spoken: SHED_BANNER.spoken }

/** A toast stays up this long. */
const TOAST_MS = 2600
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
  /**
   * The tip and toast on screen, whether tips show, and when Shake Fist works again (real
   * time). It changes on events, never per frame.
   */
  readonly hud: Store<Hud> = createStore<Hud>({
    tip: null,
    toast: null,
    banner: null,
    tips: 'auto',
    fistUntil: 0,
    yard: null,
    yardDone: false
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
  /** Columns that gained and lost a stripe in a live step, for the stripe cues. */
  private readonly stripeEvents = new Listeners<[number, number]>()
  private readonly stripeWatch = new StripeWatch()
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
  /** A new player's tips, one at a time, on tip time that stands still while paused. */
  private readonly tipQueue = new TipQueue()
  private toastKey = 0
  private toastUntil = 0
  /** The match and round the tip queue was last reset for. */
  private tipsFor = ''
  /** The current round garden's tip triggers. */
  private triggers: TipTriggers | null = null
  /** A new player's ghost finger on show, in real time, for the scene. */
  ghost: FingerPlay | null = null
  /** The ghost finger plays once more when round 1's play starts. */
  private ghostAgain = 0
  private bannerUntil = 0
  /** The round whose first live frame was seen, and whether it came in time for its countdown tips. */
  private liveFor = ''
  private freshStart = false
  /** The match `first` was read for, and whether this page is new for it. */
  private firstFor = ''
  private first = false
  /** The match whose end already saved the finished-match fact. */
  private finishedFor = ''
  /** Mr Pemberton in Practice, run each frame after this session's own update. */
  companion: Companion | null = null
  /** A bot playing this session's garden: Mr Pemberton's hands, or dev autopilot. */
  autopilot: Brain | null = null
  /** Their clip records as they arrive, at `x` in your frame. */
  readonly theirClips = new Listeners<[number]>()
  /** Room screens showing this session; the last one to go leaves the room. */
  private holders = 0
  /** The lobby's yard while it's open. */
  private yardRun: YardRun | null = null
  /** The yard's line as the tip on show, made again only when it changes. */
  private yardTip: ShownTip | null = null
  /** The yard step the room last heard of, so a change goes out in a `sync` at once. */
  private sentYardStep = 0
  /** How the last yard visit ended, for the dev `yard()` hook. */
  yardEnd: { finished: boolean; skipped: boolean } | null = null
  /** Round 1 tips that finished yard steps already taught, marked seen in each new match. */
  readonly yardLearned = new Set<TipId>()

  constructor(
    readonly code: string,
    readonly me: { id: string; name: string },
    arrival: ArrivalKind,
    private readonly makeTransport: TransportFactory,
    private readonly options: SessionOptions = {}
  ) {
    this.neighbour.pemberton = options.practice === true
    this.tipQueue.onEnd = (tip, shownMs, why) =>
      this.logEvent('noteEnd', {
        text: tip.text,
        shownMs: Math.round(shownMs),
        why,
        seen: this.tipSeen(tip.id)
      })
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
    // Leaving closes the yard first, so nothing of it outlives the room.
    this.closeYard(false)
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

  /**
   * The garden your presses reach: the round's during play, or the yard's while it's open.
   * None during a playtest pause.
   */
  inputGarden(): Garden | null {
    if (this.paused) return null
    return this.playableGarden() ?? this.yardRun?.garden ?? null
  }

  /** True while a dev playtest pause holds game time still. */
  get paused(): boolean {
    return this.clock.paused
  }

  /** Whether dev playtest pauses work here: `?local` rooms and Practice, never real Pusher. */
  get pausable(): boolean {
    return (
      process.env.NODE_ENV !== 'production' && this.makeTransport.local === true
    )
  }

  /**
   * Dev playtest clock: game time stops at shared time `at`, for the rounds, both gardens,
   * Mr Pemberton, the tip queue, the countdown and the reveal. Returns false where pauses
   * don't work.
   */
  pauseAt(at: number): boolean {
    if (!this.pausable) return false
    this.clock.pause(at)
    this.logEvent('pause', { at })
    return true
  }

  /** Dev playtest clock: game time runs again from shared time `at`. */
  resumeAt(at: number): boolean {
    if (!this.pausable) return false
    this.clock.resume(at)
    this.logEvent('resume', { at })
    return true
  }

  /** True while the lobby's yard is open. */
  get yardOpen(): boolean {
    return this.yardRun !== null
  }

  /** The yard's steps while it's open, for the dev tools. */
  get yardSteps(): YardRun['steps'] | null {
    return this.yardRun?.steps ?? null
  }

  /** The yard may stay open only on a seated page in the lobby, and never in Mr Pemberton's. */
  private yardAllowed(): boolean {
    return (
      !this.muted &&
      this.state.phase === 'lobby' &&
      this.state.admission === 'seated' &&
      this.gardenRound < 0
    )
  }

  /**
   * Opens the lobby's yard at step 1: a practice lawn on this page alone, which no message,
   * replay or score ever sees.
   */
  openYard(): void {
    if (this.yardRun || !this.yardAllowed()) return
    const run = new YardRun(this.previewSeed(), performance.now())
    this.yardRun = run
    this.yardTip = null
    this.garden = run.garden
    this.ghost = run.ghost
    this.hud.set({ yard: { step: 0, help: false }, tip: null })
    this.logEvent('yardOpen')
  }

  /**
   * Closes the yard and brings back the lobby's still lawn. `skipped` says you left it
   * before its last step; a match starting closes it with neither.
   */
  closeYard(skipped = true): void {
    const run = this.yardRun
    if (!run) return
    this.yardRun = null
    this.yardTip = null
    this.yardEnd = { finished: run.finished, skipped: skipped && !run.finished }
    for (const id of run.learned) this.yardLearned.add(id)
    this.ghost = null
    this.loops.sync(null)
    if (this.gardenRound < 0) this.garden = this.previewGarden()
    this.hud.set({
      yard: null,
      tip: null,
      yardDone:
        this.hud.get().yardDone || this.yardEnd.finished || this.yardEnd.skipped
    })
    this.logEvent('yardClose', this.yardEnd)
  }

  /** How to Play over the yard: it covers the yard's bar, panel and line until Back. */
  yardHelp(open: boolean): void {
    const yard = this.hud.get().yard
    if (yard && yard.help !== open)
      this.hud.set({ yard: { ...yard, help: open } })
  }

  /** The yard step this page sends in its lobby `sync`, 1 to 3, or 0 while the yard is shut. */
  private yardSyncStep(): number {
    return this.yardRun ? Math.min(this.yardRun.steps.step + 1, 3) : 0
  }

  /** Sends a `sync` once the yard step changes, so your friend's line follows within a frame. */
  private followYardStep(): void {
    const step = this.yardSyncStep()
    if (step === this.sentYardStep) return
    this.sentYardStep = step
    this.dispatch({ type: 'ui', action: 'yard' })
  }

  /**
   * One step of the yard: its garden runs on real time, its sounds and cues play, and a
   * throw over the fence vanishes with a puff in the peek strip. Nothing leaves this page.
   */
  private yardStep(run: YardRun, hidden: boolean): void {
    const now = performance.now()
    const events = run.update(now)
    for (const event of events) {
      if (event.type !== 'dry') this.logEvent(event.type, event)
      if (!hidden) playEvent(event, run.garden, this.play)
      if (event.type === 'cross')
        this.neighbour.vanish(
          event.crossing.x,
          event.crossing.kind,
          this.clock.now()
        )
    }
    if (this.ghost !== run.ghost) {
      this.ghost = run.ghost
      if (run.ghost)
        this.logEvent('ghost', {
          id: run.ghost.id,
          move: run.ghost.move,
          stoppable: true
        })
    }
    this.followStripes(!hidden)
    if (events.length > 0) this.gardenEvents.emit(events)
    this.loops.sync(hidden ? null : run.garden)
    const yard = this.hud.get().yard
    if (yard && yard.step !== run.steps.step)
      this.hud.set({ yard: { ...yard, step: run.steps.step } })
    if (run.over(now)) this.closeYard(false)
  }

  /** Puts the yard's line in the tip line: a failure tip for its 3s, else the step's line. */
  private yardNote(): void {
    const tip = this.shownTip
    if (!tip || tip.key === this.hud.get().tip?.key) return
    this.hud.set({ tip: { key: tip.key, text: tip.text, spot: tip.spot } })
    this.logEvent('note', { text: tip.text, kind: 'yard', spot: tip.spot })
  }

  /** The garden when its round is in play, else null, so input does nothing. */
  playableGarden(): Garden | null {
    const phase = this.phase()
    return phase?.kind === 'play' && phase.round === this.gardenRound
      ? this.garden
      : null
  }

  /**
   * Follows your settled stripes after each step: in live play, a column that gains one
   * chimes, and the scene hears of each gain and loss for its cues.
   */
  private followStripes(live: boolean): void {
    const { gained, lost } = this.stripeWatch.step(this.garden, live)
    if (!gained && !lost) return
    if (gained) this.play('stripe')
    this.logEvent('stripes', { gained, lost })
    this.stripeEvents.emit(gained, lost)
  }

  /** Listens for columns that gain or lose a stripe in live play, as 12-bit masks. */
  onStripes(fn: (gained: number, lost: number) => void): () => void {
    return this.stripeEvents.add(fn)
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
    // Leaving the seated lobby closes the yard at once, before the screen changes.
    if (this.yardRun && !this.yardAllowed()) this.closeYard(false)
    if (was !== 'over' && step.state.phase === 'over') this.sting()
    this.saveFinished()
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

  /** Saves the finished-match fact once the end of a match Brenda decided shows here. */
  private saveFinished(): void {
    const over = this.state.over
    if (this.muted || !over || !decidedMatchEnd(this.state)) return
    if (this.finishedFor === over.matchId) return
    this.finishedFor = over.matchId
    saveFinishedMatch()
    this.logEvent('finished', { match: over.matchId })
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
    if (this.yardRun && !this.yardAllowed()) this.closeYard(false)
    this.followYardStep()
    if (this.yardRun) {
      this.yardStep(this.yardRun, hidden)
      this.companion?.update()
      return
    }
    // Only a live step on a showing page raises tips; catch-up replays events silently.
    let live = false
    const playing = this.playableGarden()
    const paused = this.paused
    if (playing && !paused) this.autopilot?.step(playing)
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
      live = liveStep(behind, hidden || !this.state.visible)
      if (live) this.firstLiveFrame(garden)
    }
    const triggers = this.triggersFor()
    this.finalStep(now)
    const events = this.garden.drainEvents()
    if (playing) this.autopilot?.observe(events)
    if (playing && !this.muted)
      this.worst.track(playing, events, this.gardenRound, performance.now())
    for (const event of events) {
      // Drying is routine; logging it would push everything else out of the dev log.
      if (event.type !== 'dry') this.logEvent(event.type, event)
      // Catch-up still ends moments, so a tip that waited through it doesn't show stale.
      if (live) this.noteFor(event, triggers)
      else triggers?.ends(event)
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
    if (live && this.ghostAgain && this.phase()?.kind === 'play') {
      if (this.tipsOn) this.playGhost(this.ghostAgain, true)
      this.ghostAgain = 0
    }
    // Lawn and time tips look at the lawn after this frame's events.
    if (triggers && live && this.tipsOn) triggers.frame()
    else triggers?.quiet()
    if (!this.muted && this.gardenRound >= 0)
      this.followStripes(live && !!playing)
    this.sendLawn(now, hidden ? FRAMELESS_LAWN_EARLY_MS : 0)
    if (!hidden) {
      this.countdownSounds(now)
      this.lastTicks(now)
    }
    if (events.length > 0) this.gardenEvents.emit(events)
    // Loops follow the garden only during play on a showing page, and stop for a pause.
    if (!this.muted) this.loops.sync(hidden || paused ? null : playing)
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
    if (
      !this.playableGarden() ||
      this.paused ||
      Date.now() < this.hud.get().fistUntil
    )
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

  /** Shows a toast in the patio strip at once, for every player, for 2.6s. */
  showToast(text: string): void {
    this.toastUntil = Date.now() + TOAST_MS
    this.hud.set({ toast: { key: ++this.toastKey, text, spot: 'patio' } })
    this.logEvent('note', { text, kind: 'toast', spot: 'patio' })
  }

  /**
   * Moves the tip queue on and puts its tip and the toast on screen. Tip time stands still
   * while Reconnecting shows or the page is hidden, and a patio tip waits under a toast.
   */
  private noteStep(): void {
    const now = Date.now()
    const hud = this.hud.get()
    if (hud.toast && now >= this.toastUntil) this.hud.set({ toast: null })
    if (hud.banner && now >= this.bannerUntil) this.hud.set({ banner: null })
    if (this.yardRun) return this.yardNote()
    const tip = this.tipQueue.step(now, {
      all:
        this.state.conn === 'reconnecting' ||
        !this.state.visible ||
        this.paused,
      patio: this.hud.get().toast !== null
    })
    // An urgent tip in the patio strip ends the toast there early.
    if (tip?.spot === 'patio' && tip.urgent && this.hud.get().toast)
      this.hud.set({ toast: null })
    if ((tip?.key ?? 0) === (hud.tip?.key ?? 0)) return
    this.hud.set({
      tip: tip && { key: tip.key, text: tip.text, spot: tip.spot }
    })
    if (tip)
      this.logEvent('note', { text: tip.text, kind: 'tip', spot: tip.spot })
  }

  /** Tips show the first time each thing happens; toasts show every time. */
  private noteFor(event: GardenEvent, triggers: TipTriggers | null): void {
    if (event.type === 'canEmpty') return this.showToast(TOASTS.canEmpty)
    if (event.type === 'noMower') return this.showToast(TOASTS.noMower)
    if (event.type === 'mowerPoke') return this.showToast(TOASTS.mowerPoke)
    triggers?.event(event)
  }

  /**
   * The tip triggers for the round garden on show, made fresh with each garden, or null
   * outside a round's countdown and play, and for Mr Pemberton's muted session.
   */
  private triggersFor(): TipTriggers | null {
    if (this.gardenRound < 0 || this.muted) return null
    if (this.triggers?.garden !== this.garden)
      this.triggers = new TipTriggers(this.garden, this.tipSink)
    return this.triggers
  }

  /** Whether this page shows tips now: a new player's match, or after Show Tips. */
  get tipsOn(): boolean {
    const choice = this.hud.get().tips
    return (
      !this.muted && (choice === 'on' || (choice === 'auto' && this.firstMatch))
    )
  }

  /** True once tip `id` has shown for 3s in this match. */
  tipSeen(id: TipId): boolean {
    const kind = tipKind(id)
    return this.tipQueue.hasSeen(id, kind.failure || kind.eachRound)
  }

  /** Show Tips: a new player's tips from now until the page reloads. */
  showTips(): void {
    this.hud.set({ tips: 'on' })
  }

  /** Hide Tips: clears the tip on show and shows no more until the page reloads. */
  hideTips(): void {
    this.hud.set({ tips: 'off', tip: null, banner: null })
    this.tipQueue.clear()
    this.ghost = null
    this.ghostAgain = 0
  }

  /** Where the triggers' tips go: the queue, for a new player during the countdown or play. */
  private readonly tipSink = {
    raise: (req: TipRequest): void => {
      const kind = this.phase()?.kind
      if (!this.tipsOn || (kind !== 'play' && kind !== 'countdown')) return
      // The spot is fixed when the tip shows: the patio strip if the line would hide its object.
      this.tipQueue.raise({
        ...req,
        spot: req.spot ?? (() => tipSpotFor(this.garden, req.target))
      })
    },
    end: (moment: string, watched: boolean): void =>
      this.tipQueue.end(moment, watched),
    shedBanner: (): void => {
      if (!this.tipsOn) return
      this.bannerUntil = Date.now() + SHED_BANNER_MS
      this.hud.set({ banner: { key: ++this.toastKey, ...shedBanner } })
      this.logEvent('banner', { text: shedBanner.text })
    }
  }

  /** The tip on show, with what its arrow points at, or null. */
  get shownTip(): ShownTip | null {
    const run = this.yardRun
    if (!run) return this.tipQueue.shown
    const line = run.shown(performance.now())
    if (this.yardTip?.key !== line.key)
      this.yardTip = {
        key: line.key,
        id: 'yard',
        text: line.text,
        spot: tipSpotFor(run.garden, line.target ?? undefined),
        urgent: false,
        target: line.target
      }
    return this.yardTip
  }

  /**
   * The first live frame of a round decides whether its countdown tips may show: only
   * when it lands in the countdown or the first 2s of play, so a reload never replays them.
   */
  private firstLiveFrame(garden: Garden): void {
    const key = `${this.gardenMatch}:${this.gardenRound}`
    if (this.liveFor === key) return
    this.liveFor = key
    this.freshStart = freshRound(this.phase()?.kind ?? '', garden.t)
    this.logEvent('liveFrame', {
      round: this.gardenRound,
      fresh: this.freshStart
    })
    if (!this.freshStart) return
    this.triggersFor()?.countdown(this.coachTip(this.gardenRound))
    if (this.gardenRound !== 0 || !this.tipsOn) return
    // The finger plays in the countdown, and once more at 0s, which a press stops.
    const gnome = nearestGnome(garden)
    if (!gnome) return
    const counting = this.phase()?.kind === 'countdown'
    this.playGhost(gnome, !counting)
    this.ghostAgain = counting ? gnome : 0
  }

  /**
   * The coach tip for round `round`'s countdown: what cost you most last round, read from
   * that round's verdict, so a reloaded page picks the same words. Null in round 1, or
   * when the verdict hasn't arrived.
   */
  private coachTip(round: number): string | null {
    const last = this.state.results.find(r => r.round === round - 1)
    if (!last) return null
    const me = hostSide(this.state) ? 0 : 1
    return coachLine(last.scores[me], last.counts[me])
  }

  private playGhost(id: number, stoppable: boolean): void {
    this.ghost = { id, startAt: performance.now(), stoppable }
    this.logEvent('ghost', { id, stoppable })
  }

  /** A press on the garden stops the ghost finger's second play. */
  stopGhost(): void {
    if (this.yardRun?.ghost) this.yardRun.ghost = null
    if (!this.ghost?.stoppable) return
    this.ghost = null
    this.logEvent('ghostStop')
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
      myFinal: round => this.myFinal(round),
      newPlayer: () => this.newPlayerNow(),
      yardStep: () => this.yardSyncStep()
    }
  }

  /**
   * Whether this page counts as a new player right now: the dev `?first` override, else
   * the stored fact. Mr Pemberton's muted session never does.
   */
  newPlayerNow(): boolean {
    return !this.muted && isNewPlayer(netFlags.first)
  }

  /**
   * Whether this page teaches the current match as a new player's first. It's read once,
   * when the page first sees the match, so teaching never switches off mid-match.
   */
  get firstMatch(): boolean {
    const id = this.state.match?.id ?? ''
    if (id !== this.firstFor) {
      this.firstFor = id
      this.first = id !== '' && this.newPlayerNow()
    }
    return this.first
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
        th: this.clock.shared()
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
    // Play is over: the tip line clears for Brenda, and waiting tips leave unseen.
    this.tipQueue.clear()
    this.hud.set({ tip: null, toast: null, banner: null })
    this.ghost = null
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
    this.resetTips(match.id)
    this.ghost = null
    this.ghostAgain = 0
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

  /**
   * A new match lets every tip show again, except those a finished yard step taught; a new
   * round lets failure tips show once more.
   */
  private resetTips(matchId: string): void {
    if (this.tipsFor !== matchId) {
      this.tipQueue.newMatch()
      for (const id of this.yardLearned) this.tipQueue.learn(id)
    } else this.tipQueue.newRound()
    this.tipsFor = matchId
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
    return new Garden({ seed: this.previewSeed(), endMs: 0 })
  }

  /** The lobby lawn's seed, from the room code, which the yard's lawn shares. */
  private previewSeed(): number {
    return Math.floor(hash01(seedOf(this.code), 1) * 0x7fffffff)
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
      // A new match starts the live region empty, so a rematch never repeats the last result.
      else if (effect.type === 'matchStarted') announce = ''
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
            away: s.peer.away,
            first: s.peer.first,
            yard: peerYard(s)
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
      practice: this.options.practice === true,
      newPlayer: this.newPlayerNow(),
      firstMatch: this.firstMatch
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
