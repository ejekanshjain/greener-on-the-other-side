import { hash01 } from './math'
import { palette } from './palette'
import { settings } from './settings'

/**
 * Felt-tip drawing style. Hoist constant styles out of the render loop so drawing
 * doesn't allocate an object per call.
 */
export interface SketchStyle {
  /** Stroke colour. Defaults to `palette.ink`. */
  color?: string
  /**
   * Stroke width in logical units. 0 skips the outline. Defaults to 3. On a screen smaller
   * than the design, widths grow so a line is never thinner than its width in CSS pixels.
   */
  width?: number
  /**
   * Largest wobble away from the true line, in logical units. It also sets how far strokes
   * overshoot corners and how far fills slip outside the outline. 0 draws clean shapes.
   * Defaults to 3.
   */
  wobble?: number
  /** Picks the wobble pattern. Same seed, same shape. Add `boilSeed(t)` for line boil. Defaults to 1. */
  seed?: number
  /** 2 adds a thinner, offset second stroke, so the line's thickness varies like a felt tip. Defaults to 2. */
  passes?: 1 | 2
  /** Fill colour. No fill when omitted. */
  fill?: string
  /** 'hatch' fills with wobbly parallel lines instead of solid colour. Defaults to 'solid'. */
  fillStyle?: 'solid' | 'hatch'
  /** Gap between hatch lines. Defaults to 8. */
  hatchGap?: number
  /** Hatch angle in radians. Defaults to -0.8 (rising to the right). */
  hatchAngle?: number
  /** Opacity from 0 to 1, multiplied with the current `globalAlpha`. Defaults to 1. */
  alpha?: number
}

/** Flat point list: [x0, y0, x1, y1, ...]. Plain arrays and typed arrays both work. */
export type FlatPoints = ArrayLike<number>

export const FONT_HAND =
  "'Patrick Hand', 'Comic Sans MS', 'Chalkboard SE', cursive"
export const FONT_MARKER =
  "'Permanent Marker', 'Comic Sans MS', 'Chalkboard SE', cursive"

const EMPTY_STYLE: SketchStyle = {}
const DEFAULT_WOBBLE = 3
const SECOND_PASS_SEED = 7919
const FILL_SEED = 3571
/** Extra jittered points that let a closed curve's stroke run past its start. */
const OVERLAP_POINTS = 1

// Scratch buffers reused by every call so drawing doesn't allocate per point.
let shape = new Float64Array(256)
let jittered = new Float64Array(256)
let minX = 0
let minY = 0
let maxX = 0
let maxY = 0

/** CSS pixels per logical unit for each context, set by `Viewport.apply`. */
const pixelScales = new WeakMap<CanvasRenderingContext2D, number>()

/**
 * Tells the sketch helpers how many CSS pixels one logical unit covers on `ctx`, so
 * strokes never render thinner than their width in CSS pixels. `Viewport` and
 * `CachedLayer` call it; call it yourself only for your own scaled canvases.
 */
export function setSketchScale(
  ctx: CanvasRenderingContext2D,
  cssPixelsPerUnit: number
): void {
  pixelScales.set(ctx, cssPixelsPerUnit)
}

function ensureCapacity(points: number): void {
  if (shape.length >= points * 2) return
  const size = Math.max(points * 2, shape.length * 2)
  const next = new Float64Array(size)
  next.set(shape)
  shape = next
}

/**
 * Copies `src` into `jittered` with seeded per-vertex noise, shifted by (dx, dy), and records
 * the bounding box. Writes `n + extra` points: the extra ones repeat the first points with
 * fresh noise, so a closed stroke can run past its start without retracing it.
 */
