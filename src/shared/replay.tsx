import { useEffect, useEffectEvent, useRef } from 'react'

import { palette } from './palette'
import { cn } from './ui/cn'

export interface ReplayOptions {
  /** Seconds of history to keep. Defaults to 3. */
  seconds?: number
  /** Capture rate. Defaults to 30. */
  fps?: number
  /** Frame size in pixels. Each frame costs width x height x 4 bytes; keep it small. */
  width: number
  height: number
  /** Longest side of the sharp still taken with each clip, in pixels. Defaults to 960. */
  stillSize?: number
}

/** Recorded frames, oldest first. Valid until the recorder's next `clip()` call. */
export interface ReplayClip {
  frames: readonly HTMLCanvasElement[]
  /**
   * A sharp copy of the latest captured source (cropped like the frames) at the moment
   * of the clip, up to `stillSize` pixels. Use it as the share card picture.
   */
  still: HTMLCanvasElement | null
  fps: number
  width: number
  height: number
  durationMs: number
}

/** A crop rectangle in source pixels. */
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

/** One ring of frame canvases plus its still. Two sets swap between recording and the latest clip. */
interface FrameSet {
  frames: (HTMLCanvasElement | null)[]
  contexts: (CanvasRenderingContext2D | null)[]
  still: HTMLCanvasElement | null
}

/**
 * Keeps the last few seconds of a canvas in a ring of small canvases, for fail replays.
 * `clip()` hands the recorded frames to the clip without copying, and recording carries
 * on in a second set. So memory stays at two rings and two stills however many fails a
 * session has, and taking a clip costs one still copy.
 *
 * @example
 * const recorder = new ReplayRecorder({ width: 240, height: 320 })
 * // in render, after drawing: recorder.capture(viewport.ctx.canvas, crop, timeMs)
 * // on fail: setClip(recorder.clip())
 */
export class ReplayRecorder {
  readonly fps: number
  readonly width: number
  readonly height: number
  private readonly size: number
  private readonly stillSize: number
  private live: FrameSet
  /** The set held by the latest clip. The next clip records into it again. */
  private spare: FrameSet | null = null
  private head = 0
  private count = 0
  private lastCaptureAt = -Infinity
  private source: HTMLCanvasElement | null = null
  private crop: CropRect | undefined

  constructor({
    seconds = 3,
    fps = 30,
    width,
    height,
    stillSize = 960
  }: ReplayOptions) {
    this.fps = fps
    this.width = Math.round(width)
    this.height = Math.round(height)
    this.size = Math.max(1, Math.round(seconds * fps))
    this.stillSize = stillSize
    this.live = emptySet(this.size)
  }

  /** Number of frames held. */
  get frameCount(): number {
    return this.count
  }

  /**
   * Copies `source` into the ring if a frame is due at the recorder's fps. The image is
   * scaled to fit (letterboxed). Pass `crop` to record only part of the source, such as
   * `viewport.designRect()`, and the render `timeMs` from `startLoop` so dev steps record
   * too. Returns true when a frame was captured.
   */
  capture(
    source: HTMLCanvasElement,
    crop?: CropRect,
    timeMs = performance.now()
  ): boolean {
    const elapsed = timeMs - this.lastCaptureAt
    // The 2 ms slack keeps a 60 Hz loop capturing every other frame at 30 fps.
    // A clock that jumped backwards (a restarted loop) captures straight away.
    if (elapsed >= 0 && elapsed < 1000 / this.fps - 2) return false
    const sx = crop?.x ?? 0
    const sy = crop?.y ?? 0
    const sw = crop?.width ?? source.width
    const sh = crop?.height ?? source.height
    if (sw <= 0 || sh <= 0) return false
    this.lastCaptureAt = timeMs
    this.source = source
    this.crop = crop
    const ctx = this.slot(this.head)
    const scale = Math.min(this.width / sw, this.height / sh)
    const dw = sw * scale
    const dh = sh * scale
    ctx.fillStyle = palette.paper
    ctx.fillRect(0, 0, this.width, this.height)
    ctx.drawImage(
      source,
      sx,
      sy,
      sw,
      sh,
      (this.width - dw) / 2,
      (this.height - dh) / 2,
      dw,
      dh
    )
    this.head = (this.head + 1) % this.size
    this.count = Math.min(this.count + 1, this.size)
    return true
  }

  /**
   * Hands over the last `seconds` (default: everything held) as a clip, with a sharp still
   * of the source as it is now, and starts a fresh recording. Returns null when empty.
   * The clip stays valid until the next `clip()` call, which records over its frames.
   */
  clip(seconds?: number): ReplayClip | null {
    if (this.count === 0) return null
    const wanted =
      seconds === undefined ? this.count : Math.round(seconds * this.fps)
    const n = Math.min(this.count, Math.max(1, wanted))
    const set = this.live
    const frames: HTMLCanvasElement[] = []
    for (let i = 0; i < n; i++) {
      const frame = set.frames[(this.head - n + i + this.size) % this.size]
      if (frame) frames.push(frame)
    }
    const still = this.takeStill(set)
    this.live = this.spare ?? emptySet(this.size)
    this.spare = set
    this.reset()
    return {
      frames,
      still,
      fps: this.fps,
      width: this.width,
      height: this.height,
      durationMs: (frames.length / this.fps) * 1000
    }
  }

