'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

import type { RoomSession, RoomView } from '../net/session'
import { useStore } from '../shared/store'
import { Button } from '../shared/ui/Button'
import { cn } from '../shared/ui/cn'
import { AwayTag, FirstMatchTag } from './AwayTag'
import { Card } from './Card'
import { leaveRoom } from './leaving'
import { NEW_PLAYER_PULSE_MS } from '../game/tuning'
import { COPY } from './copy'
import { BrendaCounts, HowToPlayLines, MoreBelow } from './HowToPlay'
import { lobbyStatus, readyPulses } from './lobby'
import { ShareBox } from './ShareBox'

/** Splits a room code into two groups of capitals, such as K7D M2Q. */
export function groupCode(code: string): string {
  const upper = code.toUpperCase()
  return `${upper.slice(0, 3)} ${upper.slice(3)}`
}

/**
 * One player's garden gate: their name, You or Neighbour, Ready, Away once they go quiet,
 * and First Match for a new neighbour.
 */
function Gate({
  name,
  ready,
  you,
  away = false,
  first = false
}: {
  name: string
  ready: boolean
  you: boolean
  away?: boolean
  first?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-sketch-alt border-[3px] border-dashed border-ink bg-white/60 p-3">
      <span className="max-w-full font-marker text-lg leading-tight break-words">
        {name}
      </span>
      {away && <AwayTag />}
      {first && <FirstMatchTag />}
      <span className="text-base text-ink-soft">
        {you ? 'You' : 'Neighbour'}
      </span>
      <span
        className={cn(
          'font-marker',
          ready ? 'text-marker-green' : 'text-ink-soft'
        )}
      >
        {ready ? 'Ready' : 'Not Ready'}
      </span>
    </div>
  )
}

/**
 * Everything the room shows outside play: connection notices, Room Full, the lobby with
 * both gates and Ready, and a short note during the reveal.
 */
