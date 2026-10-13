import type { MouseEvent } from 'react'

/**
 * Drops focus from a HUD control after a mouse or touch click, so a later Space or Enter
 * meant for the game can't press it again. Keyboard clicks (`detail` 0) and controls
 * inside dialogs keep focus.
 */
export function releaseFocusAfterPointer(event: MouseEvent<HTMLElement>): void {
  const el = event.currentTarget
  if (event.detail > 0 && !el.closest('[role="dialog"]')) el.blur()
}
