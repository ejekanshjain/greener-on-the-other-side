import type { Blame } from '../game/garden'
import {
  BLAME_KEYS,
  COUNT_KEYS,
  noCounts,
  type LawnReport,
  type Marker
} from '../game/report'
import { BAG_CUTS, CAN_MS, LANDING_CAP, PATCHES } from '../game/tuning'
import { itemCode, itemFromCode } from '../game/types'

/** The lawn pack's format version, its first byte. */
export const LAWN_VERSION = 2
/** The most markers a pack can carry: 24 in the peek rows plus 6 pieces of heavy junk. */
const MARKER_MAX = 30
/** The can level and the tap's run time travel in steps of this many ms. */
const CHORE_STEP_MS = 100
/** Bytes for the chores: bag cuts, can level, the tap, the arm meter. */
const CHORE_BYTES = 4
/** Bytes before the markers: version, round, patches, counts, patio, tally, blame and chores. */
const HEAD_BYTES =
  2 + PATCHES + COUNT_KEYS.length + 2 + 2 + BLAME_KEYS.length + CHORE_BYTES

/**
 * Packs a lawn report into bytes, then base64 (PLAN.md 2.6): version, round, 192 patch
 * bytes, 8 counts, 2 patio bytes, 2 tally bytes, 6 own-fault counts, 4 chore bytes, then
 * the markers and the landings, each a count byte followed by a patch byte and an item
 * code per entry.
 */
export function encodeLawn(report: LawnReport): string {
  const markers = report.markers.slice(0, MARKER_MAX)
  const landings = report.landings.slice(-LANDING_CAP)
  const bytes = new Uint8Array(
    HEAD_BYTES + 2 + 2 * markers.length + 2 * landings.length
  )
  let i = 0
  bytes[i++] = LAWN_VERSION
  bytes[i++] = report.round
  bytes.set(report.patches.subarray(0, PATCHES), i)
  i += PATCHES
  for (const key of COUNT_KEYS) bytes[i++] = Math.min(255, report.counts[key])
  const patio = report.patio
  bytes[i++] = (patio.heaviesThrown & 7) | (patio.mowerThrown ? 8 : 0)
  bytes[i++] = Math.min(15, patio.crateLeft)
  bytes[i++] = report.tally[0]
  bytes[i++] = report.tally[1]
  for (const key of BLAME_KEYS) bytes[i++] = Math.min(255, report.blame[key])
  const chores = report.chores
  bytes[i++] = Math.min(255, chores.bag)
  bytes[i++] = Math.round(chores.can / CHORE_STEP_MS)
  // The tap's top bit says it runs; the rest is its run time toward the next 8s flood.
  bytes[i++] =
    (chores.tapOn ? 128 : 0) |
    Math.min(127, Math.floor(chores.tapRunMs / CHORE_STEP_MS))
  bytes[i++] = Math.round(Math.min(1, Math.max(0, chores.arm)) * 255)
  for (const list of [markers, landings]) {
    bytes[i++] = list.length
    for (const m of list) {
      bytes[i++] = m.patch
      bytes[i++] = itemCode(m.kind)
    }
  }
  return toBase64(bytes)
}

/** Unpacks a lawn pack, or null when it is malformed or from another version. */
export function decodeLawn(text: string): LawnReport | null {
  const bytes = fromBase64(text)
  if (!bytes || bytes.length < HEAD_BYTES + 2 || bytes[0] !== LAWN_VERSION)
    return null
  let i = 1
  const round = bytes[i++] as number
  if (round > 2) return null
  const patches = bytes.slice(i, i + PATCHES)
  i += PATCHES
  const counts = noCounts()
  for (const key of COUNT_KEYS) counts[key] = bytes[i++] as number
  const patioByte = bytes[i++] as number
  const crateLeft = bytes[i++] as number
  const tally: [number, number] = [bytes[i++] as number, bytes[i++] as number]
  const blame = {} as Blame
  for (const key of BLAME_KEYS) blame[key] = bytes[i++] as number
  const bag = Math.min(BAG_CUTS, bytes[i++] as number)
  const can = Math.min(CAN_MS, (bytes[i++] as number) * CHORE_STEP_MS)
  const tap = bytes[i++] as number
  const arm = (bytes[i++] as number) / 255
  const lists: Marker[][] = []
  for (const max of [MARKER_MAX, LANDING_CAP]) {
    const n = bytes[i++]
    if (n === undefined || n > max || i + 2 * n > bytes.length) return null
    const list: Marker[] = []
    for (let k = 0; k < n; k++) {
      const patch = bytes[i++] as number
      const kind = itemFromCode(bytes[i++] as number)
      if (patch >= PATCHES || !kind) return null
      list.push({ patch, kind })
    }
    lists.push(list)
  }
  if (i !== bytes.length) return null
  return {
    round,
    patches,
    counts,
    patio: {
      heaviesThrown: patioByte & 7,
      mowerThrown: (patioByte & 8) !== 0,
      crateLeft: Math.min(15, crateLeft)
    },
    tally,
    blame,
    chores: {
      bag,
      can,
      tapOn: (tap & 128) !== 0,
      tapRunMs: (tap & 127) * CHORE_STEP_MS,
      arm
    },
    markers: lists[0] ?? [],
    landings: lists[1] ?? []
  }
}

/** Bytes to base64. */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i] as number)
  return btoa(binary)
}

/** Base64 to bytes, or null when the text isn't base64. */
export function fromBase64(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return null
  try {
    const binary = atob(text)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}
