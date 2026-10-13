import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { cn } from './cn'
import { useDialog } from './dialog'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children?: ReactNode
  /** Buttons along the bottom. */
  footer?: ReactNode
  /** Escape, the backdrop and the close button close the modal. Defaults to true. */
  dismissible?: boolean
  className?: string
}

/**
 * A dialog over everything. Focus moves inside and stays there, the page behind turns
 * inert, game keys stop, Escape closes it, and focus returns to the opener on close.
 *
 * @example <Modal open={open} onClose={() => setOpen(false)} title="Settings"><SettingsPanel /></Modal>
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  dismissible = true,
  className
}: ModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const trapTab = useDialog(open, dialogRef, dismissible ? onClose : undefined)

  if (!open) return null
  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      onPointerDown={event => {
        if (dismissible && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapTab}
        className={cn(
          'relative flex max-h-full w-full max-w-lg animate-pop-in flex-col rounded-sketch border-4 border-ink bg-paper text-ink shadow-[6px_8px_0_rgb(34_34_34/0.35)] outline-none',
          className
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <h2 id={titleId} className="font-marker text-3xl leading-tight">
            {title}
          </h2>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mt-1 -mr-2 grid size-12 shrink-0 place-items-center rounded-full font-marker text-3xl hover:rotate-12 focus-visible:outline-4 focus-visible:outline-marker-blue"
            >
              ×
            </button>
          )}
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-3 font-hand text-xl">
          {children}
        </div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-3 px-5 pt-1 pb-5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
