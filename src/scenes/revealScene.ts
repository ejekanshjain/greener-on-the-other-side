import { countParts, type Counted, type CountLine } from '../game/counts'
import { revealMoment, type RevealTimings } from '../game/reveal'
import { blameText, brendaLine, findings, type Score } from '../game/score'
import { PEEK_TINT } from '../game/tuning'
import type { RoundResult } from '../net/judge'
import { sfx, type SfxName } from '../shared/audio'
import type { PlaySound } from './sounds'
import type { Viewport } from '../shared/canvas'
import { CachedLayer } from '../shared/layer'
import { palette } from '../shared/palette'
import { settings } from '../shared/settings'
import { FONT_HAND, sketchRect, sketchText } from '../shared/sketch'
import {
  BRENDA_RECT,
  paintBrenda,
  paintPlasticLawn,
  paintRosette,
  PLASTIC_RECT,
  ROSETTE_RECT
} from './brendaArt'
import { designY } from './layout'
import { paintTrueLawn, readPack, type TrueLawn } from './trueLawn'

/** What the reveal needs from the session for one frame. */
export interface RevealSource {
  /** Match and round, so cached lawns rebuild for each reveal. */
  key: string
  round: number
  /** True for the match's last reveal, which ends with Brenda's walk home. */
  last: boolean
  /** Ms since the reveal started, on the shared clock. */
  elapsed: number
  timings: RevealTimings
  /** The host's verdict, or null until it arrives. */
  result: RoundResult | null
  iHost: boolean
  theirName: string
  /** Final packs (or, for a guest judged without one, a lawn pack). */
  mine: string | null
  theirs: string | null
  /** The match line, after the deciding round. */
  matchLine: string | null
}

/** One lawn as Brenda's reveal draws it. */
interface RevealLawn {
  patches: Uint8Array
  markers: TrueLawn['markers']
  score: Score
  /** What Brenda counted beside Green, Stripes, Tidy and Junk, '' for none. */
  counts: string[]
  /** Brenda's line, wrapped. */
  line: string[]
  /** The blame line under the loser's score, wrapped, or none. */
  blame: string[]
}

/** The reveal board, in design units. It starts under the peek strip's tint caption. */
const BOARD = { x: 12, y: 112, w: 656, h: 940 } as const
/** Each lawn draws at 0.52 size, 312 by 333 units, side by side. */
const K = 0.52
const LAWN_W_PX = 312
const LAWN_H_PX = 333
const LAWN_Y = 340
const MINE_X = 20
const THEIRS_X = 348
const SCORE_Y = 712
const ROW_H = 32
const LINE_Y = 892
const BLAME_Y = 968
const LABELS = ['Green', 'Stripes', 'Tidy', 'Junk', 'Total'] as const
const LINE_KEYS: readonly (keyof Score)[] = [
  'green',
  'stripes',
  'tidy',
  'junk',
  'total'
]
const COUNT_LINES: readonly CountLine[] = ['green', 'stripes', 'tidy', 'junk']
/** The score labels and counts, in design units. */
const LABEL_SIZE = 22
/** The gap a count keeps from its label and its score. */
const COUNT_GAP = 10
/** Which lawn each cached layer holds, and whether it's the tinted lie. */
type Side = 'mine' | 'theirs'
const LAYERS: readonly [Side, boolean][] = [
  ['mine', true],
  ['mine', false],
  ['theirs', true],
  ['theirs', false]
]
/** Where Brenda walks along the fence while "Time's up." shows. */
const FENCE_FEET_Y = designY(0) + 2
const FEET = 56

/**
 * Brenda's reveal over the garden. "Time's up." while she walks along the fence; then both
 * true lawns side by side with the greener tint peeling off yours, then theirs; the
 * count-up with her lines and the blame line; the rosette; and after the last round, her
 * walk home across her plastic lawn. Every step follows the shared clock, so both
 * screens show it in step. Reduced Motion fades the tint instead of peeling it.
 */
export class RevealScene {
  private readonly board: CachedLayer
  private readonly lawnLayers: CachedLayer[]
  private readonly brenda: CachedLayer
  private readonly rosette: CachedLayer
  private readonly plastic: CachedLayer
  private key = ''
  private mine: RevealLawn | null = null
  private theirs: RevealLawn | null = null
  private source: RevealSource | null = null
  private warmed = 0
  private readonly cues = new Set<string>()
  /** The step drawn last, for dev checks; '' outside a reveal. */
  step = ''

