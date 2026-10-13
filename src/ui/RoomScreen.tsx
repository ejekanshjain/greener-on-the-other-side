'use client'

import { Profiler, useEffect, useState } from 'react'

import { Brain } from '../game/brain'
import { PROFILES } from '../game/profiles'
import { netFlags } from '../net/devNet'
import { funnyName, loadIdentity, localTabName } from '../net/identity'
import { LocalTransport, localPlayerId } from '../net/localTransport'
import { createMemoryPair } from '../net/memoryTransport'
import { BotNeighbour, PEMBERTON_ID, PEMBERTON_NAME } from '../net/pemberton'
import { PusherTransport } from '../net/pusherTransport'
import type { ArrivalKind } from '../net/room'
import {
  getRoomSession,
  RoomSession,
  type TransportFactory
} from '../net/session'
import { GardenScene } from '../scenes/gardenScene'
import { PressController } from '../scenes/input'
import { CostMeter } from '../scenes/lawnLayer'
import { RevealScene } from '../scenes/revealScene'
import { DESIGN_H, DESIGN_W, REPLAY_H, REPLAY_TOP } from '../scenes/layout'
import { startLoop, useGameCanvas, type Viewport } from '../shared/canvas'
import type { DevAction } from '../shared/dev'
import { Keyboard } from '../shared/input/keyboard'
import { useLeaveWarning, useWakeLock } from '../shared/lifecycle'
import { hash01 } from '../shared/math'
import { useStore } from '../shared/store'
import { GameLayout } from '../shared/ui/GameLayout'
import { COPY } from './copy'
import { Countdown } from './Countdown'
import { CVD_FILTER_ID, CvdFilter } from './CvdFilter'
import { LeaveDialog } from './LeaveDialog'
import { leaveRoom, useBackGuard } from './leaving'
import { MatchEnd } from './MatchEnd'
import { Menu } from './Menu'
import { NetOverlay } from './NetOverlay'
import { Notice } from './Notice'
import { Reconnecting } from './Reconnecting'
import { revealSource } from './reveal'
import { RoomPanel } from './RoomPanel'
import { TopBar } from './TopBar'
import { TurnUpright } from './TurnUpright'
import { useAudioUnlock } from './useAudioUnlock'
import { Verdict } from './Verdict'

const useLocal = process.env.NODE_ENV !== 'production' && netFlags.local

const makeTransport: TransportFactory = Object.assign(
  (code: string, me: { id: string; name: string }) =>
    useLocal
      ? new LocalTransport(code, me.id, me.name, netFlags.faults)
      : new PusherTransport(
          code,
          me.id,
          me.name,
          process.env.NEXT_PUBLIC_PUSHER_KEY ?? '',
          process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? 'ap2'
        ),
  { local: useLocal }
)

/** How you arrived, recorded by the home screen; a bare link counts as `link`. */
function arrivalFor(code: string): ArrivalKind {
  try {
    const value = sessionStorage.getItem(`greener-arrival-${code}`)
    return value === 'started' || value === 'typed' ? value : 'link'
  } catch {
    return 'link'
  }
}

/**
 * Practice: you host a room whose other end is Mr Pemberton, a bot session on an
 * in-page memory transport. Nothing goes to Pusher.
 */
function createPractice(code: string): RoomSession {
  const me = loadIdentity()
  const [mine, his] = createMemoryPair(
    { id: me.id, name: me.name },
    { id: PEMBERTON_ID, name: PEMBERTON_NAME }
  )
  const session = new RoomSession(
    code,
    me,
    'started',
    Object.assign(() => mine, { local: true }),
    { practice: true }
  )
  session.companion = new BotNeighbour(
    code,
    his,
    session.neighbour,
    Math.floor(Math.random() * 0x7fffffff)
  )
  return session
}

