import { armBlock, armLevel } from '../game/arm'
import { DOG_LIFT, type Biscuit } from '../game/biscuit'
import { flightPoint } from '../game/flight'
import { gustDir, gustNear } from '../game/wind'
import { isHeavy } from '../game/types'
import type { Garden } from '../game/garden'
import type { TipTarget } from '../game/tipQueue'
import { ITEM_LIFT, ITEM_RADIUS } from '../game/items'
import {
  BAG_CUTS,
  BISCUIT_HIT,
  CAN_MS,
  CAN_POS,
  CIRCLE_MS,
  CLIP_TEETER_MS,
  COLS,
  COMPOST_MS,
  COMPOST_RECT,
  FENCE_TOP_H,
  GHOST_MS,
  HEALTH_MAX,
  LIFT_MS,
  MOW_SHAKE_PX,
  MOWER_POS,
  PATCHES,
  PATCH_D,
  PATCH_W,
  POUR_RADIUS,
  TAP_POS
} from '../game/tuning'
import {
  type Flight,
  type GardenEvent,
  type Item,
  type ItemKind
} from '../game/types'
import { FailureCues } from './cues'
import { StripeCues, StripeTicks } from './stripeCues'
import { Effects } from './fx'
import { paintShedOpen, SHED_OPEN_RECT } from './junkArt'
import {
  BUBBLE_MS,
  CLIP_FALL_MS,
  HEAD_POP_MS,
  LAUGH_MS,
  type NeighbourView
} from '../net/neighbour'
import type { Viewport } from '../shared/canvas'
import { CachedLayer } from '../shared/layer'
import { damp, hash01 } from '../shared/math'
import { palette } from '../shared/palette'
import { settings } from '../shared/settings'
import { sketchRoundRect, sketchText } from '../shared/sketch'
import {
  CAN_WINDOW,
  DOG_RECT,
  DOG_RECT_LEFT,
  FIST_RECT,
  HEAD_RECT,
  itemPainter,
  litterKey,
  MOWER_BAG,
  paintCan,
  paintDog,
  paintDogAsleep,
  paintDogLeft,
  paintFist,
  paintSnail,
  paintSnailLeft,
  SNAIL_RECT,
  paintBackdrop,
  paintCaption,
  paintHead,
  paintMowerBare,
  paintPatioPaving,
  paintScenery,
  STAMP_RECT,
  TAP_SPOUT,
  type StampKey
} from './art'
import type { PressView } from './input'
import { drawGhostFinger, type FingerPlay } from './ghostFinger'
import { drawTipPointer } from './tipPointer'
import { LawnLayer } from './lawnLayer'
import {
  DESIGN_H,
  DESIGN_W,
  designX,
  designY,
  LAWN,
  PATIO,
  YARD_PANEL_Y
} from './layout'
import {
  CAPTIONS,
  drawPeekLive,
  paintPeekBack,
  paintPeekFront,
  paintPeekRows,
  PEEK_BACK_RECT,
  PEEK_FRONT_RECT,
  PEEK_ROWS_RECT,
  peekKey
} from './peekStrip'

/** How far a weed you pull leans at the full pull, in radians, and slides toward you. */
const PULL_LEAN = 0.45
const PULL_SHIFT = 7

/** A thrown item the thrower still draws rising out of view after the hand-off. */
interface Ghost {
  kind: ItemKind
  flight: Flight
  /** Scene time when the ghost started. */
  from: number
  spin: number
}

/** Options for what the scene draws besides your garden. */
export interface SceneInfo {
  /** The round on screen, 0 to 2, or -1 for the lobby preview. It picks the peek strip's lie. */
  round: number
  debug: boolean
}

/**
 * Draws one player's garden: backdrop, the neighbour's peek strip, the fence, your lawn
 * from a cached layer, and every weed and item from cached stamps. Static art repaints
 * only when the screen size or the lawn changes.
 */
export class GardenScene {
  private backdrop: CachedLayer | null = null
  private readonly scenery: CachedLayer
  /** The bare patio strip above the yard's panel, hiding the props' tops while it's open. */
  private readonly yardStrip: CachedLayer
  private readonly peekBack: CachedLayer
  private readonly peek: CachedLayer
  private readonly peekFront: CachedLayer
  readonly lawn: LawnLayer
  private readonly stamps = new Map<StampKey, CachedLayer>()
  private readonly shedOpen: CachedLayer
  private readonly can: CachedLayer
  private readonly mowerBare: CachedLayer
  private readonly snailRight: CachedLayer
  private readonly snailLeft: CachedLayer
  private readonly dogRight: CachedLayer
  private readonly dogLeft: CachedLayer
  private readonly dogAsleep: CachedLayer
  /** Scene times of Biscuit's last bark, sit and dig, for the bubbles and dirt. */
  private barkAt = -Infinity
  private sitAt = -Infinity
  private digAt = -Infinity
  /** Where Biscuit was last frame, to tell when he's trotting. */
  private dogX = 0
  private dogY = 0
  /** The weathervane's arrow angle (0 points right) and its swing speed. */
  private vaneAngle = -Math.PI / 2
  private vaneSpin = 0
  /** The mower's drawn spot in lawn units; it rolls home after you let go. */
  private mowerX: number = MOWER_POS.lx
  private mowerY: number = MOWER_POS.ly
  private readonly ghosts: Ghost[] = []
  private readonly sorted: Item[] = []
  private readonly point = { x: 0, y: 0, h: 0 }
  private info: SceneInfo = { round: -1, debug: false }
  /** Dust puffs and the screen shake. */
  readonly fx = new Effects()
  /** A blocked throw's words, a rooted weed's shake and a missed flick's swish. */
  readonly cues = new FailureCues()
  /** A stripe's sweep, its flicker as it goes, and the blocked-stripe flash. */
  readonly stripeCues = new StripeCues()
  /** The chalk ticks and crosses on the patio's edge, under each column. */
  readonly ticks = new StripeTicks()
  private ticksGarden: Garden | null = null
  /** The neighbour's lawn version and look the peek layer last painted. */
  private peekVersion = -1
  private peekLook = ''
  private readonly stopResize: () => void
  private time = 0
  /** What a new player's tip on show points at, set by the room each frame. */
  pointer: TipTarget | null = null
  /** A new player's ghost finger on show, set by the room each frame. */
  ghost: FingerPlay | null = null
  /** The neighbour's head, cached per look; rebuilt when the head seed changes. */
  private fistStamp: CachedLayer | null = null
  private head: { seed: number; calm: CachedLayer; angry: CachedLayer } | null =
    null