  /** `play` plays (and may log) each of Brenda's sounds. */
  constructor(
    viewport: Viewport,
    private readonly play: PlaySound = (name, options) =>
      sfx.play(name, options)
  ) {
    this.board = new CachedLayer(viewport, paintBoard, {
      x: BOARD.x - 6,
      y: BOARD.y - 6,
      width: BOARD.w + 12,
      height: BOARD.h + 12
    })
    // Your lawn tinted as you saw it, your true lawn, then theirs tinted and true.
    this.lawnLayers = LAYERS.map(([side, lie]) => {
      const x = side === 'mine' ? MINE_X : THEIRS_X
      return new CachedLayer(
        viewport,
        ctx => {
          const lawn = this[side]
          if (lawn)
            paintTrueLawn(
              ctx,
              x,
              LAWN_Y,
              K,
              lawn,
              lie ? tintFor(side, this.source) : null
            )
        },
        { x, y: LAWN_Y, width: LAWN_W_PX, height: LAWN_H_PX }
      )
    })
    this.brenda = new CachedLayer(viewport, paintBrenda, { ...BRENDA_RECT })
    this.rosette = new CachedLayer(viewport, paintRosette, { ...ROSETTE_RECT })
    this.plastic = new CachedLayer(viewport, paintPlasticLawn, {
      ...PLASTIC_RECT
    })
  }

  /** Draws the reveal for this frame, or nothing outside a reveal. */
  draw(
    ctx: CanvasRenderingContext2D,
    source: RevealSource | null,
    timeMs: number
  ): void {
    if (!source) {
      this.step = ''
      return
    }
    this.follow(ctx, source)
    const m = revealMoment(source.elapsed, source.timings, source.last)
    this.step = m.step
    const calm = settings.get().reducedMotion
    if (m.step === 'countdown') return
    this.cue(source, 'doorbell', 'doorbell')
    if (m.step === 'timesUp' || !source.result || !this.mine || !this.theirs) {
      const f = Math.min(1, source.elapsed / (2000 * m.scale))
      this.drawBrenda(ctx, -40 + f * 380, FENCE_FEET_Y - FEET, timeMs, calm)
      this.warm(ctx)
      return
    }
    if (m.step === 'ending')
      return this.drawEnding(ctx, source, m.ending, timeMs, calm)
    this.board.draw(ctx)
    // The heading ends before x 540, where Brenda stands by her verdict.
    sketchText(ctx, roundHeading(source, m.step === 'rosette'), 300, 150, {
      font: 'marker',
      size: 34,
      maxWidth: 460
    })
    this.drawLawn(ctx, 0, m.peelMine, calm)
    this.drawLawn(ctx, 2, m.peelTheirs, calm)
    sketchText(ctx, 'You', MINE_X + LAWN_W_PX / 2, LAWN_Y - 18, { size: 24 })
    sketchText(ctx, source.theirName, THEIRS_X + LAWN_W_PX / 2, LAWN_Y - 18, {
      size: 24,
      maxWidth: LAWN_W_PX
    })
    // Brenda drags her clipboard along the peel, then stands by her verdict.
    const peeling = m.peelMine < 1 ? m.peelMine : m.peelTheirs
    const peelX = (m.peelMine < 1 ? MINE_X : THEIRS_X) + peeling * LAWN_W_PX
    if (m.step === 'peel')
      this.cue(source, `scrub${m.peelMine < 1 ? 0 : 1}`, 'scrub')
    // Under Reduced Motion she stands still while the tint fades.
    if (m.step === 'peel' && !calm)
      this.drawBrenda(ctx, peelX - 30, 252, timeMs, calm)
    else this.drawBrenda(ctx, 590, 210, timeMs, calm)
    if (m.count > 0) this.drawScores(ctx, source, m.count)
    if (m.step === 'rosette') this.drawRosette(ctx, source, m.scale, calm)
  }

  /** Brenda's lines and the blame lines under each lawn, for dev checks. */
  lines(): { mine: string[]; theirs: string[] } {
    return {
      mine: [...(this.mine?.line ?? []), ...(this.mine?.blame ?? [])],
      theirs: [...(this.theirs?.line ?? []), ...(this.theirs?.blame ?? [])]
    }
  }

