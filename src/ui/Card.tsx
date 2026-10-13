'use client'

import { useEffect, useRef, type ReactNode } from 'react'

import { cn } from '../shared/ui/cn'

/** A centred paper card over the garden. Focus moves to its heading when it opens. */
export function Card({
  title,
  children,
  className
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [title])
  return (
    <section
      className={cn(
        'pointer-events-auto absolute top-1/2 left-1/2 flex max-h-[calc(100%-1rem)] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4 overflow-y-auto overscroll-contain rounded-sketch border-[3px] border-ink bg-paper/95 p-5 text-center font-hand text-xl text-ink shadow-[4px_6px_0_var(--color-ink)]',
        className
      )}
    >
      <h1
        ref={heading}
        tabIndex={-1}
        className="font-marker text-3xl outline-none"
      >
        {title}
      </h1>
      {children}
    </section>
  )
}
