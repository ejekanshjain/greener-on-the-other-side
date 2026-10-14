'use client'

import { useEffect, useRef, useState } from 'react'

import { Button } from '../shared/ui/Button'
import { Modal } from '../shared/ui/Modal'
import { SettingsPanel, type SettingControl } from '../shared/ui/SettingsPanel'
import { COPY } from './copy'
import { BrendaCounts, HowToPlayLines, MoreBelow } from './HowToPlay'

/** Assist Mode and sensitivity stay off: both players play by the same rules. */
const CONTROLS: readonly SettingControl[] = ['sound', 'volume', 'reducedMotion']

type View = 'menu' | 'settings' | 'help'
const TITLES: Record<View, string> = {
  menu: 'Menu',
  settings: 'Settings',
  help: 'How to Play'
}

/**
 * The match menu from the top bar's menu button or Escape: Settings, How to Play, Show
 * Tips or Hide Tips, and Leave. The round keeps going underneath. Leave hands over to the leave question.
 */
export function Menu({
  open,
  onClose,
  onLeave,
  tipsOn,
  onTips
}: {
  open: boolean
  onClose: () => void
  onLeave: () => void
  /** Whether tips show now, so the button reads Hide Tips or Show Tips. */
  tipsOn: boolean
  /** Turns tips off or on until the page reloads. */
  onTips: () => void
}) {
  const [view, setView] = useState<View>('menu')
  const body = useRef<HTMLDivElement>(null)
  const helpList = useRef<HTMLUListElement>(null)
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
  // How to Play's cue sits on the footer's top edge, over the bottom of the scroll area.
  const footer =
    view === 'menu' ? undefined : view === 'help' ? (
      <div className="relative flex w-full justify-end">
        <MoreBelow list={helpList} />
        {back}
      </div>
    ) : (
      back
    )
  return (
    <Modal open={open} onClose={close} title={TITLES[view]} footer={footer}>
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
            <Button
              variant="ghost"
              onClick={() => {
                onTips()
                close()
              }}
            >
              {tipsOn ? 'Hide Tips' : 'Show Tips'}
            </Button>
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
          <div className="flex flex-col gap-4">
            <p className="text-lg text-ink-soft">{COPY.menuNote}</p>
            <HowToPlayLines ref={helpList} className="text-lg" />
            <BrendaCounts />
          </div>
        )}
      </div>
    </Modal>
  )
}
