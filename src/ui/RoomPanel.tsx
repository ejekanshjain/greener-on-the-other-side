'use client'

import { useId } from 'react'

import type { RoomSession, RoomView } from '../net/session'
import { Button } from '../shared/ui/Button'
import { cn } from '../shared/ui/cn'
import { AwayTag } from './AwayTag'
import { Card } from './Card'
import { leaveRoom } from './leaving'
import { COPY } from './copy'
import { ShareBox } from './ShareBox'

/** Splits a room code into two groups of capitals, such as K7D M2Q. */
export function groupCode(code: string): string {
  const upper = code.toUpperCase()
  return `${upper.slice(0, 3)} ${upper.slice(3)}`
}

/** One player's garden gate: their name, You or Neighbour, Ready, and Away once they go quiet. */
function Gate({
  name,
  ready,
  you,
  away = false
}: {
  name: string
  ready: boolean
  you: boolean
  away?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-sketch-alt border-[3px] border-dashed border-ink bg-white/60 p-3">
      <span className="max-w-full font-marker text-lg leading-tight break-words">
        {name}
      </span>
      {away && <AwayTag />}
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
  const leaveButton = (
    <Button variant="ghost" onClick={() => leaveRoom(session)}>
      Leave
    </Button>
  )
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
  if (view.phase !== 'lobby') return null
  if (view.practice) return <PracticeLobby session={session} view={view} />
  const peer = view.peer
  const alone = !peer || !peer.listed
  const aloneLine =
    view.arrival === 'started'
      ? COPY.aloneStarted
      : view.arrival === 'typed'
        ? COPY.aloneTyped
        : COPY.aloneLink
  return (
    <Card title="The Garden Gate">
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
          <p>{aloneLine}</p>
          {view.arrival === 'started' && <ShareBox code={code} />}
        </>
      ) : (
        <>
          <div className="flex w-full gap-3">
            <Gate name={view.meName} ready={view.myReady} you />
            <Gate
              name={peer.name}
              ready={peer.ready || peer.rematch}
              you={false}
              away={peer.away}
            />
          </div>
          {view.myReady && <p id={waitingId}>{COPY.waitingReady(peer.name)}</p>}
        </>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        {/* Its label says what a press does; once you're ready, the waiting line says so. */}
        {!alone && (
          <Button
            aria-describedby={view.myReady ? waitingId : undefined}
            className={cn(
              !view.myReady && (peer?.ready || peer?.rematch) && 'ready-pulse'
            )}
            onClick={() =>
              session.dispatch({
                type: 'ui',
                action: view.myReady ? 'unready' : 'ready'
              })
            }
          >
            {view.myReady ? 'Not Ready' : 'Ready'}
          </Button>
        )}
        {leaveButton}
      </div>
      <ul className="text-base text-ink-soft">
        {COPY.howTo.map(line => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </Card>
  )
}

/** Practice's lobby: Mr Pemberton is always ready, so Start begins the match. */
function PracticeLobby({
  session,
  view
}: {
  session: RoomSession
  view: RoomView
}) {
  const here = !!view.peer?.listed
  return (
    <Card title="Practice With Mr Pemberton">
      <p>{here ? COPY.practiceMoods : COPY.practiceWaiting}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {here && (
          <Button
            disabled={view.myReady}
            onClick={() => session.dispatch({ type: 'ui', action: 'ready' })}
          >
            Start
          </Button>
        )}
        <Button variant="ghost" onClick={() => leaveRoom(session)}>
          Leave
        </Button>
      </div>
      <ul className="text-base text-ink-soft">
        {COPY.howTo.map(line => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </Card>
  )
}
