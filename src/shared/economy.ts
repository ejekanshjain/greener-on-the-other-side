import { createStore, useStore, type Store } from './store'

// ---------------------------------------------------------------- Wallet

/** One coin movement. `amount` is positive for earnings and negative for spending. */
export interface Transaction {
  id: number
  amount: number
  reason: string
  /** `Date.now()` when it happened. */
  at: number
}

export interface WalletState {
  coins: number
  /** The latest transactions, newest first. */
  history: readonly Transaction[]
}

/** The player's coins. */
export interface Wallet {
  store: Store<WalletState>
  coins(): number
  canAfford(amount: number): boolean
  /** Adds coins. Returns false and changes nothing for amounts that are not finite and above 0. */
  earn(amount: number, reason: string): boolean
  /** Removes coins. Returns false for negative amounts, NaN, or more than the player has. Spending 0 succeeds. */
  spend(amount: number, reason?: string): boolean
  subscribe(listener: () => void): () => void
}

/**
 * Creates a wallet. `historySize` sets how many recent transactions to keep for coin toasts.
 *
 * @example
 * const wallet = createWallet({ coins: 10 })
 * wallet.earn(5, 'Block held')
 * if (!wallet.spend(20, 'Gelatin')) toast('Not enough coins', 'bad')
 */
export function createWallet({ coins = 0, historySize = 5 } = {}): Wallet {
  const store = createStore<WalletState>({ coins, history: [] })
  let nextId = 1

  const record = (amount: number, reason: string) => {
    const entry: Transaction = { id: nextId++, amount, reason, at: Date.now() }
    store.set(s => ({
      coins: s.coins + amount,
      history: [entry, ...s.history].slice(0, historySize)
    }))
  }

  return {
    store,
    coins: () => store.get().coins,
    canAfford: amount => amount <= store.get().coins,
    earn(amount, reason) {
      if (!Number.isFinite(amount) || amount <= 0) return false
      record(amount, reason)
      return true
    },
    spend(amount, reason = 'Spent') {
      if (!Number.isFinite(amount) || amount < 0 || amount > store.get().coins)
        return false
      if (amount > 0) record(-amount, reason)
      return true
    },
    subscribe: store.subscribe
  }
}

/** Re-renders with the wallet's coin count. */
export function useCoins(wallet: Wallet): number {
  return useStore(wallet.store, selectCoins)
}

function selectCoins(state: WalletState): number {
  return state.coins
}

// ---------------------------------------------------------------- Upgrades

/** An upgrade in the shop. Each one helps a little and adds a new chore. */
export interface UpgradeDef {
  id: string
  name: string
  cost: number
  /** What it improves, shown in the shop. */
  helps: string
  /** The chore it adds, shown in the shop. */
  newChore: string
  /** Upgrade ids that must be owned first. */
  requires?: readonly string[]
}

/** Why an upgrade can't be bought: already owned, not enough coins, or missing a required upgrade. */
export type BuyFailure = 'owned' | 'poor' | 'locked'

export type BuyResult =
  | { ok: true }
  | { ok: false; reason: 'owned' | 'poor' }
  | { ok: false; reason: 'locked'; missing: readonly string[] }

export interface ShopState {
  /** Ids of owned upgrades, in purchase order. */
  owned: readonly string[]
}

/** One upgrade list per game, paid for from a wallet. */
export interface Shop<U extends UpgradeDef = UpgradeDef> {
  store: Store<ShopState>
  wallet: Wallet
  list(): readonly U[]
  /** Looks up an upgrade. Throws for unknown ids. */
  get(id: string): U
  owned(id: string): boolean
  /** Says whether `buy` would succeed, and why not. */
  check(id: string): BuyResult
  canBuy(id: string): boolean
  /** Pays and marks the upgrade owned, or explains why it can't. */
  buy(id: string): BuyResult
  subscribe(listener: () => void): () => void
}

/**
 * Creates a shop over a fixed upgrade list. Add the upgrade's chore yourself after a
 * successful `buy`.
 *
 * @example
 * const shop = createShop(UPGRADES, wallet)
 * const result = shop.buy('screws')
 * if (!result.ok && result.reason === 'poor') toast('Not enough coins', 'bad')
 */
