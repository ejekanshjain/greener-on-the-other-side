import type { Viewport } from './canvas'
import { setSketchScale } from './sketch'

/** An area in logical units. */
export interface LayerRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Static art drawn once into an off-screen canvas at the viewport's resolution, then
 * drawn as one image per frame. It repaints itself after the viewport's scale or pixel
 * ratio changes, and after `invalidate()`. Use it for locked wall sections, backgrounds,
 * and props stamped many times, such as spilled beans.
 *
 * @example
 * const wall = new CachedLayer(viewport, ctx => drawLockedSections(ctx))
 * const bean = new CachedLayer(viewport, ctx => drawBean(ctx), { x: -9, y: -6, width: 18, height: 12 })
 * // in render, after viewport.begin():
 * wall.draw(ctx)
 * for (const b of spilled) bean.stamp(ctx, b.x, b.y, b.angle)
 * // when a section locks: wall.invalidate()
 */
export class CachedLayer {
  private readonly canvas = document.createElement('canvas')
  private readonly rect: LayerRect
  private pixelsPerUnit = 0
  private dirty = true
  private readonly stopResize: () => void

  /**
   * `paint` draws in logical units, as if on the main canvas. `rect` is the area to keep,
   * in logical units; it defaults to the whole design. For stamps, centre it on (0, 0).
   */
  constructor(
    private readonly viewport: Viewport,
    private readonly paint: (ctx: CanvasRenderingContext2D) => void,
    rect?: LayerRect
  ) {
    this.rect = rect ?? {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height
    }
    this.stopResize = viewport.onResize(() => {
      if (this.viewport.scale * this.viewport.dpr !== this.pixelsPerUnit)
        this.dirty = true
    })
  }

  /** Repaints on the next draw, for example after the art changed. */
  invalidate(): void {
    this.dirty = true
  }

  /** Draws the layer at its own rectangle. Call it with the viewport's logical transform applied. */
  draw(ctx: CanvasRenderingContext2D): void {
    this.refresh()
    const { x, y } = this.rect
    const k = this.pixelsPerUnit
    ctx.drawImage(
      this.canvas,
      x,
      y,
      this.canvas.width / k,
      this.canvas.height / k
    )
  }

  /** Draws the layer with its (0, 0) at (x, y), rotated by `angle` radians. Leaves the viewport transform applied. */
  stamp(ctx: CanvasRenderingContext2D, x: number, y: number, angle = 0): void {
    this.refresh()
    const viewport = this.viewport
    const k = this.pixelsPerUnit
    const cos = Math.cos(angle) * k
    const sin = Math.sin(angle) * k
    ctx.setTransform(
      cos,
      sin,
      -sin,
      cos,
      (viewport.offsetX + x * viewport.scale) * viewport.dpr,
      (viewport.offsetY + y * viewport.scale) * viewport.dpr
    )
    const { x: rx, y: ry } = this.rect
    ctx.drawImage(
      this.canvas,
      rx,
      ry,
      this.canvas.width / k,
      this.canvas.height / k
    )
    viewport.apply(ctx)
  }

  /**
   * Draws the layer with its (0, 0) at (x, y), rotated by `angle` radians, in whatever
   * units `ctx` is set to, such as a zoomed world camera. Unlike `stamp`, it keeps the
   * current transform, so it works on any canvas. Detail matches the viewport's resolution
   * at one unit per logical unit.
   */
  drawAt(ctx: CanvasRenderingContext2D, x: number, y: number, angle = 0): void {
    this.refresh()
    const k = this.pixelsPerUnit
    const { x: rx, y: ry } = this.rect
    // Unrotated stamps skip the save and restore, which cost more than the image.
    if (angle === 0) {
      ctx.drawImage(
        this.canvas,
        x + rx,
        y + ry,
        this.canvas.width / k,
        this.canvas.height / k
      )
      return
    }
    ctx.save()
    ctx.translate(x, y)
    if (angle !== 0) ctx.rotate(angle)
    ctx.drawImage(
      this.canvas,
      rx,
      ry,
      this.canvas.width / k,
      this.canvas.height / k
    )
    ctx.restore()
  }

  /** Stops following resizes and frees the canvas memory. */
  dispose(): void {
    this.stopResize()
    this.canvas.width = 0
    this.canvas.height = 0
  }

  private refresh(): void {
    if (!this.dirty) return
    this.dirty = false
    const viewport = this.viewport
    const k = viewport.scale * viewport.dpr
    const { x, y, width, height } = this.rect
    const pixelWidth = Math.max(1, Math.ceil(width * k))
    const pixelHeight = Math.max(1, Math.ceil(height * k))
    // Resizing clears the canvas; clear by hand when the size didn't change.
    if (
      this.canvas.width !== pixelWidth ||
      this.canvas.height !== pixelHeight
    ) {
      this.canvas.width = pixelWidth
      this.canvas.height = pixelHeight
    }
    const ctx = this.canvas.getContext('2d')
    if (!ctx)
      throw new Error(
        'CachedLayer: the browser refused a 2D canvas context, so the layer cannot be drawn'
      )
    this.pixelsPerUnit = k
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, pixelWidth, pixelHeight)
    ctx.setTransform(k, 0, 0, k, -x * k, -y * k)
    setSketchScale(ctx, viewport.scale)
    this.paint(ctx)
  }
}