  /** The counts beside Green, Stripes, Tidy and Junk on each board, for dev checks. */
  counts(): { mine: string[]; theirs: string[] } {
    return { mine: this.mine?.counts ?? [], theirs: this.theirs?.counts ?? [] }
  }

  dispose(): void {
    this.board.dispose()
    for (const layer of this.lawnLayers) layer.dispose()
    this.brenda.dispose()
    this.rosette.dispose()
    this.plastic.dispose()
  }

  /** Decodes both lawns and repaints their layers when a new reveal or verdict arrives. */
  private follow(ctx: CanvasRenderingContext2D, source: RevealSource): void {
    const key = `${source.key}:${source.result ? 1 : 0}:${source.mine ? 1 : 0}:${source.theirs ? 1 : 0}`
    this.source = source
    if (key === this.key) return
    this.key = key
    this.warmed = 0
    const result = source.result
    const mineLawn = source.mine ? readPack(source.mine) : null
    const theirLawn = source.theirs ? readPack(source.theirs) : null
    if (!result || !mineLawn || !theirLawn) {
      this.mine = this.theirs = null
      return
    }
    const [myScore, theirScore] = source.iHost
      ? result.scores
      : [result.scores[1], result.scores[0]]
    const margin = Math.abs(myScore.total - theirScore.total)
    const iWon = (result.winner === 'h') === source.iHost
    const [myCounts, theirCounts] = source.iHost
      ? result.counts
      : [result.counts[1], result.counts[0]]
    const wrap = (text: string) => wrapText(ctx, text, LAWN_W_PX - 10, 19)
    const blameFor = (lawn: TrueLawn, loser: boolean, name: string | null) => {
      if (!loser || !result.blame || !lawn.blame) return []
      const n = lawn.blame[result.blame]
      return n > 0 ? wrap(blameText(result.blame, n, margin, name)) : []
    }
    const draw = result.winner === 'd'
    this.mine = {
      ...mineLawn,
      score: myScore,
      counts: fitCounts(ctx, myScore, myCounts),
      line: wrap(`"${brendaLine(findings(mineLawn), margin, iWon && !draw)}"`),
      blame: blameFor(mineLawn, !iWon && !draw, null)
    }
    this.theirs = {
      ...theirLawn,
      score: theirScore,
      counts: fitCounts(ctx, theirScore, theirCounts),
      line: wrap(
        `"${brendaLine(findings(theirLawn), margin, !iWon && !draw)}"`
      ),
      blame: blameFor(theirLawn, iWon && !draw, source.theirName)
    }
    for (const layer of this.lawnLayers) layer.invalidate()
  }

  /** Paints one cached lawn a frame while "Time's up." shows, so the peel never stalls. */
  private warm(ctx: CanvasRenderingContext2D): void {
    if (!this.mine || this.warmed >= this.lawnLayers.length) return
    const alpha = ctx.globalAlpha
    ctx.globalAlpha = 0
    this.lawnLayers[this.warmed++]?.draw(ctx)
    ctx.globalAlpha = alpha
  }

  /** A lawn with its tint peeled back to `peel`, or faded under Reduced Motion. */
  private drawLawn(
    ctx: CanvasRenderingContext2D,
    first: number,
    peel: number,
    calm: boolean
  ): void {
    const lie = this.lawnLayers[first]
    const truth = this.lawnLayers[first + 1]
    if (!lie || !truth) return
    const x0 = first === 0 ? MINE_X : THEIRS_X
    if (peel > 0) truth.draw(ctx)
    if (peel >= 1) return
    if (calm) {
      ctx.globalAlpha = 1 - peel
      lie.draw(ctx)
      ctx.globalAlpha = 1
      return
    }
    const edge = x0 + peel * LAWN_W_PX
    ctx.save()
    ctx.beginPath()
    ctx.rect(edge, LAWN_Y, x0 + LAWN_W_PX - edge, LAWN_H_PX)
    ctx.clip()
    lie.draw(ctx)
    ctx.restore()
    if (peel <= 0) return
    // The cling film curls up at the peel's edge.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.fillRect(edge - 10, LAWN_Y, 12, LAWN_H_PX)
    ctx.strokeStyle = 'rgba(120, 140, 150, 0.8)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(edge + 2, LAWN_Y)
    for (let y = 0; y <= LAWN_H_PX; y += 20)
      ctx.lineTo(edge + 2 + Math.sin(y / 30 + peel * 9) * 3, LAWN_Y + y)
    ctx.stroke()
  }

