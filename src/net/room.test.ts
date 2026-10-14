import { describe, expect, it } from 'vitest'

import { dryAll } from '../game/cheats'
import { Garden } from '../game/garden'
import { finalReport, lawnReport } from '../game/report'
import { encodeFinal } from './finalCodec'
import { encodeLawn } from './lawnCodec'
import type { Msg } from './protocol'
import {
  AWAY_MS,
  AWAY_PLAY_MS,
  DEAD_MS,
  FINAL_WAIT_MS,
  GONE_MS,
  hostSide,
  initialRoom,
  isHost,
  lastRound,
  matchPhase,
  decidedMatchEnd,
  peerHere,
  peerYard,
  roomStep,
  SEAT_FREE_MS,
  syncMsg,
  tallyOf,
  type RoomEnv,
  type RoomInput,
  type RoomState
} from './room'

const env: RoomEnv = {
  newMatchId: () => 'mtch01',
  newSeed: () => 1234,
  fast: false,
  peerLawn: () => null,
  peerFinal: () => null,
  myFinal: () => null,
  newPlayer: () => false,
  yardStep: () => 0
}

/** A player whose reducer runs over a fake room where every message reaches everyone. */
class Player {
  state: RoomState
  outbox: Msg[] = []
  effects: string[] = []
  env: RoomEnv = env
  constructor(
    readonly id: string,
    now = 0
  ) {
    this.state = {
      ...initialRoom({ id, name: `P-${id.slice(0, 3)}` }, 'link', now),
      clockSynced: true
    }
  }
  input(input: RoomInput, now: number): void {
    const step = roomStep(this.state, input, now, this.env)
    this.state = step.state
    this.outbox.push(...step.out)
    this.effects.push(...step.effects.map(e => e.type))
  }
}

class Room {
  readonly players: Player[] = []
  now = 0
  /** Messages for which this returns true never arrive. */
  lose: (msg: Msg) => boolean = () => false
  /** Players whose lawn beats stop, like a hidden tab's. Everyone else beats every tick. */
  readonly quiet = new Set<string>()

  join(id: string): Player {
    const p = new Player(id, this.now)
    const listed = this.players.map(o => ({ id: o.id, name: o.state.me.name }))
    this.players.push(p)
    for (const other of this.players)
      if (other !== p)
        other.input(
          {
            type: 'members',
            event: { type: 'added', member: { id, name: '' } }
          },
          this.now
        )
    p.input({ type: 'status', status: 'connected' }, this.now)
    p.input(
      {
        type: 'members',
        event: { type: 'snapshot', members: [...listed, { id, name: '' }] }
      },
      this.now
    )
    this.flush()
    return p
  }

  drop(p: Player): void {
    this.players.splice(this.players.indexOf(p), 1)
    for (const other of this.players)
      other.input(
        { type: 'members', event: { type: 'removed', id: p.id } },
        this.now
      )
  }

  /** Delivers every queued message until the room goes quiet. */
  flush(): void {
    for (let guard = 0; guard < 20; guard++) {
      let moved = false
      for (const p of this.players) {
        const out = p.outbox.splice(0)
        for (const msg of out) {
          moved = true
          if (this.lose(msg)) continue
          for (const other of this.players)
            if (other !== p) {
              other.input({ type: 'heard', from: p.id }, this.now)
              other.input({ type: 'msg', from: p.id, msg }, this.now)
            }
        }
      }
      if (!moved) return
    }
  }

  advance(ms: number): void {
    const end = this.now + ms
    while (this.now < end) {
      this.now = Math.min(end, this.now + 250)
      for (const p of this.players)
        if (!this.quiet.has(p.id))
          for (const other of this.players)
            if (other !== p)
              other.input({ type: 'heard', from: p.id }, this.now)
      for (const p of this.players) p.input({ type: 'tick' }, this.now)
      this.flush()
    }
  }
}

