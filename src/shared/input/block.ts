let blockers = 0
const listeners = new Set<() => void>()

/**
 * Stops game keys while a dialog is open, until the returned function runs. Held keys
 * are released when the first block starts. `Modal` and `EndingScreen` call it for you.
 *
 * @example const unblock = blockGameInput() // call unblock() when the overlay closes
 */
export function blockGameInput(): () => void {
  blockers++
  if (blockers === 1) for (const listener of listeners) listener()
  let done = false
  return () => {
    if (done) return
    done = true
    blockers--
  }
}

/** True while any dialog blocks game input. */
export function isGameInputBlocked(): boolean {
  return blockers > 0
}

/** Calls `listener` each time game input becomes blocked. Used by `Keyboard`. */
export function onGameInputBlock(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