  /** Both scores counting up line by line, then Brenda's lines and the blame line. */
  private drawScores(
    ctx: CanvasRenderingContext2D,
    source: RevealSource,
    count: number
  ): void {
    const mine = this.mine
    const theirs = this.theirs
    if (!mine || !theirs) return
    LABELS.forEach((label, i) => {
      const shown = i < 4 ? Math.min(1, Math.max(0, (count - i / 4) * 4)) : 0
      if (i === 4 && count < 1) return
      if (i < 4 && shown <= 0) return
      const y = SCORE_Y + i * ROW_H + (i === 4 ? 8 : 0)
      const key = LINE_KEYS[i] as keyof Score
      for (const [x, lawn] of [
        [MINE_X, mine],
        [THEIRS_X, theirs]
      ] as const) {
        const value =
          i === 4 ? lawn.score.total : Math.round(lawn.score[key] * shown)
        const bold =
          i === 4 ? { font: 'marker' as const, size: 26 } : { size: LABEL_SIZE }
        sketchText(ctx, label, x + 8, y, { ...bold, align: 'left' })
        // What she counted sits just left of the score, in soft ink.
        const counted = lawn.counts[i]
        if (counted)
          sketchText(ctx, counted, x + COUNT_RIGHT, y, {
            size: LABEL_SIZE,
            align: 'right',
            color: palette.inkSoft
          })
        sketchText(ctx, String(value), x + LAWN_W_PX - 8, y, {
          ...bold,
          align: 'right'
        })
        if (i === 4) {
          ctx.strokeStyle = palette.ink
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(x + 4, y - 20)
          ctx.lineTo(x + LAWN_W_PX - 4, y - 20)
          ctx.stroke()
        }
      }
      if (i < 4 && shown > 0 && shown < 1) this.cue(source, `tick${i}`, 'tick')
    })
    if (count < 0.5) return
    const alpha = Math.min(1, (count - 0.5) * 4)
    for (const [x, lawn] of [
      [MINE_X, mine],
      [THEIRS_X, theirs]
    ] as const) {
      lawn.line.forEach((text, k) =>
        sketchText(ctx, text, x + LAWN_W_PX / 2, LINE_Y + k * 24, {
          size: 19,
          alpha,
          color: palette.purple
        })
      )
      if (count < 0.8) continue
      lawn.blame.forEach((text, k) =>
        sketchText(ctx, text, x + LAWN_W_PX / 2, BLAME_Y + k * 23, {
          size: 18,
          color: palette.red
        })
      )
    }
  }

  /** The rosette pinned on the winner's lawn, popping in, or "Draw" across both. */
  private drawRosette(
    ctx: CanvasRenderingContext2D,
    source: RevealSource,
    scale: number,
    calm: boolean
  ): void {
    const result = source.result
    if (!result) return
    if (result.winner === 'd') {
      sketchText(ctx, 'Draw', 340, LAWN_Y + LAWN_H_PX / 2, {
        font: 'marker',
        size: 64,
        color: palette.red,
        outline: '#ffffff',
        rotate: -0.18
      })
      return
    }
    const iWon = (result.winner === 'h') === source.iHost
    this.cue(source, 'rosette', iWon ? 'ding' : 'fail')
    const since = source.elapsed - 14_000 * scale
    const t = calm ? 1 : Math.min(1, since / 350)
    const pop = 1 + 0.25 * Math.sin(t * Math.PI)
    const x = (iWon ? MINE_X : THEIRS_X) + LAWN_W_PX - 30
    ctx.save()
    ctx.translate(x, LAWN_Y + 28)
    ctx.scale(pop * t, pop * t)
    this.rosette.drawAt(ctx, 0, 0)
    ctx.restore()
  }