describe('room reducer', () => {
  it('seats the first two players and makes the lower id host', () => {
    const room = new Room()
    const b = room.join('bbbbbbbb')
    const a = room.join('aaaaaaaa')
    expect(b.state.seats).toEqual(['aaaaaaaa', 'bbbbbbbb'])
    expect(a.state.seats).toEqual(['aaaaaaaa', 'bbbbbbbb'])
    expect(isHost(a.state)).toBe(true)
    expect(isHost(b.state)).toBe(false)
    expect(a.state.admission).toBe('seated')
  })

  it('shows Room Full to a third visitor at once, without a word to the room', () => {
    const room = new Room()
    const a = room.join('aaaaaaaa')
    const b = room.join('bbbbbbbb')
    const c = new Player('cccccccc')
    c.input({ type: 'status', status: 'connected' }, room.now)
    c.input(
      {
        type: 'members',
        event: {
          type: 'snapshot',
          members: [a, b, c].map(p => ({ id: p.id, name: '' }))
        }
      },
      room.now
    )
    expect(c.state.admission).toBe('full')
    expect(c.effects).toContain('disconnect')
    expect(c.outbox).toEqual([])
    expect(a.state.seats).toEqual(['aaaaaaaa', 'bbbbbbbb'])
  })

  it('says hello again after any drop, whatever the transport called the gap', () => {
    const room = new Room()
    const a = room.join('aaaaaaaa')
    room.join('bbbbbbbb')
    for (const gap of ['connecting', 'reconnecting'] as const) {
      a.input({ type: 'status', status: gap }, room.now)
      a.input({ type: 'status', status: 'connected' }, room.now + 2000)
      expect(a.outbox.splice(0).map(m => m.k)).toEqual(['hello', 'sync'])
    }
  })

  it('keeps seats and host when the guest reloads', () => {
    const room = new Room()
    const a = room.join('aaaaaaaa')
    const b = room.join('bbbbbbbb')
    room.drop(b)
    room.advance(2000)
    const b2 = room.join('bbbbbbbb')
    expect(b2.state.admission).toBe('seated')
    expect(b2.state.seats).toEqual(['aaaaaaaa', 'bbbbbbbb'])
    expect(isHost(a.state)).toBe(true)
  })

  it('keeps the host when the host reloads', () => {
    const room = new Room()
    const a = room.join('aaaaaaaa')
    room.join('bbbbbbbb')
    room.drop(a)
    const a2 = room.join('aaaaaaaa')
    expect(isHost(a2.state)).toBe(true)
  })

  it('frees a seat after 10s off the member list, only in the lobby', () => {
    const room = new Room()
    const a = room.join('aaaaaaaa')
    const b = room.join('bbbbbbbb')
    room.drop(b)
    room.advance(SEAT_FREE_MS - 500)
    expect(a.state.seats).toHaveLength(2)
    room.advance(1000)
    expect(a.state.seats).toEqual(['aaaaaaaa'])
    const c = room.join('cccccccc')
    expect(c.state.admission).toBe('seated')
  })

  it('answers every hello with a sync', () => {
    const room = new Room()
    const a = room.join('aaaaaaaa')
    room.join('bbbbbbbb')
    a.input(
      { type: 'msg', from: 'bbbbbbbb', msg: { k: 'hello', name: 'B' } },
      room.now
    )
    expect(a.outbox.map(m => m.k)).toEqual(['sync'])
  })

  it('seats two newcomers who arrive together after the 3s wait', () => {
    const room = new Room()
    const a = new Player('aaaaaaaa')
    const b = new Player('bbbbbbbb')
    room.players.push(a, b)
    for (const p of [a, b]) {
      p.input({ type: 'status', status: 'connected' }, 0)
      p.input(
        {
          type: 'members',
          event: {
            type: 'snapshot',
            members: [
              { id: 'aaaaaaaa', name: '' },
              { id: 'bbbbbbbb', name: '' }
            ]
          }
        },
        0
      )
    }
    room.flush()
    expect(a.state.admission).toBe('checking')
    room.advance(4000)
    expect(a.state.seats).toEqual(['aaaaaaaa', 'bbbbbbbb'])
    expect(b.state.seats).toEqual(['aaaaaaaa', 'bbbbbbbb'])
  })

  it('finds each other when both players seated alone after lost hellos', () => {
    const room = new Room()
    const a = new Player('aaaaaaaa')
    const b = new Player('bbbbbbbb')
    const both = [
      { id: 'aaaaaaaa', name: '' },
      { id: 'bbbbbbbb', name: '' }
    ]
    for (const p of [a, b]) {
      p.input({ type: 'status', status: 'connected' }, 0)
      p.input(
        { type: 'members', event: { type: 'snapshot', members: both } },
        0
      )
      p.input({ type: 'tick' }, 3500)
      // Every hello so far was lost.
      p.outbox.length = 0
    }
    expect(a.state.seats).toEqual(['aaaaaaaa'])
    room.players.push(a, b)
    room.now = 3500
    room.advance(2500)
    expect(a.state.seats).toEqual(['aaaaaaaa', 'bbbbbbbb'])
    expect(b.state.seats).toEqual(['aaaaaaaa', 'bbbbbbbb'])
  })

  it('starts one match when both press Ready, and a late guest joins it', () => {
    const room = new Room()
    const a = room.join('aaaaaaaa')
    const b = room.join('bbbbbbbb')
    a.input({ type: 'ui', action: 'ready' }, room.now)
    room.flush()
    expect(a.state.phase).toBe('lobby')
    b.input({ type: 'ui', action: 'ready' }, room.now)
    room.flush()
    expect(a.state.phase).toBe('match')
    expect(b.state.match).toEqual(a.state.match)
    room.advance(5000)
    expect(a.effects.filter(e => e === 'matchStarted')).toHaveLength(1)

    room.drop(b)
    const b2 = room.join('bbbbbbbb')
    expect(b2.state.phase).toBe('match')
    expect(b2.state.match?.id).toBe('mtch01')
  })

  it('hands the match to a guest that lost the start and every sync before play', () => {
    const room = new Room()
    const a = room.join('aaaaaaaa')
    const b = room.join('bbbbbbbb')
    room.lose = msg =>
      msg.k === 'start' || (msg.k === 'sync' && msg.phase !== 'lobby')
    a.input({ type: 'ui', action: 'ready' }, room.now)
    b.input({ type: 'ui', action: 'ready' }, room.now)
    room.advance(6000)
    expect(matchPhase(a.state, room.now)?.kind).toBe('play')
    expect(b.state.phase).toBe('lobby')
    room.lose = () => false
    room.advance(2500)
    expect(b.state.match).toEqual(a.state.match)
    expect(matchPhase(b.state, room.now)?.kind).toBe('play')
  })

  it("holds back a guest's Ready until its clock agrees with the host's", () => {
    const room = new Room()
    const a = room.join('aaaaaaaa')
    const b = room.join('bbbbbbbb')
    b.input({ type: 'clock', synced: false }, room.now)
    a.input({ type: 'ui', action: 'ready' }, room.now)
    b.input({ type: 'ui', action: 'ready' }, room.now)
    room.flush()
    expect(b.state.myReady).toBe(true)
    expect(a.state.peer?.ready).toBe(false)
    expect(a.state.phase).toBe('lobby')
    b.input({ type: 'clock', synced: true }, room.now)
    room.flush()
    expect(a.state.phase).toBe('match')
  })

  it('gives up connecting after 8s', () => {
    const p = new Player('aaaaaaaa')
    p.input({ type: 'tick' }, 9000)
    expect(p.state.admission).toBe('unreachable')
    expect(p.state.reason).toBe('timeout')
  })
})

