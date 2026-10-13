/** Room code characters: lowercase letters and digits without 0, o, 1, l and i. */
export const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
export const CODE_LENGTH = 6

const CODE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`)

/** True for a valid lowercase room code. */
export function isRoomCode(code: string): boolean {
  return CODE.test(code)
}

/** A random room code from the browser's secure random source. */
export function newRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  let out = ''
  for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length]
  return out
}

/** The Pusher presence channel for a room. */
export function roomChannel(code: string): string {
  return `presence-lawn-${code}`
}

/** Shown when the code box holds a character no room code uses. */
export const CODE_HELP = 'Codes are 6 characters with no 0, O, 1, L or I.'

/** What the code box holds: a complete code, a partial one, or a problem to show. */
export interface CodeInput {
  /** The room code once 6 valid characters are in, else null. */
  code: string | null
  /** True when the code came from a pasted room link. */
  fromLink: boolean
  /** CODE_HELP when the text can't become a code, else null. */
  problem: string | null
}

/**
 * Reads the code box. Case doesn't matter, spaces and hyphens between groups are
 * ignored, and a pasted room link works too.
 */
export function parseCodeInput(raw: string): CodeInput {
  const link = /\/r\/([^/?#\s]+)/i.exec(raw)
  if (link?.[1]) {
    const code = link[1].toLowerCase()
    return isRoomCode(code)
      ? { code, fromLink: true, problem: null }
      : { code: null, fromLink: true, problem: CODE_HELP }
  }
  const text = raw.toLowerCase().replace(/[\s-]/g, '')
  const valid = [...text].every(ch => CODE_ALPHABET.includes(ch))
  if (!valid || text.length > CODE_LENGTH)
    return { code: null, fromLink: false, problem: CODE_HELP }
  return {
    code: text.length === CODE_LENGTH ? text : null,
    fromLink: false,
    problem: null
  }
}