  constructor(
    private readonly viewport: Viewport,
    private readonly neighbour: NeighbourView | null = null
  ) {
    this.scenery = new CachedLayer(viewport, paintScenery)
    this.peekBack = new CachedLayer(
      viewport,
      ctx => paintPeekBack(ctx, this.info.round),
      { ...PEEK_BACK_RECT }
    )
    this.peek = new CachedLayer(
      viewport,
      ctx => {
        const round = this.info.round
        paintPeekRows(
          ctx,
          round >= 0 ? (this.neighbour?.lawn ?? null) : null,
          Math.max(0, round),
          kind => this.stamp(junkLook(kind))
        )
      },
      { ...PEEK_ROWS_RECT }
    )
    this.peekFront = new CachedLayer(
      viewport,
      ctx => {
        paintPeekFront(ctx, this.info.round)
        const caption = CAPTIONS[this.info.round]
        if (caption) paintCaption(ctx, caption)
      },
      { ...PEEK_FRONT_RECT }
    )
    this.lawn = new LawnLayer(viewport)
    this.yardStrip = new CachedLayer(viewport, paintPatioPaving, {
      x: 0,
      y: PATIO.y,
      width: DESIGN_W,
      height: YARD_PANEL_Y - PATIO.y
    })
    this.shedOpen = new CachedLayer(viewport, paintShedOpen, {
      ...SHED_OPEN_RECT
    })
    this.mowerBare = new CachedLayer(viewport, paintMowerBare, {
      ...STAMP_RECT.mower
    })
    this.snailRight = new CachedLayer(viewport, paintSnail, SNAIL_RECT)
    this.snailLeft = new CachedLayer(viewport, paintSnailLeft, SNAIL_RECT)
    this.dogRight = new CachedLayer(viewport, paintDog, { ...DOG_RECT })
    this.dogLeft = new CachedLayer(viewport, paintDogLeft, { ...DOG_RECT_LEFT })
    this.dogAsleep = new CachedLayer(viewport, paintDogAsleep, { ...DOG_RECT })
    this.can = new CachedLayer(viewport, paintCan, {
      x: -48,
      y: -32,
      width: 72,
      height: 52
    })
    this.stopResize = viewport.onResize(() => {
      this.backdrop?.dispose()
      this.backdrop = null
    })
  }

  /** Changes the round the scene shows, which picks the peek strip's caption and lie. */
  setInfo(info: SceneInfo): void {
    if (info.round !== this.info.round) {
      this.peekBack.invalidate()
      this.peek.invalidate()
      this.peekFront.invalidate()
    }
    this.info = info
  }

  /** Repaints the peek strip when a new report from next door changes what it shows. */
  private followNeighbour(): void {
    const view = this.neighbour
    if (!view || view.lawnVersion === this.peekVersion) return
    this.peekVersion = view.lawnVersion
    const look = peekKey(view.lawn)
    if (look === this.peekLook) return
    this.peekLook = look
    this.peek.invalidate()
  }

  /** Follows garden events that need drawing, such as items leaving over the fence. */
  onEvents(events: readonly GardenEvent[]): void {
    this.fx.onEvents(events, this.time)
    this.cues.onEvents(events, this.time)
    this.stripeCues.onEvents(events, this.time)
    for (const event of events) {
      if (event.type === 'cross')
        this.ghosts.push({
          kind: event.crossing.kind,
          flight: event.flight,
          from: this.time,
          spin: event.crossing.spin
        })
      else if (event.type === 'bark') this.barkAt = this.time
      else if (event.type === 'sit') this.sitAt = this.time
      else if (event.type === 'dig') this.digAt = this.time
    }
  }

  /** Columns of your lawn that gained or lost a stripe in live play, as 12-bit masks. */
  stripeChange(gained: number, lost: number): void {
    this.ticks.lose(lost, this.time)
    this.stripeCues.change(
      gained,
      lost,
      this.time,
      settings.get().reducedMotion
    )
  }

  /**
   * Draws a frame. `timeMs` is the loop's clock, for animation only. `press` says what
   * your finger is doing, so the can follows it. `now` is the shared clock, which times
   * what you see of the neighbour.
   */
  draw(
    garden: Garden | null,
    timeMs: number,
    press?: PressView,
    now = 0
  ): void {
    const dt = Math.min(0.1, Math.max(0, (timeMs - this.time) / 1000))
    this.time = timeMs
    const viewport = this.viewport
    this.fx.applyShake(viewport.canvas, timeMs, viewport.scale)
    const ctx = viewport.begin('#2f6b2a')
    this.backdrop ??= new CachedLayer(
      viewport,
      c => paintBackdrop(c, viewport.view),
      {
        ...viewport.view
      }
    )
    this.backdrop.draw(ctx)
    this.followNeighbour()
    this.peekBack.draw(ctx)
    this.peek.draw(ctx)
    this.peekFront.draw(ctx)
    drawPeekLive(ctx, this.neighbour, this.info.round, now, this.time)
    // Their head and their clips falling back sit behind the fence, so draw them first.
    if (garden) this.drawBehindFence(ctx, now)
    this.scenery.draw(ctx)
    if (garden?.yardLawn) this.yardStrip.draw(ctx)
    if (garden?.shedOpen) this.shedOpen.draw(ctx)
    this.lawn.draw(ctx, garden)
    const still = settings.get().reducedMotion
    if (garden) {
      this.stripeCues.draw(ctx, this.time, still)
      this.drawSparkles(ctx, garden)
      this.drawGarden(ctx, garden)
      this.fx.draw(ctx, this.time)
      this.drawMower(ctx, garden, dt)
      this.drawTapAndCan(ctx, garden, press)
      // A new round's garden starts the ticks fresh.
      if (garden !== this.ticksGarden) {
        this.ticks.reset()
        this.ticksGarden = garden
      }
      this.ticks.follow(garden.settledStripes())
      this.ticks.draw(ctx, this.time, still)
      this.drawWind(ctx, garden)
      this.drawOverFence(ctx, now)
      this.drawSaid(ctx, now)
    }
    this.drawVane(ctx, garden, dt, still)
    this.drawGhosts(ctx, garden)
    // While the ghost finger plays, it's the pointer.
    const ghosting =
      garden !== null &&
      this.ghost !== null &&
      drawGhostFinger(
        ctx,
        garden,
        this.ghost,
        performance.now(),
        still,
        this.stampOf
      )
    if (garden && this.pointer && !ghosting)
      drawTipPointer(ctx, garden, this.pointer, this.time, still)
    if (garden && this.info.debug) this.drawDebug(ctx, garden)
  }

