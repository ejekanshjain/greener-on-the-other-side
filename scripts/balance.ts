// `bun run balance [seeds] [family]`: plays seeded bot rounds headless and checks the M27
// and M37 targets in PLAN.md. Each pairing plays `seeds` rounds (200 by default) per round
// it covers.
import { simulateRound, type SimRound } from '../src/game/headless'
import { matchTimings } from '../src/game/match'
import {
  PEMBERTON,
  PLAYERS,
  type FinalePlan,
  type Profile
} from '../src/game/profiles'
import {
  Top,
  patchLength,
  patchTop,
  type FinalReport
} from '../src/game/report'
import { scoreLawn } from '../src/game/score'
import { COLS, PATCHES, ROWS, SHORT_MAX, STRIPE_MIN } from '../src/game/tuning'

const SEEDS = Number(process.argv[2] ?? 200)
/** A second argument picks another family of seeds, to check a result isn't luck. */
const FAMILY = Number(process.argv[3] ?? 0)
const { roundMs } = matchTimings(false)

/** The expert's three finale plans. The closer is the expert's own. */
const plan = (name: string, finale: FinalePlan): Profile => ({
  ...PLAYERS.expert,
  name,
  finale
})
/** Throws its heavy junk while the arm is fresh, then every gnome. */
const THROWER = plan('thrower', {
  gnomes: 'throw',
  gapMs: 0,
  junk: true,
  mower: 'junk',
  mowAfter: false,
  closeMs: 0
})
/** Throws its gnomes, mows once they're gone, and only mows from 0:15 left. */
const MOWER = plan('mower', {
  gnomes: 'throw',
  gapMs: 0,
  junk: false,
  mower: 'keep',
  mowAfter: true,
  closeMs: 15_000
})
const CLOSER: Profile = { ...PLAYERS.expert, name: 'closer' }

/** Plays `SEEDS` rounds of `round` between `a` (host) and `b`, swapping sides on odd seeds when `swap`. */
function play(
  a: Profile,
  b: Profile,
  round: number,
  swap = false
): { sim: SimRound; aHosts: boolean }[] {
  const out: { sim: SimRound; aHosts: boolean }[] = []
  for (let k = 0; k < SEEDS; k++) {
    const seed = 1_000_003 * (k + 1) + round * 7919 + FAMILY * 104_729
    const aHosts = !swap || k % 2 === 0
    const sim = aHosts
      ? simulateRound(seed, round, a, b)
      : simulateRound(seed, round, b, a)
    out.push({ sim, aHosts })
  }
  return out
}

/** Share of rounds `a` won; draws count half. */
function winShare(runs: { sim: SimRound; aHosts: boolean }[]): number {
  let wins = 0
  for (const { sim, aHosts } of runs) {
    const w = sim.result.winner
    if (w === 'd') wins += 0.5
    else if ((w === 'h') === aHosts) wins++
  }
  return wins / runs.length
}

function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const results: { target: string; value: string; ok: boolean }[] = []
function check(target: string, value: string, ok: boolean): void {
  results.push({ target, value, ok })
}

const started = performance.now()

const learner = play(PLAYERS.learner, PEMBERTON[0], 0)
const learnerWins = winShare(learner)
check(
  'A learner beats polite Mr Pemberton in 60% or more of round 1s',
  pct(learnerWins),
  learnerWins >= 0.6
)

const expert = play(PLAYERS.expert, PEMBERTON[2], 2)
const expertWins = winShare(expert)
check(
  'An expert beats petty Mr Pemberton in 40% to 60% of round 3s',
  pct(expertWins),
  expertWins >= 0.4 && expertWins <= 0.6
)

const regulars = [0, 1, 2].flatMap(round =>
  play(PLAYERS.regular, PLAYERS.regular, round)
)
const hostWins = winShare(regulars)
check(
  'The host regular beats the guest regular in 45% to 55% of rounds',
  pct(hostWins),
  hostWins >= 0.45 && hostWins <= 0.55
)

const finale = [0, 1, 2].flatMap(round => play(THROWER, MOWER, round, true))
const throwerWins = winShare(finale)
check(
  'A finale thrower beats a finale mower in 35% to 65% of rounds',
  pct(throwerWins),
  throwerWins >= 0.35 && throwerWins <= 0.65
)
const closerThrower = [0, 1, 2].flatMap(round =>
  play(THROWER, CLOSER, round, true)
)
const throwerCloser = winShare(closerThrower)
check(
  'A finale thrower beats a closer in 35% to 65% of rounds',
  pct(throwerCloser),
  throwerCloser >= 0.35 && throwerCloser <= 0.65
)
const closerMower = [0, 1, 2].flatMap(round => play(MOWER, CLOSER, round, true))
const mowerCloser = winShare(closerMower)
check(
  'A finale mower beats a closer in 35% to 65% of rounds',
  pct(mowerCloser),
  mowerCloser >= 0.35 && mowerCloser <= 0.65
)

type Runs = { sim: SimRound; aHosts: boolean }[]
/** The lawns `a` ended each round with (`a` is the first profile of `play`). */
const lawnsOf = (runs: Runs, side: 'a' | 'b'): FinalReport[] =>
  runs.map(({ sim, aHosts }) => sim.finals[aHosts === (side === 'a') ? 0 : 1])
const stripesOf = (final: FinalReport) => scoreLawn(final).stripes
const mowerLawns = [...lawnsOf(finale, 'b'), ...lawnsOf(closerMower, 'a')]
const mowerStriped =
  mowerLawns.filter(final => stripesOf(final) > 0).length / mowerLawns.length
