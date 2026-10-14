import { yardLine } from '../net/room'
import { COPY } from './copy'

/** What decides whether your Ready, or Practice's Start, pulses. */
export interface PulseFacts {
  myReady: boolean
  /** Your neighbour pressed Ready or Rematch; Mr Pemberton always has. */
  peerReady: boolean
  /** This page counts as a new player right now. */
  newPlayer: boolean
  practice: boolean
  /** The lobby card has had its 6s to be read. */
  cardShown: boolean
  yardOpen: boolean
  /** You finished or skipped the yard on this page. */
  yardDone: boolean
}

/**
 * Whether your Ready pulses: once your neighbour is Ready and you aren't. A new player's
 * waits until the card has shown 6s and the yard is finished or skipped, and never pulses
 * while the yard is open. Practice's Start pulses only for a new player done with the yard.
 */
export function readyPulses(f: PulseFacts): boolean {
  if (f.myReady || !f.peerReady || f.yardOpen) return false
  if (!f.newPlayer) return !f.practice
  return f.cardShown && f.yardDone
}

/**
 * The one status line under an online lobby's buttons, in the yard's panel and on How to
 * Play: your neighbour's yard step while they try it and aren't Ready, then your own wait
 * once you're Ready, then theirs. Null when there's nothing to say.
 */
export function lobbyStatus(f: {
  peerName: string | null
  myReady: boolean
  peerReady: boolean
  /** Their yard step, 1 to 3, or 0; the room gives 0 once they're Ready. */
  peerYard: number
}): string | null {
  if (!f.peerName) return null
  if (f.peerYard > 0) return yardLine(f.peerName, f.peerYard)
  if (f.myReady) return COPY.waitingReady(f.peerName)
  if (f.peerReady) return COPY.isReady(f.peerName)
  return null
}
