'use client'

import {
  useEffect,
  useId,
  useRef,
  useState,
  type Ref,
  type RefObject
} from 'react'

import { isTouchDevice } from '../shared/input/pointer'
import { cn } from '../shared/ui/cn'
import { COPY } from './copy'

/**
 * What Brenda Counts: the four score lines with their names in the marker font, then how
 * many rounds win the match. The lobby cards and the menu's How to Play share it.
 */
export function BrendaCounts({ className }: { className?: string }) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      data-testid="brenda-counts"
      className={cn('flex w-full flex-col gap-1 text-left', className)}
    >
      <h2 id={titleId} className="text-center font-marker text-xl">
        {COPY.brendaCountsTitle}
      </h2>
      <ul className="flex flex-col gap-1 text-base leading-snug">
        {COPY.brendaCounts.map(({ name, line }) => (
          <li key={name}>
            <span className="font-marker">{name}</span>, {line}
          </li>
        ))}
      </ul>
      <p className="text-center text-base leading-snug">{COPY.brendaRounds}</p>
    </section>
  )
}

/** The How to Play lines, plus the keyboard line on devices without touch. */
export function HowToPlayLines({
  className,
  ref
}: {
  className?: string
  ref?: Ref<HTMLUListElement>
}) {
  return (
    <ul
      ref={ref}
      data-testid="how-to-play"
      className={cn(
        'flex list-disc flex-col gap-2 pl-5 text-left leading-snug',
        className
      )}
    >
      {COPY.howToPlay.map(line => (
        <li key={line}>{line}</li>
      ))}
      {!isTouchDevice() && <li>{COPY.keys}</li>}
    </ul>
  )
}

/**
 * The "More below" cue for a list that runs past the bottom of its scroll area: the
 * list's bottom edge fades out over the words and a down arrow, until its last line is in
 * view. Place it inside the positioned element right under the scroll area, such as the
 * lobby card's pinned buttons, and it draws just above that element. Screen readers skip
 * it, since they hear every line anyway.
 */
export function MoreBelow({ list }: { list: RefObject<HTMLElement | null> }) {
  const cue = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)
  useEffect(() => {
    const items = list.current
    const under = cue.current?.parentElement
    const scroller = items && scrollParent(items)
    if (!items || !under || !scroller) return
    const check = () => {
      const last = items.lastElementChild
      // The visible area ends at the scroll area's edge or the element over it, if higher.
      const bottom = Math.min(
        scroller.getBoundingClientRect().bottom,
        under.getBoundingClientRect().top
      )
      setMore(!!last && last.getBoundingClientRect().bottom > bottom + 1)
    }
    check()
    scroller.addEventListener('scroll', check, { passive: true })
    // A dialog's pop-in scales it, so measure again once it ends.
    window.addEventListener('animationend', check)
    const resize = new ResizeObserver(check)
    resize.observe(scroller)
    resize.observe(items)
    return () => {
      scroller.removeEventListener('scroll', check)
      window.removeEventListener('animationend', check)
      resize.disconnect()
    }
  }, [list])
  return (
    <div
      ref={cue}
      aria-hidden
      hidden={!more}
      data-testid="more-below"
      className="pointer-events-none absolute inset-x-0 bottom-full flex flex-col"
    >
      <div className="h-8 bg-linear-to-b from-paper/0 to-paper" />
      <span className="flex items-center justify-center gap-1 bg-paper font-hand text-lg leading-tight text-ink-soft">
        {COPY.moreBelow}
        <svg viewBox="0 0 24 24" className="size-5">
          <path
            d="M12.2 4 L11.8 19 M6 13.3 L11.8 19.4 L18 13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  )
}

/** The nearest ancestor that scrolls vertically, or null. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY
    if (overflow === 'auto' || overflow === 'scroll') return node
  }
  return null
}
