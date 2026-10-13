// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PointerTracker } from './pointer'

let tracker: PointerTracker | null = null

afterEach(() => {
  tracker?.dispose()
  tracker = null
})

function setup(handoff = true) {
  const element = document.createElement('div')
  tracker = new PointerTracker(element, { handoff })
  const send = (type: string, id: number, x: number, y = 0) =>
    element.dispatchEvent(
      new PointerEvent(type, {
        pointerId: id,
        pointerType: 'touch',
        clientX: x,
        clientY: y
      })
    )
  return { tracker, send }
}

describe('PointerTracker', () => {
  it('reports drags from the primary finger only', () => {
    const { tracker, send } = setup()
    const drags = vi.fn()
    tracker.onDrag(p => drags(p.id))
    send('pointerdown', 1, 0)
    send('pointerdown', 2, 120)
    send('pointermove', 2, 130)
    send('pointermove', 1, 10)
    send('pointermove', 2, 140)
    expect(drags.mock.calls).toEqual([[1]])
    expect(tracker.x).toBe(10)
  })

  it('ignores a second finger lifting and pairs each press with one release', () => {
    const { tracker, send } = setup()
    const events: string[] = []
    tracker.onPress(p => events.push(`press ${p.id}`))
    tracker.onRelease(p => events.push(`release ${p.id}`))
    send('pointerdown', 1, 0)
    send('pointerdown', 2, 50)
    send('pointerup', 2, 50)
    send('pointerup', 1, 0)
    expect(events).toEqual(['press 1', 'release 1'])
    expect(tracker.isDown).toBe(false)
  })

  it('hands the press to a finger still down when the primary lifts', () => {
    const { tracker, send } = setup()
    const events: string[] = []
    tracker.onPress(p => events.push(`press ${p.id}`))
    tracker.onRelease(p => events.push(`release ${p.id}`))
    send('pointerdown', 1, 0)
    send('pointerdown', 2, 200)
    send('pointerup', 1, 0)
    expect(tracker.isDown).toBe(true)
    expect(tracker.x).toBe(200)
    expect(tracker.vx).toBe(0)
    expect(events).toEqual(['press 1', 'release 1', 'press 2'])
  })

  it('never promotes a resting finger when handoff is off', () => {
    const { tracker, send } = setup(false)
    const events: string[] = []
    tracker.onPress(p => events.push(`press ${p.id}`))
    tracker.onRelease(p => events.push(`release ${p.id}`))
    send('pointerdown', 1, 0)
    send('pointerdown', 2, 200)
    send('pointerup', 1, 0)
    send('pointermove', 2, 220)
    expect(tracker.isDown).toBe(false)
    send('pointerdown', 3, 300)
    expect(tracker.x).toBe(300)
    expect(events).toEqual(['press 1', 'release 1', 'press 3'])
  })

  it('keeps the pinch scale when a third finger lands', () => {
    const { tracker, send } = setup()
    send('pointerdown', 1, 0)
    send('pointerdown', 2, 100)
    send('pointermove', 2, 200)
    expect(tracker.pinch.scale).toBeCloseTo(2)
    send('pointerdown', 3, 400)
    expect(tracker.pinch.scale).toBeCloseTo(2)
  })
})