/** A final pack for round `round` of a garden on `seed`, dried by `dry` health everywhere. */
function finalOf(seed: number, round: number, dry = 0): string {
  const garden = new Garden({ seed, round, calm: true })
  dryAll(garden, dry)
  return encodeFinal(finalReport(garden))
}

/** Two seated players in a match, host `a` and guest `b`. */
function inMatch(): { room: Room; a: Player; b: Player } {
  const room = new Room()
  const a = room.join('aaaaaaaa')
  const b = room.join('bbbbbbbb')
  a.input({ type: 'ui', action: 'ready' }, room.now)
  b.input({ type: 'ui', action: 'ready' }, room.now)
  room.flush()
  return { room, a, b }
}

describe('finals and verdicts', () => {
  it('judges a round once from both finals, the same on both screens', () => {
    const { room, a, b } = inMatch()
    b.input({ type: 'final', round: 0, pack: finalOf(7, 0, 2) }, room.now)
    room.flush()
    expect(a.state.results).toHaveLength(0)
    a.input({ type: 'final', round: 0, pack: finalOf(7, 0) }, room.now)
    room.flush()
    expect(a.state.results).toHaveLength(1)
    expect(b.state.results).toEqual(a.state.results)
    const [result] = a.state.results
    expect(result?.scores[0].total).toBe(53)
    expect(result?.winner).toBe('h')
    expect(tallyOf(b.state)).toEqual([1, 0])
    // A repeated final gets the same verdict, and it applies only once.
    b.input({ type: 'final', round: 0, pack: finalOf(7, 0, 2) }, room.now)
    room.flush()
    expect(b.state.results).toHaveLength(1)
    expect(b.effects.filter(e => e === 'result')).toHaveLength(1)
  })

  it('repeats the guest final every 1s until a lost verdict gets through', () => {
    const { room, a, b } = inMatch()
    let lost = 0
    room.lose = msg => msg.k === 'result' && lost++ < 2
    a.input({ type: 'final', round: 0, pack: finalOf(3, 0) }, room.now)
    b.input({ type: 'final', round: 0, pack: finalOf(3, 0, 1) }, room.now)
    room.flush()
    expect(b.state.results).toHaveLength(0)
    room.advance(2600)
    expect(b.state.results).toEqual(a.state.results)
    expect(b.state.pendingFinal).toBeNull()
  })

  it("judges the guest's rebuilt lawn 6s after the host's own final, and both screens draw it", () => {
    const { room, a, b } = inMatch()
    const rebuilt = finalOf(5, 0, 3)
    a.env = { ...env, peerFinal: () => rebuilt }
    room.lose = msg => msg.k === 'final'
    a.input({ type: 'final', round: 0, pack: finalOf(5, 0) }, room.now)
    b.input({ type: 'final', round: 0, pack: finalOf(5, 0) }, room.now)
    room.advance(FINAL_WAIT_MS - 500)
    expect(a.state.results).toHaveLength(0)
    room.advance(1000)
    expect(a.state.results[0]?.scores[1].green).toBe(14)
    expect(a.state.peerFinals[0]).toBe(rebuilt)
    expect(b.state.results).toEqual(a.state.results)
    expect(b.state.results[0]?.guestFinal).toBe(rebuilt)
  })

  it('waits the whole 6s for an Away guest that is still listed', () => {
    const { room, a, b } = inPlay()
    a.env = { ...env, peerFinal: () => finalOf(6, 0, 3) }
    room.quiet.add(b.id)
    room.advance(AWAY_PLAY_MS + 500)
    expect(a.state.peer?.away).toBe(true)
    a.input({ type: 'final', round: 0, pack: finalOf(6, 0) }, room.now)
    room.advance(FINAL_WAIT_MS - 1000)
    expect(a.state.results).toHaveLength(0)
    // A hidden tab's timer still sends its final, and Brenda judges that one.
    b.input({ type: 'final', round: 0, pack: finalOf(6, 0, 1) }, room.now)
    room.flush()
    expect(a.state.results[0]?.guestFinal).toBeNull()
    expect(a.state.results[0]?.scores[1].green).toBe(29)
  })

  it('judges at once from the rebuilt lawn when the guest has left the room', () => {
    const { room, a, b } = inMatch()
    let asked = -1
    a.env = { ...env, peerFinal: round => ((asked = round), finalOf(9, 0, 2)) }
    room.drop(b)
    a.input({ type: 'final', round: 0, pack: finalOf(9, 0) }, room.now)
    expect(asked).toBe(0)
    expect(a.state.results[0]?.scores[1].green).toBe(21)
    expect(a.state.results[0]?.winner).toBe('h')
  })

  it('ends the match after the round that gives someone 2 wins', () => {
    const { room, a, b } = inMatch()
    for (const round of [0, 1]) {
      a.input({ type: 'final', round, pack: finalOf(4, round) }, room.now)
      b.input({ type: 'final', round, pack: finalOf(4, round, 2) }, room.now)
      room.flush()
    }
    expect(a.state.results[1]?.over).toBe(true)
    expect(lastRound(b.state)).toBe(1)
    const match = a.state.match
    if (!match) throw new Error('no match')
    const afterRound2 = match.at + 2 * match.roundMs + match.revealMs + 100
    expect(matchPhase(b.state, afterRound2)).toMatchObject({
      kind: 'reveal',
      round: 1,
      last: true
    })
  })
})