function createSession(code: string, practice: boolean): RoomSession {
  if (practice) return createPractice(code)
  const identity = loadIdentity()
  // Local test tabs share storage, so each gets its own id and a name picked from it.
  const me = useLocal
    ? (() => {
        const id = localPlayerId(netFlags.pid)
        return {
          id,
          name:
            netFlags.name ??
            localTabName() ??
            funnyName(() => hash01(id.charCodeAt(0) * 31 + id.charCodeAt(1), 7))
        }
      })()
    : identity
  const session = new RoomSession(code, me, arrivalFor(code), makeTransport)
  // Dev `?bot=`: a scripted player plays this tab's garden.
  const bot = process.env.NODE_ENV !== 'production' && netFlags.bot
  const profile = bot ? PROFILES[bot] : undefined
  if (profile)
    session.autopilot = new Brain(profile, Math.floor(Math.random() * 1e9))
  return session
}

/** The design's peek strip, fence and lawn in canvas pixels: what the replay records. */
function replayCrop(viewport: Viewport) {
  const rect = viewport.designRect()
  const top = rect.height * (REPLAY_TOP / DESIGN_H)
  return {
    x: rect.x,
    y: rect.y + top,
    width: rect.width,
    height: rect.height * (REPLAY_H / DESIGN_H)
  }
}

/** Dev builds measure each frame's work, the replay's copies and React commits. */
const MEASURE = process.env.NODE_ENV !== 'production'

/** Dev perf meters for `perf()`: 10s of frames, the replay's copies and React commits. */
export interface DevMeters {
  frame: CostMeter
  capture: CostMeter
  commits: number
}

const meters: DevMeters = {
  frame: new CostMeter(600),
  capture: new CostMeter(200),
  commits: 0
}

function countCommit(): void {
  meters.commits++
}

/** Where the design sits on screen, in CSS pixels. Updates on resize only. */
export interface DesignBox {
  left: number
  top: number
  scale: number
}

function useDesignBox(viewport: Viewport): DesignBox {
  const [box, setBox] = useState<DesignBox>({ left: 0, top: 0, scale: 0 })
  useEffect(() => {
    const read = () =>
      setBox({
        left: viewport.offsetX,
        top: viewport.offsetY,
        scale: viewport.scale
      })
    read()
    return viewport.onResize(read)
  }, [viewport])
  return box
}

/**
 * The room: your garden on the canvas, with the lobby, top bar and notices over it. With
 * `practice`, your neighbour is Mr Pemberton.
 */
