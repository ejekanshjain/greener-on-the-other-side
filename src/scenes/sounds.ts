import type { Garden } from '../game/garden'
import { HEALTH_MAX, MOW_SCALP_PX, THROW_MAX_PX } from '../game/tuning'
import { isHeavy, Mess, type GardenEvent } from '../game/types'
import {
  sfx,
  type LoopHandle,
  type LoopName,
  type PlayOptions,
  type SfxName
} from '../shared/audio'
import { clamp } from '../shared/math'

/** Plays one sound; the session's version also logs it. */
export type PlaySound = (name: SfxName, options?: PlayOptions) => void

/**
 * The sound map for your own garden's events: a whoosh per throw, thuds and squishes on
 * landings, the clip's creak, pops, the mower's rattle, drips, splashes, sparkles,
 * Biscuit, the vane, the shed and heavy junk. Loops (mowing, pouring, the tap, the wind)
 * follow the garden's state in `SoundLoops` instead.
 */
export function playEvent(
  event: GardenEvent,
  garden: Garden,
  play: PlaySound
): void {
  switch (event.type) {
    case 'throw':
      return play('whoosh', {
        pitch: 0.8 + 0.6 * Math.min(1, event.speedPx / THROW_MAX_PX)
      })
    case 'land': {
      // Heavy junk sinks with its own slam.
      if (isHeavy(event.landing.kind)) return
      const patch = event.landing.patch
      const mud =
        patch >= 0 &&
        ((garden.grid.health[patch] ?? HEALTH_MAX) <= 1 ||
          garden.grid.mess[patch] === Mess.puddle)
      return play(mud ? 'squish' : 'thud', { volume: 0.8 })
    }
    case 'clip':
      return play('creak', { pitch: 1.2 })
    case 'catch':
    case 'yank':
    case 'takeBack':
      return play('pop')
    case 'shell':
      return play('squish', { pitch: 1.3, volume: 0.7 })
    case 'scalp':
    case 'run':
      return play('rattle', { volume: 0.7 })
    case 'canEmpty':
      return play('drip')
    case 'flood':
      return play('splash')
    case 'sparkle':
      return play('ding', { pitch: 1.8, volume: 0.35 })
    case 'bark':
      return play('bark')
    case 'circle':
      return play('bark', { pitch: 0.6 })
    case 'dig':
      return play('stomp')
    case 'vane':
      return play('creak')
    case 'shed':
      return play('slam')
    case 'sink':
      play('slam', { volume: 0.8 })
      play('rattle')
      if (event.kind === 'trampoline') play('boing')
      return
    case 'bounce':
      return play('boing')
    case 'lift':
      return play('crank', { volume: 0.6 })
    default:
      return
  }
}

/** The looping sounds a garden can make. */
const LOOPS: readonly LoopName[] = ['rumble', 'pour', 'rain', 'wind']

/**
 * The looping sounds that follow your garden each frame: the mower's rumble (louder the
 * faster you rub), the can's pour, the running tap's rain and a gust's wind. Pass null
 * when nothing plays, such as outside play, and every loop fades out.
 */
export class SoundLoops {
  private readonly handles = new Map<LoopName, LoopHandle>()

  constructor(private readonly onStart: (name: LoopName) => void) {}

  /** Starts, adjusts or stops each loop for `garden` this frame. */
  sync(garden: Garden | null): void {
    for (const name of LOOPS) {
      const volume = garden ? loopVolume(name, garden) : 0
      const handle = this.handles.get(name)
      if (volume <= 0) {
        if (handle) {
          handle.stop()
          this.handles.delete(name)
        }
        continue
      }
      if (handle) {
        handle.setVolume(volume)
        continue
      }
      if (!sfx.unlocked) continue
      this.handles.set(
        name,
        sfx.loop(name, { volume, pitch: name === 'rumble' ? 1.6 : 1 })
      )
      this.onStart(name)
    }
  }

  /** Stops every loop at once. */
  stop(): void {
    for (const handle of this.handles.values()) handle.stop()
    this.handles.clear()
  }
}

/** How loud a loop plays for the garden now, or 0 for silent. */
function loopVolume(name: LoopName, garden: Garden): number {
  switch (name) {
    case 'rumble':
      return garden.mower.at
        ? clamp(garden.mower.speedPx / MOW_SCALP_PX, 0.3, 1)
        : 0
    case 'pour':
      return garden.water.pour && garden.water.can > 0 ? 0.6 : 0
    case 'rain':
      return garden.water.tapOn ? 0.3 : 0
    case 'wind':
      return garden.wind.over !== 0 || garden.wind.side !== 0 ? 0.5 : 0
    default:
      return 0
  }
}