export function createShop<U extends UpgradeDef>(
  defs: readonly U[],
  wallet: Wallet
): Shop<U> {
  const store = createStore<ShopState>({ owned: [] })
  const byId = new Map(defs.map(def => [def.id, def]))
  const get = (id: string) => {
    const def = byId.get(id)
    if (!def)
      throw new Error(
        `Shop: no upgrade has id "${id}", so it can't be looked up`
      )
    return def
  }
  const owned = (id: string) => store.get().owned.includes(id)
  const check = (id: string): BuyResult => {
    const def = get(id)
    if (owned(id)) return { ok: false, reason: 'owned' }
    const missing = (def.requires ?? []).filter(req => !owned(req))
    if (missing.length > 0) return { ok: false, reason: 'locked', missing }
    if (!wallet.canAfford(def.cost)) return { ok: false, reason: 'poor' }
    return { ok: true }
  }

  return {
    store,
    wallet,
    list: () => defs,
    get,
    owned,
    check,
    canBuy: id => check(id).ok,
    buy(id) {
      const result = check(id)
      if (!result.ok) return result
      const def = get(id)
      if (!wallet.spend(def.cost, def.name))
        return { ok: false, reason: 'poor' }
      store.set(s => ({ owned: [...s.owned, id] }))
      return result
    },
    subscribe: store.subscribe
  }
}

// ---------------------------------------------------------------- Consumables

/** A consumable the player buys and uses up, such as gelatin or nails. */
export interface StockItemDef {
  id: string
  name: string
  /** Price of one unit in coins. */
  price: number
  /** Units at the start. Defaults to 0. */
  start?: number
  /** Most units the player can hold. Defaults to no limit. */
  max?: number
}

export interface StockState {
  counts: Readonly<Record<string, number>>
}

export type StockBuyResult =
  { ok: true } | { ok: false; reason: 'poor' | 'full' }

/** Counts of consumables. */
export interface Stock<I extends StockItemDef = StockItemDef> {
  store: Store<StockState>
  list(): readonly I[]
  /** Looks up an item. Throws for unknown ids. */
  get(id: string): I
  count(id: string): number
  has(id: string, amount?: number): boolean
  /** Adds units, capped at `max`. Returns the new count. */
  add(id: string, amount?: number): number
  /** Removes units. Returns false and changes nothing when there aren't enough. */
  use(id: string, amount?: number): boolean
  /** Price of `amount` units. */
  price(id: string, amount?: number): number
  /** Pays from the wallet and adds units. Fails when too poor or when it would pass `max`. */
  buy(id: string, wallet: Wallet, amount?: number): StockBuyResult
  subscribe(listener: () => void): () => void
}

/**
 * Creates a consumable stock. Amounts must be whole numbers of 0 or more; other amounts throw
 * a `RangeError`.
 *
 * @example
 * const stock = createStock([{ id: 'nails', name: 'Nails', price: 1, start: 20 }])
 * if (!stock.use('nails')) toast('Out of nails', 'bad')
 */
export function createStock<I extends StockItemDef>(
  defs: readonly I[]
): Stock<I> {
  const byId = new Map(defs.map(def => [def.id, def]))
  const counts: Record<string, number> = {}
  for (const def of defs) counts[def.id] = def.start ?? 0
  const store = createStore<StockState>({ counts })

  const get = (id: string) => {
    const def = byId.get(id)
    if (!def)
      throw new Error(`Stock: no item has id "${id}", so it can't be looked up`)
    return def
  }
  const count = (id: string) => {
    get(id)
    return store.get().counts[id] ?? 0
  }
  const setCount = (id: string, value: number) =>
    store.set(s => ({ counts: { ...s.counts, [id]: value } }))

  return {
    store,
    list: () => defs,
    get,
    count,
    has: (id, amount = 1) => count(id) >= amount,
    add(id, amount = 1) {
      assertAmount(amount)
      const next = Math.min(get(id).max ?? Infinity, count(id) + amount)
      setCount(id, next)
      return next
    },
    use(id, amount = 1) {
      assertAmount(amount)
      if (count(id) < amount) return false
      setCount(id, count(id) - amount)
      return true
    },
    price: (id, amount = 1) => get(id).price * amount,
    buy(id, wallet, amount = 1) {
      assertAmount(amount)
      const def = get(id)
      if (count(id) + amount > (def.max ?? Infinity))
        return { ok: false, reason: 'full' }
      if (!wallet.spend(def.price * amount, def.name))
        return { ok: false, reason: 'poor' }
      setCount(id, count(id) + amount)
      return { ok: true }
    },
    subscribe: store.subscribe
  }
}

function assertAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new RangeError(
      `Stock: amount ${amount} is not a whole number of 0 or more, so the stock is unchanged`
    )
  }
}

/** Re-renders with one item's count. */
export function useStockCount(stock: Stock, id: string): number {
  return useStore(stock.store, s => s.counts[id] ?? 0)
}
