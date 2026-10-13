import type { Blame } from '../game/garden'
import {
  patchHealth,
  patchLength,
  patchTop,
  reportStripes,
  Top,
  type Counts,
  type FinalMarker
} from '../game/report'
import {
  COLS,
  HEALTH_MAX,
  LAWN_D,
  LAWN_W,
  PATCH_D,
  PATCH_W,
  PATCHES
} from '../game/tuning'
import { isHeavy, Mess } from '../game/types'
import { decodeFinal } from '../net/finalCodec'
import { decodeLawn } from '../net/lawnCodec'
import { hash01 } from '../shared/math'
import { sketchRect } from '../shared/sketch'
import {
  itemPainter,
  litterKey,
  paintPatch,
  paintWeed,
  type StampKey
} from './art'

/**
 * A whole lawn drawn small from a final pack, as Brenda saw it at 0:00. Brenda's reveal
 * and the match end screen both draw lawns with it.
 */

/** A lawn read from a pack: patch bytes, items, and blame when it was a final. */
export interface TrueLawn {
  patches: Uint8Array
  markers: FinalMarker[]
  counts: Counts
  healthSum: number
  blame: Blame | null
}

/** Reads a final pack, or a lawn pack when a guest was judged without its final. */
export function readPack(pack: string): TrueLawn | null {
  const final = decodeFinal(pack)
  if (final) return final
  const lawn = decodeLawn(pack)
  if (!lawn) return null
  let health = 0
  for (const byte of lawn.patches) health += patchHealth(byte)
  return {
    patches: lawn.patches,
    markers: lawn.markers.map(m => ({
      ...m,
      look: 0,
      sunk: isHeavy(m.kind)
    })),
    counts: lawn.counts,
    healthSum: health,
    blame: null
  }
}

/**
 * Paints a whole lawn at `k` times its size with its top-left at (x, y): patches by
 * health, length and what's on top, stripes, weeds and every item, inside a sketched
 * frame. With a `tint`, it paints the lie instead: below 0 your lawn browner under grey,
 * above 0 theirs greener with their mess hidden.
 */
export function paintTrueLawn(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  k: number,
  lawn: { patches: Uint8Array; markers: FinalMarker[] },
  tint: number | null = null
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(k, k)
  const stripes = reportStripes(lawn.patches)
  const theirLie = tint !== null && tint > 0
  for (let i = 0; i < PATCHES; i++) {
    const byte = lawn.patches[i] as number
    const top = patchTop(byte)
    const col = i % COLS
    const health = patchHealth(byte)
    const mess =
      top === Top.heap
        ? Mess.heap
        : theirLie
          ? Mess.none
          : top === Top.puddle
            ? Mess.puddle
            : top === Top.mess
              ? Mess.scuff
              : Mess.none
    paintPatch(ctx, col * PATCH_W, Math.floor(i / COLS) * PATCH_D, i + 9000, {
      level: Math.max(0, Math.min(HEALTH_MAX, health + (tint ?? 0))),
      length: patchLength(byte),
      mess,
      hole: top === Top.hole,
      stripe: (stripes >> col) & 1 ? (col % 2 === 0 ? 1 : 2) : 0,
      grey: tint !== null && tint < 0
    })
  }
  for (let i = 0; i < PATCHES; i++)
    if (patchTop(lawn.patches[i] as number) === Top.weed)
      paintAt(
        ctx,
        (i % COLS) * PATCH_W + 25,
        Math.floor(i / COLS) * PATCH_D + 18,
        paintWeed
      )
  // Sunk junk lies flat under everything else, then items from the back rows down.
  const markers = [...lawn.markers].sort(
    (a, b) => Number(b.sunk) - Number(a.sunk) || a.patch - b.patch
  )
  markers.forEach((m, n) => {
    const col = m.patch % COLS
    const row = Math.floor(m.patch / COLS)
    // A 2 by 2 footprint centres on a patch corner; everything else on a patch centre.
    const even = m.sunk && (m.kind === 'bin' || m.kind === 'mower')
    const jx = m.sunk ? 0 : (hash01(m.patch, n) - 0.5) * 22
    const jy = m.sunk ? 0 : (hash01(m.patch, n + 50) - 0.5) * 12
    const cx = col * PATCH_W + (even ? 0 : 25) + jx
    const cy = row * PATCH_D + (even ? 0 : 20) + jy - (m.sunk ? 0 : 10)
    paintAt(ctx, cx, cy, itemPainter(markerKey(m)))
  })
  ctx.restore()
  sketchRect(ctx, x, y, LAWN_W * k, LAWN_D * k, { width: 2.5, seed: 221 })
}

/** The stamp a final's marker shows: litter by look, sunk heavy junk lying flat. */
function markerKey(m: FinalMarker): StampKey {
  if (m.kind === 'litter') return litterKey(m.look)
  if (m.sunk && m.kind === 'bin') return 'binDown'
  if (m.sunk && m.kind === 'trampoline') return 'trampolineFlat'
  return m.kind
}

function paintAt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  paint: (ctx: CanvasRenderingContext2D) => void
): void {
  ctx.save()
  ctx.translate(x, y)
  paint(ctx)
  ctx.restore()
}
