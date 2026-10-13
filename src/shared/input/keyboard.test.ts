// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { blockGameInput } from './block'
import { Keyboard } from './keyboard'

let keys: Keyboard | null = null

afterEach(() => {
  keys?.dispose()
  keys = null
  document.body.innerHTML = ''
})

function press(code: string, target: EventTarget = window) {
  target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }))
}

describe('Keyboard', () => {
  it('releases held keys when the window loses focus', () => {
    keys = new Keyboard()
    const release = vi.fn()
    keys.onRelease('Space', release)
    press('Space')
    window.dispatchEvent(new Event('blur'))
    expect(release).toHaveBeenCalledTimes(1)
    expect(keys.isDown('Space')).toBe(false)
    // The real key-up after returning doesn't fire a second release.
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }))
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('leaves Space on a focused button to the button', () => {
    keys = new Keyboard()
    const pressed = vi.fn()
    keys.onPress(['Space', 'KeyW'], pressed)
    const button = document.createElement('button')
    document.body.append(button)
    press('Space', button)
    expect(pressed).not.toHaveBeenCalled()
    press('KeyW', button)
    expect(pressed).toHaveBeenCalledTimes(1)
  })

  it('releases held keys and ignores presses while a dialog blocks input', () => {
    keys = new Keyboard()
    const release = vi.fn()
    keys.onRelease('KeyW', release)
    press('KeyW')
    const unblock = blockGameInput()
    expect(release).toHaveBeenCalledTimes(1)
    press('KeyW')
    expect(keys.isDown('KeyW')).toBe(false)
    unblock()
    press('KeyW')
    expect(keys.isDown('KeyW')).toBe(true)
  })
})
