import type { Point } from '../canvas'

/** One active pointer (finger, mouse button or pen) in logical units. */
export interface TrackedPointer {
  id: number
  /** 'mouse', 'pen' or 'touch'. */
  type: string
  x: number
  y: number
  startX: number
  startY: number
  /** `performance.now()` when it went down. */
  downAt: number
}

/** Two-finger pinch state. Only meaningful while `active` is true. */
export interface Pinch {
  active: boolean
  distance: number
  /** Distance when the current pair of fingers started pinching. */
  startDistance: number
  /** `distance / startDistance`. */
  scale: number
  centerX: number
  centerY: number
  ax: number
  ay: number
  bx: number
  by: number
}

export interface PointerTrackerOptions {
  /** Maps client coordinates to logical units, such as `viewport.toLogical`. Defaults to client pixels. */
  toLogical?: (clientX: number, clientY: number, out: Point) => Point
  /** Velocity smoothing time constant in ms. Defaults to 40. */
  smoothingMs?: number
  /**
   * When the primary lifts, the oldest finger still down takes over. Defaults to true.
   * With false, a finger already down never becomes primary; only a fresh press does.
   */
  handoff?: boolean
}

/** Receives the pointer (reused: copy values you keep) and the event that caused the call. */
export type PointerListener = (
  pointer: TrackedPointer,
  event: PointerEvent
) => void

/** Velocity holds this long after the last move before it starts to decay. */
const VELOCITY_HOLD_MS = 50

/**
 * Tracks pointers on an element with Pointer Events, in logical units. It sets
 * `touch-action: none`, captures pointers, blocks the context menu, and ends every
 * pointer when the window loses focus.
 *
 * The primary pointer is the first one down. When it lifts while other fingers stay
 * down, the oldest remaining finger takes over, unless `handoff` is false. `onPress`, `onDrag` and `onRelease`
 * report only the primary pointer, so a resting thumb or a second finger can't disturb
 * gestures. `onDown`, `onMove` and `onUp` report every pointer.
 *
 * @example
 * const pointer = new PointerTracker(canvas, { toLogical: (x, y, out) => viewport.toLogical(x, y, out) })
 * pointer.onPress(() => hammer.start())
 * pointer.onRelease(() => hit(hammer.release()))
 * pointer.onDrag((p, e) => stir.add(p.x, p.y, e.timeStamp))
 */
export class PointerTracker {
  /** Primary pointer position. Also follows a hovering mouse. */
  x = 0
  y = 0
  /** True while a primary pointer is pressed. */
  isDown = false
  /** `performance.now()` when the current primary press started. */
  downAt = 0
  /** Pointer type of the latest press or mouse hover: 'mouse', 'pen', 'touch', or '' before any input. */
  lastType = ''
  /** Every active pointer by id. Read-only: the tracker owns it. */
  readonly pointers = new Map<number, TrackedPointer>()
  readonly pinch: Pinch = {
    active: false,
    distance: 0,
    startDistance: 0,
    scale: 1,
    centerX: 0,
    centerY: 0,
    ax: 0,
    ay: 0,
    bx: 0,
    by: 0
  }
  private primaryId: number | null = null
  /** Active pointers, oldest first. Kept alongside the map so hot paths don't allocate iterators. */
  private readonly order: TrackedPointer[] = []
  private pinchA = -1
  private pinchB = -1
  private rawVx = 0
  private rawVy = 0
  private lastMoveAt = 0
  private readonly scratch: Point = { x: 0, y: 0 }
  private readonly hover: TrackedPointer = {
    id: -1,
    type: 'mouse',
    x: 0,
    y: 0,
    startX: 0,
    startY: 0,
    downAt: 0
  }
  private readonly toLogical: (
    clientX: number,
    clientY: number,
    out: Point
  ) => Point
  private readonly smoothingMs: number
  private readonly handoff: boolean
  private readonly downListeners = new Set<PointerListener>()
  private readonly moveListeners = new Set<PointerListener>()
  private readonly upListeners = new Set<PointerListener>()
  private readonly pressListeners = new Set<PointerListener>()
  private readonly dragListeners = new Set<PointerListener>()
  private readonly releaseListeners = new Set<PointerListener>()
  private readonly previousTouchAction: string

