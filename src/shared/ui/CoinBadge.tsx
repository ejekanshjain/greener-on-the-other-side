import { useCoins, type Wallet } from '../economy'
import { useStore } from '../store'
import { cn } from './cn'

/** How long a "+5" floater stays relevant after a transaction. */
const FLOATER_MS = 1500

/**
 * Shows the coin count, with a floating "+5" or "-3" after each transaction.
 *
 * @example <CoinBadge wallet={wallet} className="absolute top-3 right-3" />
 */
export function CoinBadge({
  wallet,
  className
}: {
  wallet: Wallet
  className?: string
}) {
  const coins = useCoins(wallet)
  const latest = useStore(wallet.store, s => s.history[0])
  const fresh = latest && Date.now() - latest.at < FLOATER_MS

  return (
    <div
      className={cn(
        'relative inline-flex min-h-12 items-center gap-2 rounded-sketch border-[3px] border-ink bg-paper px-3 font-marker text-2xl text-ink shadow-[3px_4px_0_rgb(34_34_34/0.25)]',
        className
      )}
      aria-label={`Coins: ${coins}`}
      role="status"
    >
      <CoinIcon className="size-7" />
      <span key={coins} className="animate-wobble tabular-nums">
        {coins}
      </span>
      {fresh && (
        <span
          key={latest.id}
          aria-hidden
          className={cn(
            'absolute -bottom-7 left-1/2 -translate-x-1/2 animate-float-up text-xl whitespace-nowrap',
            latest.amount > 0 ? 'text-marker-green' : 'text-marker-red'
          )}
        >
          {latest.amount > 0 ? `+${latest.amount}` : latest.amount}
        </span>
      )}
    </div>
  )
}

/** A small drawn coin, sized by `className` (defaults to 1em). Decorative only. */
export function CoinIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-[1em] shrink-0 rounded-full border-[3px] border-ink bg-marker-yellow align-[-0.15em] shadow-[inset_0_0_0_2px_rgb(255_255_255/0.55)]',
        className
      )}
    />
  )
}