/** An env that hands out a new match id and seed for every match, with `?fast` timings. */
function countingEnv(): RoomEnv {
  let n = 0
  return {
    ...env,
    fast: true,
    newMatchId: () => `mtch0${++n}`,
    newSeed: () => 1000 + n
  }
}

/** A `?fast` match the host wins 2 rounds to 0, played on to its match end screen. */
function finishedMatch(): { room: Room; a: Player; b: Player } {
  const room = new Room()
  const a = room.join('aaaaaaaa')
  const b = room.join('bbbbbbbb')
  a.env = b.env = countingEnv()
  a.input({ type: 'ui', action: 'ready' }, room.now)
  b.input({ type: 'ui', action: 'ready' }, room.now)
  room.flush()
  for (const round of [0, 1]) {
    a.input({ type: 'final', round, pack: finalOf(4, round) }, room.now)
    b.input({ type: 'final', round, pack: finalOf(4, round, 2) }, room.now)
    room.flush()
  }
  room.advance(120_000)
  return { room, a, b }
}

describe('match end, rematch and leave', () => {
  it('shows the match end after the last reveal, then rematches with a new id and seed', () => {
    const { room, a, b } = finishedMatch()
    for (const p of [a, b]) {
      expect(p.state.phase).toBe('over')
      expect(p.state.over).toMatchObject({
        reason: 'score',
        winner: 'aaaaaaaa'
      })
    }
    const first = a.state.match
    a.input({ type: 'ui', action: 'rematch' }, room.now)
    room.flush()
    expect(a.state.phase).toBe('over')
    expect(b.state.peer?.rematch).toBe(true)
    b.input({ type: 'ui', action: 'rematch' }, room.now)
    room.flush()
    for (const p of [a, b]) {
      expect(p.state.phase).toBe('match')
      expect(p.state.over).toBeNull()
      expect(p.state.results).toEqual([])
      expect(p.state.match).toEqual(a.state.match)
    }
    expect(a.state.match?.id).not.toBe(first?.id)
    expect(a.state.match?.seed).not.toBe(first?.seed)
  })

  it('hands the rematch to a guest that lost its start and every sync before play', () => {
    const { room, a, b } = finishedMatch()
    const first = a.state.match?.id
    a.env = { ...env, newMatchId: () => 'mtch02' }
    room.lose = msg =>
      msg.k === 'start' || (msg.k === 'sync' && msg.phase === 'match')
    b.input({ type: 'ui', action: 'rematch' }, room.now)
    a.input({ type: 'ui', action: 'rematch' }, room.now)
    room.advance(6000)
    expect(matchPhase(a.state, room.now)?.kind).toBe('play')
    expect(b.state.phase).toBe('over')
    expect(b.state.match?.id).toBe(first)
    room.lose = () => false
    room.advance(2500)
    expect(b.state.match).toEqual(a.state.match)
    expect(matchPhase(b.state, room.now)?.kind).toBe('play')
  })

  it('shows a neighbour who reloads at the match end the result, and Ready counts as Rematch', () => {
    const { room, a, b } = finishedMatch()
    room.drop(b)
    const b2 = room.join('bbbbbbbb')
    b2.env = a.env
    expect(b2.state.phase).toBe('over')
    expect(b2.state.over).toMatchObject({
      reason: 'score',
      winner: 'aaaaaaaa',
      summary: { tally: [2, 0] }
    })
    b2.input({ type: 'ui', action: 'lobby' }, room.now)
    a.input({ type: 'ui', action: 'rematch' }, room.now)
    b2.input({ type: 'ui', action: 'ready' }, room.now)
    room.flush()
    expect(a.state.phase).toBe('match')
    expect(b2.state.match).toEqual(a.state.match)
  })

  it('gives the stayer the win when the neighbour storms off, and frees the seat', () => {
    const { room, a, b } = inMatch()
    b.input({ type: 'ui', action: 'leave' }, room.now)
    expect(b.outbox.map(m => m.k)).toContain('leave')
    expect(b.effects).toContain('disconnect')
    room.flush()
    room.drop(b)
    expect(a.state.phase).toBe('over')
    expect(a.state.over).toMatchObject({
      reason: 'stormedOff',
      winner: 'aaaaaaaa',
      peerName: 'P-bbb'
    })
    expect(a.state.match).toBeNull()
    expect(a.state.seats).toEqual(['aaaaaaaa'])
    a.input({ type: 'ui', action: 'lobby' }, room.now)
    expect(a.state.phase).toBe('lobby')
    const c = room.join('cccccccc')
    expect(c.state.admission).toBe('seated')
    expect(a.state.peer?.id).toBe('cccccccc')
  })

  it('lets a decided match finish its reveal when the loser leaves', () => {
    const { room, a, b } = inMatch()
    a.env = b.env = countingEnv()
    for (const round of [0, 1]) {
      a.input({ type: 'final', round, pack: finalOf(4, round) }, room.now)
      b.input({ type: 'final', round, pack: finalOf(4, round, 2) }, room.now)
      room.flush()
    }
    b.input({ type: 'ui', action: 'leave' }, room.now)
    room.flush()
    room.drop(b)
    expect(a.state.phase).toBe('match')
    room.advance(500_000)
    expect(a.state.over).toMatchObject({
      reason: 'score',
      winner: 'aaaaaaaa',
      peerName: 'P-bbb'
    })
    // Off the member list for 10s outside a match: the seat is free again.
    expect(a.state.peer).toBeNull()
    expect(isHost(a.state)).toBe(false)
    expect(hostSide(a.state)).toBe(true)
  })

  it('keeps a guest on its side of the match end after the host leaves', () => {
    const { room, a, b } = finishedMatch()
    a.input({ type: 'ui', action: 'leave' }, room.now)
    room.flush()
    room.drop(a)
    room.advance(20_000)
    expect(b.state.seats).toEqual(['bbbbbbbb'])
    expect(b.state.phase).toBe('over')
    expect(hostSide(b.state)).toBe(false)
  })
})

