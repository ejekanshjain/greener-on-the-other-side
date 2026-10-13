import type { ReactNode } from 'react'

import { sfx } from '../audio'
import {
  useCoins,
  type BuyResult,
  type Shop,
  type Stock,
  type StockItemDef,
  type StockState,
  type UpgradeDef
} from '../economy'
import { createStore, useStore } from '../store'
import { Button } from './Button'
import { cn } from './cn'
import { CoinIcon } from './CoinBadge'
import { Panel } from './Panel'
import { toast } from './toast'

export interface ShopPanelProps<U extends UpgradeDef> {
  shop: Shop<U>
  /** Optional consumables, sold one at a time from the same wallet. */
  stock?: Stock
  /** Runs after a successful upgrade purchase. Add the upgrade's chore here. */
  onBuy?: (upgrade: U) => void
  /** Runs after a successful consumable purchase. */
  onBuyStock?: (item: StockItemDef) => void
  /**
   * Returns why an upgrade you don't own can't help any more, such as "The park's behind
   * you.", or null. The row shows the reason and its button reads Unavailable.
   */
  unavailable?: (upgrade: U) => string | null
  title?: string
  /**
   * Stacks each upgrade as a name and buy button over its lines, at every width. Use it in
   * narrow containers such as a `Modal`, where the wide four-column row would cramp.
   */
  compact?: boolean
  className?: string
}

/**
 * The shop: upgrades with what each one helps and the chore it adds, plus optional
 * consumables. Buttons explain why something can't be bought.
 *
 * @example <ShopPanel shop={shop} stock={stock} onBuy={u => chores.add({ id: u.id, label: u.newChore })} />
 */
export function ShopPanel<U extends UpgradeDef>({
  shop,
  stock,
  onBuy,
  onBuyStock,
  unavailable,
  title = 'Shop',
  compact = false,
  className
}: ShopPanelProps<U>) {
  const coins = useCoins(shop.wallet)
  // Subscribe so owned states refresh after purchases.
  useStore(shop.store)
  const counts = useStore(stock?.store ?? EMPTY_STOCK, s => s.counts)

  const buy = (upgrade: U) => {
    const result = shop.buy(upgrade.id)
    if (result.ok) {
      sfx.play('coin')
      toast(`Bought ${upgrade.name}. New chore: ${upgrade.newChore}`, 'coin')
      onBuy?.(upgrade)
    } else {
      sfx.play('fail', { volume: 0.4 })
    }
  }

  const buyStock = (item: StockItemDef) => {
    if (!stock) return
    const result = stock.buy(item.id, shop.wallet)
    if (result.ok) {
      sfx.play('coin')
      onBuyStock?.(item)
    } else {
      toast(
        result.reason === 'full'
          ? `No room for more ${item.name.toLowerCase()}`
          : 'Not enough coins',
        'bad'
      )
    }
  }

  return (
    <Panel title={title} className={cn('flex flex-col gap-3', className)}>
      <ul className="flex flex-col gap-3">
        {shop.list().map(upgrade => {
          const status = shop.check(upgrade.id)
          const owned = !status.ok && status.reason === 'owned'
          const why = owned ? null : (unavailable?.(upgrade) ?? null)
          return (
            <li
              key={upgrade.id}
              className={cn(
                'grid gap-x-4 gap-y-1 rounded-sketch border-2 border-ink/60 bg-white/60 p-3',
                compact
                  ? 'grid-cols-[1fr_auto] items-center'
                  : 'sm:grid-cols-[1fr_1.3fr_1.3fr_auto] sm:items-center'
              )}
            >
              <span className="font-marker text-xl leading-tight">
                {upgrade.name}
              </span>
              <span
                className={cn(
                  'font-hand text-lg leading-tight',
                  compact && 'col-span-2'
                )}
              >
                <span className="text-sm text-marker-green uppercase">
                  Helps{' '}
                </span>
                {upgrade.helps}
              </span>
              <span
                className={cn(
                  'font-hand text-lg leading-tight',
                  compact && 'col-span-2'
                )}
              >
                <span className="text-sm text-marker-red uppercase">
                  New chore{' '}
                </span>
                {upgrade.newChore}
              </span>
              <Button
                className={compact ? 'col-start-2 row-start-1' : 'mt-1 sm:mt-0'}
                disabled={!status.ok || why !== null}
                sound={false}
                onClick={() => buy(upgrade)}
                aria-label={
                  status.ok && why === null
                    ? `Buy ${upgrade.name} for ${upgrade.cost} coins`
                    : undefined
                }
              >
                {why !== null
                  ? 'Unavailable'
                  : buyLabel(status, upgrade, coins, id => shop.get(id).name)}
              </Button>
              {why !== null && (
                <span className="col-span-full font-hand text-lg leading-tight text-ink-soft">
                  {why}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {stock && (
        <>
          <h3 className="font-marker text-xl">Supplies</h3>
          <ul className="flex flex-col gap-2">
            {stock.list().map(item => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 font-hand text-lg"
              >
                <span>
                  {item.name}{' '}
                  <span className="text-ink-soft">x{counts[item.id] ?? 0}</span>
                </span>
                <Button
                  variant="ghost"
                  sound={false}
                  disabled={coins < item.price}
                  onClick={() => buyStock(item)}
                  aria-label={`Buy 1 ${item.name} for ${item.price} coins`}
                >
                  Buy 1 <CoinIcon /> {item.price}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}

const EMPTY_STOCK = createStore<StockState>({ counts: {} })

function buyLabel(
  status: BuyResult,
  upgrade: UpgradeDef,
  coins: number,
  nameOf: (id: string) => string
): ReactNode {
  if (status.ok) {
    return (
      <>
        Buy <CoinIcon /> {upgrade.cost}
      </>
    )
  }
  switch (status.reason) {
    case 'owned':
      return 'Owned'
    case 'locked':
      return `Needs ${status.missing.map(nameOf).join(', ')}`
    case 'poor':
      return (
        <>
          Need <CoinIcon /> {upgrade.cost - coins} more
        </>
      )
  }
}
