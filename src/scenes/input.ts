import type { Garden } from '../game/garden'
import { patchAt } from '../game/grid'
import { HeavyGrip } from '../game/heavy'
import { JobPicker, releaseRule, type GrassJob } from '../game/press'
import {
  MOWER_LIFT,
  REACH_MOUSE_PX,
  REACH_TOUCH_PX,
  SNAP_REACH_PX,
  TAP_POS,
  TAP_REACH
} from '../game/tuning'
import { isHeavy } from '../game/types'
import type { Viewport } from '../shared/canvas'
import { PointerTracker } from '../shared/input/pointer'
import { inEdgeGuard, toLawn } from './layout'
import { ReleaseSampler } from './sampler'

/** What the current press is doing, for the scene to draw the can or the mower. */
export interface PressView {
  /** The job on grass, or null when the press isn't on grass. */
  job: GrassJob | null
  /** The finger in lawn units. */
  lx: number
  ly: number
  /** Event time when the press started, in `performance.now()` ms. */
  since: number
}

/**
 * Turns one finger or mouse button into garden commands. A press picks its job by what
 * lies under it: Biscuit while he circles, the tap, the grass bag, then the nearest item
 * (the one in Biscuit's mouth too), rooted weed or snail in reach, then heavy junk, then
 * grass. Heavy junk drags at once or lifts after 0.6s held still. Grass waits 150 ms to
 * choose between watering and mowing. Letting go of a held item applies the release
 * rule to the peak swipe speed. A second finger does nothing.
 */
export class PressController {
  private readonly tracker: PointerTracker
  private readonly sampler = new ReleaseSampler()
  private readonly picker = new JobPicker()
  private readonly grip = new HeavyGrip()
  private readonly lawn = { x: 0, y: 0 }
  private mode: 'idle' | 'hold' | 'heavy' | 'grass' | 'spent' = 'idle'
  /** What the garden is doing for this press: pouring, mowing or neither. */
  private active: 'water' | 'mow' | null = null
  private pressX = 0
  private pressY = 0
  private touch = false
  readonly view: PressView = { job: null, lx: 0, ly: 0, since: 0 }

  constructor(
    canvas: HTMLCanvasElement,
    private readonly viewport: Viewport,
    private readonly garden: () => Garden | null
  ) {
    this.tracker = new PointerTracker(canvas, {
      toLogical: (x, y, out) => viewport.toLogical(x, y, out),
      handoff: false
    })
    this.tracker.onPress((p, e) => this.press(p.x, p.y, e))
    this.tracker.onDrag((p, e) => this.drag(p.x, p.y, e))
    this.tracker.onRelease((_p, e) => this.release(e))
  }

  /**
   * Ends the wait on grass, or lifts heavy junk held still, when no pointer event arrives
   * in time. Call it every frame.
   */
  update(now: number): void {
    if (this.mode === 'heavy' && this.grip.grip === 'wait') {
      if (this.grip.tick(now) === 'lifted')
        this.garden()?.command({ type: 'lift' })
      return
    }
    if (this.mode !== 'grass' || this.picker.job !== 'wait') return
    if (this.picker.tick(now) !== 'wait') this.grassStep(now)
  }

  dispose(): void {
    this.tracker.dispose()
  }

  private press(x: number, y: number, e: PointerEvent): void {
    const garden = this.garden()
    if (!garden) return
    this.touch = e.pointerType === 'touch'
    if (this.touch && inEdgeGuard(e.clientX, window.innerWidth)) return
    const lawn = toLawn(x, y, this.lawn)
    this.pressX = lawn.x
    this.pressY = lawn.y
    this.sampler.reset()
    this.sampler.add(e.clientX, e.clientY, e.timeStamp)
    const reach =
      (this.touch ? REACH_TOUCH_PX : REACH_MOUSE_PX) / this.viewport.scale
    // Biscuit circling a patch wins every press near it, even over the tap.
    if (garden.biscuitHit(lawn.x, lawn.y, reach)) {
      garden.command({ type: 'pat' })
      this.mode = 'spent'
      return
    }
    if (
      Math.hypot(lawn.x - TAP_POS.lx, lawn.y - TAP_POS.ly) <=
      Math.max(TAP_REACH, reach)
    ) {
      garden.command({ type: 'tap' })
      this.mode = 'spent'
      return
    }
    if (garden.bagHit(lawn.x, lawn.y, reach)) {
      garden.command({ type: 'grabBag', lx: lawn.x, ly: lawn.y })
      this.mode = 'hold'
      return
    }
    const target = garden.hitTest(lawn.x, lawn.y, reach)
    if (target) {
      garden.command({ type: 'grab', target, lx: lawn.x, ly: lawn.y })
      const item = target.type === 'item' ? garden.item(target.id) : undefined
      this.mode = item && isHeavy(item.kind) ? 'heavy' : 'hold'
      if (this.mode === 'heavy')
        this.grip.start(e.clientX, e.clientY, e.timeStamp)
      return
    }
    if (patchAt(lawn.x, lawn.y) < 0) {
      if (garden.mowerHit(lawn.x, lawn.y, reach))
        garden.command({ type: 'pokeMower' })
      this.mode = 'spent'
      return
    }
    this.mode = 'grass'
    this.picker.start(e.clientX, e.clientY, e.timeStamp)
    this.view.job = 'wait'
    this.view.lx = lawn.x
    this.view.ly = lawn.y
    this.view.since = e.timeStamp
  }