function jitter(
  src: FlatPoints,
  n: number,
  amount: number,
  seed: number,
  dx = 0,
  dy = 0,
  extra = 0
): void {
  const total = n + extra
  if (jittered.length < total * 2)
    jittered = new Float64Array(Math.max(total * 2, jittered.length * 2))
  minX = minY = Infinity
  maxX = maxY = -Infinity
  for (let i = 0; i < total; i++) {
    const k = i % n
    const x =
      (src[k * 2] as number) + dx + (hash01(seed, i * 2) - 0.5) * 2 * amount
    const y =
      (src[k * 2 + 1] as number) +
      dy +
      (hash01(seed, i * 2 + 1) - 0.5) * 2 * amount
    jittered[i * 2] = x
    jittered[i * 2 + 1] = y
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
}

/**
 * Traces straight edges between jittered points, each bowed slightly like a hand-drawn
 * line. With `overshoot` above 0, each edge is its own stroke that runs past its corners.
 */
function traceStraight(
  ctx: CanvasRenderingContext2D,
  n: number,
  closed: boolean,
  wobble: number,
  seed: number,
  overshoot: number
) {
  const j = jittered
  const segments = closed ? n : n - 1
  if (overshoot <= 0) ctx.moveTo(j[0] as number, j[1] as number)
  for (let s = 0; s < segments; s++) {
    const a = s * 2
    const b = ((s + 1) % n) * 2
    let ax = j[a] as number
    let ay = j[a + 1] as number
    let bx = j[b] as number
    let by = j[b + 1] as number
    const len = Math.hypot(bx - ax, by - ay) || 1
    const ux = (bx - ax) / len
    const uy = (by - ay) / len
    if (overshoot > 0) {
      // Open paths keep their two outer ends; every corner gets crossing strokes.
      const before =
        closed || s > 0 ? overshoot * (0.4 + hash01(seed, 6144 + s * 2)) : 0
      const after =
        closed || s < segments - 1
          ? overshoot * (0.4 + hash01(seed, 6145 + s * 2))
          : 0
      ax -= ux * before
      ay -= uy * before
      bx += ux * after
      by += uy * after
      ctx.moveTo(ax, ay)
    }
    const dx = bx - ax
    const dy = by - ay
    // Short segments bow less, so corners and small shapes stay crisp.
    const bow = wobble * Math.min(1, len / 60)
    const b1 = (hash01(seed, 4096 + s * 2) - 0.5) * 2 * bow
    const b2 = (hash01(seed, 4097 + s * 2) - 0.5) * 2 * bow
    ctx.bezierCurveTo(
      ax + dx * 0.33 - uy * b1,
      ay + dy * 0.33 + ux * b1,
      ax + dx * 0.67 - uy * b2,
      ay + dy * 0.67 + ux * b2,
      bx,
      by
    )
  }
  if (closed && overshoot <= 0) ctx.closePath()
}

/**
 * Traces a smooth Catmull-Rom curve through the first `n` jittered points. `closed` joins
 * the ends; otherwise the ends are clamped, which also draws a closed shape's overlap tail.
 */
function traceSmooth(
  ctx: CanvasRenderingContext2D,
  n: number,
  closed: boolean
) {
  const j = jittered
  ctx.moveTo(j[0] as number, j[1] as number)
  const segments = closed ? n : n - 1
  for (let s = 0; s < segments; s++) {
    const i0 = closed ? ((s - 1 + n) % n) * 2 : Math.max(0, s - 1) * 2
    const i1 = s * 2
    const i2 = ((s + 1) % n) * 2
    const i3 = closed ? ((s + 2) % n) * 2 : Math.min(n - 1, s + 2) * 2
    const x1 = j[i1] as number
    const y1 = j[i1 + 1] as number
    const x2 = j[i2] as number
    const y2 = j[i2 + 1] as number
    ctx.bezierCurveTo(
      x1 + (x2 - (j[i0] as number)) / 6,
      y1 + (y2 - (j[i0 + 1] as number)) / 6,
      x2 - ((j[i3] as number) - x1) / 6,
      y2 - ((j[i3 + 1] as number) - y1) / 6,
      x2,
      y2
    )
  }
  if (closed) ctx.closePath()
}

/** Fills the current path's bounding box with wobbly parallel lines, clipped to the path. */
function hatch(
  ctx: CanvasRenderingContext2D,
  color: string,
  width: number,
  gap: number,
  angle: number,
  seed: number
) {
  ctx.save()
  ctx.clip()
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const half = Math.hypot(maxX - minX, maxY - minY) / 2 + gap
  ctx.beginPath()
  let line = 0
  for (let k = -half; k <= half; k += gap, line++) {
    // Each hatch line runs along (dx, dy), offset by k along the normal (-dy, dx).
    const ox = cx - dy * k
    const oy = cy + dx * k
    const bow = (hash01(seed, 8192 + line) - 0.5) * gap * 0.5
    ctx.moveTo(ox - dx * half, oy - dy * half)
    ctx.quadraticCurveTo(
      ox - dy * bow,
      oy + dx * bow,
      ox + dx * half,
      oy + dy * half
    )
  }
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.stroke()
  ctx.restore()
}

/** Strokes one felt-tip pass: straight shapes get crossing corners, smooth closed shapes an overlap tail. */
function strokePass(
  ctx: CanvasRenderingContext2D,
  src: FlatPoints,
  n: number,
  closed: boolean,
  smooth: boolean,
  amount: number,
  wobble: number,
  seed: number
) {
  ctx.beginPath()
  if (smooth) {
    const extra = closed && wobble > 0 ? OVERLAP_POINTS : 0
    jitter(src, n, amount, seed, 0, 0, extra)
    if (extra > 0) {
      // Push the tail past the start along the direction of travel, so the loop overlaps.
      const last = n * 2
      const tx = (jittered[2] as number) - (jittered[(n - 1) * 2] as number)
      const ty = (jittered[3] as number) - (jittered[(n - 1) * 2 + 1] as number)
      const len = Math.hypot(tx, ty) || 1
      const push = wobble * (0.8 + hash01(seed, 5120))
      jittered[last] = (jittered[last] as number) + (tx / len) * push
      jittered[last + 1] = (jittered[last + 1] as number) + (ty / len) * push
    }
    traceSmooth(ctx, n + extra, closed && extra === 0)
  } else {
    jitter(src, n, amount, seed)
    traceStraight(ctx, n, closed, wobble, seed, wobble)
  }
  ctx.stroke()
}

/** Shared renderer: offset fill or hatch, then one or two outline passes. */
function drawShape(
  ctx: CanvasRenderingContext2D,
  src: FlatPoints,
  n: number,
  closed: boolean,
  smooth: boolean,
  jitterScale: number,
  style: SketchStyle
): void {
  if (n < 2) return
  const wobble = style.wobble ?? DEFAULT_WOBBLE
  const seed = style.seed ?? 1
  // Never thinner than the width in CSS pixels, even when the design is scaled down.
  const width =
    (style.width ?? 3) * Math.max(1, 1 / (pixelScales.get(ctx) ?? 1))
  const previousAlpha = ctx.globalAlpha
  ctx.globalAlpha = previousAlpha * (style.alpha ?? 1)

  if (style.fill && closed) {
    // Colour slips outside the lines, like a quick fill with a fat marker.
    const angle = hash01(seed, 777) * Math.PI * 2
    const shift = wobble * (0.7 + hash01(seed, 778) * 0.6)
    jitter(
      src,
      n,
      wobble * jitterScale,
      seed + FILL_SEED,
      Math.cos(angle) * shift,
      Math.sin(angle) * shift
    )
    ctx.beginPath()
    if (smooth) traceSmooth(ctx, n, true)
    else traceStraight(ctx, n, true, wobble, seed + FILL_SEED, 0)
    if (style.fillStyle === 'hatch') {
      hatch(
        ctx,
        style.fill,
        Math.max(1, width * 0.6),
        style.hatchGap ?? 8,
        style.hatchAngle ?? -0.8,
        seed
      )
    } else {
      ctx.fillStyle = style.fill
      ctx.fill()
    }
  }
  if (width > 0) {
    ctx.strokeStyle = style.color ?? palette.ink
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    strokePass(ctx, src, n, closed, smooth, wobble * jitterScale, wobble, seed)
    if ((style.passes ?? 2) === 2) {
      ctx.lineWidth = width * 0.6
      strokePass(
        ctx,
        src,
        n,
        closed,
        smooth,
        wobble * jitterScale * 1.6,
        wobble,
        seed + SECOND_PASS_SEED
      )
    }
  }
  ctx.globalAlpha = previousAlpha
}

/** Draws a wobbly straight line. */
export function sketchLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  style: SketchStyle = EMPTY_STYLE
): void {
  shape[0] = x1
  shape[1] = y1
  shape[2] = x2
  shape[3] = y2
  drawShape(ctx, shape, 2, false, false, 0.5, style)
}

