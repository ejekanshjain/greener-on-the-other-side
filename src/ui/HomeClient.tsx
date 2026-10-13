'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { loadIdentity, saveLocalTabName, saveName } from '../net/identity'
import { nameProblem, normaliseName } from '../net/names'
import { CODE_HELP, newRoomCode, parseCodeInput } from '../net/roomCode'
import { Button } from '../shared/ui/Button'
import { cn } from '../shared/ui/cn'
import type { ArrivalKind } from '../net/room'
import { useAudioUnlock } from './useAudioUnlock'

const FIELD =
  'min-h-12 w-full rounded-sketch border-[3px] border-ink bg-white px-3 font-hand text-2xl text-ink outline-none focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-marker-blue aria-invalid:border-marker-red'

/** Dev builds keep test flags such as `?local&fast` when you enter a room. */
function devQuery(): string {
  return process.env.NODE_ENV !== 'production' ? location.search : ''
}

/** The home screen: title, pitch, your name, and the ways into a room. */
export function HomeClient() {
  const router = useRouter()
  const nameId = useId()
  const codeId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const codeInput = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [joining, setJoining] = useState(false)
  const [codeText, setCodeText] = useState('')
  const [going, setGoing] = useState(false)
  /** Enter on a code shorter than 6 characters shows the code rule. */
  const [short, setShort] = useState(false)
  // A tap here carries sound into the room the page opens next.
  useAudioUnlock()

  useEffect(() => {
    // Storage only exists in the browser, so the saved name arrives after the first paint.
    setName(loadIdentity().name)
    setLoaded(true)
    heading.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (joining) codeInput.current?.focus()
  }, [joining])

  const tidyName = normaliseName(name)
  const nameError = loaded ? nameProblem(tidyName) : null
  const parsed = parseCodeInput(codeText)
  const code =
    short && !parsed.problem ? { ...parsed, problem: CODE_HELP } : parsed

  const enter = (roomCode: string, arrival: ArrivalKind) => {
    if (nameError || going) return
    saveName(tidyName)
    if (process.env.NODE_ENV !== 'production') saveLocalTabName(tidyName)
    try {
      sessionStorage.setItem(`greener-arrival-${roomCode}`, arrival)
    } catch {
      // Without storage the lobby shows the copy for a shared link, which still fits.
    }
    setGoing(true)
    router.push(`/r/${roomCode}${devQuery()}`)
  }

  const onCodeChange = (text: string) => {
    setCodeText(text)
    setShort(false)
    const next = parseCodeInput(text)
    if (next.code) enter(next.code, next.fromLink ? 'link' : 'typed')
  }

  const onStart = (event?: FormEvent) => {
    event?.preventDefault()
    enter(newRoomCode(), 'started')
  }

  const onJoinSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (code.code) enter(code.code, code.fromLink ? 'link' : 'typed')
    else setShort(true)
  }

  return (
    <main className="h-dvh overflow-y-auto overscroll-contain bg-paper px-4 py-8 font-hand text-ink">
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 text-center">
        <h1
          ref={heading}
          tabIndex={-1}
          className="font-marker text-4xl leading-tight outline-none sm:text-5xl"
        >
          Greener on the Other Side
        </h1>
        <p className="text-xl">
          Grow a better lawn than your neighbour in 3 minutes. Throw every weed,
          snail and gnome over the fence.
        </p>
        <form
          onSubmit={onStart}
          className="flex w-full flex-col gap-2 rounded-sketch-alt border-[3px] border-ink bg-paper-dark/60 p-4 text-left"
        >
          <label htmlFor={nameId} className="font-marker text-lg">
            Your Name
          </label>
          <input
            id={nameId}
            value={name}
            onChange={event => setName(event.target.value)}
            autoComplete="nickname"
            enterKeyHint="go"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={`${nameId}-help`}
            className={FIELD}
          />
          <p
            id={`${nameId}-help`}
            aria-live="polite"
            className={cn(
              'min-h-7 text-lg',
              nameError ? 'text-marker-red' : 'text-ink-soft'
            )}
          >
            {nameError ?? 'Your neighbour sees this name.'}
          </p>
          <Button type="submit" size="lg" disabled={!!nameError || going}>
            Start a Room
          </Button>
        </form>
        {joining ? (
          <form
            onSubmit={onJoinSubmit}
            className="flex w-full flex-col gap-2 rounded-sketch border-[3px] border-dashed border-ink p-4 text-left"
          >
            <label htmlFor={codeId} className="font-marker text-lg">
              Room Code
            </label>
            <input
              id={codeId}
              ref={codeInput}
              value={codeText}
              onChange={event => onCodeChange(event.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="go"
              placeholder="K7D M2Q"
              aria-invalid={code.problem ? true : undefined}
              aria-describedby={`${codeId}-help`}
              className={cn(FIELD, 'font-mono tracking-widest uppercase')}
            />
            <p
              id={`${codeId}-help`}
              aria-live="polite"
              className={cn(
                'min-h-7 text-lg',
                code.problem ? 'text-marker-red' : 'text-ink-soft'
              )}
            >
              {code.problem ?? 'Type the code or paste the link.'}
            </p>
            {nameError && (
              <p className="text-lg text-marker-red">Fix your name to join.</p>
            )}
          </form>
        ) : (
          <Button variant="ghost" onClick={() => setJoining(true)}>
            Join With Code
          </Button>
        )}
        <Link
          href="/practice"
          className="inline-flex min-h-12 items-center rounded-sketch border-[3px] border-dashed border-ink bg-paper/70 px-5 font-marker text-lg focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-marker-blue"
        >
          Practice Alone
        </Link>
      </div>
    </main>
  )
}
