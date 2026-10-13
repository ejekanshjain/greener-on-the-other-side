import { afterEach, describe, expect, it } from 'vitest'

import {
  formatClock,
  isDone,
  startTimer,
  timeLeftMs,
  timerProgress,
  waitMs
} from './clock'
import { devFlags } from './dev'

afterEach(() => {
  devFlags.fast = false
})

describe('real-time timers', () => {
  it('tracks time left, progress and completion from wall-clock times', () => {
    const timer = startTimer('Jelly setting', 60_000, 1_000)
    expect(timer.endsAt).toBe(61_000)
    expect(timeLeftMs(timer, 31_000)).toBe(30_000)
    expect(timerProgress(timer, 31_000)).toBe(0.5)
    expect(isDone(timer, 60_999)).toBe(false)
    expect(isDone(timer, 61_000)).toBe(true)
    expect(timeLeftMs(timer, 90_000)).toBe(0)
    expect(timerProgress(timer, 90_000)).toBe(1)
  })

  it('shrinks long waits to 3 seconds in fast mode', () => {
    devFlags.fast = true
    expect(waitMs(60_000)).toBe(3_000)
    expect(waitMs(1_000)).toBe(1_000)
    expect(startTimer('Glue drying', 60_000, 0).endsAt).toBe(3_000)
  })

  it('formats countdowns, rounding up', () => {
    expect(formatClock(42_000)).toBe('0:42')
    expect(formatClock(41_001)).toBe('0:42')
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(-5)).toBe('0:00')
    expect(formatClock(60_000)).toBe('1:00')
    expect(formatClock(3_725_000)).toBe('1:02:05')
  })
})
