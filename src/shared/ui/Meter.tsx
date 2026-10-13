import { useEffect, useEffectEvent, useRef } from 'react'

import { cn } from './cn'

/** A coloured band on a meter, such as the green zone for boiling. Values use the meter's scale. */
export interface MeterZone {
  from: number
  to: number
  /** Tailwind background class. Defaults to a translucent green. */
  className?: string
}

export interface MeterProps {
  /** Accessible name, also shown above the bar unless `hideLabel` is set. */
  label: string
  /** Current value for React-driven meters. */
  value?: number
  /**
   * Reads the value every animation frame without re-rendering React. Use it for fast
   * values such as a jolt level. Takes priority over `value`.
   */
  read?: () => number
  /** Top of the scale. Defaults to 1. */
  max?: number
  zones?: readonly MeterZone[]
  /** Draws a red limit line at this value. */
  limit?: number
  /** 'fill' grows a bar; 'needle' moves a marker along the bar. Defaults to 'fill'. */
  mode?: 'fill' | 'needle'
  /** Hides the visible label; it stays as the accessible name. */
  hideLabel?: boolean
  className?: string
}

/**
 * A horizontal meter with optional zones and a limit line. Display only: touches and
 * clicks pass through it to the game.
 *
 * @example
 * <Meter label="Heat" read={() => heat.level} mode="needle" zones={[{ from: 0.55, to: 0.75 }]} />
 * <Meter label="Steadiness" read={() => jolt.level} max={1.5} limit={1} />
 */
export function Meter({
  label,
  value = 0,
  read,
  max = 1,
  zones,
  limit,
  mode = 'fill',
  hideLabel = false,
  className
}: MeterProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const markRef = useRef<HTMLDivElement>(null)
  const live = read !== undefined
  // An effect event always sees the latest `read`, so inline lambdas don't restart the loop.
  const readLatest = useEffectEvent(() => read?.() ?? 0)

  useEffect(() => {
    const root = rootRef.current
    const mark = markRef.current
    if (!live || !root || !mark) return
    let shown = -1
    let shownRounded = -1
    let frame = requestAnimationFrame(function tick() {
      frame = requestAnimationFrame(tick)
      const fraction = clampFraction(readLatest() / max)
      if (Math.abs(fraction - shown) < 0.002) return
      shown = fraction
      mark.style.transform = transformFor(mode, fraction)
      const rounded = Math.round(fraction * max * 100) / 100
      if (rounded !== shownRounded) {
        shownRounded = rounded
        root.setAttribute('aria-valuenow', String(rounded))
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [live, max, mode])

  const fraction = clampFraction(value / max)
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {!hideLabel && (
        <span className="font-hand text-lg leading-none text-ink">{label}</span>
      )}
      <div
        ref={rootRef}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={live ? undefined : Math.round(value * 100) / 100}
        className="relative h-6 overflow-hidden rounded-sketch-alt border-[3px] border-ink bg-white"
      >
        {zones?.map(zone => (
          <div
            key={`${zone.from}-${zone.to}`}
            className={cn(
              'absolute inset-y-0',
              zone.className ?? 'bg-marker-green/45'
            )}
            style={{
              left: `${clampFraction(zone.from / max) * 100}%`,
              width: `${clampFraction((zone.to - zone.from) / max) * 100}%`
            }}
          />
        ))}
        {mode === 'fill' ? (
          <div
            ref={markRef}
            className="absolute inset-0 origin-left bg-marker-blue/80"
            style={{
              transform: live ? 'scaleX(0)' : transformFor('fill', fraction)
            }}
          />
        ) : (
          <div
            ref={markRef}
            className="absolute inset-0"
            style={{
              transform: live
                ? 'translateX(0%)'
                : transformFor('needle', fraction)
            }}
          >
            <div className="h-full w-1.5 -translate-x-1/2 rounded-full bg-ink" />
          </div>
        )}
        {limit !== undefined && (
          <div
            className="absolute inset-y-0 w-1 -translate-x-1/2 bg-marker-red"
            style={{ left: `${clampFraction(limit / max) * 100}%` }}
          />
        )}
      </div>
    </div>
  )
}

function clampFraction(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
}

function transformFor(mode: 'fill' | 'needle', fraction: number): string {
  return mode === 'fill'
    ? `scaleX(${fraction})`
    : `translateX(${fraction * 100}%)`
}

/**
 * Text that updates every animation frame from `read`, without re-rendering React.
 * Only touches the DOM when the text changes.
 *
 * @example <LiveText read={() => `${stir.circles} / 50`} className="font-marker text-3xl" />
 */
export function LiveText({
  read,
  className
}: {
  read: () => string | number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const readLatest = useEffectEvent(read)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let shown = ''
    let frame = requestAnimationFrame(function tick() {
      frame = requestAnimationFrame(tick)
      const next = String(readLatest())
      if (next !== shown) {
        shown = next
        el.textContent = next
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [])
  return <span ref={ref} className={className} />
}
