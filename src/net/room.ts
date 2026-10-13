import {
  matchPhaseAt,
  matchTimings,
  ROUNDS,
  START_LEAD_MS,
  type MatchPhase
} from '../game/match'
import { matchResult } from '../game/score'
import { finalRound } from './finalCodec'
import {
  judgeRound,
  matchLine,
  resultFrom,
  resultMsg,
  roundLine,
  type RoundResult
} from './judge'
import type { MatchInfo, Msg, OverMsg, RoomPhase } from './protocol'
import type { ConnStatus, MemberEvent } from './types'

/** How you got into the room, which picks the lobby's waiting copy. */
export type ArrivalKind = 'started' | 'link' | 'typed'

/** Whether you hold a seat in the room. */
export type Admission =
  | 'connecting'
  | 'checking'
  | 'seated'
  | 'full'
  | 'elsewhere'
  | 'moved'
  | 'unreachable'

/** The other seated player, as you last heard them. */
export interface Peer {
  id: string
  name: string
  /** Whether Pusher's member list shows them. */
  listed: boolean
  /** Shared time they left the member list, or -1. */
  unlistedSince: number
  ready: boolean
  rematch: boolean
  /** Ms of silence from them that you could have heard: counted only while you hear. */
  silentMs: number
  /** True once that silence reaches 3s in play or 6s outside it. */
  away: boolean
}

/** How a finished match ended, kept for the match end screen until a rematch or Back to Lobby. */
export interface MatchOver {
  /**
   * `score`: Brenda decided it. `stormedOff`: your neighbour pressed Leave mid-match.
   * `walkover`: one of you was off the member list for 60s. `noContest`: nothing came
   * through for 60s while both of you were listed.
   */
  reason: 'score' | 'stormedOff' | 'walkover' | 'noContest'
  /** The winner's player id, or null for a drawn match or a no contest. */
  winner: string | null
  /** The neighbour you played, so the copy can name them after they leave. */
  peerId: string
  peerName: string
  matchId: string
  /** Round wins and points from the neighbour's `sync`, when this page missed the verdicts. */
  summary: { tally: [number, number]; totals: [number, number] } | null
}

/** Your neighbour's count of verdicts, wins and points, from their `sync`. */
export interface PeerTally {
  done: number
  tally: [number, number]
  totals: [number, number]
}

export interface RoomState {
  me: { id: string; name: string }
  conn: ConnStatus
  admission: Admission
  /** Why the room is unreachable: `timeout`, `refused`, `quota` or a transport reason. */
  reason: string
  /** Other ids on the member list. */
  others: string[]
  /** Seated ids, sorted. The host is `seats[0]` once 2 are seated. */
  seats: string[]
  peer: Peer | null
  phase: RoomPhase
  match: MatchInfo | null
  /** How the last match ended, while `phase` is `over`. */
  over: MatchOver | null
  myReady: boolean
  myRematch: boolean
  arrival: ArrivalKind
  /** Shared time the room opened or last retried, for the 8s connection limit. */
  openedAt: number
  checkingSince: number
  lastSyncAt: number
  lastHelloAt: number
  /** Round verdicts applied in this match, in round order. */
  results: RoundResult[]
  /** Host only: the finals in hand for rounds not yet decided. */
  finals: HostFinal[]
  /** Guest only: its final waiting for the host's verdict, resent every 1s. */
  pendingFinal: { round: number; pack: string; sentAt: number } | null
  /**
   * The neighbour's tally from their last `sync` for this match. A guest heals a missing
   * verdict with it, and a reloaded host picks the match up from it.
   */
  peerTally: PeerTally | null
  /** Host only: the guest pack each round was judged on (its final, or its last lawn). */
  peerFinals: (string | null)[]
  /** True once this player's clock agrees with the host's. The host's always does. */
  clockSynced: boolean
  /** Whether the page is showing. Silence counts only while it shows and the line is up. */
  visible: boolean
  /** Shared time of the last tick, for counting silence. */
  lastTickAt: number
  /** True once this page has been in a match, so a late `sync` can't drag it into an old one. */
  matchSeen: boolean
}

/** The host's finals for one round: its own, and the guest's once it arrives. */
export interface HostFinal {
  round: number
  mine: string
  /** Shared time the host's own final was ready, for the 6s wait. */
  mineAt: number
  theirs: string | null
}

/** One thing that happened to the room. */
export type RoomInput =
  | { type: 'members'; event: MemberEvent }
  | { type: 'status'; status: ConnStatus; reason?: string }
  | { type: 'msg'; from: string; msg: Msg }
  | {
      type: 'ui'
      action: 'ready' | 'unready' | 'rematch' | 'lobby' | 'leave' | 'tryAgain'
    }
  /** The room's Web Lock: another tab holds it, it was stolen, or you took it with Play Here. */
  | { type: 'lock'; state: 'busy' | 'stolen' | 'taken' }
  /** Your garden caught up to the end of `round`'s play: its final pack. */
  | { type: 'final'; round: number; pack: string }
  /** Your clock started or stopped agreeing with the host's. */
  | { type: 'clock'; synced: boolean }
  /** The page was hidden, or shows again after a share sheet, an app switch or a restore. */
  | { type: 'visible'; visible: boolean }
  /** Something arrived from `from`: a bundle of any kind. */
  | { type: 'heard'; from: string }
  | { type: 'tick' }