  /** Frees the cached layers. */
  dispose(): void {
    this.stopResize()
    this.fx.reset(this.viewport.canvas)
    this.backdrop?.dispose()
    this.scenery.dispose()
    this.shedOpen.dispose()
    this.yardStrip.dispose()
    this.peekBack.dispose()
    this.peek.dispose()
    this.peekFront.dispose()
    this.lawn.dispose()
    this.can.dispose()
    this.mowerBare.dispose()
    this.snailRight.dispose()
    this.snailLeft.dispose()
    this.dogRight.dispose()
    this.dogLeft.dispose()
    this.dogAsleep.dispose()
    for (const stamp of this.stamps.values()) stamp.dispose()
    this.head?.calm.dispose()
    this.head?.angry.dispose()
    this.fistStamp?.dispose()
  }

  /** Item stamps cached so far: it stops growing once every look has drawn once. */
  get stampCount(): number {
    return this.stamps.size
  }

  /** The stamp for an item kind, made once, for the ghost finger. */
  private readonly stampOf = (kind: ItemKind): CachedLayer => this.stamp(kind)

  private stamp(kind: StampKey): CachedLayer {
    let stamp = this.stamps.get(kind)
    if (!stamp) {
      stamp = new CachedLayer(
        this.viewport,
        itemPainter(kind),
        STAMP_RECT[kind]
      )
      this.stamps.set(kind, stamp)
    }
    return stamp
  }

  private drawGarden(ctx: CanvasRenderingContext2D, garden: Garden): void {
    const still = settings.get().reducedMotion
    const pull = garden.pullProgress()
    const held = garden.held
    for (const weed of garden.weeds) {
      let x = designX(weed.lx)
      let y = designY(weed.ly, ITEM_LIFT[weed.kind])
      let lean = this.cues.weedLean(weed.id, this.time, still)
      // A weed you pull leans toward your finger as the pull builds.
      if (pull > 0 && held?.id === weed.id && !still) {
        const dx = held.fingerX - held.pressX
        const dy = held.fingerY - held.pressY
        const d = Math.hypot(dx, dy)
        lean += (dx / d) * pull * PULL_LEAN
        x += (dx / d) * pull * PULL_SHIFT
        y += (dy / d) * pull * PULL_SHIFT
      }
      this.stamp(weed.kind).stamp(ctx, x, y, lean)
    }
    // Dandelion seeds waiting to root.
    for (const seed of garden.seeds)
      this.stamp('seed').stamp(ctx, designX(seed.lx), designY(seed.ly, 6))
    for (const snail of garden.snails)
      (snail.dir > 0 ? this.snailRight : this.snailLeft).stamp(
        ctx,
        designX(snail.lx),
        designY(snail.ly, ITEM_LIFT.snailShell)
      )
    const sorted = this.sorted
    sorted.length = 0
    // The parked mower draws with its bag and its mowing in `drawMower`.
    const home = garden.mowerHome()
    for (const item of garden.items)
      if (item.id !== garden.mowerId || !home) sorted.push(item)
    sorted.sort(byDepth)
    // Shadows first, so items in the air float over everything on the ground.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)'
    for (const item of sorted) {
      if (item.state === 'sunk') continue
      if (item.h <= 1 && item.state !== 'held') continue
      if (item.ly < 0 || item.state === 'teeter') continue
      const r = ITEM_RADIUS[item.kind] * Math.max(0.4, 1 - item.h / 600)
      ctx.beginPath()
      ctx.ellipse(
        designX(item.lx),
        designY(item.ly),
        r,
        r * 0.4,
        0,
        0,
        Math.PI * 2
      )
      ctx.fill()
    }
    const dog = garden.biscuit
    this.drawDogMarks(ctx, garden)
    // Biscuit sleeps under the yard's panel, so his Zs stay out of its patio strip.
    let dogDrawn = garden.yardLawn
    for (const item of sorted) {
      // Biscuit takes his place in the depth order, behind what lies nearer you.
      if (!dogDrawn && item.ly > dog.y) {
        this.drawBiscuit(ctx, dog)
        dogDrawn = true
      }
      if (item.state === 'sunk') {
        this.drawSunk(ctx, garden, item)
        continue
      }
      const heavy = isHeavy(item.kind)
      const lift =
        ITEM_LIFT[item.kind] + (item.state === 'held' && !heavy ? 10 : 0)
      let angle = item.angle
      if (item.state === 'teeter') angle = Math.sin(this.time / 50) * 0.35
      // A lifted heavy wobbles in your arms.
      if (heavy && item.state === 'held' && item.h > 0)
        angle = Math.sin(this.time / 70) * 0.06
      this.stamp(stampKey(item)).stamp(
        ctx,
        designX(item.lx),
        designY(item.ly, item.h + lift),
        angle
      )
    }
    if (!dogDrawn) this.drawBiscuit(ctx, dog)
    this.drawArmRing(ctx, garden)
    this.cues.draw(ctx, garden, this.time)
  }

  /** Sunk heavy junk lying flat; a thrown mower still on its run shakes and sparks. */
  private drawSunk(
    ctx: CanvasRenderingContext2D,
    garden: Garden,
    item: Item
  ): void {
    let x = designX(item.lx)
    let y = designY(item.ly)
    const running = garden.runs.some(run => run.id === item.id)
    if (running) {
      x += (hash01(Math.floor(this.time), 3) - 0.5) * 5
      y += (hash01(Math.floor(this.time), 4) - 0.5) * 5
    }
    this.stamp(stampKey(item)).stamp(ctx, x, y)
    if (running) this.drawSparks(ctx, x, y)
  }

