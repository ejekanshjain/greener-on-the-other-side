import { describe, expect, it } from 'vitest'

import {
  CODE_ALPHABET,
  CODE_HELP,
  isRoomCode,
  newRoomCode,
  parseCodeInput
} from './roomCode'

describe('room codes', () => {
  it('use 31 letters and digits without 0, o, 1, l and i', () => {
    expect(CODE_ALPHABET).toHaveLength(31)
    for (const ch of '0o1li') expect(CODE_ALPHABET).not.toContain(ch)
    for (let i = 0; i < 50; i++) expect(isRoomCode(newRoomCode())).toBe(true)
  })

  it('validate exactly 6 lowercase alphabet characters', () => {
    expect(isRoomCode('k7dm2q')).toBe(true)
    expect(isRoomCode('K7DM2Q')).toBe(false)
    expect(isRoomCode('k7dm2')).toBe(false)
    expect(isRoomCode('k7dm2o')).toBe(false)
  })
})

describe('parseCodeInput', () => {
  it('ignores case and group spaces, and joins on the 6th character', () => {
    expect(parseCodeInput('K7D')).toEqual({
      code: null,
      fromLink: false,
      problem: null
    })
    expect(parseCodeInput('K7D M2Q')).toEqual({
      code: 'k7dm2q',
      fromLink: false,
      problem: null
    })
  })

  it('shows the code rule for characters no code uses', () => {
    expect(parseCodeInput('k7dm2o').problem).toBe(CODE_HELP)
    expect(parseCodeInput('k7dm2qq').problem).toBe(CODE_HELP)
  })

  it('reads a pasted room link', () => {
    expect(parseCodeInput('https://greener.example/r/K7DM2Q?local')).toEqual({
      code: 'k7dm2q',
      fromLink: true,
      problem: null
    })
    expect(parseCodeInput('http://x.test/r/k7dm2').problem).toBe(CODE_HELP)
  })
})