/** Side effects the session carries out. */
export type RoomEffect =
  | { type: 'disconnect' }
  | { type: 'reconnect' }
  | { type: 'announce'; text: string }
  /** The seats locked or changed; `host` says whether you are the clock reference. */
  | { type: 'role'; host: boolean }
  | { type: 'matchStarted' }
  /** A round's verdict was applied. */
  | { type: 'result'; round: number }
  /** Your neighbour's last copy of your lawn in match `match`, which arrived at shared time `at`. */
  | { type: 'copy'; match: string; pack: string; at: number }
  /**
   * Host only: the guest still waits for a verdict on `round`, a round this page never
   * finished. Build this page's final for it and hand it back as a `final` input.
   */
  | { type: 'missedFinal'; round: number }

export interface RoomStep {
  state: RoomState
  out: Msg[]
  effects: RoomEffect[]
}

/** A step in progress. `wantSync` asks for one `sync` built from the final state. */
interface Draft extends RoomStep {
  wantSync: boolean
}

/** Randomness, dev switches and the session's lawns, injected so the reducer stays pure. */
export interface RoomEnv {
  newMatchId(): string
  newSeed(): number
  fast: boolean
  /**
   * The neighbour's last lawn pack in `round` of the current match and the shared time it
   * arrived: the copy a `sync` carries.
   */
  peerLawn(round: number): { pack: string; at: number } | null
  /**
   * Host only: the guest's final for `round` when its own never came. The session
   * rebuilds the guest's garden from its last lawn pack (else a fresh one) and catches it
   * up to the round's end, as a reload would.
   */
  peerFinal(round: number): string | null
  /** This page's own final pack for `round` of the current match. */
  myFinal(round: number): string | null
}

/** Give up on connecting after this long. */
export const CONNECT_LIMIT_MS = 8000
/** A newcomer waits this long for a `sync` before deciding alone. */
export const CHECK_LIMIT_MS = 3000
/** Both players send `sync` this often outside a round. */
export const SYNC_EVERY_MS = 2000
/** Outside a match, a seat frees after its player has been off the member list this long. */
export const SEAT_FREE_MS = 10_000
/** The guest repeats its final this often until the verdict arrives. */
export const FINAL_REPEAT_MS = 1000
/** The host waits this long after its own final for the guest's, then judges without it. */
export const FINAL_WAIT_MS = 6000
/** Your neighbour shows Away after this much heard silence in play, where lawns beat every 1s. */
export const AWAY_PLAY_MS = 3000
/** The same outside play, where syncs beat every 2s. */
export const AWAY_MS = 6000
/** Off the member list this long mid-match: a walkover. */
export const GONE_MS = 60_000
/** Heard silence this long mid-match while still listed: a no contest. */
export const DEAD_MS = 60_000
/** One tick adds at most this much silence, so a frozen tab never judges its own nap. */
const MAX_TICK_MS = 1000
const HELLO_RETRY_MS = 1000

/** A fresh room for player `me`, before the transport connects. */
export function initialRoom(
  me: { id: string; name: string },
  arrival: ArrivalKind,
  now: number
): RoomState {
  return {
    me,
    conn: 'connecting',
    admission: 'connecting',
    reason: '',
    others: [],
    seats: [],
    peer: null,
    phase: 'lobby',
    match: null,
    over: null,
    myReady: false,
    myRematch: false,
    arrival,
    openedAt: now,
    checkingSince: 0,
    lastSyncAt: -Infinity,
    lastHelloAt: -Infinity,
    results: [],
    finals: [],
    pendingFinal: null,
    peerTally: null,
    peerFinals: [],
    clockSynced: false,
    visible: true,
    lastTickAt: now,
    matchSeen: false
  }
}

/** The round that ends the match: the one whose verdict decided it, else the last. */
export function lastRound(state: RoomState): number {
  return state.results.find(r => r.over)?.round ?? ROUNDS - 1
}

/**
 * Where the match is at shared time `now`, or null outside a match. A match that ended
 * early (a walkover or a no contest) has no phase left, even with time on its clock.
 */
export function matchPhase(state: RoomState, now: number): MatchPhase | null {
  return state.match && state.phase === 'match'
    ? matchPhaseAt(state.match, now, lastRound(state))
    : null
}

/**
 * The verdicts known so far: this page's, or the neighbour's when that knows of more (a
 * page that reloaded mid-match). Rounds are judged in order, so the last verdict's round
 * says how many are in.
 */
function knownTally(state: RoomState): PeerTally | null {
  const last = state.results[state.results.length - 1]
  const mine = last
    ? { done: last.round + 1, tally: last.tally, totals: last.totals }
    : null
  const peer = state.peerTally
  return peer && peer.done > (mine?.done ?? 0) ? peer : mine
}

/**
 * Round wins so far, host first: from the verdicts applied here, or from the
 * neighbour's `sync` when that knows of more.
 */
export function tallyOf(state: RoomState): [number, number] {
  return knownTally(state)?.tally ?? NO_WINS
}

/** No round wins yet. Shared, so per-frame readers allocate nothing. */
const NO_WINS: [number, number] = [0, 0]

/**
 * True when your neighbour can hear you right now: on the member list and not Away.
 * Throws and fists to anyone else vanish over the fence.
 */
export function peerHere(state: RoomState): boolean {
  return !!state.peer?.listed && !state.peer.away
}

/** True while you can hear your neighbour: your page shows and your connection is up. */
function hearing(state: RoomState): boolean {
  return state.conn === 'connected' && state.visible
}

/** True when you host: the lower id once both seats are taken. */
export function isHost(state: RoomState): boolean {
  return state.seats.length === 2 && state.seats[0] === state.me.id
}

/**
 * True when this page plays the host's side of the current or last match. Once the
 * neighbour has left the match end their seat is gone, so the side comes from the
 * neighbour the match was played against: the host holds the lower id.
 */
