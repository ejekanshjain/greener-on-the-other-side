import { useEffect, useEffectEvent, useState } from 'react'

import {
  cardFileName,
  encodeAndFree,
  renderShareCard,
  shareCard,
  type ShareCardInput
} from '../share'
import { loadSketchFonts } from '../sketch'
import { Button, type ButtonVariant } from './Button'
import { Modal } from './Modal'

export interface ShareModalProps {
  open: boolean
  onClose: () => void
  /** Card contents, read when the modal opens. */
  card: ShareCardInput
  /** Message sent with the picture. */
  text: string
  title?: string
}

/**
 * Previews a share card and shares it through the share sheet, or downloads it where
 * sharing files isn't supported. The card is drawn once each time the modal opens.
 */
export function ShareModal({
  open,
  onClose,
  card,
  text,
  title = 'Share Your Shame'
}: ShareModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const currentCard = useEffectEvent(() => card)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let url: string | null = null
    setFile(null)
    setPreview(null)
    setStatus(null)
    const draw = async () => {
      await loadSketchFonts()
      const input = currentCard()
      const next = await encodeAndFree(
        renderShareCard(input),
        cardFileName(input.game)
      )
      if (cancelled) return
      url = URL.createObjectURL(next)
      setFile(next)
      setPreview(url)
    }
    draw().catch(() => setStatus('The card could not be drawn. Try again.'))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
      // Forget the freed picture, so reopening never shows a revoked image for a frame.
      setFile(null)
      setPreview(null)
    }
  }, [open])

  const canShareFiles =
    file !== null &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })

  const share = async () => {
    if (!file) return
    const result = await shareCard(file, text)
    if (result === 'shared')
      setStatus('Shared. Your friends will never understand.')
    if (result === 'downloaded')
      setStatus('Saved the picture to your downloads.')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={share} disabled={!file}>
            {canShareFiles ? 'Share' : 'Download'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-2">
        {preview ? (
          <img
            src={preview}
            alt={`Share card: ${card.title}`}
            className="max-h-[50dvh] w-auto -rotate-1 rounded-sketch-alt border-[3px] border-ink shadow-[4px_5px_0_rgb(34_34_34/0.3)]"
          />
        ) : (
          <p className="py-10 text-ink-soft">Drawing your card…</p>
        )}
        {status && (
          <p role="status" className="text-center">
            {status}
          </p>
        )}
      </div>
    </Modal>
  )
}

export interface ShareCardButtonProps {
  card: ShareCardInput
  text: string
  label?: string
  /** The share dialog's heading; `ShareModal`'s own default when left out. */
  title?: string
  variant?: ButtonVariant
  className?: string
}

/**
 * A button that opens a `ShareModal`.
 *
 * @example <ShareCardButton card={{ game: 'Nail Jelly to a Wall', title: 'Held for 0.4s', stats }} text="Help" />
 */
export function ShareCardButton({
  card,
  text,
  label = 'Share',
  title,
  variant = 'primary',
  className
}: ShareCardButtonProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant={variant}
        className={className}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <ShareModal
        open={open}
        onClose={() => setOpen(false)}
        card={card}
        text={text}
        {...(title === undefined ? {} : { title })}
      />
    </>
  )
}