/**
 * Draws a path through flat points. Straight wobbly edges by default; `smooth` curves
 * through the points instead. Pass `count` to draw only the first `count` points.
 *
 * @example sketchPath(ctx, [10, 10, 80, 30, 60, 90], { closed: true, fill: palette.yellow })
 */
export function sketchPath(
  ctx: CanvasRenderingContext2D,
  points: FlatPoints,
  style: SketchStyle & { closed?: boolean; smooth?: boolean } = EMPTY_STYLE,
  count = points.length >> 1
): void {
  drawShape(
    ctx,
    points,
    count,
    style.closed ?? false,
    style.smooth ?? false,
    0.5,
    style
  )
}

/** Draws a closed polygon with straight wobbly edges. Supports solid and hatch fills. */
export function sketchPolygon(
  ctx: CanvasRenderingContext2D,
  points: FlatPoints,
  style: SketchStyle = EMPTY_STYLE,
  count = points.length >> 1
): void {
  drawShape(ctx, points, count, true, false, 0.5, style)
}

/** Draws a wobbly rectangle. */
export function sketchRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  style: SketchStyle = EMPTY_STYLE
): void {
  shape[0] = x
  shape[1] = y
  shape[2] = x + w
  shape[3] = y
  shape[4] = x + w
  shape[5] = y + h
  shape[6] = x
  shape[7] = y + h
  drawShape(ctx, shape, 4, true, false, 0.5, style)
}