check(
  'A finale mower holds a striped column at 0:00 in at least half its rounds',
  pct(mowerStriped),
  mowerStriped >= 0.5
)

// Lawns at 0:00 from the regular rounds, both sides.
const lawns = regulars.flatMap(({ sim }) => sim.finals)
const scores = lawns.map(final => scoreLawn(final))
const tidy = median(scores.map(s => s.tidy))
check(
  'Median Tidy at 0:00 sits between 6 and 16',
  String(tidy),
  tidy >= 6 && tidy <= 16
)
const junkGap = median(
  regulars.map(({ sim }) =>
    Math.abs(scoreLawn(sim.finals[0]).junk - scoreLawn(sim.finals[1]).junk)
  )
)
check('The median Junk gap is at least 4 points', String(junkGap), junkGap >= 4)

const upkeep = (round: number) =>
  median(
    regulars
      .filter(({ sim }) => sim.result.round === round)
      .flatMap(({ sim }) => sim.shares.map(s => s.upkeep / roundMs))
  )
const calmUpkeep = (upkeep(0) + upkeep(1)) / 2
check(
  "Upkeep takes 20% to 30% of a regular's time in rounds 1 and 2",
  pct(calmUpkeep),
  calmUpkeep >= 0.2 && calmUpkeep <= 0.3
)
const heatUpkeep = upkeep(2)
check(
  "Upkeep takes 37% to 50% of a regular's time in the heatwave",
  pct(heatUpkeep),
  heatUpkeep >= 0.37 && heatUpkeep <= 0.5
)

for (const r of results)
  console.log(`${r.ok ? 'pass' : 'FAIL'}  ${r.value.padStart(6)}  ${r.target}`)

// What the regular lawns look like, to see where points come from.
const part = (pick: (i: number) => number) =>
  median(lawns.map((_, i) => pick(i)))
const holes = (i: number) => {
  let n = 0
  const patches = lawns[i]?.patches
  if (patches)
    for (let p = 0; p < PATCHES; p++)
      if (patchTop(patches[p] as number) === Top.hole) n++
  return n
}
console.log(
  `regular lawns at 0:00, medians: green ${part(i => scores[i]?.green ?? 0)}, stripes ${part(i => scores[i]?.stripes ?? 0)}, tidy ${tidy}, junk ${part(i => scores[i]?.junk ?? 0)}, total ${part(i => scores[i]?.total ?? 0)}; weeds ${part(i => lawns[i]?.counts.weeds ?? 0)}, snails ${part(i => lawns[i]?.counts.snails ?? 0)}, litter ${part(i => lawns[i]?.counts.litter ?? 0)}, heaps ${part(i => lawns[i]?.counts.heaps ?? 0)}, holes ${part(holes)}, gnomes ${part(i => lawns[i]?.counts.gnomes ?? 0)}`
)
const closerLawns = [
  ...lawnsOf(closerThrower, 'b'),
  ...lawnsOf(closerMower, 'b')
]
console.log(
  `median Stripes at 0:00: regular ${median(lawns.map(stripesOf))}, mower ${median(mowerLawns.map(stripesOf))}, closer ${median(closerLawns.map(stripesOf))}`
)

/**
 * Why the finale mower's unstriped columns failed at 0:00. Each patch that keeps a column
 * from striping gets one reason, worst first: sunk junk, a hole, something covering it, a
 * mark, then long grass. A failed column takes the reason most of its bad patches share.
 */
const failed = { long: 0, marked: 0, covered: 0, holed: 0, sunk: 0 }
type Why = keyof typeof failed
for (const final of mowerLawns) {
  // Heavy junk still lying covers its middle patch; the rest of a heavy footprint sank.
  const lyingHeavy = new Set(
    final.markers.filter(m => !m.sunk).map(m => m.patch)
  )
  for (let c = 0; c < COLS; c++) {
    const tally = { long: 0, marked: 0, covered: 0, holed: 0, sunk: 0 }
    let bad = 0
    for (let i = c; i < PATCHES; i += COLS) {
      const byte = final.patches[i] as number
      const top = patchTop(byte)
      const why: Why | null =
        top === Top.heavy
          ? lyingHeavy.has(i)
            ? 'covered'
            : 'sunk'
          : top === Top.hole
            ? 'holed'
            : top === Top.weed || top === Top.item || top === Top.heap
              ? 'covered'
              : top === Top.mess || top === Top.puddle
                ? 'marked'
                : patchLength(byte) > SHORT_MAX
                  ? 'long'
                  : null
      if (!why) continue
      tally[why]++
      bad++
    }
    if (bad <= ROWS - STRIPE_MIN) continue
    let main: Why = 'long'
    for (const why of Object.keys(tally) as Why[])
      if (tally[why] > tally[main]) main = why
    failed[main]++
  }
}
const failedTotal = Object.values(failed).reduce((x, y) => x + y, 0)
console.log(
  `the mower's unstriped columns at 0:00 (${(failedTotal / mowerLawns.length).toFixed(1)} a round), by main reason: ${(
    Object.entries(failed) as [Why, number][]
  )
    .map(([why, n]) => `${why} ${pct(n / Math.max(1, failedTotal))}`)
    .join(', ')}`
)
console.log(
  `${SEEDS} seeds per pairing and round in ${((performance.now() - started) / 1000).toFixed(1)}s`
)
if (results.some(r => !r.ok)) process.exitCode = 1
