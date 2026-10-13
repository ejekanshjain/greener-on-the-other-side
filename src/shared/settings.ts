import { createStore, useStore } from './store'

/** Player settings. They live in memory only and reset on reload. */
export interface Settings {
  /** Plays sound effects when true. */
  sound: boolean
  /** Master volume from 0 to 1. */
  volume: number
  /** Scales how strongly jolts and tilt register, from 0.5 to 2. */
  sensitivity: number
  /** Assist Mode: loosens steadiness limits for players with shaky hands. */
  assist: boolean
  /** Calms screen shake, line boil and UI animation. */
  reducedMotion: boolean
}

/** Jolt multiplier while Assist Mode is on. 0.6 means a jolt reads 40% weaker. */
export const ASSIST_JOLT_SCALE = 0.6

/** The one settings store for the running game. */
export const settings = createStore<Settings>({
  sound: true,
  volume: 0.8,
  sensitivity: 1,
  assist: false,
  reducedMotion:
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
})

/**
 * Re-renders with a selected setting.
 *
 * @example const assist = useSettings(s => s.assist)
 */
export function useSettings<S>(selector: (state: Settings) => S): S {
  return useStore(settings, selector)
}
