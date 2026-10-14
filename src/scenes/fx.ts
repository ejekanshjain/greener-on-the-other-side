import { patchCenter } from '../game/grid'
import type { GardenEvent } from '../game/types'
import { hash01 } from '../shared/math'
import { settings } from '../shared/settings'
import { LAWN } from './layout'

/** A puff of dust, dirt, clippings or spray, in design units. */
export interface Puff {
  x: number
  y: number
  /** Loop time it appeared. */
  at: number
  size: number
  color: string
  seed: number
}

/** How long a puff lasts, in ms. */
const PUFF_MS = 520
/** Puffs on screen at once; the oldest goes first. */
const PUFF_CAP = 24
const DUST = 'rgb(196 176 132)'
const DIRT = 'rgb(110 80 44)'
const CLIPPINGS = 'rgb(120 168 70)'
const SPRAY = 'rgb(150 196 230)'
const MUD = 'rgb(122 92 58)'

/**
 * The garden's juice: dust puffs where things land, a blocked throw drops, a flick misses
 * or the yard puts a step's object back; dirt where Biscuit digs, or a weed stays rooted,
 * pops out or comes up; clippings where a heap lands; spray on a flood; a muddy splash
 * where a patch drowns; and a screen shake when heavy junk sinks in. Under Reduced Motion
 * the puffs fade without growing and the screen never shakes.
 */
export class Effects {
  /** Puffs still fading out, oldest first. */
  readonly puffs: Puff[] = []
  private shakeFrom = 0
  private shakeUntil = 0
  private shakeAmp = 0
  private shaking = false
  private seed = 0

  /** Adds the effects for your garden's events at loop time `time`. */
  onEvents(events: readonly GardenEvent[], time: number): void {
    for (const event of events) {
      switch (event.type) {
        case 'land':
          this.puffAt(event.landing.patch, time, 0.8, DUST)
          break
        case 'sink':
          this.puffAt(event.patch, time, 2, DUST)
          this.shake(time, 7, 380)
          break
        case 'bounce':
          this.puffAt(event.patch, time, 0.7, DUST)
          break
        case 'dig':
          this.puffAt(event.patch, time, 1.3, DIRT)
          break
        case 'heap':
          for (const patch of event.patches)
            this.puffAt(patch, time, 0.9, CLIPPINGS)
          break
        case 'flood':
          for (const patch of event.patches)
            this.puffAt(patch, time, 1.1, SPRAY)
          break
        case 'drown':
          this.puffAt(event.patch, time, 1, SPRAY)
          this.puffAt(event.patch, time, 0.6, MUD)
          break
        case 'tired':
          this.puff(LAWN.x + event.lx, LAWN.y + event.ly, time, 0.6, DUST)
          break
        case 'rooted':
          this.puff(LAWN.x + event.lx, LAWN.y + event.ly, time, 0.45, DIRT)
          break
        case 'yank':
          this.puff(LAWN.x + event.lx, LAWN.y + event.ly, time, 0.6, DIRT)
          break
        // Every new weed pops up through dirt, so you see where weeds come from.
        case 'sprout':
          this.puff(LAWN.x + event.lx, LAWN.y + event.ly, time, 0.45, DIRT)
          break
        case 'miss':
          this.puff(LAWN.x + event.lx, LAWN.y + event.ly, time, 0.4, DUST)
          break
        // The yard puts a stuck step object back where its step began.
        case 'putBack':
          this.puff(LAWN.x + event.lx, LAWN.y + event.ly, time, 0.7, DUST)
          break
        default:
          break
      }
    }
  }

  /** Shakes the screen by up to `amp` design units for `ms`. */
  shake(time: number, amp: number, ms: number): void {
    this.shakeFrom = time
    this.shakeUntil = time + ms
    this.shakeAmp = amp
  }

  /**
   * Moves the canvas element for the shake, so every layer shakes together. Call once a
   * frame; it touches the page only while a shake runs and once after.
   */
  applyShake(canvas: HTMLCanvasElement | null, time: number, scale: number) {
    if (!canvas) return
    const on = time < this.shakeUntil && !settings.get().reducedMotion
    if (!on) {
      if (this.shaking) canvas.style.transform = ''
      this.shaking = false
      return
    }
    this.shaking = true
    const left =
      1 - (time - this.shakeFrom) / (this.shakeUntil - this.shakeFrom)
    const amp = this.shakeAmp * left * scale
    const dx = Math.sin(time * 0.09) * amp
    const dy = Math.cos(time * 0.13) * amp * 0.6
    // A touch of zoom keeps the page behind from peeking in at the edges.
    const zoom =
      1 +
      (2 * amp + 2) /
        Math.max(1, Math.min(canvas.clientWidth, canvas.clientHeight))
    canvas.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${zoom.toFixed(4)})`
  }

  /** Puts the canvas back where it belongs, for when the scene goes. */
  reset(canvas: HTMLCanvasElement | null): void {
    if (canvas && this.shaking) canvas.style.transform = ''
    this.shaking = false
    this.shakeUntil = 0
  }

  /** Draws every puff still fading out. */
  draw(ctx: CanvasRenderingContext2D, time: number): void {
    const puffs = this.puffs
    for (let i = puffs.length - 1; i >= 0; i--)
      if (time - (puffs[i] as Puff).at > PUFF_MS) puffs.splice(i, 1)
    if (puffs.length === 0) return
    const grow = !settings.get().reducedMotion
    for (const puff of puffs) {
      const k = (time - puff.at) / PUFF_MS
      ctx.globalAlpha = 0.55 * (1 - k)
      ctx.fillStyle = puff.color
      ctx.beginPath()
      for (let j = 0; j < 5; j++) {
        const a = (j / 5) * Math.PI * 2 + hash01(puff.seed, j) * 1.2
        const reach = puff.size * (grow ? 6 + 22 * k : 14)
        const r = puff.size * (grow ? 7 + 9 * k : 11)
        const x = puff.x + Math.cos(a) * reach
        const y = puff.y + Math.sin(a) * reach * 0.55 - (grow ? 10 * k : 0)
        ctx.moveTo(x + r, y)
        ctx.arc(x, y, r, 0, Math.PI * 2)
      }
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  private puffAt(
    patch: number,
    time: number,
    size: number,
    color: string
  ): void {
    if (patch < 0) return
    const c = patchCenter(patch)
    this.puff(LAWN.x + c.lx, LAWN.y + c.ly, time, size, color)
  }

  /** A puff at design point (x, y). */
  private puff(
    x: number,
    y: number,
    time: number,
    size: number,
    color: string
  ): void {
    if (this.puffs.length >= PUFF_CAP) this.puffs.shift()
    this.puffs.push({
      x,
      y,
      at: time,
      size,
      color,
      seed: ++this.seed
    })
  }
}