const CORNER_STEPS = 4

/** Draws a wobbly rectangle with rounded corners of radius `r`. */
export function sketchRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  style: SketchStyle = EMPTY_STYLE
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ensureCapacity(4 * (CORNER_STEPS + 1))
  let n = 0
  for (let corner = 0; corner < 4; corner++) {
    // Corners go clockwise from top-right; each sweeps a quarter turn.
    const cx = corner === 0 || corner === 1 ? x + w - radius : x + radius
    const cy = corner === 1 || corner === 2 ? y + h - radius : y + radius
    const start = -Math.PI / 2 + (corner * Math.PI) / 2
    for (let step = 0; step <= CORNER_STEPS; step++) {
      const angle = start + (step / CORNER_STEPS) * (Math.PI / 2)
      shape[n * 2] = cx + Math.cos(angle) * radius
      shape[n * 2 + 1] = cy + Math.sin(angle) * radius
      n++
    }
  }
  drawShape(ctx, shape, n, true, false, 0.5, style)
}

/** Draws a wobbly ellipse centred on (cx, cy). */
export function sketchEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  style: SketchStyle = EMPTY_STYLE
): void {
  const seed = style.seed ?? 1
  const wobble = style.wobble ?? DEFAULT_WOBBLE
  const n = Math.max(10, Math.min(48, Math.round((Math.PI * (rx + ry)) / 14)))
  ensureCapacity(n)
  const phase1 = hash01(seed, 101) * Math.PI * 2
  const phase2 = hash01(seed, 102) * Math.PI * 2
  const start = hash01(seed, 103) * Math.PI * 2
  for (let i = 0; i < n; i++) {
    const angle = start + (i / n) * Math.PI * 2
    // Two slow sine waves bend the outline so it reads as hand-drawn, not noisy.
    const bend =
      wobble *
      (0.6 * Math.sin(2 * angle + phase1) + 0.4 * Math.sin(3 * angle + phase2))
    shape[i * 2] = cx + Math.cos(angle) * (rx + bend)
    shape[i * 2 + 1] = cy + Math.sin(angle) * (ry + bend)
  }
  drawShape(ctx, shape, n, true, true, 0.3, style)
}

/** Draws a wobbly circle. */
export function sketchCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  style: SketchStyle = EMPTY_STYLE
): void {
  sketchEllipse(ctx, cx, cy, r, r, style)
}

/**
 * Draws a smooth closed outline through flat points, for jelly soft bodies and puddles.
 * Pass `count` to draw only the first `count` points of a larger buffer.
 *
 * @example sketchBlob(ctx, jelly.perimeter(), { fill: palette.jelly, seed: 3 + boilSeed(t) })
 */
export function sketchBlob(
  ctx: CanvasRenderingContext2D,
  points: FlatPoints,
  style: SketchStyle = EMPTY_STYLE,
  count = points.length >> 1
): void {
  drawShape(ctx, points, count, true, true, 0.4, style)
}

