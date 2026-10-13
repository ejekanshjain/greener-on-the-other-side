import { useEffect, useState } from 'react'

import { devFlags } from './dev'

/** Length of every real-time wait when the dev `?fast` flag is on. */
export const FAST_WAIT_MS = 3000

/** A real-time wait stored as wall-clock times, so it stays correct while the tab sleeps. */
export interface RealTimer {
  id: string
  label: string
  /** `Date.now()` when the timer started. */
  startedAt: number
  /** `Date.now()` when the timer finishes. */
  endsAt: number
  /** Effective length in ms, after `waitMs`. */
  durationMs: number
}

let nextTimerId = 1

/** Wall-clock time in ms (`Date.now()`). Use this, not `performance.now()`, for real-time waits. */
export function now(): number {
  return Date.now()
}

/**
 * Returns the wait length to use for a designed wait of `ms`. In dev builds with `?fast`,
 * waits longer than 3 seconds shrink to 3 seconds. `startTimer` already calls this.
 */
export function waitMs(ms: number): number {
  return devFlags.fast ? Math.min(ms, FAST_WAIT_MS) : ms
}

/**
 * Starts a real-time timer. Pass the designed duration: this applies `waitMs`, so `?fast`
 * works without changes at call sites.
 *
 * @example const fridge = startTimer('Jelly setting', 60_000)
 */
export function startTimer(
  label: string,
  durationMs: number,
  startedAt = now()
): RealTimer {
  const effective = waitMs(durationMs)
  return {
    id: `timer-${nextTimerId++}`,
    label,
    startedAt,
    endsAt: startedAt + effective,
    durationMs: effective
  }
}

/** Milliseconds until the timer finishes, never below 0. */
export function timeLeftMs(timer: RealTimer, at = now()): number {
  return Math.max(0, timer.endsAt - at)
}

/** True once the timer's finish time has passed. */
export function isDone(timer: RealTimer, at = now()): boolean {
  return at >= timer.endsAt
}

/** How far through the timer is, from 0 to 1. */
export function timerProgress(timer: RealTimer, at = now()): number {
  if (timer.durationMs <= 0) return 1
  const progress = (at - timer.startedAt) / timer.durationMs
  return progress < 0 ? 0 : progress > 1 ? 1 : progress
}

/**
 * Formats a duration as a countdown clock. Rounds up, so "0:00" only shows when time is up.
 *
 * @example formatClock(42_000) // "0:42"; formatClock(3_725_000) // "1:02:05"
 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`
}

/**
 * Returns `Date.now()` and re-renders every `intervalMs`, and immediately when the tab
 * becomes visible again. Use it for countdown displays.
 *
 * @example const t = useNow(); const left = timeLeftMs(timer, t)
 */
export function useNow(intervalMs = 250): number {
  const [time, setTime] = useState(now)
  useEffect(() => {
    const tick = () => setTime(now())
    const id = setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [intervalMs])
  return time
}
