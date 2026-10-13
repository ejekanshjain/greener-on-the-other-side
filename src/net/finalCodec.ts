import type { Blame } from '../game/garden'
import {
  BLAME_KEYS,
  COUNT_KEYS,
  noCounts,
  type FinalMarker,
  type FinalReport
} from '../game/report'
import { PATCHES } from '../game/tuning'
import { itemCode, itemFromCode } from '../game/types'
import { fromBase64, toBase64 } from './lawnCodec'

/** The final pack's format version, its first byte. */
export const FINAL_VERSION = 1
/** Every loose item under the 160-item cap, plus 12 crawling snails. */
export const FINAL_MARKER_MAX = 172
/** Bytes before the markers: version, round, patches, counts, blame, health sum, marker count. */
const HEAD_BYTES = 2 + PATCHES + COUNT_KEYS.length + BLAME_KEYS.length + 2 + 1
/** The longest final in base64. */
export const FINAL_MAX_CHARS =
  Math.ceil((HEAD_BYTES + 2 * FINAL_MARKER_MAX) / 3) * 4

/**
 * Packs a final into bytes, then base64 (PLAN.md 2.6): version, round, 192 patch bytes,
 * 8 counts, 6 own-fault counts capped at 255, the health sum in 2 bytes, then a count
 * and 2 bytes per item: its patch, and its item code with the litter look in bits 4
 * and 5 and a sunk flag in bit 6.
 */
export function encodeFinal(report: FinalReport): string {
  const markers = report.markers.slice(0, FINAL_MARKER_MAX)
  const bytes = new Uint8Array(HEAD_BYTES + 2 * markers.length)
  let i = 0
  bytes[i++] = FINAL_VERSION
  bytes[i++] = report.round
  bytes.set(report.patches.subarray(0, PATCHES), i)
  i += PATCHES
  for (const key of COUNT_KEYS) bytes[i++] = Math.min(255, report.counts[key])
  for (const key of BLAME_KEYS) bytes[i++] = Math.min(255, report.blame[key])
  bytes[i++] = report.healthSum >> 8
  bytes[i++] = report.healthSum & 255
  bytes[i++] = markers.length
  for (const m of markers) {
    bytes[i++] = m.patch
    bytes[i++] = itemCode(m.kind) | ((m.look & 3) << 4) | (m.sunk ? 64 : 0)
  }
  return toBase64(bytes)
}

/** Unpacks a final, or null when it is malformed or from another version. */
export function decodeFinal(text: string): FinalReport | null {
  const bytes = fromBase64(text)
  if (!bytes || bytes.length < HEAD_BYTES || bytes[0] !== FINAL_VERSION)
    return null
  let i = 1
  const round = bytes[i++] as number
  if (round > 2) return null
  const patches = bytes.slice(i, i + PATCHES)
  i += PATCHES
  const counts = noCounts()
  for (const key of COUNT_KEYS) counts[key] = bytes[i++] as number
  const blame = {} as Blame
  for (const key of BLAME_KEYS) blame[key] = bytes[i++] as number
  const healthSum = ((bytes[i++] as number) << 8) | (bytes[i++] as number)
  const n = bytes[i++] as number
  if (n > FINAL_MARKER_MAX || i + 2 * n !== bytes.length) return null
  const markers: FinalMarker[] = []
  for (let k = 0; k < n; k++) {
    const patch = bytes[i++] as number
    const type = bytes[i++] as number
    const kind = itemFromCode(type & 15)
    if (patch >= PATCHES || !kind) return null
    markers.push({
      patch,
      kind,
      look: (type >> 4) & 3,
      sunk: (type & 64) !== 0
    })
  }
  return { round, patches, counts, healthSum, blame, markers }
}

/** The round a final pack belongs to, without decoding it all, or -1 when it isn't one. */
export function finalRound(text: string): number {
  const bytes = fromBase64(text.slice(0, 4))
  return bytes && bytes[0] === FINAL_VERSION ? (bytes[1] ?? -1) : -1
}
