import { describe, expect, it } from 'vitest'

import { JobPicker, releaseRule } from './press'

describe('releaseRule', () => {
  it('throws at 400 px/s or faster within 60 degrees of the fence', () => {
    expect(releaseRule({ speedPx: 400, dirX: 0, dirY: -1 }).type).toBe('throw')
    const at60 = {
      speedPx: 900,
      dirX: Math.sin(Math.PI / 3),
      dirY: -Math.cos(Math.PI / 3)
    }
    expect(releaseRule(at60).type).toBe('throw')
  })

  it('puts down slow, off-angle and cancelled releases', () => {
    expect(releaseRule({ speedPx: 399, dirX: 0, dirY: -1 }).type).toBe(
      'putDown'
    )
    const at65 = { speedPx: 900, dirX: Math.sin(1.134), dirY: -Math.cos(1.134) }
    expect(releaseRule(at65).type).toBe('putDown')
    expect(releaseRule({ speedPx: 2000, dirX: 0, dirY: 1 }).type).toBe(
      'putDown'
    )
    expect(releaseRule({ speedPx: 2000, dirX: 0, dirY: -1 }, true).type).toBe(
      'putDown'
    )
  })

  it('normalises the throw direction', () => {
    const release = releaseRule({ speedPx: 1000, dirX: 30, dirY: -40 })
    expect(release).toEqual({
      type: 'throw',
      speedPx: 1000,
      dirX: 0.6,
      dirY: -0.8
    })
  })
})

/** Feeds a straight-line drag at `speedPx` from t = `startMs` for `ms`, one sample per 10 ms. */
function drag(
  picker: JobPicker,
  startMs: number,
  ms: number,
  speedPx: number,
  from = 0
) {
  let job = picker.job
  for (let t = startMs + 10; t <= startMs + ms; t += 10)
    job = picker.move(from + ((t - startMs) * speedPx) / 1000, 0, t)
  return job
}

describe('JobPicker', () => {
  it('waters once a press stays put for 150 ms', () => {
    const picker = new JobPicker()
    picker.start(0, 0, 0)
    picker.move(3, 2, 60)
    expect(picker.tick(140)).toBe('wait')
    expect(picker.tick(150)).toBe('water')
  })

  it('mows once a press moves 12 px within 150 ms, committing at 100 ms', () => {
    const picker = new JobPicker()
    picker.start(0, 0, 0)
    // 400 px/s crosses 12 px after 30 ms, but a flick could still speed up until 100 ms.
    expect(drag(picker, 0, 60, 400)).toBe('wait')
    expect(drag(picker, 60, 40, 400, 24)).toBe('mow')
    const still = new JobPicker()
    still.start(0, 0, 0)
    still.move(14, 0, 50)
    expect(still.tick(99)).toBe('wait')
    expect(still.tick(100)).toBe('mow')
  })

  it('snaps when a slow start speeds past 1,000 px/s before 100 ms', () => {
    const picker = new JobPicker()
    picker.start(0, 0, 0)
    expect(picker.move(13, 0, 19)).toBe('wait')
    expect(picker.move(64, 0, 45)).toBe('snap')
  })

  it('snaps instead of mowing when the press starts faster than 1,000 px/s', () => {
    const picker = new JobPicker()
    picker.start(0, 0, 0)
    expect(drag(picker, 0, 30, 1500)).toBe('snap')
    expect(picker.move(400, 0, 200)).toBe('snap')
  })

  it('snaps when the finger jumps 12 px faster than 8 ms after the press', () => {
    const picker = new JobPicker()
    picker.start(0, 0, 100)
    expect(picker.move(2, 0, 102)).toBe('wait')
    expect(picker.move(30, 0, 104)).toBe('snap')
  })

  it('turns a pour into mowing after 100 ms above 200 px/s, never back', () => {
    const picker = new JobPicker()
    picker.start(0, 0, 0)
    picker.tick(150)
    // A slow slide keeps pouring.
    expect(drag(picker, 150, 300, 150)).toBe('water')
    // A fast stretch shorter than 100 ms keeps pouring too.
    expect(drag(picker, 450, 80, 400, 45)).toBe('water')
    expect(drag(picker, 530, 200, 50, 77)).toBe('water')
    expect(drag(picker, 730, 120, 400, 87)).toBe('mow')
    picker.tick(2000)
    expect(drag(picker, 2000, 300, 0, 135)).toBe('mow')
  })
})