export function hostSide(state: RoomState): boolean {
  if (state.seats.length === 2) return state.seats[0] === state.me.id
  return !!state.over && state.me.id < state.over.peerId
}

/** True while both seats are taken and the other player is on the member list. */
export function bothPresent(state: RoomState): boolean {
  return (
    state.admission === 'seated' &&
    state.seats.length === 2 &&
    !!state.peer?.listed
  )
}

/**
 * The `sync` you send now: your seats, flags and phase. Outside the lobby it adds the
 * match with its tally, at the match end how it ended, and during a match your copy of
 * your neighbour's lawn. A guest waiting on a verdict names the round, with its copy of
 * the host's lawn from it; a host that lost verdicts in a reload asks for them. A guest
 * whose clock hasn't synced yet doesn't say it's ready, so the countdown waits.
 */
export function syncMsg(state: RoomState, now: number, env: RoomEnv): Msg {
  const msg: Msg = {
    k: 'sync',
    name: state.me.name,
    seats: state.seats,
    ready: state.myReady && (isHost(state) || state.clockSynced),
    rematch: state.myRematch,
    phase: state.phase
  }
  if (state.match && state.phase !== 'lobby' && state.seats.length === 2) {
    const known = knownTally(state)
    msg.match = state.match
    msg.tally = known?.tally ?? NO_WINS
    msg.totals = known?.totals ?? NO_WINS
    msg.done = known?.done ?? 0
  }
  const over = state.over
  // A neighbour who stormed off knows what they did; everyone else hears the result.
  if (
    state.phase === 'over' &&
    over &&
    over.reason !== 'stormedOff' &&
    over.peerId === state.peer?.id
  )
    msg.over = { r: over.reason, w: over.winner ?? '', m: over.matchId }
  if (state.phase !== 'match') return msg
  const round = matchPhase(state, now)?.round ?? -1
  const copy = round >= 0 ? env.peerLawn(round) : null
  if (copy) {
    msg.copy = copy.pack
    msg.copyAt = Math.max(0, Math.round(copy.at))
  }
  const waiting = state.pendingFinal
  if (waiting && !isHost(state) && state.seats.length === 2) {
    msg.wait = waiting.round
    // The current round's copy already went out above.
    const waitCopy =
      waiting.round !== round ? env.peerLawn(waiting.round) : null
    if (waitCopy) {
      msg.waitCopy = waitCopy.pack
      msg.waitCopyAt = Math.max(0, Math.round(waitCopy.at))
    }
  }
  const need = missingVerdicts(state)
  if (need) msg.need = need
  return msg
}

/**
 * Host only: the rounds the guest has a verdict for and this page doesn't, as bits. A host
 * page that reloaded after a verdict asks for these in its `sync`.
 */
function missingVerdicts(s: RoomState): number {
  if (!isHost(s) || s.phase !== 'match' || !s.peerTally) return 0
  let bits = 0
  for (let round = 0; round < s.peerTally.done; round++)
    if (!s.results.some(r => r.round === round)) bits |= 1 << round
  return bits
}

/**
 * The room flow as a pure reducer: admission, seats, host, `hello` and `sync`, Ready flags
 * and match start. It returns the next state plus messages to send and effects to run.
 */
export function roomStep(
  state: RoomState,
  input: RoomInput,
  now: number,
  env: RoomEnv
): RoomStep {
  const step: Draft = {
    state: { ...state },
    out: [],
    effects: [],
    wantSync: false
  }
  switch (input.type) {
    case 'members':
      onMembers(step, input.event, now)
      break
    case 'status':
      onStatus(step, input.status, now, input.reason)
      break
    case 'msg':
      onMsg(step, input.from, input.msg, now, env)
      break
    case 'ui':
      onUi(step, input.action, now, env)
      break
    case 'lock':
      if (input.state === 'taken') {
        step.state.admission = 'connecting'
        step.state.openedAt = now
      } else {
        step.state.admission = input.state === 'busy' ? 'elsewhere' : 'moved'
        step.effects.push({ type: 'disconnect' })
      }
      break
    case 'tick':
      onTick(step, now, env)
      break
    case 'final':
      onOwnFinal(step, input.round, input.pack, now, env)
      break
    case 'clock':
      if (state.clockSynced === input.synced) break
      step.state.clockSynced = input.synced
      // Ready pressed while the clock was still syncing goes out now.
      if (input.synced && state.myReady && state.phase === 'lobby')
        sendSync(step)
      break
    case 'visible':
      step.state.visible = input.visible
      if (!input.visible) break
      // You couldn't hear while hidden, so the silence count starts again.
      quiet(step.state)
      if (
        state.admission === 'seated' &&
        now - state.lastHelloAt > HELLO_RETRY_MS
      )
        hello(step, now)
      break
    case 'heard':
      if (state.peer?.id === input.from && state.peer.silentMs > 0)
        quiet(step.state)
      break
  }
  if (step.wantSync) {
    step.out.push(syncMsg(step.state, now, env))
    step.state.lastSyncAt = now
  }
  return { state: step.state, out: step.out, effects: step.effects }
}

/** Your neighbour just spoke, or you can hear again: their silence starts from 0. */
function quiet(s: RoomState): void {
  if (s.peer) s.peer = { ...s.peer, silentMs: 0, away: false }
}

