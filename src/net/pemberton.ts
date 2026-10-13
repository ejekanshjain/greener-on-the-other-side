import { Brain } from '../game/brain'
import { patchCenter } from '../game/grid'
import { PEMBERTON, type Profile } from '../game/profiles'
import { COLS, LAWN_W } from '../game/tuning'
import type { GardenEvent } from '../game/types'
import type { NeighbourView } from './neighbour'
import { RoomSession, type Companion } from './session'
import type { Transport } from './types'

/** Mr Pemberton's player id. It sorts after every player id, so you always host Practice. */
export const PEMBERTON_ID = 'z'.repeat(24)
export const PEMBERTON_NAME = 'Mr Pemberton'

/** What he says over the fence. */
export const PEMBERTON_LINES = {
  begonias: 'My begonias!',
  laugh: 'Heh heh heh.',
  blast: 'Blast.'
} as const

/** Hits on his lawn within this window make him shake his fist. */
const FIST_WINDOW_MS = 10_000
const FIST_HITS = 3
/** His front rows, where the begonias grow. */
const BEGONIA_ROWS = 4

/**
 * Mr Pemberton, the Practice neighbour: a guest session of his own on a memory transport,
 * with his own garden and the shared bot brain at its hands. He readies at once, asks for
 * a rematch at once, and plays polite in round 1, normal in round 2 and petty in round 3.
 * His reactions travel as normal messages (his fist) and as Practice-only speech bubbles
 * on your side of the fence (`view`).
 */
export class BotNeighbour implements Companion {
  readonly session: RoomSession
  readonly brain: Brain
  /** A dev override for his mood, or null to follow the round. */
  forced: Profile | null = null
  private hits: number[] = []

  constructor(
    code: string,
    transport: Transport,
    /** Your view of next door, where his bubbles show. */
    private readonly view: NeighbourView,
    seed: number
  ) {
    this.session = new RoomSession(
      code,
      { id: PEMBERTON_ID, name: PEMBERTON_NAME },
      'link',
      Object.assign(() => transport, { local: true }),
      { muted: true }
    )
    this.brain = new Brain(PEMBERTON[0], seed)
    this.session.autopilot = this.brain
    this.session.onGardenEvents(events => this.react(events))
    // Your clip arrives already in his frame.
    this.session.theirClips.add(x => this.say(PEMBERTON_LINES.laugh, x))
    this.session.open()
  }

  /** Readies and rematches at once, sets his mood for the round, and runs his session. */
  update(): void {
    const s = this.session
    const room = s.room
    if (
      room.admission === 'seated' &&
      room.seats.length === 2 &&
      room.phase === 'lobby' &&
      !room.myReady
    )
      s.dispatch({ type: 'ui', action: 'ready' })
    if (
      room.phase === 'over' &&
      room.over?.reason === 'score' &&
      !room.myRematch
    )
      s.dispatch({ type: 'ui', action: 'rematch' })
    const round = Math.max(0, s.gardenRound)
    this.brain.profile = this.forced ?? PEMBERTON[round] ?? PEMBERTON[0]
    s.update()
  }

  close(): void {
    this.session.close()
  }

  /**
   * His reactions to his own garden: "My begonias!" when your gnome lands in his front 4
   * rows, a fist after 3 hits within 10s, and "Blast." when his own throw clips.
   */
  private react(events: readonly GardenEvent[]): void {
    const t = this.session.garden.t
    for (const event of events) {
      if (event.type === 'clip') {
        this.say(PEMBERTON_LINES.blast, event.clip.x, true)
        continue
      }
      if (event.type !== 'land' || !event.fromNeighbour) continue
      const { patch, kind } = event.landing
      const x = patchCenter(patch).lx
      if (kind === 'gnome' && Math.floor(patch / COLS) < BEGONIA_ROWS)
        this.say(PEMBERTON_LINES.begonias, x, true)
      this.hits = this.hits.filter(at => t - at < FIST_WINDOW_MS)
      this.hits.push(t)
      if (this.hits.length >= FIST_HITS) {
        this.hits = []
        this.session.sendFist(x)
      }
    }
  }

  /** A bubble over the fence at `x` in his frame, which is mirrored on your side. */
  private say(text: string, x: number, angry = false): void {
    this.view.say(text, LAWN_W - x, this.session.clock.now(), angry)
    this.session.logEvent('say', { text })
  }
}
