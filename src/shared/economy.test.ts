import { describe, expect, it } from 'vitest'

import {
  createShop,
  createStock,
  createWallet,
  type UpgradeDef
} from './economy'

const UPGRADES: UpgradeDef[] = [
  {
    id: 'screws',
    name: 'Screws',
    cost: 10,
    helps: 'Hold better',
    newChore: 'Screw them in'
  },
  {
    id: 'mesh',
    name: 'Mesh backing',
    cost: 15,
    helps: 'Spreads the load',
    newChore: 'Cut mesh',
    requires: ['screws']
  }
]

describe('wallet', () => {
  it('earns, spends and keeps the latest transactions newest first', () => {
    const wallet = createWallet({ coins: 5, historySize: 2 })
    expect(wallet.earn(10, 'Block held')).toBe(true)
    expect(wallet.spend(3, 'Gelatin')).toBe(true)
    expect(wallet.earn(1, 'Tip')).toBe(true)
    expect(wallet.coins()).toBe(13)
    expect(wallet.store.get().history.map(t => [t.amount, t.reason])).toEqual([
      [1, 'Tip'],
      [-3, 'Gelatin']
    ])
  })

  it('refuses overspending, negative and invalid amounts', () => {
    const wallet = createWallet({ coins: 5 })
    expect(wallet.spend(6)).toBe(false)
    expect(wallet.spend(-1)).toBe(false)
    expect(wallet.spend(Number.NaN)).toBe(false)
    expect(wallet.earn(-4, 'Cheat')).toBe(false)
    expect(wallet.earn(Infinity, 'Cheat')).toBe(false)
    expect(wallet.coins()).toBe(5)
    expect(wallet.spend(0)).toBe(true)
    expect(wallet.store.get().history).toHaveLength(0)
  })
})

describe('shop', () => {
  it('explains why an upgrade cannot be bought, in priority order', () => {
    const wallet = createWallet({ coins: 12 })
    const shop = createShop(UPGRADES, wallet)

    expect(shop.check('mesh')).toEqual({
      ok: false,
      reason: 'locked',
      missing: ['screws']
    })
    expect(shop.buy('screws')).toEqual({ ok: true })
    expect(wallet.coins()).toBe(2)
    expect(shop.owned('screws')).toBe(true)
    expect(shop.buy('screws')).toEqual({ ok: false, reason: 'owned' })
    expect(shop.buy('mesh')).toEqual({ ok: false, reason: 'poor' })
    expect(shop.canBuy('mesh')).toBe(false)
    expect(wallet.coins()).toBe(2)
  })

  it('throws for unknown upgrade ids', () => {
    const shop = createShop(UPGRADES, createWallet())
    expect(() => shop.buy('jetpack')).toThrow()
  })
})

describe('stock', () => {
  it('adds, uses and buys consumables within limits', () => {
    const stock = createStock([
      { id: 'nails', name: 'Nails', price: 2, start: 3, max: 5 },
      { id: 'gelatin', name: 'Gelatin', price: 4 }
    ])
    const wallet = createWallet({ coins: 9 })

    expect(stock.use('nails', 2)).toBe(true)
    expect(stock.use('nails', 2)).toBe(false)
    expect(stock.count('nails')).toBe(1)
    expect(stock.add('nails', 10)).toBe(5)
    expect(stock.buy('nails', wallet)).toEqual({ ok: false, reason: 'full' })
    expect(stock.buy('gelatin', wallet, 2)).toEqual({ ok: true })
    expect(stock.buy('gelatin', wallet)).toEqual({ ok: false, reason: 'poor' })
    expect(stock.has('gelatin', 2)).toBe(true)
    expect(stock.price('gelatin', 3)).toBe(12)
    expect(wallet.coins()).toBe(1)
    expect(() => stock.use('nails', -1)).toThrow(RangeError)
  })
})
