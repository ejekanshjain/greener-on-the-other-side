import { describe, expect, it } from 'vitest'

import { YARD_DONE_MS, YARD_FAILURE_MS } from '../game/tuning'
import { YARD_LINES } from '../game/yard'
import { YardRun } from './yardRun'

/** A yard opened at real time 1000, and a press on its step's object let go at once. */
function opened() {
  const run = new YardRun(5, 1000)
  const letGo = (speedPx: number, at: number) => {
    const item = run.garden.item(run.steps.id)
    if (!item) throw new Error('no step object')
    run.garden.command({
      type: 'grab',
      target: { type: 'item', id: item.id, distance: 0 },
      lx: item.lx,
      ly: item.ly
    })
    run.garden.command({
      type: 'release',
      release:
        speedPx > 0
          ? { type: 'throw', speedPx, dirX: 0, dirY: -1 }
          : { type: 'putDown', reason: 'slow' }
    })
    run.update(at)
  }
  return { run, letGo }
}

describe('YardRun', () => {
  it('shows each failure tip for 3s, then the step line again', () => {
    const { run, letGo } = opened()
    const first = run.shown(1000)
    expect(first).toMatchObject({ text: YARD_LINES.throw, failure: false })
    letGo(0, 1100)
    const tip = run.shown(1100)
    expect(tip).toMatchObject({
      text: "Let go while you're still moving.",
      failure: true
    })
    // The same mistake again shows its tip again, as a new showing.
    letGo(0, 1600)
    const again = run.shown(1600)
    expect(again.text).toBe(tip.text)
    expect(again.key).not.toBe(tip.key)
    expect(run.shown(1600 + YARD_FAILURE_MS - 1).failure).toBe(true)
    const back = run.shown(1600 + YARD_FAILURE_MS)
    expect(back).toMatchObject({ text: YARD_LINES.throw, failure: false })
    // It shows again in place of the tip, so the line pops in again.
    expect(back.key).not.toBe(again.key)
  })

  it('plays the ghost finger as each step starts and again after 2 failed tries', () => {
    const { run, letGo } = opened()
    expect(run.ghost).toMatchObject({ move: 'throw', startAt: 1000 })
    run.ghost = null
    letGo(0, 1200)
    expect(run.ghost).toBeNull()
    letGo(0, 1400)
    expect(run.ghost).toMatchObject({ move: 'throw', startAt: 1400 })
    letGo(1400, 1500)
    run.update(4000)
    expect(run.steps.step).toBe(1)
    expect(run.ghost).toMatchObject({ move: 'pull', id: run.steps.id })
  })

  it('says the yard is over 2s after its last step', () => {
    const { run } = opened()
    run.steps.begin(2)
    const x = run.steps.col * 50 + 25
    for (let row = 0; row < 16; row++)
      run.garden.command({
        type: 'mow',
        lx: x,
        ly: row * 40 + 20,
        speedPx: 300
      })
    run.garden.command({ type: 'mowEnd' })
    run.update(2000)
    expect(run.finished).toBe(true)
    expect(run.shown(2000).text).toBe(YARD_LINES.done)
    expect(run.over(2000 + YARD_DONE_MS - 1)).toBe(false)
    expect(run.over(2000 + YARD_DONE_MS)).toBe(true)
  })

  it('marks the weed tip after step 2 and the mow tip after step 3, and none before', () => {
    const { run, letGo } = opened()
    letGo(1400, 1100)
    run.update(4000)
    expect(run.steps.step).toBe(1)
    // A visit closed here, by Skip or a match start, has taught no round 1 tip.
    expect(run.learned).toEqual([])
    const weed = run.garden.weeds.find(w => w.id === run.steps.id)
    if (!weed) throw new Error('no weed')
    run.garden.command({
      type: 'grab',
      target: { type: 'weed', id: weed.id, distance: 0 },
      lx: weed.lx,
      ly: weed.ly
    })
    run.garden.command({ type: 'hold', lx: weed.lx, ly: weed.ly - 70 })
    run.update(4100)
    expect(run.steps.pulled).toBe(true)
    run.garden.command({
      type: 'release',
      release: { type: 'throw', speedPx: 2200, dirX: 0, dirY: -1 }
    })
    run.update(7000)
    expect(run.steps.step).toBe(2)
    expect(run.learned).toEqual(['weed'])
    const x = run.steps.col * 50 + 25
    for (let row = 0; row < 16; row++)
      run.garden.command({
        type: 'mow',
        lx: x,
        ly: row * 40 + 20,
        speedPx: 300
      })
    run.garden.command({ type: 'mowEnd' })
    run.update(7100)
    expect(run.learned).toEqual(['weed', 'mow'])
  })
})
