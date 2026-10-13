'use client'

import { useEffect } from 'react'

import { sfx } from '../shared/audio'

/**
 * Unlocks sound on the page's first tap, click or key press, as browsers require.
 * Nothing plays before it.
 */
export function useAudioUnlock(): void {
  useEffect(() => {
    if (sfx.unlocked) return
    const unlock = () => {
      sfx.unlock()
      stop()
    }
    const stop = () => {
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('keydown', unlock, true)
    }
    window.addEventListener('pointerdown', unlock, true)
    window.addEventListener('keydown', unlock, true)
    return stop
  }, [])
}
