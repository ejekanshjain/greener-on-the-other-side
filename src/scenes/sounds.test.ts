import { describe, expect, it } from 'vitest'

import { setPatch } from '../game/cheats'
import { Garden } from '../game/garden'
import { Mess, type GardenEvent } from '../game/types'
import type { SfxName } from '../shared/audio'
import { playEvent } from './sounds'

/** The sounds one event plays, by name. */
function soundsOf(event: GardenEvent, garden = new Garden({ seed: 1 })) {
  const names: SfxName[] = []
  playEvent(event, garden, name => names.push(name))
  return names
}

describe('the sound map', () => {
  it('gives each garden event its sound', () => {
    const cases: [GardenEvent, SfxName[]][] = [
      [{ type: 'throw', id: 1, speedPx: 1200, distance: 400 }, ['whoosh']],
      [{ type: 'clip', clip: { kind: 'gnome', x: 300, at: 0 } }, ['creak']],
      [{ type: 'catch', id: 1 }, ['pop']],
      [{ type: 'yank', id: 1 }, ['pop']],
      [{ type: 'shell', id: 1 }, ['squish']],
      [{ type: 'scalp', patch: 3 }, ['rattle']],
      [{ type: 'canEmpty' }, ['drip']],
      [{ type: 'flood', patches: [1, 2] }, ['splash']],
      [{ type: 'sparkle', patch: 5 }, ['ding']],
      [{ type: 'bark', id: 1 }, ['bark']],
      [{ type: 'dig', patch: 9 }, ['stomp']],
      [{ type: 'vane', kind: 'over', dir: 1 }, ['creak']],
      [{ type: 'shed' }, ['slam']],
      [
        { type: 'sink', kind: 'trampoline', patch: 40, fromNeighbour: true },
        ['slam', 'rattle', 'boing']
      ],
      [{ type: 'dry', patch: 1, health: 4 }, []]
    ]
    for (const [event, names] of cases) expect(soundsOf(event)).toEqual(names)
  })

  it('thuds on grass, squishes on mud, and leaves heavy junk to its slam', () => {
    const garden = new Garden({ seed: 1 })
    setPatch(garden, 20, { health: 1 })
    setPatch(garden, 21, { mess: Mess.puddle })
    const land = (patch: number, kind: 'gnome' | 'bin' = 'gnome') =>
      soundsOf(
        {
          type: 'land',
          landing: { patch, kind, at: 0 },
          fromNeighbour: true
        },
        garden
      )
    expect(land(30)).toEqual(['thud'])
    expect(land(20)).toEqual(['squish'])
    expect(land(21)).toEqual(['squish'])
    expect(land(30, 'bin')).toEqual([])
  })

  it('pitches a throw up with its speed', () => {
    const pitches: number[] = []
    for (const speedPx of [400, 1500, 2500])
      playEvent(
        { type: 'throw', id: 1, speedPx, distance: 0 },
        new Garden({ seed: 1 }),
        (_name, options) => pitches.push(options?.pitch ?? 1)
      )
    expect(pitches[0]).toBeLessThan(pitches[1] ?? 0)
    expect(pitches[1]).toBeLessThan(pitches[2] ?? 0)
  })
})
