'use client'

import { useEffect, useEffectEvent } from 'react'

import type { RoomSession } from '../net/session'
import { endSession } from '../shared/lifecycle'

/**
 * Back during a match: a guard history entry on top of the room catches the browser's
 * Back button and back swipes, so they open the leave question instead of leaving.
 * Module state, so React's double effects in development never stack two guards.
 */
const GUARD = 'greenerGuard'
let onBack: (() => void) | null = null
/** True while the guard entry sits on top of the history stack. */
let guarded = false
/** True while our own `history.back()` removes the guard, so its popstate is ignored. */
let removing = false
let listening = false

function onPopState(): void {
  if (removing) {
    removing = false
    return
  }
  if (!guarded || !onBack) return
  // Back stepped off the guard entry: put it back and ask instead.
  history.pushState({ [GUARD]: true }, '')
  onBack()
}

/**
 * While `active`, Back opens `ask` instead of leaving the page. The guard entry goes when
 * `active` turns false, such as at the match end.
 */
export function useBackGuard(active: boolean, ask: () => void): void {
  const askEvent = useEffectEvent(ask)
  useEffect(() => {
    if (!active) return
    if (!listening) {
      window.addEventListener('popstate', onPopState)
      listening = true
    }
    onBack = () => askEvent()
    if (!guarded) {
      // A reload mid-match lands on the old guard entry, so it serves again.
      if (!history.state?.[GUARD]) history.pushState({ [GUARD]: true }, '')
      guarded = true
    }
    return () => {
      onBack = null
      // A remount in the same tick re-arms the guard; only a real stop removes it.
      setTimeout(() => {
        if (onBack || !guarded) return
        guarded = false
        if (history.state?.[GUARD]) {
          removing = true
          history.back()
        }
      }, 0)
    }
  }, [active])
}

/**
 * Leaves the room for the home screen: tells the neighbour, closes the connection and
 * silences the desktop leave warning. The home page replaces the guard entry when one is
 * on top, so Back from home doesn't land on it.
 */
export function leaveRoom(session: RoomSession): void {
  session.dispatch({ type: 'ui', action: 'leave' })
  session.close()
  endSession()
  onBack = null
  if (guarded) {
    guarded = false
    location.replace('/')
  } else location.assign('/')
}