  constructor(
    private readonly element: HTMLElement,
    {
      toLogical = clientPoint,
      smoothingMs = 40,
      handoff = true
    }: PointerTrackerOptions = {}
  ) {
    this.toLogical = toLogical
    this.smoothingMs = smoothingMs
    this.handoff = handoff
    this.previousTouchAction = element.style.touchAction
    element.style.touchAction = 'none'
    element.addEventListener('pointerdown', this.handleDown)
    element.addEventListener('pointermove', this.handleMove)
    element.addEventListener('pointerup', this.handleUp)
    element.addEventListener('pointercancel', this.handleUp)
    element.addEventListener('contextmenu', preventDefault)
    window.addEventListener('blur', this.releaseAll)
  }

  /** How long the primary press has lasted, or 0 when up. */
  get holdMs(): number {
    return this.isDown ? performance.now() - this.downAt : 0
  }

  /** Smoothed primary velocity in logical units per second. Decays to 0 once the pointer stops. */
  get vx(): number {
    return this.rawVx * this.velocityDecay()
  }

  get vy(): number {
    return this.rawVy * this.velocityDecay()
  }

  get speed(): number {
    return Math.hypot(this.rawVx, this.rawVy) * this.velocityDecay()
  }

  /** Number of active pointers. */
  get count(): number {
    return this.order.length
  }

  /** Listens for the primary press starting: the first pointer down, or a finger taking over after the primary lifts. */
  onPress(listener: PointerListener): () => void {
    return subscribe(this.pressListeners, listener)
  }

  /** Listens for the primary pointer moving while pressed. Feed gestures from here. */
  onDrag(listener: PointerListener): () => void {
    return subscribe(this.dragListeners, listener)
  }

  /** Listens for the primary pointer lifting or being cancelled. Fires once per `onPress`. */
  onRelease(listener: PointerListener): () => void {
    return subscribe(this.releaseListeners, listener)
  }

  /** Listens for any pointer going down, including second fingers. */
  onDown(listener: PointerListener): () => void {
    return subscribe(this.downListeners, listener)
  }

  /** Listens for movement of any active pointer, and of a hovering mouse. */
  onMove(listener: PointerListener): () => void {
    return subscribe(this.moveListeners, listener)
  }

  /** Listens for any pointer lifting or being cancelled. */
  onUp(listener: PointerListener): () => void {
    return subscribe(this.upListeners, listener)
  }

  /** Removes every listener and restores the element. */
  dispose(): void {
    const el = this.element
    el.style.touchAction = this.previousTouchAction
    el.removeEventListener('pointerdown', this.handleDown)
    el.removeEventListener('pointermove', this.handleMove)
    el.removeEventListener('pointerup', this.handleUp)
    el.removeEventListener('pointercancel', this.handleUp)
    el.removeEventListener('contextmenu', preventDefault)
    window.removeEventListener('blur', this.releaseAll)
    for (const set of [
      this.downListeners,
      this.moveListeners,
      this.upListeners,
      this.pressListeners,
      this.dragListeners,
      this.releaseListeners
    ])
      set.clear()
    this.pointers.clear()
    this.order.length = 0
  }

  private velocityDecay(): number {
    const idle = performance.now() - this.lastMoveAt
    return idle <= VELOCITY_HOLD_MS
      ? 1
      : Math.exp(-(idle - VELOCITY_HOLD_MS) / this.smoothingMs)
  }

