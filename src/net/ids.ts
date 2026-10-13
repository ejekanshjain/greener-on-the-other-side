const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Random lowercase letters and digits from the browser's secure random source. */
export function randomId(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = ''
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length]
  return out
}

/** True for a player id: 8 to 24 lowercase letters or digits, as the auth route expects. */
export function isPlayerId(id: string): boolean {
  return /^[a-z0-9]{8,24}$/.test(id)
}