  /** Forgets every frame, for example when a new attempt starts. */
  reset(): void {
    this.head = 0
    this.count = 0
    this.lastCaptureAt = -Infinity
  }

  private slot(index: number): CanvasRenderingContext2D {
    const set = this.live
    const existing = set.contexts[index]
    if (existing) return existing
    const canvas = document.createElement('canvas')
    canvas.width = this.width
    canvas.height = this.height
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx)
      throw new Error(
        'ReplayRecorder: the browser refused a 2D canvas context, so frames cannot be recorded'
      )
    set.frames[index] = canvas
    set.contexts[index] = ctx
    return ctx
  }

  /** Copies the latest source into the set's still canvas, scaled to fit `stillSize`. */
  private takeStill(set: FrameSet): HTMLCanvasElement | null {
    const source = this.source
    if (!source) return null
    const sx = this.crop?.x ?? 0
    const sy = this.crop?.y ?? 0
    const sw = this.crop?.width ?? source.width
    const sh = this.crop?.height ?? source.height
    const scale = Math.min(1, this.stillSize / Math.max(sw, sh))
    const width = Math.max(1, Math.round(sw * scale))
    const height = Math.max(1, Math.round(sh * scale))
    const still = (set.still ??= document.createElement('canvas'))
    if (still.width !== width) still.width = width
    if (still.height !== height) still.height = height
    const ctx = still.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, width, height)
    return still
  }
}

function emptySet(size: number): FrameSet {
  return {
    frames: new Array<HTMLCanvasElement | null>(size).fill(null),
    contexts: new Array<CanvasRenderingContext2D | null>(size).fill(null),
    still: null
  }
}

/** Picks a frame by position, from 0 (first) to 1 (last). Use it as a share card image. */
export function clipFrame(
  clip: ReplayClip,
  t = 1
): HTMLCanvasElement | undefined {
  const index = Math.round(
    Math.min(1, Math.max(0, t)) * (clip.frames.length - 1)
  )
  return clip.frames[index]
}

export interface ReplayPlayerProps {
  clip: ReplayClip
  /** Playback speed. Defaults to 0.25 (slow motion). */
  speed?: number
  /** Big caption over the replay, such as "Held for 0.4s". */
  label?: string
  loop?: boolean
  /** Runs once when a non-looping replay ends. */
  onDone?: () => void
  /** Shows the "Slow-mo" badge in the corner. Defaults to true; small players may hide it. */
  badge?: boolean
  className?: string
}

/**
 * Plays a clip in slow motion with a big caption.
 *
 * @example <ReplayPlayer clip={clip} label="Held for 0.4s" onDone={() => setClip(null)} />
 */
export function ReplayPlayer({
  clip,
  speed = 0.25,
  label,
  loop = false,
  onDone,
  badge = true,
  className
}: ReplayPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const finish = useEffectEvent(() => onDone?.())

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || clip.frames.length === 0) return
    let start = performance.now()
    let shown = -1
    let frame = requestAnimationFrame(function tick(time) {
      const elapsed = ((time - start) / 1000) * speed
      // A frame's time stamp can come before `start`, which would ask for frame -1.
      let index = Math.max(0, Math.floor(elapsed * clip.fps))
      if (index >= clip.frames.length) {
        if (loop) {
          start = time
          index = 0
        } else {
          index = clip.frames.length - 1
          if (shown !== index) ctx.drawImage(clip.frames[index]!, 0, 0)
          finish()
          return
        }
      }
      if (index !== shown) {
        ctx.drawImage(clip.frames[index]!, 0, 0)
        shown = index
      }
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [clip, speed, loop])

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-sketch border-4 border-ink bg-paper',
        className
      )}
    >
      <canvas
        ref={canvasRef}
        width={clip.width}
        height={clip.height}
        className="block h-auto w-full"
        aria-label={
          label ? `Slow-motion replay: ${label}` : 'Slow-motion replay'
        }
        role="img"
      />
      {badge && (
        <span className="absolute top-2 left-2 -rotate-3 rounded-sketch-alt bg-marker-red px-2 py-0.5 font-marker text-sm text-white">
          Slow-mo {speed}x
        </span>
      )}
      {label && (
        <p className="absolute inset-x-2 bottom-3 rotate-[-2deg] text-center font-marker text-3xl text-ink [text-shadow:0_0_6px_var(--color-paper),0_0_2px_var(--color-paper)] sm:text-4xl">
          {label}
        </p>
      )}
    </div>
  )
}
