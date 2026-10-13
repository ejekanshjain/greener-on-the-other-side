import { useEffect, useEffectEvent, useRef } from 'react'

import {
  formatClock,
  timeLeftMs,
  timerProgress,
  useNow,
  type RealTimer
} from '../clock'
import { cn } from './cn'

export interface TimerChipProps {
  timer: RealTimer
  /** Shown instead of the timer's own label. */
  label?: string
  /** Text once the time is up. Defaults to "Ready!". */
  doneLabel?: string
  /** Runs once when the timer finishes while shown. */
  onDone?: () => void
  className?: string
}

/**
 * A countdown chip for a real-time timer, with a progress bar. Updates 4 times a second.
 *
 * @example <TimerChip timer={fridgeTimer} onDone={() => sfx.play('ding')} />
 */
export function TimerChip({
  timer,
  label = timer.label,
  doneLabel = 'Ready!',
  onDone,
  className
}: TimerChipProps) {
  const now = useNow(250)
  const left = timeLeftMs(timer, now)
  const done = left <= 0
  const finish = useEffectEvent(() => onDone?.())
  const previous = useRef({ id: timer.id, done })

  useEffect(() => {
    // Fire only on the change to done, not when mounting an already finished timer.
    const was = previous.current
    if (done && !(was.id === timer.id && was.done)) finish()
    previous.current = { id: timer.id, done }
  }, [done, timer.id])

  return (
    <div
      role="timer"
      aria-label={
        done ? `${label}: ${doneLabel}` : `${label}: ${formatClock(left)} left`
      }
      className={cn(
        'inline-flex min-w-36 flex-col gap-1 rounded-sketch-alt border-[3px] border-ink bg-paper px-3 py-1.5 text-ink shadow-[3px_4px_0_rgb(34_34_34/0.25)]',
        done && 'bg-marker-green/20',
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-hand text-lg leading-tight">{label}</span>
        <span className="font-marker text-xl tabular-nums">
          {done ? doneLabel : formatClock(left)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full border-2 border-ink bg-white">
        <div
          className="h-full origin-left bg-marker-blue transition-transform duration-300 ease-linear"
          style={{ transform: `scaleX(${timerProgress(timer, now)})` }}
        />
      </div>
    </div>
  )
}