  private drag(x: number, y: number, e: PointerEvent): void {
    if (this.mode !== 'hold' && this.mode !== 'heavy' && this.mode !== 'grass')
      return
    const garden = this.garden()
    if (!garden) return
    // Coalesced events carry the samples between frames, which sharpens swipe speeds.
    const samples = e.getCoalescedEvents?.() ?? []
    if (samples.length === 0) samples.push(e)
    for (const s of samples) {
      this.sampler.add(s.clientX, s.clientY, s.timeStamp)
      if (this.mode === 'grass')
        this.picker.move(s.clientX, s.clientY, s.timeStamp)
    }
    const lawn = toLawn(x, y, this.lawn)
    if (this.mode === 'heavy') return this.heavyStep(garden, lawn.x, lawn.y, e)
    if (this.mode === 'hold') {
      garden.command({ type: 'hold', lx: lawn.x, ly: lawn.y })
      return
    }
    this.view.lx = lawn.x
    this.view.ly = lawn.y
    this.grassStep(e.timeStamp)
  }

  /**
   * Follows a press on heavy junk: a drag moves it, a lift waits for the swipe, and a slow
   * drift after a lift sets it back down and ends the press.
   */
  private heavyStep(
    garden: Garden,
    lx: number,
    ly: number,
    e: PointerEvent
  ): void {
    const was = this.grip.grip
    const speed = this.sampler.peak(e.timeStamp).speedPx
    const grip = this.grip.move(e.clientX, e.clientY, e.timeStamp, speed)
    if (was === 'wait' && grip === 'lifted') garden.command({ type: 'lift' })
    if (grip === 'drag') garden.command({ type: 'hold', lx, ly })
    else if (grip === 'down') {
      garden.command({ type: 'release', release: { type: 'putDown' } })
      this.mode = 'spent'
    }
  }

  /** Carries out the grass job at the finger's latest lawn point. */
  private grassStep(now: number): void {
    const garden = this.garden()
    if (!garden) return
    const job = this.picker.job
    this.view.job = job
    const { lx, ly } = this.view
    if (job === 'water') {
      this.active = 'water'
      garden.command({ type: 'pour', lx, ly })
    } else if (job === 'mow') {
      const speedPx = this.sampler.pathSpeed(now)
      if (this.active === 'water') garden.command({ type: 'pourEnd' })
      // A press that mowed from the start rolls from where it began, so the strokes
      // before the job was picked count. A pour that turns into mowing starts here.
      if (this.active === null)
        garden.command({
          type: 'mow',
          lx: this.pressX,
          ly: this.pressY - MOWER_LIFT,
          speedPx
        })
      this.active = 'mow'
      garden.command({ type: 'mow', lx, ly: ly - MOWER_LIFT, speedPx })
    } else if (job === 'snap') this.snap(garden, lx, ly)
  }

  /**
   * A fast flick that missed: grab the nearest light thing within 44 px of the press, or
   * nothing.
   */
  private snap(garden: Garden, lx: number, ly: number): void {
    this.view.job = null
    const target = garden.hitTest(
      this.pressX,
      this.pressY,
      SNAP_REACH_PX / this.viewport.scale
    )
    // Heavy junk never snaps: it needs a lift, and a flick would only drag it.
    const item = target?.type === 'item' ? garden.item(target.id) : undefined
    if (!target || (item && isHeavy(item.kind))) {
      this.mode = 'spent'
      return
    }
    garden.command({ type: 'grab', target, lx: this.pressX, ly: this.pressY })
    garden.command({ type: 'hold', lx, ly })
    this.mode = 'hold'
  }

  private release(e: PointerEvent): void {
    const mode = this.mode
    this.mode = 'idle'
    this.view.job = null
    const garden = this.garden()
    const active = this.active
    this.active = null
    if (!garden) return
    if (active === 'water') garden.command({ type: 'pourEnd' })
    if (active === 'mow') garden.command({ type: 'mowEnd' })
    if (mode !== 'hold' && mode !== 'heavy') return
    const cancelled = e.type === 'pointercancel'
    if (!cancelled) this.sampler.add(e.clientX, e.clientY, e.timeStamp)
    garden.command({
      type: 'release',
      release: releaseRule(this.sampler.peak(e.timeStamp), cancelled)
    })
  }
}
