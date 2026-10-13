import { useId, type ReactNode } from 'react'

import { sfx } from '../audio'
import { settings, useSettings } from '../settings'
import { cn } from './cn'

/** One control the settings panel can show. */
export type SettingControl =
  'sound' | 'volume' | 'sensitivity' | 'assist' | 'reducedMotion'

const ALL_CONTROLS: readonly SettingControl[] = [
  'sound',
  'volume',
  'sensitivity',
  'assist',
  'reducedMotion'
]

/**
 * Sound, volume, sensitivity, Assist Mode and reduced motion controls. Put it in a `Modal`.
 * Pass game-specific controls through `extra`, and `assistHint` to say what Assist Mode
 * loosens in your game. `controls` picks which of the five show, and `motionHint`
 * replaces the Reduced Motion line.
 *
 * @example <Modal open={open} onClose={close} title="Settings"><SettingsPanel /></Modal>
 */
export function SettingsPanel({
  extra,
  assistHint = 'Loosens steadiness limits for shaky hands.',
  motionHint = 'Stops screen shake and wobbling lines.',
  controls = ALL_CONTROLS
}: {
  extra?: ReactNode
  assistHint?: string
  motionHint?: string
  controls?: readonly SettingControl[]
}) {
  const state = useSettings(s => s)
  const show = (control: SettingControl) => controls.includes(control)
  return (
    <div className="flex flex-col gap-4 font-hand text-xl text-ink">
      {show('sound') && (
        <Toggle
          label="Sound"
          checked={state.sound}
          onChange={sound => {
            settings.set({ sound })
            if (sound) sfx.play('pop')
          }}
        />
      )}
      {show('volume') && (
        <Slider
          label="Volume"
          min={0}
          max={1}
          step={0.05}
          value={state.volume}
          disabled={!state.sound}
          display={`${Math.round(state.volume * 100)}%`}
          onChange={volume => settings.set({ volume })}
          onCommit={() => sfx.play('ding')}
        />
      )}
      {show('sensitivity') && (
        <Slider
          label="Sensitivity"
          hint="How strongly shakes and tilts register."
          min={0.5}
          max={2}
          step={0.1}
          value={state.sensitivity}
          display={`${state.sensitivity.toFixed(1)}x`}
          onChange={sensitivity => settings.set({ sensitivity })}
        />
      )}
      {show('assist') && (
        <Toggle
          label="Assist Mode"
          hint={assistHint}
          checked={state.assist}
          onChange={assist => settings.set({ assist })}
        />
      )}
      {show('reducedMotion') && (
        <Toggle
          label="Reduced Motion"
          hint={motionHint}
          checked={state.reducedMotion}
          onChange={reducedMotion => settings.set({ reducedMotion })}
        />
      )}
      {extra}
    </div>
  )
}

interface ToggleProps {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function Toggle({ label, hint, checked, onChange }: ToggleProps) {
  const hintId = useId()
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4">
      <span className="flex flex-col">
        <span>{label}</span>
        {hint && (
          <span id={hintId} className="text-base text-ink-soft">
            {hint}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        aria-describedby={hint ? hintId : undefined}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          'relative h-8 w-14 shrink-0 rounded-sketch border-[3px] border-ink transition-colors peer-focus-visible:outline-4 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-marker-blue',
          checked ? 'bg-marker-green' : 'bg-white'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-5 rounded-full border-[3px] border-ink bg-paper transition-transform',
            checked && 'translate-x-6'
          )}
        />
      </span>
    </label>
  )
}

interface SliderProps {
  label: string
  hint?: string
  min: number
  max: number
  step: number
  value: number
  display: string
  disabled?: boolean
  onChange: (value: number) => void
  /** Runs when the player lets go of the slider. */
  onCommit?: () => void
}

function Slider({
  label,
  hint,
  min,
  max,
  step,
  value,
  display,
  disabled,
  onChange,
  onCommit
}: SliderProps) {
  const id = useId()
  const hintId = useId()
  return (
    <div className={cn('flex flex-col gap-1', disabled && 'opacity-50')}>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="font-marker text-lg tabular-nums">
          {display}
        </output>
      </div>
      {hint && (
        <span id={hintId} className="text-base text-ink-soft">
          {hint}
        </span>
      )}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        aria-valuetext={display}
        onChange={event => onChange(Number(event.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        className="h-12 w-full cursor-pointer accent-marker-blue"
      />
    </div>
  )
}