function onMembers(step: Draft, event: MemberEvent, now: number): void {
  const s = step.state
  const me = s.me.id
  if (event.type === 'snapshot') {
    s.others = [
      ...new Set(event.members.map(m => m.id).filter(id => id !== me))
    ]
    if (s.peer) setListed(s, s.others.includes(s.peer.id), now)
    if (s.admission !== 'connecting') return
    if (s.others.length === 0) {
      seat(step, [me])
      return
    }
    // Two other players already listed: the room is full, and saying hello would only
    // cost both of them a sync.
    if (s.others.length >= 2) {
      s.admission = 'full'
      step.effects.push({ type: 'disconnect' })
      return
    }
    s.admission = 'checking'
    s.checkingSince = now
    hello(step, now)
    return
  }
  if (event.type === 'added') {
    if (event.member.id === me) return
    if (!s.others.includes(event.member.id))
      s.others = [...s.others, event.member.id]
    if (s.peer?.id === event.member.id) setListed(s, true, now)
    return
  }
  s.others = s.others.filter(id => id !== event.id)
  if (s.peer?.id === event.id) {
    setListed(s, false, now)
    step.effects.push({ type: 'announce', text: `${s.peer.name} left.` })
  }
}

function onStatus(
  step: Draft,
  status: ConnStatus,
  now: number,
  reason?: string
): void {
  const s = step.state
  const was = s.conn
  s.conn = status
  if (status === 'failed') {
    if (
      s.admission === 'connecting' ||
      s.admission === 'checking' ||
      s.admission === 'seated'
    ) {
      s.admission = 'unreachable'
      s.reason = reason ?? 'failed'
    }
    return
  }
  // Back from a dropped connection, whatever the transport called the gap: the silence
  // count restarts, and a hello asks the neighbour for a sync. A first connect has no
  // seat yet; its member snapshot says hello instead.
  if (status === 'connected' && was !== 'connected') {
    quiet(s)
    if (s.admission === 'seated') hello(step, now)
  }
}

function onMsg(
  step: Draft,
  from: string,
  msg: Msg,
  now: number,
  env: RoomEnv
): void {
  const s = step.state
  if (from === s.me.id) return
  switch (msg.k) {
    case 'hello':
      return onHello(step, from, msg.name)
    case 'sync':
      return onSync(step, from, msg, now, env)
    case 'start':
      if (s.admission !== 'seated' || s.seats[0] !== from || s.seats.length < 2)
        return
      return startMatch(step, msg)
    case 'leave':
      return onLeave(step, from)
    case 'final':
      return onTheirFinal(step, from, msg.g, now, env)
    case 'result':
      if (s.phase !== 'match') return
      if (isHost(s)) return adoptVerdict(step, from, msg, now)
      if (s.seats[0] !== from) return
      return applyResult(step, resultFrom(msg))
    case 'throw':
    case 'lawn':
    case 'fist':
      return
  }
}

/**
 * Your neighbour pressed Leave. Mid-match, before Brenda decided it, they stormed off and
 * you win. A decided match plays out its reveal, and the match end then says they left.
 * Outside a match their seat frees at once.
 */
function onLeave(step: Draft, from: string): void {
  const s = step.state
  const peer = s.peer
  if (peer?.id !== from) return
  if (s.phase !== 'match') {
    step.effects.push({ type: 'announce', text: `${peer.name} left.` })
    freeSeat(step)
    return
  }
  if (s.results.some(r => r.over)) {
    step.effects.push({ type: 'announce', text: `${peer.name} left.` })
    return
  }
  s.phase = 'over'
  s.over = {
    reason: 'stormedOff',
    winner: s.me.id,
    peerId: peer.id,
    peerName: peer.name,
    matchId: s.match?.id ?? '',
    summary: null
  }
  s.match = null
  step.effects.push({
    type: 'announce',
    text: `${peer.name} stormed off. You win.`
  })
  freeSeat(step)
}

/**
 * Your garden's final for a round. The host keeps it and judges once the guest's final
 * is in, or at once when the guest has left. The guest sends it now and repeats it every
 * 1s until the verdict comes.
 */
function onOwnFinal(
  step: Draft,
  round: number,
  pack: string,
  now: number,
  env: RoomEnv
): void {
  const s = step.state
  if (s.phase !== 'match' || s.seats.length < 2) return
  if (s.results.some(r => r.round === round)) return
  if (!isHost(s)) {
    s.pendingFinal = { round, pack, sentAt: now }
    step.out.push({ k: 'final', g: pack })
    return
  }
  const held = s.finals.find(f => f.round === round)
  if (held?.mine) return
  const mine = { round, mine: pack, mineAt: now, theirs: held?.theirs ?? null }
  s.finals = [...s.finals.filter(f => f !== held), mine]
  judge(step, round, now, env)
}

/** The guest's final reaches the host: judge with it, or repeat a verdict already given. */
function onTheirFinal(
  step: Draft,
  from: string,
  pack: string,
  now: number,
  env: RoomEnv
): void {
  const s = step.state
  if (!isHost(s) || s.peer?.id !== from || s.phase !== 'match') return
  const round = finalRound(pack)
  if (round < 0) return
  const done = s.results.find(r => r.round === round)
  if (done) {
    step.out.push(resultMsg(done))
    return
  }
  const held = s.finals.find(f => f.round === round)
  s.finals = held
    ? s.finals.map(f => (f === held ? { ...f, theirs: pack } : f))
    : [...s.finals, { round, mine: '', mineAt: Infinity, theirs: pack }]
  missedRound(step, round, now)
  judge(step, round, now, env)
}

/**
 * Host only: the guest still waits for a verdict on `round`, but this page never finished
 * that round (it was closed when the round ended). The session builds this page's final
 * for it, from the guest's copy of the host's lawn or a fresh lawn, caught up to the
 * round's end like a reload during its reveal. During that round's own reveal the page
 * builds its garden and final itself.
 */