  /** Sparks off a mower's blades: the warning before a scalp, and a thrown mower's run. */
  private drawSparks(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number
  ): void {
    ctx.strokeStyle = palette.orange
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let k = 0; k < 4; k++) {
      const a = hash01(Math.floor(this.time / 30), k) * Math.PI * 2
      const sx = x + Math.cos(a) * 24
      const sy = y + Math.sin(a) * 18
      ctx.moveTo(sx, sy)
      ctx.lineTo(sx + Math.cos(a) * 10, sy + Math.sin(a) * 10)
    }
    ctx.stroke()
  }

  /**
   * Warnings on the lawn under Biscuit: a pulsing red ring on the patch he circles (the
   * area a tap reaches) with an arc for the time left, and a dotted ring round the item
   * he's eyeing.
   */
  private drawDogMarks(ctx: CanvasRenderingContext2D, garden: Garden): void {
    const dog = garden.biscuit
    if (dog.state === 'circle') {
      const x = designX((dog.patch % COLS) * PATCH_W + PATCH_W / 2)
      const y = designY(Math.floor(dog.patch / COLS) * PATCH_D + PATCH_D / 2)
      const left = 1 - (garden.t - dog.since) / CIRCLE_MS
      ctx.lineWidth = 4
      ctx.setLineDash([10, 8])
      ctx.strokeStyle = `rgba(201, 42, 42, ${0.5 + 0.4 * Math.sin(this.time / 80)})`
      ctx.beginPath()
      ctx.ellipse(x, y, BISCUIT_HIT, BISCUIT_HIT * 0.7, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      // The time left to tap him, as a shrinking arc.
      ctx.strokeStyle = palette.red
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.ellipse(
        x,
        y,
        BISCUIT_HIT + 7,
        BISCUIT_HIT * 0.7 + 7,
        0,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * left
      )
      ctx.stroke()
    }
    if (dog.state === 'eye') {
      const item = garden.item(dog.item)
      if (!item) return
      ctx.lineWidth = 3
      ctx.setLineDash([4, 6])
      ctx.lineDashOffset = -this.time / 40
      ctx.strokeStyle = palette.orange
      ctx.beginPath()
      ctx.arc(
        designX(item.lx),
        designY(item.ly, ITEM_LIFT[item.kind]),
        ITEM_RADIUS[item.kind] + 9,
        0,
        Math.PI * 2
      )
      ctx.stroke()
      ctx.setLineDash([])
      ctx.lineDashOffset = 0
    }
  }

  /**
   * Biscuit: asleep in his bed with floating Zs, or awake with legs that trot and a tail
   * that wags. He barks "Woof!", growls "Grr" while circling, and kicks up dirt as he digs.
   */
  private drawBiscuit(ctx: CanvasRenderingContext2D, dog: Biscuit): void {
    const moving = Math.hypot(dog.x - this.dogX, dog.y - this.dogY) > 0.2
    this.dogX = dog.x
    this.dogY = dog.y
    const gx = designX(dog.x)
    const gy = designY(dog.y)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
    ctx.beginPath()
    ctx.ellipse(gx, gy, 32, 8, 0, 0, Math.PI * 2)
    ctx.fill()
    if (dog.state === 'sleep') {
      this.dogAsleep.stamp(ctx, gx, gy - 12)
      const f = (this.time / 1400) % 1
      sketchText(ctx, 'z', gx + 24 + f * 10, gy - 36 - f * 22, {
        font: 'marker',
        size: 14 + f * 8,
        color: '#ffffff',
        outline: palette.ink,
        alpha: 1 - f
      })
      return
    }
    const bob = moving ? Math.abs(Math.sin(this.time / 55)) * 3 : 0
    const y = gy - DOG_LIFT - bob
    const face = dog.face
    // Legs swing while he trots, and tuck under him while he sits.
    const swing = moving ? Math.sin(this.time / 45) * 5 : 0
    ctx.strokeStyle = palette.ink
    ctx.lineWidth = 3.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const [lx, s] of [
      [-18, 1],
      [-9, -1],
      [10, -1],
      [19, 1]
    ] as const) {
      const legY = dog.state === 'sit' && lx < 0 ? 12 : DOG_LIFT
      ctx.moveTo(gx + lx * face, y + 8)
      ctx.lineTo(gx + (lx + swing * s) * face, y + legY)
    }
    ctx.stroke()
    // The tail: a lazy wave, a fast wag after a bark or while he waits by an item.
    const barked = this.time - this.barkAt < 1200 || dog.state === 'eye'
    const wag = Math.sin(this.time / (barked ? 40 : 220)) * (barked ? 9 : 4)
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(gx - 24 * face, y - 4)
    ctx.quadraticCurveTo(
      gx - 36 * face,
      y - 8,
      gx - (40 + wag * 0.3) * face,
      y - 21 + wag
    )
    ctx.stroke()
    ctx.lineCap = 'butt'
    ;(face > 0 ? this.dogRight : this.dogLeft).stamp(ctx, gx, y)
    const headX = gx + 30 * face
    if (this.time - this.barkAt < 900)
      this.bubble(ctx, 'Woof!', headX + 18 * face, y - 44)
    else if (dog.state === 'circle')
      this.bubble(ctx, 'Grr', headX, y - 40, Math.sin(this.time / 30) * 2)
    if (this.time - this.sitAt < 1300)
      sketchText(ctx, '♥', gx, y - 42 - (this.time - this.sitAt) / 60, {
        font: 'marker',
        size: 22,
        color: palette.red,
        outline: '#ffffff'
      })
    const dug = this.time - this.digAt
    if (dug >= 0 && dug < 700) {
      // Clods of dirt flying out of the new hole.
      ctx.fillStyle = '#6b4a2a'
      for (let k = 0; k < 6; k++) {
        const a = -Math.PI / 2 + (hash01(k, 3) - 0.5) * 2.2
        const r = 10 + (dug / 700) * (30 + hash01(k, 4) * 20)
        ctx.beginPath()
        ctx.arc(
          gx + Math.cos(a) * r,
          gy - 6 + Math.sin(a) * r + (dug / 700) ** 2 * 26,
          3,
          0,
          Math.PI * 2
        )
        ctx.fill()
      }
    }
  }

  /**
   * The weathervane on the fence top. Its arrow points where the wind will blow: up over
   * the fence for a tailwind, down at you for a headwind, or along the fence. It swings
   * on a spring 2s before each gust and shudders while the gust blows. Under Reduced
   * Motion it still turns to point, with no idle wobble and no shudder.
   */
  private drawVane(
    ctx: CanvasRenderingContext2D,
    garden: Garden | null,
    dt: number,
    still: boolean
  ): void {
    const gust = garden ? gustNear(garden.gusts, garden.t) : null
    let target = this.vaneAngle
    if (gust && garden) {
      const dir = gustDir(gust, garden.host)
      target =
        gust.kind === 'over'
          ? dir > 0
            ? -Math.PI / 2
            : Math.PI / 2
          : dir > 0
            ? 0
            : Math.PI
    }
    let diff = target - this.vaneAngle
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    this.vaneSpin += (diff * 60 - this.vaneSpin * 7) * dt
    this.vaneAngle += this.vaneSpin * dt
    const blowing = gust && garden && garden.t >= gust.at
    const angle = still
      ? this.vaneAngle
      : this.vaneAngle +
        (blowing
          ? Math.sin(this.time / 35) * 0.12
          : Math.sin(this.time / 900) * 0.05)
    const x = DESIGN_W / 2
    const y = VANE_Y
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(x, FENCE_Y + 6)
    ctx.lineTo(x, y)
    ctx.stroke()
    ctx.strokeStyle = palette.ink
    ctx.lineWidth = 3.5
    ctx.stroke()
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.scale(1.25, 1.25)
    ctx.beginPath()
    ctx.moveTo(-28, 0)
    ctx.lineTo(22, 0)
    ctx.moveTo(-28, 0)
    ctx.lineTo(-36, -8)
    ctx.moveTo(-28, 0)
    ctx.lineTo(-36, 8)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 8
    ctx.stroke()
    ctx.strokeStyle = palette.ink
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(34, 0)
    ctx.lineTo(18, -10)
    ctx.lineTo(18, 10)
    ctx.closePath()
    ctx.fillStyle = palette.yellow
    ctx.strokeStyle = palette.ink
    ctx.lineWidth = 2.5
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    ctx.fillStyle = palette.ink
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineCap = 'butt'
  }

  /** Streaks racing across your lawn the way a gust blows, fading in and out with it. */
  private drawWind(ctx: CanvasRenderingContext2D, garden: Garden): void {
    const gust = gustNear(garden.gusts, garden.t)
    if (!gust || garden.t < gust.at) return
    const fade = Math.min(
      1,
      (garden.t - gust.at) / 400,
      (gust.end - garden.t) / 400
    )
    const dir = gustDir(gust, garden.host)
    const over = gust.kind === 'over'
    // Lawn units per second along the wind; a tailwind blows up the screen.
    const vx = over ? 0 : dir * WIND_STREAK_SPEED
    const vy = over ? -dir * WIND_STREAK_SPEED : 0
    const t = this.time / 1000
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.75 * fade})`
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (let k = 0; k < 18; k++) {
      const x = wrap(
        hash01(k, 41) * LAWN.w + vx * t * (0.8 + hash01(k, 43) * 0.4),
        LAWN.w
      )
      const y = wrap(
        hash01(k, 42) * LAWN.h + vy * t * (0.8 + hash01(k, 44) * 0.4),
        LAWN.h
      )
      const px = LAWN.x + x
      const py = LAWN.y + y
      const wave = Math.sin(t * 9 + k) * 4
      if (over) {
        ctx.moveTo(px, py)
        ctx.quadraticCurveTo(px + wave, py + 20, px, py + 40)
      } else {
        ctx.moveTo(px, py)
        ctx.quadraticCurveTo(px + 22, py + wave, px + 44, py)
      }
    }
    ctx.stroke()
    ctx.lineCap = 'butt'
  }

  /** A short shout in the marker font with an ink outline, such as "Woof!". */
  private bubble(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    jitter = 0
  ): void {
    sketchText(ctx, text, x + jitter, y, {
      font: 'marker',
      size: 20,
      color: '#ffffff',
      outline: palette.ink,
      rotate: -0.08
    })
  }

  /**
   * The arm meter as a ring round whatever you hold: it fills clockwise with tiredness,
   * green to orange to red, and pulses red while a full meter blocks throws.
   */
  private drawArmRing(ctx: CanvasRenderingContext2D, garden: Garden): void {
    const held = garden.held
    // A rooted weed can't fly yet, so its pull ring takes the arm ring's place.
    this.cues.notePull(held?.target === 'weed' ? held.id : 0)
    if (held?.target === 'weed') return this.drawPullRing(ctx, garden, held.id)
    if (!held || held.grip === 'drag') return
    let x: number
    let y: number
    let r: number
    if (held.target === 'item') {
      const item = garden.item(held.id)
      if (!item) return
      const heavy = held.grip !== undefined
      x = designX(item.lx)
      y = designY(item.ly, item.h + ITEM_LIFT[item.kind] + (heavy ? 0 : 10))
      r = ITEM_RADIUS[item.kind] + 10
      if (held.grip === 'wait') return this.drawLiftRing(ctx, garden, x, y, r)
    } else {
      const weed = garden.weeds.find(w => w.id === held.id)
      if (!weed) return
      x = designX(weed.lx)
      y = designY(weed.ly, ITEM_LIFT[weed.kind])
      r = ITEM_RADIUS[weed.kind] + 10
    }
    const level = armLevel(garden.arm, garden.t)
    const locked = armBlock(garden.arm, garden.t) === 'tired'
    ctx.lineCap = 'round'
    ctx.lineWidth = 6
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.stroke()
    if (locked || level > 0.01) {
      ctx.strokeStyle = locked
        ? `rgba(201, 42, 42, ${0.55 + 0.45 * Math.sin(this.time / 70)})`
        : level < 0.5
          ? palette.green
          : level < 0.8
            ? palette.orange
            : palette.red
      ctx.beginPath()
      ctx.arc(
        x,
        y,
        r,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * (locked ? 1 : level)
      )
      ctx.stroke()
    }
    ctx.lineCap = 'butt'
  }

  /**
   * While you drag a rooted weed, a marker-yellow ring round its root fills with your
   * finger's distance from the press, full at the 60-unit pull that pops it out.
   */
  private drawPullRing(
    ctx: CanvasRenderingContext2D,
    garden: Garden,
    id: number
  ): void {
    const weed = garden.weeds.find(w => w.id === id)
    if (!weed) return
    const x = designX(weed.lx)
    const y = designY(weed.ly, ITEM_LIFT[weed.kind])
    const r = ITEM_RADIUS[weed.kind] + 10
    const f = Math.max(0, garden.pullProgress())
    ctx.lineCap = 'round'
    ctx.lineWidth = 7
    ctx.strokeStyle = 'rgba(34, 34, 34, 0.4)'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.stroke()
    if (f > 0) {
      ctx.lineWidth = 6
      ctx.strokeStyle = palette.yellow
      ctx.beginPath()
      ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f)
      ctx.stroke()
    }
    ctx.lineCap = 'butt'
  }

  /** While you hold heavy junk still, a ring fills over the 0.6s it takes to lift. */
  private drawLiftRing(
    ctx: CanvasRenderingContext2D,
    garden: Garden,
    x: number,
    y: number,
    r: number
  ): void {
    const f = Math.min(
      1,
      (garden.t - (garden.held?.gripAt ?? garden.t)) / LIFT_MS
    )
    ctx.lineCap = 'round'
    ctx.lineWidth = 6
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = palette.ink
    ctx.beginPath()
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f)
    ctx.stroke()
    ctx.lineCap = 'butt'
  }

  private headStamp(angry: boolean): CachedLayer {
    const pemberton = this.neighbour?.pemberton ?? false
    // Mr Pemberton's head needs its own stamps, so his key never matches a seed's.
    const seed = pemberton ? NaN : (this.neighbour?.headSeed ?? 0)
    let head = this.head
    if (!head || !Object.is(head.seed, seed)) {
      head?.calm.dispose()
      head?.angry.dispose()
      const paint = (c: CanvasRenderingContext2D, mad: boolean) =>
        paintHead(c, pemberton ? 0 : seed, mad, pemberton)
      head = this.head = {
        seed,
        calm: new CachedLayer(this.viewport, c => paint(c, false), {
          ...HEAD_RECT
        }),
        angry: new CachedLayer(this.viewport, c => paint(c, true), {
          ...HEAD_RECT
        })
      }
    }
    return angry ? head.angry : head.calm
  }

  /**
   * Behind the fence: the neighbour's head popping up where their throw left their hand,
   * and their clipped throws dropping back down on their side.
   */
  private drawBehindFence(ctx: CanvasRenderingContext2D, now: number): void {
    const view = this.neighbour
    if (!view) return
    const head = view.heads[view.heads.length - 1]
    const age = head ? now - head.at : Infinity
    const stay = head?.until ? head.until - head.at : HEAD_POP_MS
    if (head && age >= 0 && age < stay) {
      // Up over 150 ms, a bob while it stays, down over the last 200 ms.
      const up = Math.min(1, age / 150, (stay - age) / 200)
      const y = FENCE_Y + 30 - up * 52 + Math.sin(age / 90) * 1.5
      this.headStamp(head.angry).stamp(ctx, designX(head.x), y)
    }
    for (const clip of view.clips) {
      const fall = now - clip.at - CLIP_TEETER_MS
      if (fall < 0 || fall > CLIP_FALL_MS) continue
      const f = fall / CLIP_FALL_MS
      ctx.globalAlpha = 1 - f
      this.stamp(clip.kind).stamp(
        ctx,
        designX(clip.x),
        FENCE_Y - ITEM_LIFT[clip.kind] + f * f * 60,
        f * 2
      )
      ctx.globalAlpha = 1
    }
  }

  /** Over the fence: their throws teetering on its top, and their laugh at your clips. */
  private drawOverFence(ctx: CanvasRenderingContext2D, now: number): void {
    const view = this.neighbour
    if (!view) return
    for (const clip of view.clips) {
      const age = now - clip.at
      if (age < 0 || age >= CLIP_TEETER_MS) continue
      this.stamp(clip.kind).stamp(
        ctx,
        designX(clip.x),
        FENCE_Y - ITEM_LIFT[clip.kind],
        Math.sin(this.time / 50) * 0.35
      )
    }
    for (const laugh of view.laughs) {
      const age = now - laugh.at
      if (age < 0 || age >= LAUGH_MS) continue
      const f = age / LAUGH_MS
      sketchText(
        ctx,
        'heh heh heh',
        designX(Math.min(520, Math.max(80, laugh.x))),
        FENCE_Y - 44 - f * 50,
        {
          font: 'marker',
          size: 24,
          color: '#ffffff',
          outline: palette.ink,
          alpha: 1 - f * f,
          rotate: Math.sin(age / 120) * 0.08
        }
      )
    }
  }

  /** Their shaken fist and their newest speech bubble, over the fence. */
  private drawSaid(ctx: CanvasRenderingContext2D, now: number): void {
    const view = this.neighbour
    if (!view) return
    const fist = view.fists[view.fists.length - 1]
    const fistAge = fist ? now - fist.at : Infinity
    if (fist && fistAge >= 0 && fistAge < BUBBLE_MS) {
      this.fistStamp ??= new CachedLayer(this.viewport, paintFist, {
        ...FIST_RECT
      })
      const up = Math.min(1, fistAge / 150, (BUBBLE_MS - fistAge) / 200)
      const x = designX(Math.min(560, Math.max(40, fist.x))) + 40
      this.fistStamp.stamp(
        ctx,
        x + Math.sin(fistAge / 45) * 6,
        FENCE_Y + 20 - up * 56,
        Math.sin(fistAge / 60) * 0.25
      )
    }
    const bubble = view.bubbles[view.bubbles.length - 1]
    const age = bubble ? now - bubble.at : Infinity
    if (!bubble || age < 0 || age >= BUBBLE_MS) return
    const x = designX(Math.min(470, Math.max(130, bubble.x)))
    const y = FENCE_Y - 92
    ctx.globalAlpha = Math.min(1, (BUBBLE_MS - age) / 250)
    sketchRoundRect(ctx, x - 104, y - 24, 208, 44, 14, BUBBLE)
    sketchText(ctx, bubble.text, x, y - 2, { size: 24, maxWidth: 196 })
    ctx.globalAlpha = 1
  }

  /** A twinkling star on every full patch. It shows true health, so it never lies. */
  private drawSparkles(ctx: CanvasRenderingContext2D, garden: Garden): void {
    const health = garden.grid.health
    let any = false
    ctx.beginPath()
    for (let i = 0; i < PATCHES; i++) {
      if (health[i] !== HEALTH_MAX) continue
      any = true
      const x = LAWN.x + (i % COLS) * PATCH_W + 14 + hash01(i, 7) * 22
      const y = LAWN.y + Math.floor(i / COLS) * PATCH_D + 12 + hash01(i, 8) * 16
      const r = 5 + 2.5 * Math.sin(this.time / 160 + i)
      ctx.moveTo(x - r, y)
      ctx.lineTo(x + r, y)
      ctx.moveTo(x, y - r)
      ctx.lineTo(x, y + r)
    }
    if (!any) return
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(255, 236, 120, 0.9)'
    ctx.lineWidth = 3.5
    ctx.stroke()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.lineCap = 'butt'
  }

  /** The tap's handle: across when off, upright while it runs. */
  private drawTapHandle(ctx: CanvasRenderingContext2D, on: boolean): void {
    const hx = designX(TAP_POS.lx) + 4
    const hy = designY(TAP_POS.ly) - 9
    ctx.strokeStyle = palette.ink
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.beginPath()
    if (on) {
      ctx.moveTo(hx, hy - 9)
      ctx.lineTo(hx, hy + 3)
    } else {
      ctx.moveTo(hx - 8, hy - 3)
      ctx.lineTo(hx + 8, hy - 3)
    }
    ctx.stroke()
    ctx.lineCap = 'butt'
  }

  /** The tap's handle and stream, and the can: home under the tap, or in your hand. */
  private drawTapAndCan(
    ctx: CanvasRenderingContext2D,
    garden: Garden,
    press: PressView | undefined
  ): void {
    const water = garden.water
    const level = water.can / CAN_MS
    // The tap's handle sits in the patio strip the yard keeps bare.
    if (!garden.yardLawn) this.drawTapHandle(ctx, water.tapOn)
    const inHand = press?.job === 'wait' || press?.job === 'water'
    const homeX = designX(CAN_POS.lx)
    const homeY = designY(CAN_POS.ly)
    if (water.tapOn)
      this.drawStream(
        ctx,
        TAP_SPOUT.x,
        TAP_SPOUT.y,
        TAP_SPOUT.x,
        inHand ? homeY + 20 : homeY - 14
      )
    if (!inHand || !press) {
      this.drawCan(ctx, homeX, homeY, 0, level)
      if (water.tapOn && water.can >= CAN_MS) this.drawSpill(ctx, homeX, homeY)
      return
    }
    // The can tips during the 150 ms wait, so you see that watering is coming.
    const waited = Math.min(1, (performance.now() - press.since) / 150)
    const angle = press.job === 'water' ? -0.8 : -0.4 * waited
    const fx = designX(press.lx)
    const fy = designY(press.ly)
    const cx = fx + 38
    const cy = fy - 48
    if (water.pour && water.can > 0) {
      ctx.fillStyle = 'rgba(116, 192, 252, 0.16)'
      ctx.beginPath()
      ctx.arc(
        designX(water.pour.lx),
        designY(water.pour.ly),
        POUR_RADIUS,
        0,
        Math.PI * 2
      )
      ctx.fill()
    }
    this.drawCan(ctx, cx, cy, angle, level)
    if (press.job !== 'water') return
    // The spout's rose, turned with the can.
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const rx = cx + -40 * cos - -16 * sin
    const ry = cy + -40 * sin + -16 * cos
    if (water.can > 0) this.drawStream(ctx, rx, ry, fx, fy)
    else if (Math.floor(this.time / 400) % 2 === 0) {
      ctx.fillStyle = palette.water
      ctx.beginPath()
      ctx.arc(rx, ry + 6 + ((this.time / 4) % 100) / 10, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  /**
   * Water running over the rim of a full can at home while the tap still runs: drops
   * down both sides into a spreading puddle, or still drops under Reduced Motion.
   */
  private drawSpill(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const still = settings.get().reducedMotion
    ctx.fillStyle = 'rgba(116, 192, 252, 0.45)'
    ctx.beginPath()
    ctx.ellipse(x, y + 18, 34, 7, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = palette.water
    ctx.strokeStyle = palette.blue
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const f = still ? k / 3 : (this.time / 520 + k / 3) % 1
        const dx = side * (20 + f * 6)
        const dy = -13 + f * 30
        ctx.moveTo(x + dx + 3, y + dy)
        ctx.ellipse(x + dx, y + dy, 3, 4, 0, 0, Math.PI * 2)
      }
    }
    ctx.fill()
    ctx.stroke()
  }

  private drawCan(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    level: number
  ): void {
    this.can.stamp(ctx, x, y, angle)
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    const h = CAN_WINDOW.h * level
    ctx.fillStyle = palette.water
    ctx.fillRect(CAN_WINDOW.x, CAN_WINDOW.y + CAN_WINDOW.h - h, CAN_WINDOW.w, h)
    ctx.restore()
  }

  /** Falling water from (x0, y0) to (x1, y1), as drops moving down the line. */
  private drawStream(
    ctx: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): void {
    ctx.strokeStyle = palette.water
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (let k = 0; k < 5; k++) {
      const f = (this.time / 260 + k / 5) % 1
      const g = Math.min(1, f + 0.12)
      ctx.moveTo(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f)
      ctx.lineTo(x0 + (x1 - x0) * g, y0 + (y1 - y0) * g)
    }
    ctx.stroke()
    ctx.lineCap = 'butt'
  }

  /** The mower: parked with its bag on the patio, or under your finger while you mow. */
  private drawMower(
    ctx: CanvasRenderingContext2D,
    garden: Garden,
    dt: number
  ): void {
    const mower = garden.mower
    const home = garden.mowerHome()
    // In your hand, flying or thrown, the mower draws as an item instead.
    if (!home && !mower.at) return
    if (mower.at) {
      this.mowerX = mower.at.lx
      this.mowerY = mower.at.ly
    } else if (home) {
      this.mowerX = damp(this.mowerX, home.lx, 10, dt)
      this.mowerY = damp(this.mowerY, home.ly, 10, dt)
    }
    let x = designX(this.mowerX)
    let y = designY(this.mowerY)
    const shaking = mower.at !== null && mower.speedPx >= MOW_SHAKE_PX
    if (shaking) {
      x += (hash01(Math.floor(this.time), 1) - 0.5) * 5
      y += (hash01(Math.floor(this.time), 2) - 0.5) * 5
    }
    if (mower.bagOff) {
      this.mowerBare.stamp(ctx, x, y)
      this.drawCompostFill(ctx, garden)
      return
    }
    this.stamp('mower').stamp(ctx, x, y)
    const full = mower.bag >= BAG_CUTS
    const fill = Math.min(1, mower.bag / BAG_CUTS) * (MOWER_BAG.h - 4)
    ctx.fillStyle = full ? '#5f8a2a' : '#8fb84a'
    ctx.fillRect(
      x + MOWER_BAG.x + 3,
      y + MOWER_BAG.y + MOWER_BAG.h - 2 - fill,
      MOWER_BAG.w - 6,
      fill
    )
    if (full)
      sketchText(ctx, 'Full', x, y + MOWER_BAG.y + MOWER_BAG.h / 2, {
        font: 'marker',
        size: 22,
        color: '#ffffff',
        outline: palette.red,
        rotate: -0.12
      })
    if (shaking) this.drawSparks(ctx, x, y)
  }

  /** While you hold the bag on the compost bin, a ring round the bin fills over 1.5s. */
  private drawCompostFill(ctx: CanvasRenderingContext2D, garden: Garden): void {
    if (garden.compostSince < 0) return
    const f = Math.min(1, (garden.t - garden.compostSince) / COMPOST_MS)
    const x = designX(COMPOST_RECT.lx + COMPOST_RECT.w / 2)
    const y = designY(COMPOST_RECT.ly + COMPOST_RECT.h / 2)
    ctx.lineCap = 'round'
    ctx.lineWidth = 7
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.beginPath()
    ctx.arc(x, y, 58, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = palette.green
    ctx.beginPath()
    ctx.arc(x, y, 58, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f)
    ctx.stroke()
    ctx.lineCap = 'butt'
  }

  private drawGhosts(
    ctx: CanvasRenderingContext2D,
    garden: Garden | null
  ): void {
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const ghost = this.ghosts[i] as Ghost
      const age = this.time - ghost.from
      if (age > GHOST_MS || !garden) {
        this.ghosts.splice(i, 1)
        continue
      }
      const flight = ghost.flight
      const tau = flight.endTau + age / flight.T
      const p = flightPoint(flight, tau, this.point)
      ctx.globalAlpha = 1 - age / GHOST_MS
      this.stamp(ghost.kind).stamp(
        ctx,
        designX(p.x),
        designY(p.y, p.h + ITEM_LIFT[ghost.kind]),
        (ghost.spin * age) / 1000
      )
      ctx.globalAlpha = 1
    }
  }

  private drawDebug(ctx: CanvasRenderingContext2D, garden: Garden): void {
    ctx.strokeStyle = 'rgba(255, 0, 255, 0.8)'
    ctx.lineWidth = 1.5
    for (const item of garden.items) {
      ctx.beginPath()
      ctx.arc(
        designX(item.lx),
        designY(item.ly, ITEM_LIFT[item.kind]),
        ITEM_RADIUS[item.kind],
        0,
        Math.PI * 2
      )
      ctx.stroke()
    }
    for (const weed of [...garden.weeds, ...garden.snails]) {
      const kind = 'kind' in weed ? weed.kind : 'snailShell'
      ctx.beginPath()
      ctx.arc(
        designX(weed.lx),
        designY(weed.ly, ITEM_LIFT[kind]),
        ITEM_RADIUS[kind],
        0,
        Math.PI * 2
      )
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.font = '10px monospace'
    for (let i = 0; i < PATCHES; i++)
      ctx.fillText(
        String(i),
        LAWN.x + (i % COLS) * PATCH_W + 3,
        LAWN.y + Math.floor(i / COLS) * PATCH_D + 11
      )
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'
    ctx.strokeRect(0, 0, DESIGN_W, DESIGN_H)
  }
}

/** Mr Pemberton's speech bubble: white paper with an ink edge. */
const BUBBLE = { fill: '#ffffff', width: 2.5, wobble: 1, seed: 311 } as const

/** The fence top in design units, where teeters sit and heads pop up. */
const FENCE_Y = designY(0, FENCE_TOP_H)
/** Where the weathervane's arrow turns, above the middle of the fence. */
const VANE_Y = FENCE_Y - 30
/** How fast the wind streaks cross the lawn, in units per second. */
const WIND_STREAK_SPEED = 420

/** `v` wrapped into 0 to `size`. */
function wrap(v: number, size: number): number {
  return ((v % size) + size) % size
}

/** Sunk junk lies flat under everything; the rest sorts by depth. */
function byDepth(a: Item, b: Item): number {
  return (
    (a.state === 'sunk' ? -1e4 : 0) +
    a.ly -
    (b.state === 'sunk' ? -1e4 : 0) -
    b.ly
  )
}

/** The stamp an item shows: litter by its look, and sunk heavy junk lying flat. */
function stampKey(item: Item): StampKey {
  if (item.kind === 'litter') return litterKey(item.look)
  return item.state === 'sunk' ? junkLook(item.kind) : item.kind
}

/** Heavy junk as it lies once it has landed. */
function junkLook(kind: ItemKind): StampKey {
  return kind === 'bin'
    ? 'binDown'
    : kind === 'trampoline'
      ? 'trampolineFlat'
      : kind
}
