import {
  useEffect,
  useEffectEvent,
  type KeyboardEvent,
  type RefObject
} from 'react'

import { blockGameInput } from '../input/block'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Top-level elements with this attribute stay usable while a dialog is open, such as the toaster. */
const LIVE_ATTRIBUTE = 'data-dialog-live'

/** Open dialogs, oldest first. Only the newest one answers Escape. */
const openDialogs: HTMLElement[] = []
/** Elements made inert by open dialogs, with how many dialogs hold each one. */
const inertHolds = new Map<HTMLElement, number>()

/**
 * Makes an element behave as a modal dialog while `open`: focus moves to its first
 * control and stays inside, everything else on the page turns inert, game keys stop,
 * Escape calls `onEscape` (when given), and focus returns to the opener on close.
 * Render the dialog through a portal into `document.body`.
 *
 * @example
 * const onKeyDown = useDialog(open, dialogRef, onClose)
 * return createPortal(<div ref={dialogRef} role="dialog" aria-modal="true" onKeyDown={onKeyDown} />, document.body)
 */
export function useDialog(
  open: boolean,
  dialogRef: RefObject<HTMLElement | null>,
  onEscape?: () => void
): (event: KeyboardEvent<HTMLElement>) => void {
  const escape = useEffectEvent(() => onEscape?.())
  const canEscape = onEscape !== undefined

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    openDialogs.push(dialog)
    const unblock = blockGameInput()
    const restoreInert = inertOutside(topLevel(dialog))
    // Without preventScroll a dialog taller than a short phone screen would scroll its
    // title away to show the first button.
    ;(dialog.querySelector<HTMLElement>(FOCUSABLE) ?? dialog).focus({
      preventScroll: true
    })
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || !canEscape) return
      if (openDialogs[openDialogs.length - 1] !== dialog) return
      event.stopPropagation()
      escape()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      openDialogs.splice(openDialogs.indexOf(dialog), 1)
      restoreInert()
      unblock()
      opener?.focus()
    }
  }, [open, canEscape, dialogRef])

  return trapTab
}

/** Keeps Tab and Shift+Tab cycling inside the dialog. */
function trapTab(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Tab') return
  const items = event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

/** The ancestor of `el` that sits directly in `<body>`, such as a portal's root. */
function topLevel(el: HTMLElement): HTMLElement {
  let node = el
  while (node.parentElement && node.parentElement !== document.body)
    node = node.parentElement
  return node
}

/** Makes every other top-level element inert until the returned function runs. */
function inertOutside(root: HTMLElement): () => void {
  const held: HTMLElement[] = []
  for (const el of Array.from(document.body.children)) {
    if (!(el instanceof HTMLElement) || el === root) continue
    if (el.hasAttribute(LIVE_ATTRIBUTE)) continue
    const holds = inertHolds.get(el) ?? 0
    // Leave alone anything the page made inert itself.
    if (holds === 0 && el.inert) continue
    inertHolds.set(el, holds + 1)
    el.inert = true
    held.push(el)
  }
  return () => {
    for (const el of held) {
      const holds = (inertHolds.get(el) ?? 1) - 1
      if (holds > 0) {
        inertHolds.set(el, holds)
      } else {
        inertHolds.delete(el)
        el.inert = false
      }
    }
  }
}
