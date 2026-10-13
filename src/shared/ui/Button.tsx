import type { ButtonHTMLAttributes, MouseEvent } from 'react'

import { sfx } from '../audio'
import { cn } from './cn'
import { releaseFocusAfterPointer } from './focus'

export type ButtonVariant = 'primary' | 'ghost' | 'danger'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** 'lg' is for the main call to action, such as Tap to Start. */
  size?: 'md' | 'lg'
  /** Plays a click sound on press. Defaults to true. */
  sound?: boolean
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-marker-yellow text-ink shadow-[3px_4px_0_var(--color-ink)]',
  ghost: 'border-dashed bg-paper/70 text-ink',
  danger: 'bg-marker-red text-white shadow-[3px_4px_0_var(--color-ink)]'
}

/**
 * A chunky hand-drawn button with a press wobble. At least 48 px tall for thumbs. Outside
 * dialogs it lets go of focus after a mouse or touch click, so game keys reach the game.
 *
 * @example <Button variant="danger" onClick={reset}>Scrap It</Button>
 */
export function Button({
  variant = 'primary',
  size = 'md',
  sound = true,
  className,
  onClick,
  type = 'button',
  ...rest
}: ButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (sound) sfx.play('click')
    onClick?.(event)
    releaseFocusAfterPointer(event)
  }
  return (
    <button
      type={type}
      onClick={handleClick}
      className={cn(
        'pointer-events-auto inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-sketch border-[3px] border-ink px-5 font-marker tracking-wide transition-transform duration-100 select-none hover:-rotate-1 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-marker-blue active:translate-y-0.5 active:scale-95 active:rotate-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:rotate-0 disabled:active:scale-100',
        size === 'lg' ? 'min-h-16 px-8 text-2xl' : 'text-lg',
        VARIANTS[variant],
        className
      )}
      {...rest}
    />
  )
}