export function RoomPanel({
  session,
  view,
  code
}: {
  session: RoomSession
  view: RoomView
  code: string
}) {
  const waitingId = useId()
  const yardOpen = useStore(session.hud, s => s.yard !== null)
  const yardDone = useStore(session.hud, s => s.yardDone)
  // How to Play swaps the lobby card for its lines; Back returns focus to its button.
  const [help, setHelp] = useState(false)
  // What the card focuses when it comes back: How to Play after Back, Ready (or Start)
  // after the yard, else its heading.
  const [focusOn, setFocusOn] = useState<string>()
  const [wasYard, setWasYard] = useState(yardOpen)
  if (wasYard !== yardOpen) {
    setWasYard(yardOpen)
    if (!yardOpen) setFocusOn('[data-ready]')
  }
  const inLobby = view.phase === 'lobby'
  useEffect(() => {
    if (inLobby) return
    setHelp(false)
    setFocusOn(undefined)
  }, [inLobby])
  const closeHelp = () => {
    setFocusOn('[data-how-to]')
    setHelp(false)
  }
  // A new player's Ready waits until the card has had 6s to be read.
  const cardShown = useAfter(
    NEW_PLAYER_PULSE_MS,
    inLobby && view.admission === 'seated'
  )
  const peer = view.peer?.listed ? view.peer : null
  const pulse = readyPulses({
    myReady: view.myReady,
    peerReady: !!peer && (peer.ready || peer.rematch || view.practice),
    newPlayer: view.newPlayer,
    practice: view.practice,
    cardShown,
    yardOpen,
    yardDone
  })
  // A new player's card leads with Try the Yard until they finish or skip it.
  const yardButton = view.newPlayer && (
    <Button
      variant={yardDone ? 'ghost' : 'primary'}
      data-testid="try-yard"
      onClick={() => session.openYard()}
    >
      {COPY.tryYard}
    </Button>
  )
  const readyVariant = view.newPlayer && !yardDone ? 'ghost' : 'primary'
  const leaveButton = (
    <Button variant="ghost" onClick={() => leaveRoom(session)}>
      Leave
    </Button>
  )
  const helpButton = (
    <Button variant="ghost" data-how-to onClick={() => setHelp(true)}>
      How to Play
    </Button>
  )
  // The one status line the card and How to Play keep, so you still see your friend waits.
  const status = lobbyStatus({
    peerName: peer?.name ?? null,
    myReady: view.myReady,
    peerReady: !!peer && (peer.ready || peer.rematch),
    peerYard: peer?.yard ?? 0
  })
  switch (view.admission) {
    case 'connecting':
    case 'checking':
      return (
        <Card title="Greener on the Other Side">
          <p>{COPY.connecting}</p>
          {leaveButton}
        </Card>
      )
    case 'unreachable':
      return (
        <Card title="No Garden">
          <p>{view.reason === 'quota' ? COPY.quota : COPY.unreachable}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              onClick={() =>
                session.dispatch({ type: 'ui', action: 'tryAgain' })
              }
            >
              Try Again
            </Button>
            <Button
              variant="ghost"
              onClick={() => location.assign('/practice')}
            >
              Practice Alone
            </Button>
          </div>
        </Card>
      )
    case 'full':
      return (
        <Card title="Room Full">
          <p>{COPY.full}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={() => location.reload()}>Try Again</Button>
            <Button variant="ghost" onClick={() => location.assign('/')}>
              Start a Room
            </Button>
            <Button
              variant="ghost"
              onClick={() => location.assign('/practice')}
            >
              Practice Alone
            </Button>
          </div>
        </Card>
      )
    case 'elsewhere':
      return (
        <Card title="Already Open">
          <p>{COPY.elsewhere}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={() => session.playHere()}>Play Here</Button>
            {leaveButton}
          </div>
        </Card>
      )
    case 'moved':
      return (
        <Card title="Moved">
          <p>{COPY.moved}</p>
          <Button variant="ghost" onClick={() => location.assign('/')}>
            Leave
          </Button>
        </Card>
      )
    case 'seated':
      break
  }
  // The yard takes the lobby card's place while it's open.
  if (view.phase !== 'lobby' || yardOpen) return null
  if (help) return <HelpCard status={status} onBack={closeHelp} />
  if (view.practice)
    return (
      <PracticeLobby
        session={session}
        view={view}
        focus={focusOn}
        pulse={pulse}
        variant={readyVariant}
        yardButton={yardButton}
        helpButton={helpButton}
        leaveButton={leaveButton}
      />
    )
  const alone = !peer
  return (
    <Card title="The Garden Gate" focus={focusOn}>
      <p className="text-base">
        Room code{' '}
        {/* Screen readers get the code letter by letter; the grouped capitals are for eyes. */}
        <span className="sr-only">
          {code.toUpperCase().split('').join(' ')}
        </span>
        <span
          aria-hidden
          className="font-mono text-2xl font-bold tracking-widest"
        >
          {groupCode(code)}
        </span>
      </p>
      {alone ? (
        <>
          <p>{aloneLine(view)}</p>
          {view.arrival === 'started' && <ShareBox code={code} />}
        </>
      ) : (
        <div className="flex w-full gap-3">
          <Gate name={view.meName} ready={view.myReady} you />
          <Gate
            name={peer.name}
            ready={peer.ready || peer.rematch}
            you={false}
            away={peer.away}
            first={peer.first}
          />
        </div>
      )}
      <BrendaCounts />
      <Pinned>
        {status && (
          <p id={waitingId} data-testid="lobby-status">
            {status}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          {yardButton}
          {!alone && (
            <ReadyButton
              session={session}
              myReady={view.myReady}
              pulse={pulse}
              variant={readyVariant}
              describedBy={view.myReady && status ? waitingId : undefined}
            />
          )}
          {helpButton}
          {leaveButton}
        </div>
      </Pinned>
    </Card>
  )
}

/** What a lobby says while your neighbour hasn't arrived, by how you got here. */
export function aloneLine(view: RoomView): string {
  return view.arrival === 'started'
    ? COPY.aloneStarted
    : view.arrival === 'typed'
      ? COPY.aloneTyped
      : COPY.aloneLink
}

/**
 * Ready, which turns into Not Ready once pressed. Its label says what a press does; once
 * you're ready, the status line it's described by says who you wait for.
 */
export function ReadyButton({
  session,
  myReady,
  pulse,
  variant,
  describedBy
}: {
  session: RoomSession
  myReady: boolean
  pulse: boolean
  variant: 'primary' | 'ghost'
  describedBy?: string
}) {
  return (
    <Button
      data-ready
      variant={variant}
      aria-describedby={describedBy}
      className={cn(pulse && 'ready-pulse')}
      onClick={() =>
        session.dispatch({
          type: 'ui',
          action: myReady ? 'unready' : 'ready'
        })
      }
    >
      {myReady ? 'Not Ready' : 'Ready'}
    </Button>
  )
}

/**
 * How to Play in place of a lobby card or the yard: the lines, the one status line kept,
 * and Back.
 */
export function HelpCard({
  status,
  onBack
}: {
  status: string | null
  onBack: () => void
}) {
  const list = useRef<HTMLUListElement>(null)
  return (
    <Card title="How to Play">
      <HowToPlayLines ref={list} className="text-lg" />
      <Pinned>
        <MoreBelow list={list} />
        {status && <p data-testid="lobby-status">{status}</p>}
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      </Pinned>
    </Card>
  )
}

/** True once `active` has held for `ms`, and false again as soon as it drops. */
function useAfter(ms: number, active: boolean): boolean {
  const [waited, setWaited] = useState(false)
  useEffect(() => {
    if (!active || ms === 0) return
    const timer = setTimeout(() => setWaited(true), ms)
    return () => {
      clearTimeout(timer)
      setWaited(false)
    }
  }, [active, ms])
  return active && (ms === 0 || waited)
}

/**
 * The bottom of a lobby card: its status line and buttons stay in view while the rest of
 * the card scrolls on short screens.
 */
export function Pinned({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="lobby-pinned"
      className="sticky -bottom-5 -mx-5 -mb-5 flex w-[calc(100%+2.5rem)] flex-col items-center gap-2 bg-paper px-5 pt-2 pb-5"
    >
      {children}
    </div>
  )
}

/** Practice's lobby: Mr Pemberton is always ready, so Start begins the match. */
function PracticeLobby({
  session,
  view,
  focus,
  pulse,
  variant,
  yardButton,
  helpButton,
  leaveButton
}: {
  session: RoomSession
  view: RoomView
  focus: string | undefined
  pulse: boolean
  variant: 'primary' | 'ghost'
  yardButton: ReactNode
  helpButton: ReactNode
  leaveButton: ReactNode
}) {
  const here = !!view.peer?.listed
  return (
    <Card title="Practice With Mr Pemberton" focus={focus}>
      <p>{here ? COPY.practiceMoods : COPY.practiceWaiting}</p>
      <BrendaCounts />
      <Pinned>
        <div className="flex flex-wrap justify-center gap-3">
          {yardButton}
          {here && (
            <StartButton
              session={session}
              started={view.myReady}
              pulse={pulse}
              variant={variant}
            />
          )}
          {helpButton}
          {leaveButton}
        </div>
      </Pinned>
    </Card>
  )
}

/** Practice's Start: Mr Pemberton is always ready, so it begins the match at once. */
export function StartButton({
  session,
  started,
  pulse,
  variant
}: {
  session: RoomSession
  started: boolean
  pulse: boolean
  variant: 'primary' | 'ghost'
}) {
  return (
    <Button
      data-ready
      variant={variant}
      disabled={started}
      className={cn(pulse && 'ready-pulse')}
      onClick={() => session.dispatch({ type: 'ui', action: 'ready' })}
    >
      Start
    </Button>
  )
}
