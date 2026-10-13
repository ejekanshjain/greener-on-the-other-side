import { describe, expect, it, vi } from 'vitest'

import { createChoreBoard } from './chores'

describe('ChoreBoard', () => {
  it('blocks actions until their chores are complete', () => {
    const board = createChoreBoard()
    board.add({
      id: 'mop',
      label: 'Mop the splat',
      blocks: ['carry-tray'],
      createdAt: 1
    })
    board.add({
      id: 'bowls',
      label: 'Wash bowls',
      blocks: ['carry-tray', 'stir'],
      createdAt: 2
    })

    expect(board.canDo('carry-tray')).toBe(false)
    expect(board.blockersFor('carry-tray').map(c => c.id)).toEqual([
      'mop',
      'bowls'
    ])
    expect(board.canDo('hammer')).toBe(true)

    expect(board.complete('mop')).toBe(true)
    expect(board.blockersFor('carry-tray').map(c => c.id)).toEqual(['bowls'])
    board.complete('bowls')
    expect(board.canDo('carry-tray')).toBe(true)
    expect(board.complete('bowls')).toBe(false)
  })

  it('ignores a second add with the same id', () => {
    const board = createChoreBoard()
    const listener = vi.fn()
    board.subscribe(listener)
    expect(board.add({ id: 'mop', label: 'Mop' })).toBe(true)
    expect(board.add({ id: 'mop', label: 'Mop again', blocks: ['stir'] })).toBe(
      false
    )
    expect(board.list()).toHaveLength(1)
    expect(board.list()[0]?.label).toBe('Mop')
    expect(board.canDo('stir')).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('keeps the list reference stable between changes for React', () => {
    const board = createChoreBoard()
    board.add({ id: 'mop', label: 'Mop' })
    const first = board.list()
    expect(board.list()).toBe(first)
    board.add({ id: 'scrape', label: 'Scrape' })
    expect(board.list()).not.toBe(first)
  })
})
