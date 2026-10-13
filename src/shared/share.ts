import { palette } from './palette'
import {
  FONT_HAND,
  FONT_MARKER,
  sketchLine,
  sketchRect,
  sketchRoundRect,
  sketchText
} from './sketch'

export const SHARE_CARD_WIDTH = 1080
export const SHARE_CARD_HEIGHT = 1350

export interface ShareStat {
  label: string
  value: string | number
}

export interface ShareCardInput {
  /** Game name, shown small at the top, such as "Nail Jelly to a Wall". */
  game: string
  /** The headline, such as "Held for 0.4s". */
  title: string
  /** Up to 4 rows of numbers. */
  stats: readonly ShareStat[]
  /** Optional picture, such as a replay frame from `clipFrame`. */
  image?: CanvasImageSource
  /** Small print at the bottom. */
  footer?: string
  /** Changes the wobble pattern. */
  seed?: number
}

/** How a share ended: through the share sheet, as a downloaded PNG, or dismissed by the player. */
export type ShareResult = 'shared' | 'downloaded' | 'cancelled'

/** Splits `text` into lines no wider than `maxWidth` with the current font. */
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    lines.length = maxLines
    lines[maxLines - 1] = `${lines[maxLines - 1]}…`
  }
  return lines
}

function imageSize(image: CanvasImageSource): {
  width: number
  height: number
} {
  if (image instanceof HTMLImageElement)
    return { width: image.naturalWidth, height: image.naturalHeight }
  if (image instanceof HTMLVideoElement)
    return { width: image.videoWidth, height: image.videoHeight }
  if (image instanceof SVGImageElement)
    return {
      width: image.width.baseVal.value,
      height: image.height.baseVal.value
    }
  if ('displayWidth' in image)
    return { width: image.displayWidth, height: image.displayHeight }
  return { width: image.width, height: image.height }
}

/**
 * Draws a 1080 x 1350 share card in the scrappy style. Load fonts first with
 * `loadSketchFonts`, or text falls back to a system font.
 *
 * @example
 * const card = renderShareCard({ game: 'Nail Jelly to a Wall', title: 'Held for 0.4s',
 *   stats: [{ label: 'Blocks lost', value: 17 }], image: clipFrame(clip) })
 */
export function renderShareCard({
  game,
  title,
  stats,
  image,
  footer = 'No saving. No skipping. Good luck.',
  seed = 1
}: ShareCardInput): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = SHARE_CARD_WIDTH
  canvas.height = SHARE_CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx)
    throw new Error(
      'renderShareCard: the browser refused a 2D canvas context, so no card was drawn'
    )
  const W = SHARE_CARD_WIDTH

  ctx.fillStyle = palette.paper
  ctx.fillRect(0, 0, W, SHARE_CARD_HEIGHT)
  sketchRoundRect(ctx, 36, 36, W - 72, SHARE_CARD_HEIGHT - 72, 40, {
    width: 8,
    wobble: 4,
    passes: 2,
    seed
  })

  sketchText(ctx, game, W / 2, 120, {
    font: 'marker',
    size: 52,
    color: palette.red,
    tilt: 0.04,
    seed
  })
  ctx.font = `84px ${FONT_MARKER}`
  const titleLines = wrapLines(ctx, title, W - 200, 2)
  titleLines.forEach((line, i) =>
    sketchText(ctx, line, W / 2, 230 + i * 96, {
      font: 'marker',
      size: 84,
      tilt: 0.03,
      seed: seed + i
    })
  )
  let y = 230 + titleLines.length * 96

  if (image) {
    const { width, height } = imageSize(image)
    const boxW = W - 240
    // The picture takes whatever height the title and stat rows leave free.
    const rows = Math.min(4, stats.length)
    const boxH = Math.max(
      280,
      Math.min(800, 1102 - y - Math.max(0, rows - 1) * 86)
    )
    const scale = Math.min(
      boxW / Math.max(1, width),
      boxH / Math.max(1, height)
    )
    const dw = width * scale
    const dh = height * scale
    const x = (W - dw) / 2
    const top = y + 10 + (boxH - dh) / 2
    ctx.save()
    // A slight tilt makes the picture look taped on.
    ctx.translate(W / 2, top + dh / 2)
    ctx.rotate(-0.025)
    ctx.translate(-W / 2, -(top + dh / 2))
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x - 16, top - 16, dw + 32, dh + 32)
    ctx.drawImage(image, x, top, dw, dh)
    sketchRect(ctx, x - 16, top - 16, dw + 32, dh + 32, {
      width: 5,
      wobble: 3,
      seed: seed + 3
    })
    sketchLine(ctx, x - 40, top - 4, x + 70, top - 30, {
      width: 26,
      color: 'rgba(252, 196, 25, 0.75)',
      seed
    })
    ctx.restore()
    y += boxH + 60
  } else {
    y += 40
  }

  for (const [i, stat] of stats.slice(0, 4).entries()) {
    const rowY = y + i * 86
    sketchText(ctx, stat.label, 150, rowY, {
      size: 50,
      align: 'left',
      seed: seed + i
    })
    sketchText(ctx, String(stat.value), W - 150, rowY, {
      font: 'marker',
      size: 56,
      align: 'right',
      color: palette.blue,
      tilt: 0.03,
      seed: seed + i
    })
    sketchLine(ctx, 150, rowY + 38, W - 150, rowY + 38, {
      width: 2,
      color: palette.inkSoft,
      seed: seed + i,
      alpha: 0.5
    })
  }

  ctx.font = `36px ${FONT_HAND}`
  sketchText(ctx, footer, W / 2, SHARE_CARD_HEIGHT - 100, {
    size: 36,
    color: palette.inkSoft,
    maxWidth: W - 200
  })
  return canvas
}

/** Encodes a canvas as a PNG file. */
export function canvasToFile(
  canvas: HTMLCanvasElement,
  fileName = 'share-card.png'
): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(new File([blob], fileName, { type: 'image/png' }))
      else
        reject(
          new Error(
            'canvasToFile: the browser could not encode the card as PNG, so there is nothing to share'
          )
        )
    }, 'image/png')
  })
}

/**
 * Encodes a canvas as a PNG file, then shrinks the canvas to 0 x 0 to free its memory at
 * once. iPhone Safari caps total canvas memory and frees detached canvases slowly.
 */
export async function encodeAndFree(
  canvas: HTMLCanvasElement,
  fileName?: string
): Promise<File> {
  try {
    return await canvasToFile(canvas, fileName)
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

/** Saves a file through a temporary download link. */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Turns a game name into a safe file name, such as "nail-jelly-to-a-wall.png". */
export function cardFileName(game: string): string {
  const slug = game
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'share-card'}.png`
}

/**
 * Opens the phone's share sheet with the card image, or downloads the PNG where sharing
 * files isn't supported. Pass a ready `File` when calling from a tap: Safari only allows
 * sharing straight after a tap, so render and encode the card beforehand.
 *
 * @example const result = await shareCard(file, 'I held 60 jellies. Barely.')
 */
export async function shareCard(
  card: ShareCardInput | HTMLCanvasElement | File,
  text: string
): Promise<ShareResult> {
  let file: File
  if (card instanceof File) file = card
  else if (card instanceof HTMLCanvasElement) file = await canvasToFile(card)
  else
    file = await encodeAndFree(renderShareCard(card), cardFileName(card.game))

  if (
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], text })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError')
        return 'cancelled'
      // Any other failure (such as a lost tap permission) falls back to a download.
    }
  }
  downloadFile(file)
  return 'downloaded'
}
