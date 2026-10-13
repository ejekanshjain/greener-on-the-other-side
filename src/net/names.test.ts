import { describe, expect, it } from 'vitest'

import { authorizeRoom } from '../server/pusherAuth'
import {
  graphemeCount,
  isValidName,
  NAME_HELP,
  nameProblem,
  normaliseName,
  shortName
} from './names'

describe('names', () => {
  it('passes Hindi and Tamil names, counting characters as shown', () => {
    expect(isValidName(normaliseName('एकांश'))).toBe(true)
    expect(isValidName(normaliseName('அருண்'))).toBe(true)
    expect(graphemeCount('एकांश')).toBe(3)
    expect(isValidName("O'Neil-Ray Jr.")).toBe(true)
  })

  it('fails blanks and dots with the helper line', () => {
    expect(nameProblem(normaliseName('   '))).toBe(NAME_HELP)
    expect(nameProblem(normaliseName('...'))).toBe(NAME_HELP)
    expect(nameProblem('Gnome <3')).toBe(NAME_HELP)
  })

  it('caps names at 16 characters as shown', () => {
    expect(isValidName('g'.repeat(16))).toBe(true)
    expect(isValidName('g'.repeat(17))).toBe(false)
    expect(isValidName('एकांश'.repeat(5))).toBe(true)
    expect(isValidName('एकांश'.repeat(6))).toBe(false)
  })

  it('trims, collapses spaces and straightens curly apostrophes', () => {
    expect(normaliseName('  Gnome   Hoarder ')).toBe('Gnome Hoarder')
    expect(normaliseName('O’Brien')).toBe("O'Brien")
    expect(normaliseName('é')).toBe('é')
  })
})

describe('shortName', () => {
  it('keeps names of up to 10 characters and cuts longer ones to 9 plus an ellipsis', () => {
    expect(shortName('Wilhelmina')).toBe('Wilhelmina')
    expect(shortName('Compost Mentis')).toBe('Compost M…')
  })

  it('counts characters as shown, never splitting a vowel sign from its letter', () => {
    const name = 'एकांश'.repeat(4)
    expect(shortName(name)).toBe(`${'एकांश'.repeat(3)}…`)
    expect(graphemeCount(shortName(name))).toBe(10)
  })
})

describe('auth route name rule', () => {
  const form = (name: string) => ({
    socketId: '123.456',
    channel: 'presence-lawn-k7dm2q',
    playerId: 'abcdefgh12',
    name
  })

  it('uses the same rule as the name box', () => {
    const before = process.env.PUSHER_SECRET
    process.env.PUSHER_SECRET = 'test_secret_for_unit_tests'
    try {
      expect(authorizeRoom(form('एकांश')).ok).toBe(true)
      expect(authorizeRoom(form('அருண்')).ok).toBe(true)
      expect(authorizeRoom(form('   '))).toMatchObject({
        ok: false,
        status: 400
      })
      expect(authorizeRoom(form('...'))).toMatchObject({
        ok: false,
        status: 400
      })
    } finally {
      process.env.PUSHER_SECRET = before
    }
  })
})
