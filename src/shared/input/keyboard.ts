import { isGameInputBlocked, onGameInputBlock } from './block'

type KeyListener = (event: KeyboardEvent) => void

/** Focused elements that Space and Enter activate, so those keys belong to them, not the game. */
const ACTIVATED_BY_KEYS =
  'button, a[href], summary, [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="tab"], [role="menuitem"]'

/**
 * Tracks held keys by `KeyboardEvent.code` (layout independent, e.g. 'KeyW', 'ArrowUp', 'Space').
 * It ignores keys typed into form fields, Space and Enter on a focused button, and new
 * presses while a dialog is open. When the window loses focus or a dialog opens, every
 * held key is released and its release listeners run, so presses never stick.
 *
 * @example
 * const keys = new Keyboard()
 * keys.onPress('Space', () => hammer.start())
 * keys.onRelease('Space', () => hit(hammer.release()))
 * // in update: const walk = keys.anyDown(['KeyW', 'ArrowUp'])
 */
export class Keyboard {
  private readonly held = new Set<string>()
  private readonly pressListeners = new Map<string, Set<KeyListener>>()
  private readonly releaseListeners = new Map<string, Set<KeyListener>>()
  private readonly stopBlockWatch: () => void

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.handleDown)
    target.addEventListener('keyup', this.handleUp)
    target.addEventListener('blur', this.releaseAll)
    this.stopBlockWatch = onGameInputBlock(this.releaseAll)
  }

  isDown(code: string): boolean {
    return this.held.has(code)
  }

  /** True when any of `codes` is held. */
  anyDown(codes: readonly string[]): boolean {
    for (const code of codes) if (this.held.has(code)) return true
    return false
  }

  /**
   * Returns -1, 0 or 1 from two key groups. For a smooth tilt control use `TiltAxis`.
   *
   * @example const turn = keys.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight'])
   */
  axis(negative: readonly string[], positive: readonly string[]): number {
    return (this.anyDown(positive) ? 1 : 0) - (this.anyDown(negative) ? 1 : 0)
  }

  /** Calls `listener` when a key goes down (not on auto-repeat). Returns an unsubscribe function. */
  onPress(
    codes: string | readonly string[],
    listener: KeyListener
  ): () => void {
    return addListener(this.pressListeners, codes, listener)
  }

  /**
   * Calls `listener` when a held key comes up, or is released because the window lost
   * focus or a dialog opened. Returns an unsubscribe function.
   */
  onRelease(
    codes: string | readonly string[],
    listener: KeyListener
  ): () => void {
    return addListener(this.releaseListeners, codes, listener)
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.handleDown)
    this.target.removeEventListener('keyup', this.handleUp)
    this.target.removeEventListener('blur', this.releaseAll)
    this.stopBlockWatch()
    this.held.clear()
    this.pressListeners.clear()
    this.releaseListeners.clear()
  }

  private readonly handleDown = (event: KeyboardEvent) => {
    if (isGameInputBlocked() || isTyping(event) || activatesFocus(event)) return
    if (event.repeat && this.held.has(event.code)) return
    this.held.add(event.code)
    const listeners = this.pressListeners.get(event.code)
    if (listeners) for (const listener of listeners) listener(event)
  }

  private readonly handleUp = (event: KeyboardEvent) => {
    if (!this.held.delete(event.code)) return
    const listeners = this.releaseListeners.get(event.code)
    if (listeners) for (const listener of listeners) listener(event)
  }

  private readonly releaseAll = () => {
    for (const code of [...this.held]) {
      this.handleUp(new KeyboardEvent('keyup', { code }))
    }
  }
}

function addListener(
  map: Map<string, Set<KeyListener>>,
  codes: string | readonly string[],
  listener: KeyListener
): () => void {
  const list = typeof codes === 'string' ? [codes] : codes
  for (const code of list) {
    let set = map.get(code)
    if (!set) map.set(code, (set = new Set()))
    set.add(listener)
  }
  return () => {
    for (const code of list) map.get(code)?.delete(listener)
  }
}

function isTyping(event: KeyboardEvent): boolean {
  const target = event.target
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

function activatesFocus(event: KeyboardEvent): boolean {
  const code = event.code
  if (code !== 'Space' && code !== 'Enter' && code !== 'NumpadEnter')
    return false
  const target = event.target
  return target instanceof HTMLElement && target.matches(ACTIVATED_BY_KEYS)
}
