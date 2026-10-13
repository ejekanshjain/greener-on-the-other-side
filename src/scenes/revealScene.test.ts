import { describe, expect, it } from 'vitest'

import type { RoundResult } from '../net/judge'
import { roundHeading, type RevealSource } from './revealScene'

/** A reveal source for round 2 against Gnome Hoarder, judged with `winner`. */
function source(winner: RoundResult['winner'] | null, iHost: boolean) {
  return {
    round: 1,
    iHost,
    theirName: 'Gnome Hoarder',
    result: winner ? ({ winner } as RoundResult) : null
  } as RevealSource
}

describe('the reveal heading', () => {
  it('names the round until the rosette is pinned', () => {
    expect(roundHeading(source('h', true), false)).toBe('Round 2')
    expect(roundHeading(source(null, true), true)).toBe('Round 2')
  })

  it('names the winner from each side once the rosette is pinned', () => {
    expect(roundHeading(source('h', true), true)).toBe('You Win Round 2')
    expect(roundHeading(source('h', false), true)).toBe(
      'Gnome Hoarder Wins Round 2'
    )
    expect(roundHeading(source('g', false), true)).toBe('You Win Round 2')
    expect(roundHeading(source('d', true), true)).toBe('Round 2 Is a Draw')
  })
})
