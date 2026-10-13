import { useState, type ReactNode } from 'react'

import { sfx } from '../audio'
import { requestMotionPermission, type MotionPermission } from '../input/motion'
import { startSession } from '../lifecycle'
import { Button } from './Button'
import { cn } from './cn'

export interface StartInfo {
  /** Result of the motion permission request, or 'unsupported' when `motion` was false. */
  motion: MotionPermission
}

export interface StartScreenProps {
  title: string
  /** One-line pitch, such as "Nail 60 jellies to a wall." */
  pitch: string
  /** A sentence or two of story. */
  story?: ReactNode
  /** Asks for motion sensor access during the tap. Needed on iOS for tilt and jolt. */
  motion?: boolean
  onStart: (info: StartInfo) => void
  buttonLabel?: string
  /** Extra content under the button, such as a settings link. */
  children?: ReactNode
  className?: string
}

/**
 * The title screen with a big Tap to Start button. The tap unlocks audio, starts the
 * session (the screen stays awake until `EndingScreen` opens), and asks for motion access
 * when `motion` is set.
 *
 * @example <StartScreen title="Water in a Sieve" pitch="Fill the bathtub." motion onStart={begin} />
 */
export function StartScreen({
  title,
  pitch,
  story,
  motion = false,
  onStart,
  buttonLabel = 'Tap to Start',
  children,
  className
}: StartScreenProps) {
  const [busy, setBusy] = useState(false)

  const start = async () => {
    if (busy) return
    setBusy(true)
    // Everything that needs the tap's user activation runs before the first await.
    sfx.unlock()
    startSession()
    const permission = motion
      ? requestMotionPermission()
      : Promise.resolve<MotionPermission>('unsupported')
    sfx.play('pop')
    onStart({ motion: await permission })
  }

  return (
    <div
      className={cn(
        'pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-5 overflow-y-auto px-6 py-8 text-center text-ink',
        className
      )}
    >
      <h1 className="max-w-xl -rotate-2 font-marker text-5xl leading-none text-balance sm:text-7xl">
        {title}
      </h1>
      <p className="max-w-md rotate-1 font-hand text-2xl leading-tight text-balance sm:text-3xl">
        {pitch}
      </p>
      {story && (
        <p className="max-w-md font-hand text-xl leading-snug text-balance text-ink-soft">
          {story}
        </p>
      )}
      <Button
        size="lg"
        sound={false}
        onClick={start}
        disabled={busy}
        className="mt-2 animate-wobble"
      >
        {buttonLabel}
      </Button>
      {children}
    </div>
  )
}