/** Two players in round 1's play, host `a` and guest `b`. */
function inPlay(): { room: Room; a: Player; b: Player } {
  const { room, a, b } = inMatch()
  room.advance(4000)
  expect(matchPhase(a.state, room.now)?.kind).toBe('play')
  return { room, a, b }
}

describe('presence, walkovers and no contests', () => {
  it('shows Away after 3s of silence in play and 6s outside, and clears it on any word', () => {
    const { room, a, b } = inPlay()
    room.quiet.add(b.id)
    room.advance(AWAY_PLAY_MS - 500)
    expect(a.state.peer?.away).toBe(false)
    room.advance(750)
    expect(a.state.peer?.away).toBe(true)
    expect(peerHere(a.state)).toBe(false)
    room.quiet.delete(b.id)
    room.advance(250)
    expect(a.state.peer?.away).toBe(false)

    const lobby = new Room()
    const c = lobby.join('cccccccc')
    const d = lobby.join('dddddddd')
    lobby.quiet.add(d.id)
    // Lobby syncs every 2s still count as words, so the lobby needs them lost too.
    lobby.lose = msg => msg.k === 'sync'
    lobby.advance(AWAY_PLAY_MS + 500)
    expect(c.state.peer?.away).toBe(false)
    lobby.advance(AWAY_MS - AWAY_PLAY_MS)
    expect(c.state.peer?.away).toBe(true)
  })

  it('counts silence only while you can hear: never while hidden or offline', () => {
    const { room, a, b } = inPlay()
    room.quiet.add(b.id)
    // b ends the match itself after 60s; only a's own count matters here.
    room.lose = msg => msg.k === 'sync'
    a.input({ type: 'visible', visible: false }, room.now)
    room.advance(DEAD_MS + 5000)
    expect(a.state.phase).toBe('match')
    expect(a.state.peer?.silentMs).toBeLessThanOrEqual(250)
    a.input({ type: 'visible', visible: true }, room.now)
    a.input({ type: 'status', status: 'reconnecting' }, room.now)
    room.advance(DEAD_MS + 5000)
    expect(a.state.phase).toBe('match')
    a.input({ type: 'status', status: 'connected' }, room.now)
    room.advance(DEAD_MS - 1000)
    expect(a.state.phase).toBe('match')
    room.advance(1500)
    expect(a.state.over).toMatchObject({ reason: 'noContest', winner: null })
  })

  it('ends as a no contest after 60s of heard silence, and tells the other side', () => {
    const { room, a, b } = inPlay()
    // b hears nothing from a, but a hears b.
    room.quiet.add(a.id)
    room.lose = msg => msg.k !== 'sync'
    room.advance(DEAD_MS + 500)
    expect(b.state.over).toMatchObject({ reason: 'noContest', winner: null })
    expect(a.state.phase).toBe('over')
    expect(a.state.over).toMatchObject({ reason: 'noContest', peerId: b.id })
    // Both can ask for a rematch after a no contest.
    room.lose = () => false
    room.quiet.clear()
    a.env = { ...env, newMatchId: () => 'mtch02' }
    a.input({ type: 'ui', action: 'rematch' }, room.now)
    b.input({ type: 'ui', action: 'rematch' }, room.now)
    room.flush()
    expect(a.state.phase).toBe('match')
    expect(b.state.match?.id).toBe('mtch02')
  })

  it('gives a walkover after 60s off the member list, and the returner sees it', () => {
    const { room, a, b } = inPlay()
    room.drop(b)
    room.advance(GONE_MS - 1000)
    expect(a.state.phase).toBe('match')
    expect(a.state.peer?.listed).toBe(false)
    room.advance(1500)
    expect(a.state.over).toMatchObject({
      reason: 'walkover',
      winner: a.id,
      peerName: 'P-bbb'
    })
    // The seat stays theirs while the walkover shows, so a newcomer finds the room full.
    room.advance(SEAT_FREE_MS * 3)
    const c = room.join('cccccccc')
    expect(c.state.admission).toBe('full')
    room.drop(c)
    const b2 = room.join('bbbbbbbb')
    expect(b2.state.over).toMatchObject({ reason: 'walkover', winner: a.id })
    // Back in the lobby, a seat left empty for 10s frees again.
    room.drop(b2)
    a.input({ type: 'ui', action: 'lobby' }, room.now)
    room.advance(SEAT_FREE_MS + 500)
    expect(a.state.seats).toEqual([a.id])
  })

  it('never gives a walkover while your own line is down, and play goes on when they return', () => {
    const { room, a, b } = inPlay()
    room.drop(b)
    a.input({ type: 'status', status: 'reconnecting' }, room.now)
    room.advance(GONE_MS + 5000)
    expect(a.state.phase).toBe('match')
    a.input({ type: 'status', status: 'connected' }, room.now)
    const b2 = room.join('bbbbbbbb')
    expect(b2.state.phase).toBe('match')
    expect(b2.state.match?.id).toBe(a.state.match?.id)
    room.advance(GONE_MS)
    expect(a.state.phase).toBe('match')
  })

  it('clears a reloaded neighbour Ready until their own sync says it', () => {
    const room = new Room()
    const a = room.join('aaaaaaaa')
    const b = room.join('bbbbbbbb')
    b.input({ type: 'ui', action: 'ready' }, room.now)
    room.flush()
    expect(a.state.peer?.ready).toBe(true)
    room.drop(b)
    room.join('bbbbbbbb')
    expect(a.state.peer?.ready).toBe(false)
    a.input({ type: 'ui', action: 'ready' }, room.now)
    room.flush()
    room.advance(1000)
    expect(a.state.phase).toBe('lobby')
  })

  it('lets a reloaded host take the running match back from the guest, with the tally', () => {
    const { room, a, b } = inMatch()
    a.input({ type: 'final', round: 0, pack: finalOf(4, 0) }, room.now)
    b.input({ type: 'final', round: 0, pack: finalOf(4, 0, 2) }, room.now)
    room.flush()
    room.drop(a)
    const a2 = room.join('aaaaaaaa')
    expect(isHost(a2.state)).toBe(true)
    expect(a2.state.match).toEqual(b.state.match)
    expect(tallyOf(a2.state)).toEqual([1, 0])
    // The next verdict builds on the tally the guest kept.
    a2.input({ type: 'final', round: 1, pack: finalOf(4, 1) }, room.now)
    b.input({ type: 'final', round: 1, pack: finalOf(4, 1, 2) }, room.now)
    room.flush()
    expect(b.state.results[1]?.tally).toEqual([2, 0])
    expect(b.state.results[1]?.over).toBe(true)
  })

  it('never drags a page that finished a match back into it with a late sync', () => {
    const { room, a, b } = finishedMatch()
    const old = b.state.match
    if (!old) throw new Error('no match')
    a.input({ type: 'ui', action: 'lobby' }, room.now)
    a.input(
      {
        type: 'msg',
        from: b.id,
        msg: {
          k: 'sync',
          name: 'B',
          seats: [a.id, b.id],
          ready: false,
          rematch: false,
          phase: 'match',
          match: { ...old, at: room.now }
        }
      },
      room.now
    )
    expect(a.state.phase).toBe('lobby')
  })

  it('sends a reloaded page the copy of its lawn with the match', () => {
    const { room, a } = inPlay()
    a.env = {
      ...a.env,
      peerLawn: () => ({ pack: 'AQAB', at: room.now - 400 })
    }
    const b = room.players[1]
    if (!b) throw new Error('no guest')
    room.drop(b)
    const b2 = room.join('bbbbbbbb')
    expect(b2.state.phase).toBe('match')
    expect(b2.effects).toContain('copy')
  })

  it('hands a reloaded host the verdicts it lost, with the guest lawn, once each', () => {
    const { room, a, b } = inMatch()
    const guestFinal = finalOf(4, 0, 2)
    a.input({ type: 'final', round: 0, pack: finalOf(4, 0) }, room.now)
    b.input({ type: 'final', round: 0, pack: guestFinal }, room.now)
    room.flush()
    b.env = { ...env, myFinal: round => (round === 0 ? guestFinal : null) }
    room.drop(a)
    const a2 = room.join('aaaaaaaa')
    expect(a2.state.results).toEqual(b.state.results)
    expect(a2.state.peerFinals[0]).toBe(guestFinal)
    expect(a2.effects.filter(e => e === 'result')).toHaveLength(1)
    // It has them all now, so its syncs stop asking.
    a2.input({ type: 'ui', action: 'ready' }, room.now)
    a2.input({ type: 'tick' }, room.now + 3000)
    const syncs = a2.outbox.filter(m => m.k === 'sync')
    expect(syncs.every(m => m.k === 'sync' && m.need === undefined)).toBe(true)
  })

  it("judges a round the host missed from its own rebuilt final and the guest's", () => {
    const { room, a, b } = inMatch()
    const match = a.state.match
    if (!match) throw new Error('no match')
    const hostLawn = encodeLawn(
      lawnReport(new Garden({ seed: 4, round: 0, calm: true }), [])
    )
    b.env = {
      ...env,
      peerLawn: round =>
        round === 0 ? { pack: hostLawn, at: match.at + 170_000 } : null
    }
    // The host closes its page 1s before round 1 ends and comes back in round 2.
    room.now = match.at + match.roundMs - 1000
    room.drop(a)
    room.advance(1500)
    b.input({ type: 'final', round: 0, pack: finalOf(4, 0, 2) }, room.now)
    let finals = 0
    room.lose = msg => (msg.k === 'final' && finals++, false)
    room.advance(match.revealMs + 4000)
    // Nobody heard repeats while the host was off the member list.
    expect(finals).toBe(1)
    const a2 = room.join('aaaaaaaa')
    expect(a2.effects).toContain('missedFinal')
    expect(a2.effects).toContain('copy')
    // The session hands back the final it built for round 1.
    a2.input({ type: 'final', round: 0, pack: finalOf(4, 0) }, room.now)
    room.advance(1500)
    expect(b.state.results).toHaveLength(1)
    expect(b.state.results).toEqual(a2.state.results)
    expect(b.state.pendingFinal).toBeNull()
    expect(tallyOf(b.state)).toEqual([1, 0])
  })

  it('ends a guest that missed the deciding verdict when the host shows the result', () => {
    const { room, a, b } = inMatch()
    a.env = b.env = countingEnv()
    room.lose = msg => msg.k === 'result'
    for (const round of [0, 1]) {
      a.input({ type: 'final', round, pack: finalOf(4, round) }, room.now)
      b.input({ type: 'final', round, pack: finalOf(4, round, 2) }, room.now)
      room.flush()
    }
    expect(b.state.results).toHaveLength(0)
    room.advance(500_000)
    expect(a.state.over?.reason).toBe('score')
    expect(b.state.phase).toBe('over')
    expect(b.state.over).toMatchObject({
      reason: 'score',
      winner: a.id,
      summary: { tally: [2, 0] }
    })
  })
})

