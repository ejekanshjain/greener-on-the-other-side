import { useEffect } from 'react'

/** Text for the leave prompt. Most desktop browsers show their own wording instead. */
export const LEAVE_MESSAGE = 'Leave and lose everything?'

let holders = 0
let sentinel: WakeLockSentinel | null = null
let requesting = false
let releaseSession: (() => void) | null = null
let sessionOver = false

async function acquire(): Promise<void> {
  if (holders === 0 || requesting || (sentinel && !sentinel.released)) return
  if (document.visibilityState !== 'visible') return
  requesting = true
  try {
    const lock = await navigator.wakeLock.request('screen')
    if (holders === 0) await lock.release()
    else sentinel = lock
  } catch {
    // Refused, for example on low battery. The game still works; the screen may sleep.
  } finally {
    requesting = false
  }
}

function onVisibilityChange(): void {
  // Browsers drop the lock when the tab is hidden, so take it again on return.
  if (document.visibilityState === 'visible') void acquire()
}

/**
 * Asks the browser to keep the screen on until the returned release function runs.
 * Calls stack: the lock stays on while any holder hasn't released. It is taken again
 * after the tab becomes visible. Does nothing where the Screen Wake Lock API is missing.
 *
 * @example const release = holdWakeLock() // call release() when play stops
 */
export function holdWakeLock(): () => void {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator))
    return noop
  holders++
  if (holders === 1)
    document.addEventListener('visibilitychange', onVisibilityChange)
  void acquire()
  let released = false
  return () => {
    if (released) return
    released = true
    holders--
    if (holders > 0) return
    document.removeEventListener('visibilitychange', onVisibilityChange)
    const lock = sentinel
    sentinel = null
    void lock?.release().catch(noop)
  }
}

/** Keeps the screen on while `active` is true. */
export function useWakeLock(active: boolean): void {
  useEffect(() => (active ? holdWakeLock() : undefined), [active])
}

/**
 * Starts a play session: keeps the screen on until `endSession`, and re-enables leave
 * warnings after a previous `endSession`. `StartScreen` calls it on the start tap.
 */
export function startSession(): void {
  sessionOver = false
  releaseSession ??= holdWakeLock()
}

/**
 * Ends the play session: lets the screen sleep again and silences every leave warning,
 * since nothing is left to lose. `EndingScreen` calls it when it opens.
 */
export function endSession(): void {
  sessionOver = true
  releaseSession?.()
  releaseSession = null
}

/** Starts the game over by reloading the page, without the leave prompt. Nothing is saved, so this is a full restart. */
export function restartGame(): void {
  endSession()
  location.reload()
}

/**
 * Asks "Leave and lose everything?" before the tab closes or reloads while `active` is
 * true and the session hasn't ended. Phone browsers often skip this prompt.
 */
export function useLeaveWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (sessionOver) return
      event.preventDefault()
      // Older browsers read the prompt text from returnValue.
      event.returnValue = LEAVE_MESSAGE
      return LEAVE_MESSAGE
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [active])
}

function noop(): void {}
