import { rosetteShown } from '../game/reveal'
import { matchResult } from '../game/score'
import { matchLine } from '../net/judge'
import { isHost, tallyOf } from '../net/room'
import type { RoomSession } from '../net/session'
import type { RevealSource } from '../scenes/revealScene'

/** Reused every frame, so the reveal allocates nothing while it runs. */
const source: RevealSource = {
  key: '',
  round: 0,
  last: false,
  elapsed: 0,
  timings: { revealMs: 0, lastRevealMs: 0, countdownMs: 0 },
  result: null,
  iHost: false,
  theirName: '',
  mine: null,
  theirs: null,
  matchLine: null
}

/** What Brenda's reveal shows this frame, or null outside a reveal. */
export function revealSource(session: RoomSession): RevealSource | null {
  const phase = session.phase()
  const room = session.room
  const match = room.match
  if (phase?.kind !== 'reveal' || !match) return null
  const key = `${match.id}:${phase.round}`
  const result = room.results.find(r => r.round === phase.round) ?? null
  // A final can land after the verdict (a guest back from hiding), so missing packs retry.
  const stale = !source.mine || !source.theirs
  if (source.key !== key || source.result !== result || stale) {
    const iHost = isHost(room)
    const them = room.peer?.name ?? 'Your neighbour'
    const packs = session.revealPacks(phase.round)
    const decided = result?.over
      ? matchResult(result.tally, result.totals, result.round + 1).winner
      : null
    source.key = key
    source.round = phase.round
    source.timings = match
    source.result = result
    source.iHost = iHost
    source.theirName = them
    source.mine = packs?.mine ?? session.myFinal(phase.round)
    source.theirs = packs?.theirs ?? null
    source.matchLine = decided ? matchLine(decided, iHost, them) : null
  }
  source.last = phase.last
  source.elapsed = phase.elapsed
  return source
}

/**
 * Round wins as the top bar shows them: the round being revealed joins the tally only
 * once Brenda pins its rosette.
 */
export function shownTally(session: RoomSession): [number, number] {
  const room = session.room
  const phase = session.phase()
  if (
    phase?.kind !== 'reveal' ||
    !room.match ||
    rosetteShown(phase.elapsed, room.match)
  )
    return tallyOf(room)
  let shown: [number, number] = NO_WINS
  for (const r of room.results) if (r.round < phase.round) shown = r.tally
  return shown
}

const NO_WINS: [number, number] = [0, 0]
