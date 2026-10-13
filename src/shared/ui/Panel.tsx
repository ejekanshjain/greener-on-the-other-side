import type { ComponentProps, ReactNode } from 'react'

import { cn } from './cn'

export interface PanelProps extends Omit<ComponentProps<'section'>, 'title'> {
  /** Optional heading drawn in the marker font. */
  title?: ReactNode
}

/**
 * A paper card with a hand-drawn border. Receives pointer events inside `GameLayout`.
 *
 * @example <Panel title="Chores">...</Panel>
 */
export function Panel({ title, className, children, ...rest }: PanelProps) {
  return (
    <section
      className={cn(
        'pointer-events-auto rounded-sketch-alt border-[3px] border-ink bg-paper p-4 text-ink shadow-[4px_5px_0_rgb(34_34_34/0.25)]',
        className
      )}
      {...rest}
    >
      {title && (
        <h2 className="mb-2 font-marker text-2xl leading-tight">{title}</h2>
      )}
      {children}
    </section>
  )
}