describe('the finished-match fact', () => {
  it('counts a match Brenda decided, on both pages and on one that rejoins its end', () => {
    const { room, a, b } = finishedMatch()
    expect(decidedMatchEnd(a.state)).toBe(true)
    expect(decidedMatchEnd(b.state)).toBe(true)
    room.drop(b)
    const b2 = room.join('bbbbbbbb')
    expect(decidedMatchEnd(b2.state)).toBe(true)
  })

  it('never counts a storm-off, a walkover, a no contest or a leave mid-reveal', () => {
    const storm = inMatch()
    storm.b.input({ type: 'ui', action: 'leave' }, storm.room.now)
    storm.room.flush()
    expect(decidedMatchEnd(storm.a.state)).toBe(false)
    expect(decidedMatchEnd(storm.b.state)).toBe(false)

    const gone = inPlay()
    gone.room.drop(gone.b)
    gone.room.advance(GONE_MS + 1000)
    expect(gone.a.state.over?.reason).toBe('walkover')
    expect(decidedMatchEnd(gone.a.state)).toBe(false)
    expect(decidedMatchEnd(gone.room.join('bbbbbbbb').state)).toBe(false)

    const dead = inPlay()
    dead.room.quiet.add(dead.a.id)
    dead.room.lose = msg => msg.k !== 'sync'
    dead.room.advance(DEAD_MS + 500)
    expect(dead.b.state.over?.reason).toBe('noContest')
    expect(decidedMatchEnd(dead.b.state)).toBe(false)

    // The loser leaves during the last reveal: only the page that saw it end counts it.
    const late = inMatch()
    late.a.env = late.b.env = countingEnv()
    for (const round of [0, 1]) {
      late.a.input(
        { type: 'final', round, pack: finalOf(4, round) },
        late.room.now
      )
      late.b.input(
        { type: 'final', round, pack: finalOf(4, round, 2) },
        late.room.now
      )
      late.room.flush()
    }
    late.b.input({ type: 'ui', action: 'leave' }, late.room.now)
    late.room.flush()
    expect(decidedMatchEnd(late.b.state)).toBe(false)
    late.room.drop(late.b)
    late.room.advance(500_000)
    expect(decidedMatchEnd(late.a.state)).toBe(true)
  })

  it("puts a new player's flag in its lobby sync, read live, and never during play", () => {
    const room = new Room()
    const a = room.join('aaaaaaaa')
    const b = room.join('bbbbbbbb')
    let fresh = true
    b.env = { ...env, newPlayer: () => fresh }
    b.input({ type: 'ui', action: 'ready' }, room.now)
    room.flush()
    expect(a.state.peer?.first).toBe(true)
    expect(b.state.peer?.first).toBe(false)
    a.input({ type: 'ui', action: 'ready' }, room.now)
    room.flush()
    expect(b.state.phase).toBe('match')
    expect(syncMsg(b.state, room.now, b.env)).not.toHaveProperty('first')
    expect(a.state.peer?.first).toBe(false)
    fresh = false
    expect(
      syncMsg({ ...b.state, phase: 'lobby' }, room.now, b.env)
    ).not.toHaveProperty('first')
  })

  it('sends the yard step in a lobby sync and shows it until the neighbour is Ready', () => {
    const room = new Room()
    const a = room.join('aaaaaaaa')
    const b = room.join('bbbbbbbb')
    let step = 1
    b.env = { ...env, yardStep: () => step }
    a.input({ type: 'ui', action: 'ready' }, room.now)
    room.advance(2000)
    expect(peerYard(a.state)).toBe(1)
    expect(a.state.peer?.yard).toBe(1)
    step = 2
    a.effects.length = 0
    room.advance(2000)
    expect(peerYard(a.state)).toBe(2)
    // Each new step is spoken once, and a repeat of the same step says nothing.
    room.advance(2000)
    expect(a.effects.filter(e => e === 'announce')).toHaveLength(1)
    // Ready takes over the friend's status line, though the yard stays open.
    b.input({ type: 'ui', action: 'ready' }, room.now)
    room.flush()
    expect(b.state.phase).toBe('match')
    expect(peerYard(a.state)).toBe(0)
    expect(syncMsg(b.state, room.now, b.env)).not.toHaveProperty('yard')
  })

  it('sends a sync at once when the yard step changes in the lobby, and not in a match', () => {
    const room = new Room()
    const a = room.join('aaaaaaaa')
    const b = room.join('bbbbbbbb')
    room.flush()
    b.env = { ...env, yardStep: () => 2 }
    b.input({ type: 'ui', action: 'yard' }, room.now)
    room.flush()
    expect(peerYard(a.state)).toBe(2)
    b.input({ type: 'ui', action: 'ready' }, room.now)
    a.input({ type: 'ui', action: 'ready' }, room.now)
    room.flush()
    expect(b.state.phase).toBe('match')
    b.outbox.length = 0
    b.input({ type: 'ui', action: 'yard' }, room.now)
    expect(b.outbox).toHaveLength(0)
  })

  it('gives no yard line once the neighbour presses Ready in the yard', () => {
    const room = new Room()
    const a = room.join('aaaaaaaa')
    const b = room.join('bbbbbbbb')
    b.env = { ...env, yardStep: () => 3 }
    b.input({ type: 'ui', action: 'ready' }, room.now)
    room.flush()
    expect(a.state.peer?.yard).toBe(3)
    expect(a.state.peer?.ready).toBe(true)
    expect(peerYard(a.state)).toBe(0)
    b.input({ type: 'ui', action: 'unready' }, room.now)
    room.flush()
    expect(peerYard(a.state)).toBe(3)
    b.env = env
    room.advance(2000)
    expect(peerYard(a.state)).toBe(0)
  })
})
