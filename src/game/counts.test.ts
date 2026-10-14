import { describe, expect, it } from 'vitest'

import {
  coachLine,
  countedFromWire,
  countedToWire,
  countLawn,
  countParts,
  zeroCounts,
  type Counted
} from './counts'
import { noCounts, packPatch, Top } from './report'
import { scoreLawn, type Score } from './score'
import { COLS, PATCHES } from './tuning'

const score = (green: number, tidy: number, junk: number, stripes = 0) =>
  ({
    green,
    stripes,
    tidy,
    junk,
    total: green + stripes + tidy + junk
  }) satisfies Score
const counted = (c: Partial<Counted>): Counted => ({ ...zeroCounts(), ...c })

describe('reveal counts', () => {
  it('names the kinds that cost most on each line', () => {
    const s = score(30, 9, -17)
    expect(countParts('junk', s, counted({ gnomes: 17 }))).toEqual([
      '17 gnomes'
    ])
    expect(
      countParts('tidy', s, counted({ weeds: 15, snails: 7, holes: 1 }))
    ).toEqual(['15 weeds', '7 snails'])
    expect(
      countParts('junk', s, counted({ gnomes: 11, trampolines: 1 }))
    ).toEqual(['11 gnomes', '1 trampoline'])
    // A trampoline costs 6, so it comes before 5 gnomes.
    expect(
      countParts('junk', s, counted({ gnomes: 5, trampolines: 1 }))
    ).toEqual(['1 trampoline', '5 gnomes'])
    expect(countParts('stripes', s, counted({}))).toEqual(['no columns'])
    expect(countParts('stripes', s, counted({ stripes: 1 }))).toEqual([
      '1 column'
    ])
    expect(countParts('green', s, counted({}))).toEqual(['of 50'])
  })

  it('breaks Tidy ties in the order weeds, snails, holes, litter, clippings', () => {
    const s = score(30, 17, 0)
    expect(
      countParts('tidy', s, counted({ clippings: 2, holes: 2, litter: 2 }))
    ).toEqual(['2 holes', '2 bits of litter'])
  })

  it('shows nothing for a Tidy of 20 or a Junk of 0', () => {
    const s = score(30, 20, 0)
    expect(countParts('tidy', s, counted({ weeds: 1 }))).toEqual([])
    expect(countParts('junk', s, counted({}))).toEqual([])
  })

  it('counts a final the way Brenda scores it, with junk from next door apart', () => {
    const patches = new Uint8Array(PATCHES).fill(packPatch(5, 0, Top.clean))
    // Column 0 loses its stripe to 3 holes; every other column stripes.
    for (const row of [0, 1, 2]) patches[row * COLS] = packPatch(5, 0, Top.hole)
    const counts = { ...noCounts(), gnomes: 2, trampolines: 1, bins: 1 }
    const lawn = {
      patches,
      counts,
      healthSum: 5 * PATCHES,
      markers: [
        { patch: 40, kind: 'trampoline', look: 0, sunk: true, theirs: true },
        { patch: 50, kind: 'bin', look: 0, sunk: true, theirs: false }
      ] as const
    }
    const c = countLawn({ ...lawn, markers: [...lawn.markers] })
    expect(c).toMatchObject({
      stripes: COLS - 1,
      holes: 3,
      gnomes: 2,
      trampolines: 1,
      bins: 1,
      theirJunk: 6
    })
    expect(scoreLawn(lawn).stripes).toBe(28)
  })

  it('travel as whole numbers and refuse anything else', () => {
    const c = counted({ stripes: 2, weeds: 15, gnomes: 11, theirJunk: 6 })
    const wire = countedToWire(c)
    expect(JSON.stringify(wire).length).toBeLessThan(30)
    expect(countedFromWire(wire)).toEqual(c)
    expect(countedFromWire(wire.slice(1))).toBeNull()
    expect(countedFromWire([...wire.slice(1), -1])).toBeNull()
    expect(countedFromWire([...wire.slice(1), 1.5])).toBeNull()
    expect(countedFromWire('1,2,3')).toBeNull()
  })
})

describe('the coach tip', () => {
  it('blames gnomes when they cost most', () => {
    expect(coachLine(score(30, 10, -11), counted({ gnomes: 11 }))).toBe(
      'Gnomes cost you 11. Throw them all over.'
    )
  })

  it('blames your own heavy junk, not junk from next door', () => {
    expect(
      coachLine(
        score(34, 15, -8),
        counted({ bins: 2, weeds: 10, theirJunk: 8 })
      )
    ).toBe('Weeds and snails cost you 5. Throw them.')
    expect(
      coachLine(score(34, 15, -15), counted({ gnomes: 3, trampolines: 2 }))
    ).toBe('Junk cost you 15. Throw it from halfway up.')
  })

  it("picks Tidy's line from its biggest kind", () => {
    expect(coachLine(score(36, 16, 0), counted({ holes: 6, weeds: 2 }))).toBe(
      'Holes cost you 4. Press Biscuit as he circles.'
    )
    expect(
      coachLine(
        score(36, 14, 0),
        counted({ litter: 8, clippings: 3, weeds: 1 })
      )
    ).toBe('Litter and clippings cost you 6. Clear them.')
  })

  it('names dry grass, and ties go Junk, then Tidy, then Green', () => {
    expect(coachLine(score(24, 18, 0), counted({ weeds: 4 }))).toBe(
      'Dry grass cost you 12. Water brown grass.'
    )
    expect(
      coachLine(score(31, 15, -5), counted({ gnomes: 5, weeds: 10 }))
    ).toBe('Gnomes cost you 5. Throw them all over.')
    expect(coachLine(score(31, 15, 0), counted({ weeds: 10 }))).toBe(
      'Weeds and snails cost you 5. Throw them.'
    )
  })

  it('talks about stripes only when nothing else cost 3 or more', () => {
    expect(coachLine(score(35, 18, -2), counted({ gnomes: 2 }))).toBe(
      'No stripes. Mow a whole column slowly.'
    )
    expect(
      coachLine(score(35, 18, -2, 3), counted({ gnomes: 2, stripes: 1 }))
    ).toBeNull()
  })
})
