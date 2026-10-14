'use client'

import { useState } from 'react'

import { Button } from '../shared/ui/Button'
import { toast } from '../shared/ui/toast'
import { COPY } from './copy'

/** Dev flags about this tab's own player, which a friend opening the link must not get. */
const OWN_FLAGS = ['first', 'pid', 'name', 'bot', 'skew']

/**
 * The room link to send. Dev builds keep room flags such as `?local`, and drop this tab's
 * own player flags, such as `?first`.
 */
export function roomLink(code: string): string {
  const flags =
    process.env.NODE_ENV !== 'production'
      ? location.search
          .slice(1)
          .split('&')
          .filter(flag => flag && !OWN_FLAGS.includes(flag.split('=')[0] ?? ''))
      : []
  return `${location.origin}/r/${code}${flags.length ? `?${flags.join('&')}` : ''}`
}

/**
 * Copy Link and Share Link for the player who started the room. Share Link shows only
 * where the browser can share, and a failed copy shows the link as selectable text.
 */
export function ShareBox({ code }: { code: string }) {
  const [failed, setFailed] = useState(false)
  const link = roomLink(code)
  const canShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toast(COPY.copied, 'good')
    } catch {
      setFailed(true)
    }
  }

  const share = async () => {
    try {
      await navigator.share({
        title: 'Greener on the Other Side',
        text: COPY.shareText,
        url: link
      })
    } catch {
      // Closing the share sheet rejects too; the buttons stay for another go.
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={copy}>Copy Link</Button>
        {canShare && (
          <Button variant="ghost" onClick={share}>
            Share Link
          </Button>
        )}
      </div>
      {failed && (
        <p className="w-full rounded-sketch border-2 border-dashed border-ink bg-white px-3 py-2 font-mono text-base break-all select-all">
          {link}
        </p>
      )}
      <p className="text-base text-ink-soft">{COPY.comeBack}</p>
    </div>
  )
}
