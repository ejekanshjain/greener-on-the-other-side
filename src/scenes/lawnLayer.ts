import type { Garden } from '../game/garden'
import { ALL_ROWS } from '../game/grid'
import { COLS, PATCH_D, PATCH_W, ROWS } from '../game/tuning'
import type { Viewport } from '../shared/canvas'
import { setSketchScale } from '../shared/sketch'
import { paintPatch, type PatchLook } from './art'
import { LAWN } from './layout'

/** Rows repainted per frame at most, so a burst of changes spreads over a few frames. */
const ROWS_PER_FRAME = 2
const COST_FRAMES = 120

/** Rolling cost of the last `size` frames in ms, for the dev perf readout. */
export class CostMeter {
  private readonly samples: Float64Array
  private count = 0
  private head = 0
  /** Rows repainted since the meter started. */
  rows = 0

  constructor(private readonly size = COST_FRAMES) {
    this.samples = new Float64Array(size)
  }

  add(ms: number): void {
    this.samples[this.head] = ms
    this.head = (this.head + 1) % this.size
    if (this.count < this.size) this.count++
  }

  /** Forgets the frames so far, so a measurement starts clean. */
  reset(): void {
    this.count = 0
    this.head = 0
  }

  /** Mean, 95th percentile and worst frame over the recent frames. */
  read(): {
    frames: number
    mean: number
    p95: number
    max: number
    rows: number
  } {
    const values = Array.from(this.samples.subarray(0, this.count)).sort(
      (a, b) => a - b
    )
    const sum = values.reduce((a, b) => a + b, 0)
    return {
      frames: this.count,
      mean: this.count ? sum / this.count : 0,
      p95: values[Math.floor(values.length * 0.95)] ?? 0,
      max: values[values.length - 1] ?? 0,
      rows: this.rows
    }
  }
}

/**
 * Your lawn as one off-screen canvas. It repaints only the rows the grid marked dirty, up
 * to 4 a frame, and the whole lawn when the garden, the screen scale or the stripes
 * change. Your own lawn draws 1 level browner than it is, under a grey wash.
 */
export class LawnLayer {
  private readonly canvas = document.createElement('canvas')
  private pixelsPerUnit = 0
  private pending = ALL_ROWS
  private stripes = 0
  private garden: Garden | null | undefined = undefined
  private readonly look: PatchLook = {
    level: 0,
    length: 0,
    mess: 0,
    hole: false,
    stripe: 0,
    grey: true
  }
  readonly cost = new CostMeter()

  constructor(private readonly viewport: Viewport) {}

  /** Marks every row for repaint, for dev perf checks. */
  invalidate(): void {
    this.pending = ALL_ROWS
  }

  /** Brings the cached lawn up to date and draws it. Call with the logical transform applied. */
  draw(ctx: CanvasRenderingContext2D, garden: Garden | null): void {
    const started = performance.now()
    const k = this.viewport.scale * this.viewport.dpr
    if (k <= 0) return
    let full = false
    if (k !== this.pixelsPerUnit) {
      this.pixelsPerUnit = k
      this.canvas.width = Math.max(1, Math.ceil(LAWN.w * k))
      this.canvas.height = Math.max(1, Math.ceil(LAWN.h * k))
      full = true
    }
    if (garden !== this.garden) {
      this.garden = garden
      full = true
    }
    if (garden) {
      this.pending |= garden.grid.dirtyRows
      garden.grid.dirtyRows = 0
      const stripes = garden.stripes()
      if (stripes !== this.stripes) {
        this.stripes = stripes
        this.pending = ALL_ROWS
      }
    }
    if (full) {
      this.paintRows(ALL_ROWS)
      this.pending = 0
    } else if (this.pending) {
      // Lowest rows first: take up to the budget from the pending set.
      let take = 0
      let left = ROWS_PER_FRAME
      for (let row = 0; row < ROWS && left > 0; row++)
        if (this.pending & (1 << row)) {
          take |= 1 << row
          left--
        }
      this.pending &= ~take
      this.paintRows(take)
    }
    ctx.drawImage(
      this.canvas,
      LAWN.x,
      LAWN.y,
      this.canvas.width / k,
      this.canvas.height / k
    )
    this.cost.add(performance.now() - started)
  }

  /** Frees the canvas memory. */
  dispose(): void {
    this.canvas.width = 0
    this.canvas.height = 0
  }

  private paintRows(rows: number): void {
    const ctx = this.canvas.getContext('2d')
    if (!ctx)
      throw new Error(
        'LawnLayer: the browser refused a 2D canvas context, so the lawn cannot be drawn'
      )
    const k = this.pixelsPerUnit
    const grid = this.garden?.grid
    setSketchScale(ctx, this.viewport.scale)
    const look = this.look
    for (let row = 0; row < ROWS; row++) {
      if (!(rows & (1 << row))) continue
      this.cost.rows++
      // Clip to the row's whole device pixels, so neighbouring rows never smear.
      const top = Math.round(row * PATCH_D * k)
      const bottom = Math.round((row + 1) * PATCH_D * k)
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.beginPath()
      ctx.rect(0, top, this.canvas.width, bottom - top)
      ctx.clip()
      ctx.setTransform(k, 0, 0, k, -LAWN.x * k, -LAWN.y * k)
      for (let col = 0; col < COLS; col++) {
        const i = row * COLS + col
        const health = grid ? (grid.health[i] as number) : 5
        // Your own lawn always looks 1 level browner than it is.
        look.level = Math.max(0, health - 1)
        look.length = grid ? (grid.length[i] as number) : 2
        look.mess = grid ? (grid.mess[i] as number) : 0
        look.hole = grid ? grid.hole[i] === 1 : false
        look.stripe = this.stripes & (1 << col) ? (col % 2 === 0 ? 1 : 2) : 0
        paintPatch(ctx, LAWN.x + col * PATCH_W, LAWN.y + row * PATCH_D, i, look)
      }
      ctx.restore()
    }
  }
}
