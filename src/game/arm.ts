import {
  ARM_DRAIN_PER_S,
  ARM_HEAVY,
  ARM_LIGHT,
  ARM_LOCK_MS,
  HAND_MS
} from './tuning'

/**
 * Your throwing arm. The meter fills with each throw and drains over time; a full meter
 * locks throws for 1.5s, and the hand needs 0.4s between throws. Times are garden ms.
 */
export interface Arm {
  /** Meter level from 0 to 1 at garden time `at`. */
  level: number
  at: number
  /** No throws until this garden time, after the meter filled. */
  lockUntil: number
  /** Garden time of the last throw, or -Infinity. */
  lastThrowAt: number
}

/** Why a throw can't go right now. */
export type ArmBlock = 'hand' | 'tired'

/** A fresh arm. */
export function createArm(): Arm {
  return { level: 0, at: 0, lockUntil: -Infinity, lastThrowAt: -Infinity }
}

/** The meter level at garden time `t`, drained since its last change. */
export function armLevel(arm: Arm, t: number): number {
  return Math.max(0, arm.level - (ARM_DRAIN_PER_S * (t - arm.at)) / 1000)
}

/** Null when a throw can go at time `t`, else why not. */
export function armBlock(arm: Arm, t: number): ArmBlock | null {
  if (t < arm.lockUntil) return 'tired'
  if (t - arm.lastThrowAt < HAND_MS) return 'hand'
  return null
}

/**
 * Spends a throw at time `t`: the meter fills by 18%, or 45% for heavy junk. Filling it
 * to the top locks throws for 1.5s.
 */
export function spendThrow(arm: Arm, t: number, heavy: boolean): void {
  const level = armLevel(arm, t) + (heavy ? ARM_HEAVY : ARM_LIGHT)
  arm.level = Math.min(1, level)
  arm.at = t
  arm.lastThrowAt = t
  if (level >= 1) arm.lockUntil = t + ARM_LOCK_MS
}