function missedRound(step: Draft, round: number, now: number): void {
  const s = step.state
  if (!isHost(s) || s.phase !== 'match') return
  if (s.results.some(r => r.round === round)) return
  if (s.finals.find(f => f.round === round)?.mine) return
  const known = knownTally(s)
  if (known && round < known.done) return
  const phase = matchPhase(s, now)
  if (!phase || (phase.kind !== 'done' && phase.round <= round)) return
  step.effects.push({ type: 'missedFinal', round })
}

/**
 * Host only: the guest hands back a verdict this page lost in a reload, with the guest's
 * own final for drawing its lawn. It applies once, and only for a round this page asked
 * for, so the reveal and the match end show what the guest's screen shows.
 */
function adoptVerdict(
  step: Draft,
  from: string,
  msg: Extract<Msg, { k: 'result' }>,
  now: number
): void {
  const s = step.state
  if (s.peer?.id !== from || !(missingVerdicts(s) & (1 << msg.round))) return
  const peerFinals = [...s.peerFinals]
  peerFinals[msg.round] = msg.gf ?? null
  s.peerFinals = peerFinals
  s.finals = s.finals.filter(f => f.round !== msg.round)
  // Only the verdict on show is news; older ones were announced before the reload.
  const phase = matchPhase(s, now)
  const onShow = phase?.kind === 'reveal' && phase.round === msg.round
  // The guest's lawn draws from `peerFinals` here, whoever built it.
  applyResult(step, { ...resultFrom(msg), guestFinal: null }, onShow)
}

/**
 * Host only: scores a round once both finals are in, the guest has left, or 6s passed
 * since the host's own final. An Away guest still on the member list gets the whole 6s,
 * since a hidden tab still sends its final. A missing final is replaced by the guest's
 * lawn rebuilt and caught up to the round's end, which the verdict carries so both
 * screens draw it. A round the guest already knows a verdict for (from before this page
 * reloaded) is never judged again.
 */
function judge(step: Draft, round: number, now: number, env: RoomEnv): void {
  const s = step.state
  const held = s.finals.find(f => f.round === round)
  if (!held?.mine || s.results.some(r => r.round === round)) return
  const known = knownTally(s)
  if (known && round < known.done) {
    s.finals = s.finals.filter(f => f !== held)
    return
  }
  const waited = now - held.mineAt >= FINAL_WAIT_MS
  if (!held.theirs && !waited && s.peer?.listed) return
  const rebuilt = held.theirs ? null : env.peerFinal(round)
  const theirs = held.theirs ?? rebuilt
  const judged = judgeRound(round, held.mine, theirs, known ?? undefined)
  if (!judged) return
  const result = rebuilt ? { ...judged, guestFinal: rebuilt } : judged
  s.finals = s.finals.filter(f => f !== held)
  const peerFinals = [...s.peerFinals]
  peerFinals[round] = theirs
  s.peerFinals = peerFinals
  applyResult(step, result)
  step.out.push(resultMsg(result))
}

/** Applies a round's verdict once per match and round, announcing it unless `announce` is false. */
function applyResult(step: Draft, result: RoundResult, announce = true): void {
  const s = step.state
  if (s.results.some(r => r.round === result.round)) return
  s.results = [...s.results, result].sort((a, b) => a.round - b.round)
  if (s.pendingFinal?.round === result.round) s.pendingFinal = null
  step.effects.push({ type: 'result', round: result.round })
  if (!announce) return
  const them = s.peer?.name ?? 'Your neighbour'
  const host = isHost(s)
  let text = roundLine(result.winner, result.round, host, them)
  const match = matchResult(result.tally, result.totals, result.round + 1)
  if (result.over && match.winner)
    text += ` ${matchLine(match.winner, host, them)}`
  step.effects.push({ type: 'announce', text })
}

/**
 * A hello means a page loaded, showed again or reconnected. Its Ready and Rematch reset
 * until its own `sync` says otherwise, so a reload never inherits the old page's Ready.
 */
function onHello(step: Draft, from: string, name: string): void {
  const s = step.state
  if (s.admission !== 'seated') return
  if (s.seats.includes(from)) {
    if (s.peer?.id === from)
      s.peer = {
        ...s.peer,
        name,
        listed: true,
        unlistedSince: -1,
        ready: false,
        rematch: false,
        silentMs: 0,
        away: false
      }
  } else if (s.seats.length < 2) {
    seat(step, [...s.seats, from], name)
    step.effects.push({ type: 'announce', text: `${name} joined.` })
  }
  // Every hello gets a sync. A newcomer to a full room learns from its seats.
  sendSync(step)
}

