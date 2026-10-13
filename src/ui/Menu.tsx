'use client'

import { useEffect, useRef, useState } from 'react'

import { isTouchDevice } from '../shared/input/pointer'
import { Button } from '../shared/ui/Button'
import { Modal } from '../shared/ui/Modal'
import { SettingsPanel, type SettingControl } from '../shared/ui/SettingsPanel'
import { COPY } from './copy'

/** Assist Mode and sensitivity stay off: both players play by the same rules. */
const CONTROLS: readonly SettingControl[] = ['sound', 'volume', 'reducedMotion']

type View = 'menu' | 'settings' | 'help'
const TITLES: Record<View, string> = {
  menu: 'Menu',
  settings: 'Settings',
  help: 'How to Play'
}

/**
 * The match menu from the top bar's menu button or Escape: Settings, How to Play, Hide
 * Tips and Leave. The round keeps going underneath. Leave hands over to the leave question.
 */
export function Menu({
  open,
  onClose,
  onLeave,
  onHideTips
}: {
  open: boolean
  onClose: () => void
  onLeave: () => void
  /** Turns tips off until the page reloads; leave it out once they're off. */
  onHideTips?: () => void
}) {
  const [view, setView] = useState<View>('menu')
  const body = useRef<HTMLDivElement>(null)
  // Each view opens on its first control, so keyboard focus never drops to the page.
  useEffect(() => {
    if (open) body.current?.querySelector<HTMLElement>('button, input')?.focus()
  }, [open, view])
  const close = () => {
    onClose()
    setView('menu')
  }
  const back = (
    <Button variant="ghost" onClick={() => setView('menu')}>
      Back
    </Button>
  )
  return (
    <Modal
      open={open}
      onClose={close}
      title={TITLES[view]}
      footer={view === 'menu' ? undefined : back}
    >
      <div ref={body} data-testid={`menu-${view}`}>
        {view === 'menu' && (
          <div className="flex flex-col items-stretch gap-3">
            <p className="text-lg text-ink-soft">{COPY.menuNote}</p>
            <Button onClick={close}>Keep Playing</Button>
            <Button variant="ghost" onClick={() => setView('settings')}>
              Settings
            </Button>
            <Button variant="ghost" onClick={() => setView('help')}>
              How to Play
            </Button>
            {onHideTips && (
              <Button
                variant="ghost"
                onClick={() => {
                  onHideTips()
                  close()
                }}
              >
                Hide Tips
              </Button>
            )}
            <Button
              variant="danger"
              onClick={() => {
                close()
                onLeave()
              }}
            >
              Leave
            </Button>
          </div>
        )}
        {view === 'settings' && (
          <SettingsPanel controls={CONTROLS} motionHint={COPY.motionHint} />
        )}
        {view === 'help' && (
          <ul className="flex list-disc flex-col gap-2 pl-5 text-lg leading-snug">
            {COPY.howToPlay.map(line => (
              <li key={line}>{line}</li>
            ))}
            {!isTouchDevice() && <li>{COPY.keys}</li>}
          </ul>
        )}
      </div>
    </Modal>
  )
}
