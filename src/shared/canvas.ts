import { useCallback, useState } from 'react'

import { exposeDev } from './dev'
import { palette } from './palette'
import { setSketchScale } from './sketch'

/** `contain` shows the whole design with extra space around it; `cover` fills the screen and crops. */
export type FitMode = 'contain' | 'cover'

export interface ViewportOptions {
  /** Logical design width. Game code draws in these units. */
  width: number
  /** Logical design height. */
  height: number
  mode?: FitMode
  /** Highest device pixel ratio to render at. Defaults to 2 to keep phones fast. */
  maxDpr?: number
  /** Where spare height goes: split above and below (`'center'`, the default), or all above (`'end'`). */
  alignY?: 'center' | 'end'
}

/** How a logical design maps into a CSS box. */
export interface Fit {
  /** CSS pixels per logical unit. */
  scale: number
  /** CSS pixel position of the logical origin inside the box. */
  offsetX: number
  offsetY: number
}

/** A mutable point, reused to avoid allocations. */
export interface Point {
  x: number
  y: number
}

/**
 * Fits a `width` x `height` design into a `boxWidth` x `boxHeight` box, centred. With
 * `alignY: 'end'` the design sits on the box's bottom edge, so spare height goes above it.
 */
export function fitDesign(
  boxWidth: number,
  boxHeight: number,
  width: number,
  height: number,
  mode: FitMode,
  alignY: 'center' | 'end' = 'center'
): Fit {
  const sx = boxWidth / width
  const sy = boxHeight / height
  const scale = Math.max(
    1e-6,
    mode === 'contain' ? Math.min(sx, sy) : Math.max(sx, sy)
  )
  const spareY = boxHeight - height * scale
  return {
    scale,
    offsetX: (boxWidth - width * scale) / 2,
    offsetY: alignY === 'end' ? spareY : spareY / 2
  }
}

/**
 * Sizes a canvas to its CSS box times the device pixel ratio, and maps a logical design
 * space onto it. Most games use it through `useGameCanvas`.
 */
export class Viewport {
  readonly width: number
  readonly height: number
  readonly mode: FitMode
  readonly maxDpr: number
  readonly alignY: 'center' | 'end'
  canvas: HTMLCanvasElement | null = null
  /** CSS size of the canvas box. */
  cssWidth = 0
  cssHeight = 0
  dpr = 1
  /** CSS pixels per logical unit, and the CSS position of the logical origin. */
  scale = 1
  offsetX = 0
  offsetY = 0
  /** The visible area in logical units. Larger than the design in contain mode, smaller in cover mode. */
  readonly view = { x: 0, y: 0, width: 0, height: 0 }
  private context: CanvasRenderingContext2D | null = null
  private left = 0
  private top = 0
  private readonly listeners = new Set<() => void>()

  constructor({
    width,
    height,
    mode = 'contain',
    maxDpr = 2,
    alignY = 'center'
  }: ViewportOptions) {
    this.width = width
    this.height = height
    this.mode = mode
    this.maxDpr = maxDpr
    this.alignY = alignY
    this.view.width = width
    this.view.height = height
  }

  /** The 2D context. Throws until a canvas is attached. */
  get ctx(): CanvasRenderingContext2D {
    if (!this.context) {
      throw new Error(
        'Viewport: no canvas is attached, so there is nothing to draw on. Start the loop in an effect after rendering <canvas ref={canvasRef}>.'
      )
    }
    return this.context
  }

  /** Starts tracking a canvas element's size. Returns a function that stops tracking. */
  attach(canvas: HTMLCanvasElement): () => void {
    this.canvas = canvas
    const context = canvas.getContext('2d', { alpha: false })
    if (!context)
      throw new Error(
        'Viewport: the browser refused a 2D canvas context, so nothing can be drawn'
      )
    this.context = context
    const measure = () => this.resize()
    const observer = new ResizeObserver(measure)
    observer.observe(canvas)
    window.addEventListener('resize', measure)
    screen.orientation?.addEventListener('change', measure)
    measure()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      screen.orientation?.removeEventListener('change', measure)
    }
  }

  /** Re-measures the canvas. Runs automatically on resize and orientation change. */
  resize(): void {
    const canvas = this.canvas
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    this.left = rect.left
    this.top = rect.top
    this.cssWidth = rect.width
    this.cssHeight = rect.height
    this.dpr = Math.min(this.maxDpr, window.devicePixelRatio || 1)
    const pixelWidth = Math.max(1, Math.round(rect.width * this.dpr))
    const pixelHeight = Math.max(1, Math.round(rect.height * this.dpr))
    // Assigning width or height clears the canvas, so only do it on a real change.
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight
    const fit = fitDesign(
      rect.width,
      rect.height,
      this.width,
      this.height,
      this.mode,
      this.alignY
    )
    this.scale = fit.scale
    this.offsetX = fit.offsetX
    this.offsetY = fit.offsetY
    this.view.x = -fit.offsetX / fit.scale
    this.view.y = -fit.offsetY / fit.scale
    this.view.width = rect.width / fit.scale
    this.view.height = rect.height / fit.scale
    for (const listener of this.listeners) listener()
  }

  /** Calls `listener` after every resize. Returns an unsubscribe function. */
  onResize(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Sets the logical-to-pixel transform on `ctx`, and tells the sketch helpers its scale. */
  apply(ctx: CanvasRenderingContext2D = this.ctx): void {
    const k = this.scale * this.dpr
    setSketchScale(ctx, this.scale)
    ctx.setTransform(
      k,
      0,
      0,
      k,
      this.offsetX * this.dpr,
      this.offsetY * this.dpr
    )
  }

  /**
   * Starts a frame: fills the whole canvas with `background`, applies the logical transform,
   * and returns the context.
   */
  begin(background: string = palette.paper): CanvasRenderingContext2D {
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.fillStyle = background
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    this.apply(ctx)
    return ctx
  }

  /** Converts client (CSS) coordinates, such as from a pointer event, into logical units. */
  toLogical(
    clientX: number,
    clientY: number,
    out: Point = { x: 0, y: 0 }
  ): Point {
    out.x = (clientX - this.left - this.offsetX) / this.scale
    out.y = (clientY - this.top - this.offsetY) / this.scale
    return out
  }

  /** The design area in canvas backing pixels. Useful as a crop when capturing replays. Allocates; cache it in `onResize`. */
  designRect(): { x: number; y: number; width: number; height: number } {
    const k = this.scale * this.dpr
    return {
      x: this.offsetX * this.dpr,
      y: this.offsetY * this.dpr,
      width: this.width * k,
      height: this.height * k
    }
  }
}