function onSync(
  step: Draft,
  from: string,
  msg: Extract<Msg, { k: 'sync' }>,
  now: number,
  env: RoomEnv
): void {
  const s = step.state
  const me = s.me.id
  const listsMe = msg.seats.includes(me)
  const wasChecking = s.admission === 'checking'
  if (wasChecking) {
    if (!listsMe && msg.seats.length >= 2) {
      s.admission = 'full'
      step.effects.push({ type: 'disconnect' })
      return
    }
    seat(
      step,
      [...msg.seats, me],
      msg.seats.includes(from) ? msg.name : undefined
    )
  } else if (s.admission !== 'seated') {
    return
  } else if (!s.seats.includes(from)) {
    // Someone we haven't seated yet, who already seated us.
    if (s.seats.length < 2 && (listsMe || msg.seats.length < 2))
      seat(step, [...s.seats, from], msg.name)
    else return
  }
  if (msg.seats.length >= 2 && !listsMe) {
    // They seated someone else: our seat with them doesn't exist.
    s.admission = 'full'
    step.effects.push({ type: 'disconnect' })
    return
  }
  if (!listsMe && now - s.lastHelloAt > HELLO_RETRY_MS) hello(step, now)
  applyPeerFlags(step, msg)
  followPeerMatch(step, from, msg, now)
  followVerdicts(step, from, msg, now, env)
  // Just seated after a reload: your flags and phase go straight back.
  if (wasChecking && s.seats.length === 2) sendSync(step)
  // A guest still in the lobby lost the start and every sync before play; once play
  // runs nothing repeats them, so its lobby sync gets the match back.
  const phase = matchPhase(s, now)
  if (isHost(s) && msg.phase === 'lobby' && phase && phase.kind !== 'done')
    sendSync(step)
  maybeStart(step, now, env)
}

/**
 * What a neighbour's `sync` says about the match: the host's new match for the guest, a
 * running match for a host page that reloaded, the verdicts so far, how the match ended
 * for a page that missed it, and their copy of your lawn for a reload rebuild.
 */
function followPeerMatch(
  step: Draft,
  from: string,
  msg: Extract<Msg, { k: 'sync' }>,
  now: number
): void {
  const s = step.state
  const theirs = msg.match
  if (theirs && msg.phase === 'match' && s.match?.id !== theirs.id) {
    if (s.seats[0] === from) startMatch(step, { k: 'start', ...theirs })
    // A host page that never saw a match (it reloaded) takes the guest's back, unless
    // that match has already run out.
    else if (
      isHost(s) &&
      !s.matchSeen &&
      s.phase === 'lobby' &&
      matchPhaseAt(theirs, now, decidedRound(msg)).kind !== 'done'
    )
      startMatch(step, { k: 'start', ...theirs })
  }
  if (
    theirs &&
    theirs.id === s.match?.id &&
    msg.tally &&
    msg.totals &&
    msg.done !== undefined
  )
    s.peerTally = { done: msg.done, tally: msg.tally, totals: msg.totals }
  const over = msg.over
  if (
    over &&
    ((s.phase === 'match' && s.match?.id === over.m) ||
      (s.phase === 'lobby' && !s.matchSeen && theirs?.id === over.m))
  )
    adoptOver(step, from, msg, over)
  // A guest left waiting for the deciding verdict, whose host has moved on to the lobby.
  if (
    s.phase === 'match' &&
    msg.phase === 'lobby' &&
    s.seats[0] === from &&
    matchPhase(s, now)?.kind === 'done'
  )
    endMatch(step)
  if (
    msg.copy !== undefined &&
    msg.copyAt !== undefined &&
    s.phase === 'match' &&
    s.match &&
    theirs?.id === s.match.id
  )
    step.effects.push({
      type: 'copy',
      match: s.match.id,
      pack: msg.copy,
      at: msg.copyAt
    })
}

/**
 * Mends verdicts a page lost while it was closed. A guest hands a host the verdicts its
 * `sync` asks for. A host hears which round the guest still waits on, and builds its own
 * final for it when this page never finished that round.
 */
function followVerdicts(
  step: Draft,
  from: string,
  msg: Extract<Msg, { k: 'sync' }>,
  now: number,
  env: RoomEnv
): void {
  const s = step.state
  if (s.phase !== 'match' || !s.match || msg.match?.id !== s.match.id) return
  if (msg.need && !isHost(s) && s.seats[0] === from)
    for (const r of s.results) {
      if (!(msg.need & (1 << r.round))) continue
      // The guest lawn Brenda judged: the host's rebuild of it, else this page's own final.
      const gf = r.guestFinal ?? env.myFinal(r.round)
      step.out.push(gf ? { ...resultMsg(r), gf } : resultMsg(r))
    }
  if (msg.wait !== undefined && isHost(s) && s.peer?.id === from) {
    if (msg.waitCopy !== undefined && msg.waitCopyAt !== undefined)
      step.effects.push({
        type: 'copy',
        match: s.match.id,
        pack: msg.waitCopy,
        at: msg.waitCopyAt
      })
    missedRound(step, msg.wait, now)
  }
}

/** The round a neighbour's tally says ends the match: the deciding one, else the last. */
function decidedRound(msg: Extract<Msg, { k: 'sync' }>): number {
  const done = msg.done ?? 0
  if (done > 0 && msg.tally && msg.totals)
    if (matchResult(msg.tally, msg.totals, done).over) return done - 1
  return ROUNDS - 1
}

/** Your neighbour's `sync` says how the match you missed ended: show it. */
function adoptOver(
  step: Draft,
  from: string,
  msg: Extract<Msg, { k: 'sync' }>,
  over: OverMsg
): void {
  const s = step.state
  const winner = over.w === '' ? null : over.w
  const decided = s.results.some(r => r.over)
  s.phase = 'over'
  if (!s.match && msg.match) s.match = msg.match
  s.matchSeen = true
  s.myReady = false
  s.myRematch = false
  s.over = {
    reason: over.r,
    winner,
    peerId: from,
    peerName: msg.name,
    matchId: over.m,
    summary:
      decided || !msg.tally || !msg.totals
        ? null
        : { tally: msg.tally, totals: msg.totals }
  }
  const text =
    over.r === 'noContest'
      ? 'The line went dead. Nobody wins.'
      : over.r === 'walkover'
        ? winner === s.me.id
          ? `${msg.name} didn't come back. You win.`
          : `You didn't come back in time. ${msg.name} wins.`
        : winner === null
          ? "Brenda can't choose. She's calling the council."
          : winner === s.me.id
            ? 'You win the match.'
            : `${msg.name} wins the match.`
  step.effects.push({ type: 'announce', text })
}

