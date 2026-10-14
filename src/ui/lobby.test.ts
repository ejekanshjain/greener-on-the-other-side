import { describe, expect, it } from 'vitest'

import { lobbyStatus, readyPulses, type PulseFacts } from './lobby'

/** A new player online whose friend is Ready, card read, yard shut and done. */
const ready: PulseFacts = {
  myReady: false,
  peerReady: true,
  newPlayer: true,
  practice: false,
  cardShown: true,
  yardOpen: false,
  yardDone: true
}

describe('the Ready pulse', () => {
  it("waits for a new player's friend, the card's 6s and a finished or skipped yard", () => {
    expect(readyPulses(ready)).toBe(true)
    expect(readyPulses({ ...ready, peerReady: false })).toBe(false)
    expect(readyPulses({ ...ready, cardShown: false })).toBe(false)
    expect(readyPulses({ ...ready, yardDone: false })).toBe(false)
    expect(readyPulses({ ...ready, myReady: true })).toBe(false)
  })

  it('never pulses while the yard is open', () => {
    expect(readyPulses({ ...ready, yardOpen: true })).toBe(false)
  })

  it("pulses a returning player's Ready at once, but not Practice's Start", () => {
    const veteran = {
      ...ready,
      newPlayer: false,
      cardShown: false,
      yardDone: false
    }
    expect(readyPulses(veteran)).toBe(true)
    expect(readyPulses({ ...veteran, practice: true })).toBe(false)
    expect(readyPulses({ ...ready, practice: true })).toBe(true)
    expect(readyPulses({ ...ready, practice: true, yardDone: false })).toBe(
      false
    )
  })
})

describe('the lobby status line', () => {
  const base = {
    peerName: 'Sam',
    myReady: false,
    peerReady: false,
    peerYard: 0
  }

  it('names the yard step while your friend tries it', () => {
    expect(lobbyStatus({ ...base, peerYard: 2 })).toBe(
      'Sam is trying the yard (2 of 3).'
    )
    expect(lobbyStatus({ ...base, peerYard: 1, myReady: true })).toBe(
      'Sam is trying the yard (1 of 3).'
    )
  })

  it('says who waits once the yard line is gone', () => {
    expect(lobbyStatus({ ...base, peerReady: true })).toBe('Sam is ready.')
    expect(lobbyStatus({ ...base, myReady: true })).toBe(
      'Waiting for Sam to press Ready.'
    )
    expect(lobbyStatus(base)).toBeNull()
    expect(lobbyStatus({ ...base, peerName: null, myReady: true })).toBeNull()
  })
})
