import { nameProblem, normaliseName } from './names'
import type { Faults } from './types'

/** Dev-only network and game switches read from the room page's query string. */
export interface NetFlags {
  /** `?local`: the BroadcastChannel transport instead of Pusher. */
  local: boolean
  /** `?skew=ms`: added to this tab's clock reads, to test clock sync. */
  skew: number
  /** `?pid=`: forces the local player id. */
  pid: string | null
  /** `?seed=`: the host's match seed. */
  seed: number | null
  /** `?fast`: short rounds and reveals. */
  fast: boolean
  /** `?debug`: net and hit-area overlays. */
  debug: boolean
  /** `?calm`: no gusts and no Biscuit, so older checks of throws and mowing stay exact. */
  calm: boolean
  /** `?cvd=deutan` or `?cvd=protan`: a colour-vision filter on the canvas. */
  cvd: 'deutan' | 'protan' | null
  /** `?bot=learner` (or another profile name): autopilot plays this tab's garden. */
  bot: string | null
  /** `?name=`: this local tab's display name, so layout checks can pick long names. */
  name: string | null
  faults: Faults
}

const OFF: NetFlags = {
  local: false,
  skew: 0,
  pid: null,
  seed: null,
  fast: false,
  debug: false,
  calm: false,
  cvd: null,
  bot: null,
  name: null,
  faults: { lag: 0, jitter: 0, drop: 0, reorder: 0, offline: false }
}

function num(
  params: URLSearchParams,
  key: string,
  min: number,
  max: number
): number {
  const value = Number(params.get(key))
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 0
}

/** Parses the dev flags from a query string. Exported for tests; use `netFlags` in code. */
export function parseNetFlags(search: string): NetFlags {
  const params = new URLSearchParams(search)
  const pid = params.get('pid')
  const seed = params.get('seed')
  const cvd = params.get('cvd')
  const name = normaliseName(params.get('name') ?? '')
  return {
    local: params.has('local'),
    skew: num(params, 'skew', -86_400_000, 86_400_000),
    pid: pid && /^[a-z0-9]{8,24}$/.test(pid) ? pid : null,
    seed:
      seed !== null && Number.isFinite(Number(seed))
        ? Math.abs(Math.floor(Number(seed)))
        : null,
    fast: params.has('fast'),
    debug: params.has('debug'),
    calm: params.has('calm'),
    cvd: cvd === 'deutan' || cvd === 'protan' ? cvd : null,
    bot: /^[a-z]{1,12}$/.test(params.get('bot') ?? '')
      ? params.get('bot')
      : null,
    name: name && !nameProblem(name) ? name : null,
    faults: {
      lag: num(params, 'lag', 0, 10_000),
      jitter: num(params, 'jitter', 0, 10_000),
      drop: num(params, 'drop', 0, 1),
      reorder: num(params, 'reorder', 0, 1),
      offline: false
    }
  }
}

/** This page's dev flags. Every flag is off in production builds. */
export const netFlags: NetFlags =
  process.env.NODE_ENV !== 'production' && typeof location !== 'undefined'
    ? parseNetFlags(location.search)
    : OFF
