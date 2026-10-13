import { describe, expect, it } from 'vitest'

import { roomStatus } from './pusherTransport'

describe('roomStatus', () => {
  it('stays connecting until the room channel first subscribes', () => {
    expect(roomStatus('connecting', false, false)).toBe('connecting')
    expect(roomStatus('unavailable', false, false)).toBe('connecting')
    expect(roomStatus('connected', false, false)).toBe('connecting')
    expect(roomStatus('connected', true, false)).toBe('connected')
  })

  it("counts every gap after the first join as reconnecting, even pusher-js's connecting", () => {
    for (const socket of ['connecting', 'unavailable', 'disconnected'])
      expect(roomStatus(socket, false, true)).toBe('reconnecting')
    // The socket is back, but the channel hasn't subscribed again yet.
    expect(roomStatus('connected', false, true)).toBe('reconnecting')
    expect(roomStatus('connected', true, true)).toBe('connected')
  })

  it('fails when pusher-js gives up', () => {
    expect(roomStatus('failed', false, true)).toBe('failed')
  })
})