function applyPeerFlags(step: Draft, msg: Extract<Msg, { k: 'sync' }>): void {
  const peer = step.state.peer
  if (!peer) return
  if (msg.ready && !peer.ready && step.state.phase === 'lobby')
    step.effects.push({ type: 'announce', text: `${msg.name} is ready.` })
  if (msg.rematch && !peer.rematch && step.state.phase === 'over')
    step.effects.push({
      type: 'announce',
      text: `${msg.name} wants a rematch.`
    })
  step.state.peer = {
    ...peer,
    name: msg.name,
    ready: msg.ready,
    rematch: msg.rematch
  }
}

function onUi(
  step: Draft,
  action: Extract<RoomInput, { type: 'ui' }>['action'],
  now: number,
  env: RoomEnv
): void {
  const s = step.state
  switch (action) {
    case 'ready':
    case 'unready':
      if (s.phase !== 'lobby') return
      s.myReady = action === 'ready'
      sendSync(step)
      maybeStart(step, now, env)
      return
    case 'rematch':
      if (
        s.phase !== 'over' ||
        (s.over?.reason !== 'score' && s.over?.reason !== 'noContest')
      )
        return
      s.myRematch = true
      sendSync(step)
      maybeStart(step, now, env)
      return
    case 'lobby':
      if (s.phase !== 'over') return
      s.phase = 'lobby'
      s.match = null
      s.over = null
      s.myReady = false
      s.myRematch = false
      sendSync(step)
      return
    case 'leave':
      step.out.push({ k: 'leave' })
      step.effects.push({ type: 'disconnect' })
      return
    case 'tryAgain':
      s.admission = 'connecting'
      s.reason = ''
      s.openedAt = now
      s.seats = []
      s.peer = null
      step.effects.push({ type: 'reconnect' })
      return
  }
}

function onTick(step: Draft, now: number, env: RoomEnv): void {
  const s = step.state
  if (
    s.admission === 'connecting' &&
    s.conn !== 'connected' &&
    now - s.openedAt > CONNECT_LIMIT_MS
  ) {
    s.admission = 'unreachable'
    s.reason = 'timeout'
    step.effects.push({ type: 'disconnect' })
    return
  }
  if (s.admission === 'checking' && now - s.checkingSince > CHECK_LIMIT_MS) {
    if (s.others.length <= 1) {
      seat(step, [s.me.id])
      hello(step, now)
    } else {
      s.admission = 'full'
      step.effects.push({ type: 'disconnect' })
    }
    return
  }
  if (s.admission !== 'seated') return
  // Alone in a seat while someone else is listed: a lost hello must not strand you both.
  if (
    s.seats.length < 2 &&
    s.others.length > 0 &&
    now - s.lastHelloAt >= SYNC_EVERY_MS
  )
    hello(step, now)
  if (
    s.peer &&
    !s.peer.listed &&
    !seatLocked(s) &&
    now - s.peer.unlistedSince > SEAT_FREE_MS
  )
    freeSeat(step)
  listen(step, now)
  if (s.phase === 'match' && s.match) {
    if (presenceEnds(step, now)) return
    // A guest still missing the deciding verdict keeps asking for it before the end shows.
    const decided = s.results.some(r => r.over) || !s.peer?.listed
    if (matchPhase(s, now)?.kind === 'done' && decided) endMatch(step)
    else finalsStep(step, now, env)
  }
  if (bothPresent(s) && !inPlay(s, now) && now - s.lastSyncAt >= SYNC_EVERY_MS)
    sendSync(step)
  maybeStart(step, now, env)
}

/**
 * True while your neighbour's seat stays theirs however long they're away: through a
 * match, and on the match end of a walkover they lost by not coming back, so they see
 * the result when they return.
 */
function seatLocked(s: RoomState): boolean {
  if (s.phase === 'match') return true
  return (
    s.phase === 'over' &&
    s.over?.reason === 'walkover' &&
    s.over.peerId === s.peer?.id
  )
}

/**
 * Counts your neighbour's silence while you can hear them, and marks them Away once it
 * reaches 3s in play or 6s outside it. A tick adds at most 1s, so a frozen tab that wakes
 * up doesn't count its own nap.
 */
function listen(step: Draft, now: number): void {
  const s = step.state
  const dt = Math.min(MAX_TICK_MS, Math.max(0, now - s.lastTickAt))
  s.lastTickAt = now
  const peer = s.peer
  if (!peer || !peer.listed || !hearing(s)) return
  const silentMs = peer.silentMs + dt
  const away = silentMs >= (inPlay(s, now) ? AWAY_PLAY_MS : AWAY_MS)
  s.peer = { ...peer, silentMs, away }
}

/**
 * Ends an undecided match when your neighbour can't come back: off the member list for
 * 60s while your own line is up is a walkover to you; listed but silent for 60s of
 * hearing time is a no contest. Returns true when the match ended.
 */