  /**
   * The last reveal's ending: Brenda walks home across her own perfect lawn, which
   * squeaks because it's plastic. Then "It was never greener." and the match result.
   */
  private drawEnding(
    ctx: CanvasRenderingContext2D,
    source: RevealSource,
    e: number,
    timeMs: number,
    calm: boolean
  ): void {
    this.board.draw(ctx)
    sketchText(ctx, "Brenda's Lawn", 340, 290, { font: 'marker', size: 34 })
    this.plastic.draw(ctx)
    const walk = Math.min(1, Math.max(0, (e - 0.04) / 0.5))
    const x = 80 + walk * 520
    this.drawBrenda(ctx, x, 560, timeMs, calm)
    if (walk > 0 && walk < 1) {
      const step = Math.floor(walk * 8)
      this.cue(source, `squeak${step}`, 'squish', 1.9)
      sketchText(
        ctx,
        'squeak',
        x - 20 + (step % 2) * 30,
        640 - (walk * 8 - step) * 30,
        {
          size: 22,
          color: '#ffffff',
          outline: palette.ink,
          rotate: step % 2 ? 0.2 : -0.2
        }
      )
    }
    if (e >= 0.3)
      sketchText(ctx, 'It was never greener.', 340, 820, {
        font: 'marker',
        size: 38,
        alpha: Math.min(1, (e - 0.3) * 8)
      })
    if (e >= 0.55 && source.matchLine) {
      const alpha = Math.min(1, (e - 0.55) * 8)
      sketchText(ctx, source.matchLine, 340, 910, {
        font: 'marker',
        size: 28,
        alpha,
        maxWidth: 600
      })
      if (!source.matchLine.startsWith('Brenda')) {
        ctx.globalAlpha = alpha
        this.rosette.stamp(ctx, 340, 990)
        ctx.globalAlpha = 1
      }
    }
  }

  /** Brenda standing at (x, y), with a walking bob unless Reduced Motion is on. */
  private drawBrenda(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    timeMs: number,
    calm: boolean
  ): void {
    const bob = calm ? 0 : Math.abs(Math.sin(timeMs / 140)) * -4
    this.brenda.stamp(ctx, x, y + bob, calm ? 0 : Math.sin(timeMs / 140) * 0.04)
  }

  /** Plays a sound once per reveal. Sounds stay silent until the player's first tap. */
  private cue(
    source: RevealSource,
    name: string,
    sound: SfxName,
    pitch = 1
  ): void {
    const key = `${source.key}:${name}`
    if (this.cues.has(key)) return
    this.cues.add(key)
    if (this.cues.size > 200) this.cues.clear()
    this.play(sound, { pitch })
  }
}

/** The board's heading: the round, and once the rosette is pinned, who won it. */
export function roundHeading(source: RevealSource, decided: boolean): string {
  const round = `Round ${source.round + 1}`
  const winner = source.result?.winner
  if (!decided || !winner) return round
  if (winner === 'd') return `${round} Is a Draw`
  return (winner === 'h') === source.iHost
    ? `You Win ${round}`
    : `${source.theirName} Wins ${round}`
}

/** The tint a lawn wore all round: yours a level browner under grey, theirs greener by round. */
function tintFor(side: Side, source: RevealSource | null): number {
  if (side === 'mine') return -1
  return PEEK_TINT[source?.round ?? 0] ?? PEEK_TINT[0]
}

/** A count's right edge from the lawn's left: clear of a three-character score. */
const COUNT_RIGHT = LAWN_W_PX - 8 - 36 - COUNT_GAP

/**
 * The count beside each of Green, Stripes, Tidy and Junk, measured to fit between its
 * label and its score. One too wide keeps only its first kind.
 */
function fitCounts(
  ctx: CanvasRenderingContext2D,
  score: Score,
  counted: Counted
): string[] {
  ctx.save()
  ctx.font = `${LABEL_SIZE}px ${FONT_HAND}`
  const out = COUNT_LINES.map((line, i) => {
    const parts = countParts(line, score, counted)
    const room =
      COUNT_RIGHT - 8 - ctx.measureText(LABELS[i] as string).width - COUNT_GAP
    const all = parts.join(', ')
    return ctx.measureText(all).width <= room ? all : (parts[0] ?? '')
  })
  ctx.restore()
  return out
}

/** The paper board the reveal sits on. */
function paintBoard(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = palette.paper
  ctx.fillRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h)
  sketchRect(ctx, BOARD.x, BOARD.y, BOARD.w, BOARD.h, {
    width: 3.5,
    wobble: 1.5,
    seed: 231
  })
}

/** Splits `text` into lines no wider than `width` in the hand font at `size`. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  size: number
): string[] {
  ctx.save()
  ctx.font = `${size}px ${FONT_HAND}`
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > width) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  ctx.restore()
  return lines
}
