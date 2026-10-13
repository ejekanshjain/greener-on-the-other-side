import { useEffect, type ReactNode, type Ref } from 'react'

import { DevPanel, type DevAction } from '../dev'
import { settings } from '../settings'
import { cn } from './cn'
import { Toaster } from './toast'

export interface GameLayoutProps {
  /** Ref for the full-screen canvas, usually `canvasRef` from `useGameCanvas`. Omit for menu-only screens. */
  canvasRef?: Ref<HTMLCanvasElement>
  /** Overlay content (HUD, menus). The overlay lets pointer events through; controls such as Buttons and Panels opt back in, display-only pieces don't. */
  children?: ReactNode
  /** Cheats for the dev panel (dev builds only, toggled with the backquote key). */
  dev?: readonly DevAction[]
  className?: string
}

/**
 * Full-viewport game shell: a canvas underneath, an overlay inset by the safe areas on
 * top, plus the toaster and dev panel. Also mirrors the Reduced Motion setting onto
 * `<html data-reduced-motion>` so CSS animations stop.
 *
 * @example
 * <GameLayout canvasRef={canvasRef} dev={[{ label: '+100 coins', run: () => wallet.earn(100, 'dev') }]}>
 *   <CoinBadge wallet={wallet} className="absolute top-3 right-3" />
 * </GameLayout>
 */
export function GameLayout({
  canvasRef,
  children,
  dev,
  className
}: GameLayoutProps) {
  useEffect(() => {
    const sync = () => {
      document.documentElement.dataset.reducedMotion = String(
        settings.get().reducedMotion
      )
    }
    sync()
    return settings.subscribe(sync)
  }, [])

  return (
    <div
      className={cn(
        'fixed inset-0 game-layer overflow-hidden bg-paper',
        className
      )}
    >
      {canvasRef && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block size-full touch-none"
        />
      )}
      <div className="pointer-events-none absolute inset-0 safe-inset">
        <div className="relative size-full">{children}</div>
      </div>
      <Toaster />
      <DevPanel actions={dev} />
    </div>
  )
}