function presenceEnds(step: Draft, now: number): boolean {
  const s = step.state
  const peer = s.peer
  if (!peer || !s.match || s.results.some(r => r.over)) return false
  const gone =
    !peer.listed &&
    s.conn === 'connected' &&
    now - peer.unlistedSince >= GONE_MS
  const dead = peer.listed && peer.silentMs >= DEAD_MS
  if (!gone && !dead) return false
  s.phase = 'over'
  s.myReady = false
  s.myRematch = false
  s.over = {
    reason: gone ? 'walkover' : 'noContest',
    winner: gone ? s.me.id : null,
    peerId: peer.id,
    peerName: peer.name,
    matchId: s.match.id,
    summary: null
  }
  step.effects.push({
    type: 'announce',
    text: gone
      ? `${peer.name} didn't come back. You win.`
      : 'The line went dead. Nobody wins.'
  })
  // If they can still hear you, they learn the result at once.
  sendSync(step)
  return true
}

/** The guest repeats its final every 1s; the host judges rounds whose 6s wait ran out. */
function finalsStep(step: Draft, now: number, env: RoomEnv): void {
  const s = step.state
  const pending = s.pendingFinal
  // Nobody hears a repeat while the host is off the member list; its return asks again.
  if (
    pending &&
    !isHost(s) &&
    s.peer?.listed &&
    now - pending.sentAt >= FINAL_REPEAT_MS
  ) {
    s.pendingFinal = { ...pending, sentAt: now }
    step.out.push({ k: 'final', g: pending.pack })
  }
  if (isHost(s)) for (const f of s.finals) judge(step, f.round, now, env)
}

/** True while a round's play is running. */
export function inPlay(state: RoomState, now: number): boolean {
  return state.phase === 'match' && matchPhase(state, now)?.kind === 'play'
}

/** True when you want the next match: Ready in the lobby, or Rematch at the match end. */
function iWantToPlay(s: RoomState): boolean {
  return s.phase === 'lobby' ? s.myReady : s.phase === 'over' && s.myRematch
}

/**
 * Host only: starts a match once both players want one. Ready and Rematch count the same,
 * so a neighbour who reloaded into the lobby can still meet you at the match end.
 */
function maybeStart(step: Draft, now: number, env: RoomEnv): void {
  const s = step.state
  const peer = s.peer
  if (
    !isHost(s) ||
    !iWantToPlay(s) ||
    !peer?.listed ||
    !(peer.ready || peer.rematch)
  )
    return
  const match: MatchInfo = {
    id: env.newMatchId(),
    seed: env.newSeed(),
    at: Math.round(now + START_LEAD_MS),
    ...matchTimings(env.fast)
  }
  step.out.push({ k: 'start', ...match })
  startMatch(step, { k: 'start', ...match })
  sendSync(step)
}

function startMatch(step: Draft, msg: Extract<Msg, { k: 'start' }>): void {
  const s = step.state
  const { k: _kind, ...match } = msg
  if (s.match?.id === match.id || s.phase === 'match') return
  s.match = match
  s.phase = 'match'
  s.matchSeen = true
  s.over = null
  s.myReady = false
  s.myRematch = false
  s.results = []
  s.finals = []
  s.pendingFinal = null
  s.peerTally = null
  s.peerFinals = []
  if (s.peer) s.peer = { ...s.peer, ready: false, rematch: false }
  step.effects.push({ type: 'matchStarted' })
}

/**
 * The last reveal is over: the match end screen takes over. The match stays in state, so
 * the screen can draw the last round's lawns, until a rematch or Back to Lobby.
 */
function endMatch(step: Draft): void {
  const s = step.state
  const decided = s.results.find(r => r.over)
  const winner = decided
    ? matchResult(decided.tally, decided.totals, decided.round + 1).winner
    : null
  s.phase = 'over'
  s.over = {
    reason: 'score',
    winner:
      winner === 'h'
        ? (s.seats[0] ?? null)
        : winner === 'g'
          ? (s.seats[1] ?? null)
          : null,
    peerId: s.peer?.id ?? '',
    peerName: s.peer?.name ?? 'Your neighbour',
    matchId: s.match?.id ?? '',
    summary: null
  }
  s.myReady = false
  s.myRematch = false
}

function seat(step: Draft, ids: string[], peerName?: string): void {
  const s = step.state
  const seats = [...new Set(ids)].sort().slice(0, 2)
  const before = s.seats.join()
  s.seats = seats
  s.admission = 'seated'
  const peerId = seats.find(id => id !== s.me.id)
  if (peerId && s.peer?.id !== peerId) {
    s.peer = {
      id: peerId,
      name: peerName ?? 'Neighbour',
      listed: s.others.includes(peerId),
      unlistedSince: s.others.includes(peerId) ? -1 : s.lastTickAt,
      ready: false,
      rematch: false,
      silentMs: 0,
      away: false
    }
  } else if (peerId && s.peer && peerName) {
    s.peer = { ...s.peer, name: peerName }
  }
  if (seats.join() !== before && seats.length === 2)
    step.effects.push({ type: 'role', host: seats[0] === s.me.id })
}

function freeSeat(step: Draft): void {
  const s = step.state
  s.seats = [s.me.id]
  s.peer = null
  s.myReady = false
  s.myRematch = false
}

/** Marks your neighbour on or off the member list. Leaving clears their Ready and Rematch. */
function setListed(s: RoomState, listed: boolean, now: number): void {
  const peer = s.peer
  if (!peer || peer.listed === listed) return
  s.peer = listed
    ? { ...peer, listed, unlistedSince: -1 }
    : { ...peer, listed, unlistedSince: now, ready: false, rematch: false }
}

/** Says hello. A page seated with its neighbour sends its `sync` too, so its flags stand. */
function hello(step: Draft, now: number): void {
  step.state.lastHelloAt = now
  step.out.push({ k: 'hello', name: step.state.me.name })
  if (step.state.seats.length === 2) sendSync(step)
}

function sendSync(step: Draft): void {
  step.wantSync = true
}