/** Draws a wobbly arrow from (x1, y1) to (x2, y2). `head` is the arrowhead length. */
export function sketchArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  style: SketchStyle & { head?: number } = EMPTY_STYLE
): void {
  sketchLine(ctx, x1, y1, x2, y2, style)
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const head = style.head ?? 18
  shape[0] = x2 - Math.cos(angle - 0.45) * head
  shape[1] = y2 - Math.sin(angle - 0.45) * head
  shape[2] = x2
  shape[3] = y2
  shape[4] = x2 - Math.cos(angle + 0.45) * head
  shape[5] = y2 - Math.sin(angle + 0.45) * head
  drawShape(ctx, shape, 3, false, false, 0.5, style)
}

export interface SketchTextStyle {
  /** 'hand' is Patrick Hand (body); 'marker' is Permanent Marker (titles). Defaults to 'hand'. */
  font?: 'hand' | 'marker'
  /** Font size in logical units. Defaults to 24. */
  size?: number
  color?: string
  align?: CanvasTextAlign
  baseline?: CanvasTextBaseline
  /** Fixed rotation in radians. */
  rotate?: number
  /** Largest extra random rotation in radians, picked by `seed`. Defaults to 0. */
  tilt?: number
  seed?: number
  /** Draws a thick outline of this colour behind the text, for legibility over busy scenes. */
  outline?: string
  alpha?: number
  maxWidth?: number
}

let lastFontKey = ''
let lastFont = ''

/** Draws text in a hand or marker font, optionally tilted. Load fonts first with `loadSketchFonts`. */
export function sketchText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  style: SketchTextStyle = {}
): void {
  const size = style.size ?? 24
  const family = style.font === 'marker' ? FONT_MARKER : FONT_HAND
  const key = family === FONT_MARKER ? `m${size}` : `h${size}`
  if (key !== lastFontKey) {
    lastFontKey = key
    lastFont = `${size}px ${family}`
  }
  const angle =
    (style.rotate ?? 0) +
    (hash01(style.seed ?? 1, 9001) - 0.5) * 2 * (style.tilt ?? 0)
  const previousAlpha = ctx.globalAlpha
  ctx.globalAlpha = previousAlpha * (style.alpha ?? 1)
  ctx.font = lastFont
  ctx.textAlign = style.align ?? 'center'
  ctx.textBaseline = style.baseline ?? 'middle'
  const rotated = angle !== 0
  if (rotated) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
  }
  const px = rotated ? 0 : x
  const py = rotated ? 0 : y
  if (style.outline) {
    ctx.strokeStyle = style.outline
    ctx.lineWidth = Math.max(2, size * 0.18)
    ctx.lineJoin = 'round'
    ctx.strokeText(text, px, py, style.maxWidth)
  }
  ctx.fillStyle = style.color ?? palette.ink
  ctx.fillText(text, px, py, style.maxWidth)
  if (rotated) ctx.restore()
  ctx.globalAlpha = previousAlpha
}

/**
 * Builds an irregular round outline as flat points, for splats and puddles. Reuses `out`
 * when given. `irregularity` from 0 (circle) to about 0.5 (very lumpy).
 *
 * @example const puddle = blobPoints(200, 500, 40, 14, 9, 0.3); sketchBlob(ctx, puddle, { fill: palette.water })
 */
export function blobPoints(
  cx: number,
  cy: number,
  radius: number,
  count: number,
  seed: number,
  irregularity = 0.25,
  out: Float64Array = new Float64Array(count * 2)
): Float64Array {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2
    const r = radius * (1 + (hash01(seed, i) - 0.5) * 2 * irregularity)
    out[i * 2] = cx + Math.cos(angle) * r
    out[i * 2 + 1] = cy + Math.sin(angle) * r
  }
  return out
}

/**
 * Returns a seed that changes `fps` times per second, for an intentional low-frame-rate
 * line boil. Returns 0 when reduced motion is on, so lines hold still.
 *
 * @example sketchCircle(ctx, x, y, 20, { seed: id + boilSeed(timeMs) })
 */
export function boilSeed(timeMs: number, fps = 6): number {
  if (settings.get().reducedMotion) return 0
  return Math.floor((timeMs * fps) / 1000) % 1000
}

/** Waits until the hand and marker fonts are ready for canvas text. Resolves even if loading fails. */
export async function loadSketchFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  await Promise.all([
    document.fonts.load("32px 'Patrick Hand'"),
    document.fonts.load("32px 'Permanent Marker'")
  ]).catch(() => undefined)
}