/**
 * Creates a `Viewport` and a ref for a full-screen `<canvas>`. Options are read once.
 *
 * @example
 * const { canvasRef, viewport } = useGameCanvas({ width: 600, height: 800, mode: 'contain' })
 * useEffect(() => startLoop({ update, render: () => draw(viewport.begin()) }), [viewport])
 * return <canvas ref={canvasRef} className="size-full" />
 */
export function useGameCanvas(options: ViewportOptions): {
  canvasRef: (canvas: HTMLCanvasElement | null) => (() => void) | undefined
  viewport: Viewport
} {
  const [viewport] = useState(() => new Viewport(options))
  const canvasRef = useCallback(
    (canvas: HTMLCanvasElement | null) =>
      canvas ? viewport.attach(canvas) : undefined,
    [viewport]
  )
  return { canvasRef, viewport }
}

// ---------------------------------------------------------------- Loop

/** Splits frame time into fixed update steps, keeping the remainder for the next frame. */
export class FixedStepper {
  private accumulator = 0

  constructor(
    readonly stepMs: number,
    readonly maxFrameMs: number
  ) {}

  /** Adds one frame's elapsed time and returns how many fixed steps to run. */
  advance(frameMs: number): number {
    // Clamping stops a long pause (background tab, debugger) from running hundreds of steps.
    this.accumulator += Math.min(Math.max(frameMs, 0), this.maxFrameMs)
    // The 1 ms slack absorbs rAF jitter, so a 60 Hz screen runs one step per frame
    // instead of alternating between 0 and 2.
    const steps = Math.floor((this.accumulator + 1) / this.stepMs)
    this.accumulator -= steps * this.stepMs
    return steps
  }

  /** How far between the last step and the next one, from 0 to 1. Use it to interpolate drawing. */
  get alpha(): number {
    return Math.max(0, this.accumulator / this.stepMs)
  }
}

export interface LoopHandlers {
  /** Advances the simulation by exactly `dtMs` (one fixed step). */
  update(dtMs: number): void
  /**
   * Draws a frame. `alpha` is the progress towards the next step. `timeMs` is the loop's
   * simulated clock, which advances with every update, including dev steps. Use it for
   * animation, `boilSeed` and replay capture, not for real-time waits.
   */
  render(alpha: number, timeMs: number): void
}

export interface LoopOptions {
  /** Fixed update step. Defaults to 1000 / 60. */
  stepMs?: number
  /** Longest frame time counted, so a tab returning from the background doesn't explode physics. Defaults to 100. */
  maxFrameMs?: number
}

/** The dev scripting API `startLoop` publishes at `window.__game.loop`. */
export interface LoopDevApi {
  /** Runs `updates` fixed steps, rendering after each one so replays record them, even while animation frames are throttled. */
  step(updates?: number): void
  /** The simulated clock in ms. */
  readonly timeMs: number
}

/**
 * Runs `update` at a fixed 60 Hz and `render` once per animation frame. Returns `stop`.
 * In dev builds it also publishes `window.__game.loop.step(n)` for browser automation.
 *
 * @example useEffect(() => startLoop({ update: dt => sim.step(dt), render: (_a, t) => draw(t) }), [])
 */
export function startLoop(
  handlers: LoopHandlers,
  { stepMs = 1000 / 60, maxFrameMs = 100 }: LoopOptions = {}
): () => void {
  const stepper = new FixedStepper(stepMs, maxFrameMs)
  let simMs = 0
  let last = performance.now()
  let frame = 0
  const tick = (time: number) => {
    frame = requestAnimationFrame(tick)
    const steps = stepper.advance(time - last)
    last = time
    for (let i = 0; i < steps; i++) {
      handlers.update(stepMs)
      simMs += stepMs
    }
    handlers.render(stepper.alpha, simMs + stepper.alpha * stepMs)
  }
  frame = requestAnimationFrame(tick)
  const dev: LoopDevApi = {
    step(updates = 1) {
      for (let i = 0; i < updates; i++) {
        handlers.update(stepMs)
        simMs += stepMs
        handlers.render(0, simMs)
      }
    },
    get timeMs() {
      return simMs
    }
  }
  const unexpose = exposeDev('loop', dev)
  return () => {
    cancelAnimationFrame(frame)
    unexpose()
  }
}
