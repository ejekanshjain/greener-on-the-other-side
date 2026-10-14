'use client'

import { useEffect, useId, useRef } from 'react'

import { shortName } from '../net/names'
import type { RoomSession, RoomView } from '../net/session'
import { TOP_BAR, YARD_PANEL_Y } from '../scenes/layout'
import { useStore } from '../shared/store'
import { Button } from '../shared/ui/Button'
import { COPY } from './copy'
import { lobbyStatus } from './lobby'
import { aloneLine, HelpCard, ReadyButton, StartButton } from './RoomPanel'
import type { DesignBox } from './RoomScreen'

/**
 * The lobby's yard while it's open: the yard bar over the top band (How to Play, "The
 * Yard" with its step, Skip) and the panel over the patio, below its stripe ticks (the
 * status line and Ready).
 * How to Play covers both until Back, which returns to the same step. Focus moves to
 * "The Yard" when it opens, and to How to Play after Back. Mount it only while the yard
 * is open, so each visit starts fresh.
 */
export function Yard({
  session,
  view,
  box
}: {
  session: RoomSession
  view: RoomView
  box: DesignBox
}) {
  const yard = useStore(session.hud, s => s.yard)
  const title = useRef<HTMLHeadingElement>(null)
  // After How to Play, Back puts focus on its button instead of the title.
  const fromHelp = useRef(false)
  const statusId = useId()
  const help = yard?.help ?? false
  useEffect(() => {
    if (help) return
    const target = fromHelp.current
      ? document.querySelector<HTMLElement>('[data-yard-help]')
      : title.current
    fromHelp.current = false
    target?.focus({ preventScroll: true })
  }, [help])
  if (!yard || box.scale === 0) return null
  const peer = view.peer?.listed ? view.peer : null
  // Names cut to 10 characters, as the top bar shows them, keep the status to one line.
  const status = view.practice
    ? peer
      ? COPY.isReady(peer.name)
      : COPY.practiceWaiting
    : peer
      ? lobbyStatus({
          peerName: shortName(peer.name),
          myReady: view.myReady,
          peerReady: peer.ready || peer.rematch,
          peerYard: peer.yard
        })
      : aloneLine(view)
  if (help)
    return (
      <HelpCard
        status={status}
        onBack={() => {
          fromHelp.current = true
          session.yardHelp(false)
        }}
      />
    )
  const width = 680 * box.scale
  // The bar matches the match's top bar: at least 48 px, growing up into the sky.
  const band = TOP_BAR.h * box.scale
  const height = Math.max(48, band)
  return (
    <>
      <header
        data-testid="yard-bar"
        className="fixed z-10 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 px-1 font-hand text-ink sm:gap-2 sm:px-3"
        style={{
          left: box.left,
          top: Math.max(0, box.top + band - height),
          width,
          height
        }}
      >
        <span className="flex justify-start">
          <Button
            variant="ghost"
            data-yard-help
            className={BAR_BUTTON}
            onClick={() => session.yardHelp(true)}
          >
            How to Play
          </Button>
        </span>
        <span className="flex flex-col items-center rounded-sketch bg-paper/85 px-2 leading-tight">
          <h1
            ref={title}
            tabIndex={-1}
            className="font-marker text-xl leading-tight outline-none sm:text-2xl"
          >
            {COPY.yardTitle}
          </h1>
          <span data-testid="yard-step" className="text-base sm:text-lg">
            {COPY.yardStep(Math.min(yard.step + 1, 3))}
          </span>
        </span>
        <span className="flex justify-end">
          <Button
            variant="ghost"
            className={BAR_BUTTON}
            onClick={() => session.closeYard(true)}
          >
            {COPY.skip}
          </Button>
        </span>
      </header>
      <div
        data-testid="yard-panel"
        className="pointer-events-auto fixed bottom-0 z-10 flex flex-col items-center justify-center gap-1 border-t-[3px] border-ink bg-paper px-3 pb-[env(safe-area-inset-bottom)] text-center font-hand text-ink"
        style={{
          left: box.left,
          width,
          top: box.top + YARD_PANEL_Y * box.scale
        }}
      >
        {status && (
          <p
            id={statusId}
            data-testid="lobby-status"
            className="text-base leading-tight sm:text-xl"
          >
            {status}
          </p>
        )}
        {view.practice
          ? peer && (
              <StartButton
                session={session}
                started={view.myReady}
                pulse={false}
                variant="primary"
              />
            )
          : peer && (
              <ReadyButton
                session={session}
                myReady={view.myReady}
                pulse={false}
                variant="primary"
                describedBy={view.myReady && status ? statusId : undefined}
              />
            )}
      </div>
    </>
  )
}

/** The bar's buttons: narrower than a card's, so the bar fits a 375 px phone. */
const BAR_BUTTON = 'px-2! text-base! whitespace-nowrap sm:px-4! sm:text-lg!'