  private readonly handleDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    try {
      this.element.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic events have no capturable pointer; tracking still works without capture.
    }
    const p = this.toLogical(event.clientX, event.clientY, this.scratch)
    const pointer: TrackedPointer = {
      id: event.pointerId,
      type: event.pointerType,
      x: p.x,
      y: p.y,
      startX: p.x,
      startY: p.y,
      downAt: event.timeStamp
    }
    this.pointers.set(pointer.id, pointer)
    this.order.push(pointer)
    this.updatePinch()
    for (const listener of this.downListeners) listener(pointer, event)
    if (this.primaryId === null) this.makePrimary(pointer, event)
  }

  private readonly handleMove = (event: PointerEvent) => {
    const p = this.toLogical(event.clientX, event.clientY, this.scratch)
    let pointer = this.pointers.get(event.pointerId)
    const isPrimary =
      this.primaryId === event.pointerId ||
      (this.primaryId === null && event.pointerType === 'mouse')
    if (isPrimary) this.trackVelocity(p.x, p.y, event.timeStamp)
    if (pointer) {
      pointer.x = p.x
      pointer.y = p.y
      this.updatePinch()
    } else if (isPrimary) {
      // A hovering mouse has no tracked pointer, so report it through a reused one.
      this.lastType = event.pointerType
      pointer = this.hover
      pointer.id = event.pointerId
      pointer.x = pointer.startX = p.x
      pointer.y = pointer.startY = p.y
    } else {
      return
    }
    for (const listener of this.moveListeners) listener(pointer, event)
    if (this.primaryId === event.pointerId) {
      for (const listener of this.dragListeners) listener(pointer, event)
    }
  }

  private readonly handleUp = (event: PointerEvent) => {
    const pointer = this.pointers.get(event.pointerId)
    if (!pointer) return
    this.remove(pointer)
    for (const listener of this.upListeners) listener(pointer, event)
    if (this.primaryId !== pointer.id) return
    this.endPrimary(pointer, event)
    if (!this.handoff) return
    // Hand the press to the oldest finger still down, so holding with another thumb keeps working.
    const next = this.order[0]
    if (next) this.makePrimary(next, event)
  }

  private readonly releaseAll = () => {
    // Window blur can swallow pointerup, so end every pointer to avoid stuck presses.
    for (const pointer of this.order.slice()) {
      this.remove(pointer)
      const event = new PointerEvent('pointercancel', {
        pointerId: pointer.id,
        pointerType: pointer.type
      })
      for (const listener of this.upListeners) listener(pointer, event)
      if (this.primaryId === pointer.id) this.endPrimary(pointer, event)
    }
  }

  private remove(pointer: TrackedPointer): void {
    this.pointers.delete(pointer.id)
    const index = this.order.indexOf(pointer)
    if (index >= 0) this.order.splice(index, 1)
    this.updatePinch()
  }

  private makePrimary(pointer: TrackedPointer, event: PointerEvent): void {
    this.primaryId = pointer.id
    this.isDown = true
    this.downAt = event.timeStamp
    this.lastType = pointer.type
    this.x = pointer.x
    this.y = pointer.y
    // A new primary starts still, so switching fingers doesn't read as a jolt.
    this.rawVx = 0
    this.rawVy = 0
    this.lastMoveAt = event.timeStamp
    for (const listener of this.pressListeners) listener(pointer, event)
  }

  private endPrimary(pointer: TrackedPointer, event: PointerEvent): void {
    this.primaryId = null
    this.isDown = false
    for (const listener of this.releaseListeners) listener(pointer, event)
  }

  private trackVelocity(x: number, y: number, time: number): void {
    const dt = time - this.lastMoveAt
    if (dt > 0) {
      const fresh = dt < 100
      const ivx = fresh ? ((x - this.x) / dt) * 1000 : 0
      const ivy = fresh ? ((y - this.y) / dt) * 1000 : 0
      const vx = this.vx
      const vy = this.vy
      const blend = 1 - Math.exp(-dt / this.smoothingMs)
      this.rawVx = vx + (ivx - vx) * blend
      this.rawVy = vy + (ivy - vy) * blend
      this.lastMoveAt = time
    }
    this.x = x
    this.y = y
  }

  private updatePinch(): void {
    const pinch = this.pinch
    const a = this.order[0]
    const b = this.order[1]
    if (!a || !b) {
      pinch.active = false
      this.pinchA = this.pinchB = -1
      return
    }
    pinch.ax = a.x
    pinch.ay = a.y
    pinch.bx = b.x
    pinch.by = b.y
    pinch.centerX = (a.x + b.x) / 2
    pinch.centerY = (a.y + b.y) / 2
    pinch.distance = Math.hypot(b.x - a.x, b.y - a.y)
    // Restart the scale only when the pinching pair changes, not when a third finger lands.
    if (!pinch.active || a.id !== this.pinchA || b.id !== this.pinchB) {
      pinch.startDistance = pinch.distance
      this.pinchA = a.id
      this.pinchB = b.id
    }
    pinch.scale =
      pinch.startDistance > 0 ? pinch.distance / pinch.startDistance : 1
    pinch.active = true
  }
}

/** True on phones and tablets whose main input is a finger. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof matchMedia === 'function')
    return matchMedia('(hover: none) and (pointer: coarse)').matches
  return 'ontouchstart' in window
}

function clientPoint(clientX: number, clientY: number, out: Point): Point {
  out.x = clientX
  out.y = clientY
  return out
}

function subscribe<T>(set: Set<T>, listener: T): () => void {
  set.add(listener)
  return () => {
    set.delete(listener)
  }
}

function preventDefault(event: Event): void {
  event.preventDefault()
}