export default function RoomScreen({
  code,
  practice = false
}: {
  code: string
  practice?: boolean
}) {
  const [session] = useState(() =>
    getRoomSession(code, () => createSession(code, practice))
  )
  const view = useStore(session.view)
  const { canvasRef, viewport } = useGameCanvas({
    width: DESIGN_W,
    height: DESIGN_H,
    alignY: 'end'
  })
  const box = useDesignBox(viewport)
  // The dev panel's cheats arrive with the dev scripting module, in dev builds only.
  const [cheats, setCheats] = useState<readonly DevAction[]>()
  // Keep the phone awake while you wait in the lobby or play.
  useWakeLock(view.admission === 'seated')
  // Leaving this screen (Back from the lobby to the home page, say) leaves the room.
  useEffect(() => session.hold(), [session])
  useAudioUnlock()

  const inMatch = view.phase === 'match' && view.admission === 'seated'
  const matchId = inMatch ? (view.match?.id ?? null) : null
  const decided = view.results.some(r => r.over)
  // The menu and the leave question belong to one match, so they close when it ends.
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [leaveFor, setLeaveFor] = useState<string | null>(null)
  const askLeave = () => {
    setMenuFor(null)
    setLeaveFor(matchId)
  }
  useBackGuard(inMatch, askLeave)
  useLeaveWarning(inMatch && !decided)
  useEffect(() => {
    const keys = new Keyboard()
    keys.onPress('Escape', () => {
      const room = session.room
      if (room.phase === 'match') setMenuFor(room.match?.id ?? null)
    })
    keys.onPress('KeyF', () => session.shakeFist())
    return () => keys.dispose()
  }, [session])

  useEffect(() => {
    const canvas = viewport.canvas
    if (!canvas) return
    const scene = new GardenScene(viewport, session.neighbour)
    const reveal = new RevealScene(viewport, session.play)
    if (netFlags.cvd) canvas.style.filter = `url(#${CVD_FILTER_ID})`
    const press = new PressController(canvas, viewport, () =>
      session.playableGarden()
    )
    const stopEvents = session.onGardenEvents(events => scene.onEvents(events))
    // The replay records the design from the peek strip to the patio's edge; its crop
    // changes only on resize.
    let crop = replayCrop(viewport)
    const stopCrop = viewport.onResize(() => (crop = replayCrop(viewport)))
    // When this frame's first update began, so the frame meter counts updates too.
    let frameStart = 0
    const stopLoop = startLoop({
      update: () => {
        const now = performance.now()
        if (frameStart === 0) frameStart = now
        press.update(now)
        session.update()
      },
      render: (_alpha, timeMs) => {
        const started = MEASURE ? performance.now() : 0
        scene.setInfo({ round: session.gardenRound, debug: netFlags.debug })
        scene.draw(session.garden, timeMs, press.view, session.clock.now())
        if (session.playableGarden()) {
          const at = MEASURE ? performance.now() : 0
          if (session.worst.capture(canvas, crop, timeMs) && MEASURE)
            meters.capture.add(performance.now() - at)
        }
        const source = revealSource(session)
        if (source) {
          viewport.apply()
          reveal.draw(viewport.ctx, source, timeMs)
        }
        if (MEASURE)
          meters.frame.add(performance.now() - (frameStart || started))
        frameStart = 0
      }
    })
    let unexpose = () => {}
    let cancelled = false
    if (process.env.NODE_ENV !== 'production')
      void import('./devApi').then(dev => {
        if (cancelled) return
        unexpose = dev.exposeRoomDev(session, viewport, scene, reveal, meters)
        setCheats(dev.devActions(session))
      })
    return () => {
      cancelled = true
      unexpose()
      stopLoop()
      stopCrop()
      stopEvents()
      press.dispose()
      scene.dispose()
      reveal.dispose()
    }
  }, [session, viewport])

  const screen = (
    <GameLayout canvasRef={canvasRef} dev={cheats}>
      {view.phase === 'match' && (
        <TopBar
          session={session}
          view={view}
          box={box}
          onMenu={() => setMenuFor(matchId)}
        />
      )}
      <Countdown session={session} />
      {view.phase === 'match' && <Verdict session={session} view={view} />}
      {view.admission === 'seated' && view.conn === 'reconnecting' ? (
        <Reconnecting box={box} />
      ) : (
        view.phase === 'match' && <Notice session={session} box={box} />
      )}
      {inMatch && box.left >= 180 && (
        <p
          className="fixed top-1/2 rounded-sketch border-[3px] border-dashed border-ink bg-paper/80 p-3 text-center font-hand text-lg text-ink"
          style={{ left: 24, width: box.left - 48 }}
        >
          {COPY.keys}
        </p>
      )}
      <RoomPanel session={session} view={view} code={code} />
      <MatchEnd session={session} view={view} />
      <Menu
        open={matchId !== null && menuFor === matchId}
        onClose={() => setMenuFor(null)}
        onLeave={askLeave}
        onHideTips={session.tipsHidden ? undefined : () => session.hideTips()}
      />
      <LeaveDialog
        open={matchId !== null && leaveFor === matchId}
        decided={decided}
        onStay={() => setLeaveFor(null)}
        onLeave={() => leaveRoom(session)}
      />
      <TurnUpright playing={inMatch && !decided} />
      {netFlags.debug && <NetOverlay session={session} meters={meters} />}
      {netFlags.cvd && <CvdFilter kind={netFlags.cvd} />}
      <p aria-live="polite" className="sr-only">
        {view.announce}
      </p>
    </GameLayout>
  )
  return MEASURE ? (
    <Profiler id="room" onRender={countCommit}>
      {screen}
    </Profiler>
  ) : (
    screen
  )
}
