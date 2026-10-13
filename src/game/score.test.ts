import { describe, expect, it } from 'vitest'

import { Garden } from './garden'
import { finalReport, noCounts, packPatch, Top } from './report'
import {
  blameLine,
  blameText,
  brendaLine,
  findings,
  halfUp,
  matchResult,
  roundWinner,
  scoreLawn,
  type Scorable
} from './score'
import { COLS, PATCHES } from './tuning'

/** A lawn with every patch at `health` and `length`, nothing on it, plus `counts`. */
function lawn(
  health: number,
  length = 2,
  counts: Partial<ReturnType<typeof noCounts>> = {}
): Scorable {
  return {
    patches: new Uint8Array(PATCHES).fill(packPatch(health, length, Top.clean)),
    counts: { ...noCounts(), ...counts },
    healthSum: health * PATCHES
  }
}

const NO_BLAME = {
  drowned: 0,
  scalped: 0,
  clips: 0,
  flattened: 0,
  bounces: 0,
  digs: 0
}

describe('scoreLawn', () => {
  it('scores a fresh lawn 53', () => {
    const score = scoreLawn(finalReport(new Garden({ seed: 3 })))
    expect(score).toEqual({
      green: 36,
      stripes: 0,
      tidy: 20,
      junk: -3,
      total: 53
    })
  })

  it('rounds each line half up', () => {
    expect(halfUp(2.5)).toBe(3)
    expect(halfUp(-0.5)).toBe(0)
    // 5 striped columns are 12.5 points.
    const striped = lawn(4, 1)
    for (let i = 0; i < PATCHES; i++)
      if (i % COLS >= 5) striped.patches[i] = packPatch(4, 3, Top.clean)
    expect(scoreLawn(striped).stripes).toBe(13)
    // 3 clutter is 18.5 Tidy points.
    expect(scoreLawn(lawn(4, 2, { weeds: 3 })).tidy).toBe(19)
  })

  it('floors Tidy at 0 but lets Junk go below 0', () => {
    const score = scoreLawn(
      lawn(0, 2, { weeds: 40, litter: 30, gnomes: 30, bins: 1, trampolines: 2 })
    )
    expect(score.tidy).toBe(0)
    expect(score.junk).toBe(-30 - 4 - 12)
    expect(score.total).toBe(-46)
  })

  it('counts holes as clutter', () => {
    const holed = lawn(5)
    for (let i = 0; i < 4; i++) holed.patches[i] = packPatch(5, 2, Top.hole)
    expect(scoreLawn(holed).tidy).toBe(18)
  })
})

describe('roundWinner', () => {
  it('takes the higher total, then the higher health sum, else a draw', () => {
    const a = scoreLawn(lawn(5))
    const b = scoreLawn(lawn(4))
    expect(roundWinner(a, b, 960, 768)).toBe('h')
    expect(roundWinner(b, a, 768, 960)).toBe('g')
    expect(roundWinner(a, a, 960, 959)).toBe('h')
    expect(roundWinner(a, a, 960, 960)).toBe('d')
  })
})

describe('matchResult', () => {
  it('ends at 2 wins, else after round 3 by wins, then points', () => {
    expect(matchResult([2, 0], [100, 80], 2)).toEqual({
      over: true,
      winner: 'h'
    })
    expect(matchResult([1, 1], [100, 80], 2)).toEqual({
      over: false,
      winner: null
    })
    expect(matchResult([1, 0], [100, 120], 3)).toEqual({
      over: true,
      winner: 'h'
    })
    expect(matchResult([1, 1], [100, 120], 3)).toEqual({
      over: true,
      winner: 'g'
    })
    expect(matchResult([0, 0], [150, 150], 3)).toEqual({
      over: true,
      winner: 'd'
    })
  })
})

describe('blameLine', () => {
  it('names the worst fault only when faults cost half the margin', () => {
    expect(blameLine({ ...NO_BLAME, clips: 2, drowned: 1 }, 4)).toBe('clips')
    expect(blameLine({ ...NO_BLAME, clips: 1 }, 4)).toBeNull()
    expect(blameLine({ ...NO_BLAME, bounces: 1, digs: 1 }, 2)).toBe('bounces')
    expect(blameLine({ ...NO_BLAME, digs: 3 }, 0)).toBeNull()
  })
})

describe("Brenda's lines", () => {
  const plain = { gnomes: 3, trampolines: 0, mud: 0, holes: 0, stripes: 0 }

  it('names the first thing on her list she finds', () => {
    expect(brendaLine({ ...plain, gnomes: 12, trampolines: 1 }, 9, true)).toBe(
      'I count 12 gnomes. Are they breeding?'
    )
    expect(brendaLine({ ...plain, trampolines: 1, mud: 30 }, 9, true)).toBe(
      'Is that a trampoline?'
    )
    expect(brendaLine({ ...plain, mud: 20 }, 9, false)).toBe('Lovely mud.')
    expect(brendaLine({ ...plain, holes: 3 }, 9, false)).toBe(
      "Something's been digging."
    )
    expect(brendaLine({ ...plain, stripes: 12 }, 9, true)).toBe(
      'Proper stripes. Suspicious.'
    )
    expect(brendaLine(plain, 2, true)).toBe("Too close. I'm going with my gut.")
    expect(brendaLine(plain, 9, false)).toBe('Could be greener.')
  })

  it('counts mud and holes from the patch bytes', () => {
    const lawn = {
      patches: new Uint8Array(PATCHES).fill(packPatch(5, 1, Top.clean)),
      counts: noCounts(),
      healthSum: 0
    }
    for (let i = 0; i < 20; i++) lawn.patches[i] = packPatch(1, 1, Top.clean)
    lawn.patches[30] = packPatch(4, 1, Top.puddle)
    lawn.patches[40] = packPatch(4, 1, Top.hole)
    expect(findings(lawn)).toMatchObject({ mud: 21, holes: 1 })
  })

  it('words the blame line for you and for your neighbour', () => {
    expect(blameText('drowned', 9, 4, null)).toBe(
      'You lost by 4. You drowned 9 patches yourself.'
    )
    expect(blameText('clips', 1, 2, 'Turf Lord')).toBe(
      'Turf Lord lost by 2. They clipped the fence once.'
    )
    expect(blameText('digs', 3, 3, null)).toBe(
      'You lost by 3. Biscuit dug 3 holes you missed.'
    )
  })
})
