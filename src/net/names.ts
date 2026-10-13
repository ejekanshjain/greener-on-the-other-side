/** The helper line under the name box when a name breaks the rule. */
export const NAME_HELP =
  'Use letters, numbers, spaces, apostrophes, dots or hyphens.'
/** Names show at most this many characters, counted as they appear on screen. */
export const NAME_MAX = 16
/** The server also refuses names longer than this many code points. */
export const NAME_MAX_CODE_POINTS = 64

const ALLOWED = /^[\p{L}\p{M}\p{N} '.-]+$/u
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u

/**
 * Tidies a typed name: NFC, curly apostrophes made straight (phone keyboards type them),
 * spaces trimmed and runs of spaces collapsed.
 */
export function normaliseName(raw: string): string {
  return raw.normalize('NFC').replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ').trim()
}

/** A text's characters as they show on screen, so "एकांश" splits into 3, not 5. */
export function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl)
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text),
      part => part.segment
    )
  return Array.from(text)
}

/** Characters as they show on screen, so "एकांश" counts 3, not 5. */
export function graphemeCount(text: string): number {
  return graphemes(text).length
}

/**
 * Cuts a name to at most `max` characters as they show on screen, ending in "…" when cut,
 * so a combining mark never loses its letter.
 */
export function shortName(name: string, max = 10): string {
  const chars = graphemes(name)
  return chars.length <= max ? name : `${chars.slice(0, max - 1).join('')}…`
}

/**
 * Why a normalised name is refused, or null when it's fine: 1 to 16 characters of letters
 * in any script, digits, spaces, apostrophes, dots and hyphens, with at least one letter
 * or digit.
 */
export function nameProblem(name: string): string | null {
  if (
    Array.from(name).length > NAME_MAX_CODE_POINTS ||
    graphemeCount(name) > NAME_MAX
  )
    return `Names fit ${NAME_MAX} characters.`
  // Blank names fail the same way: there's no letter or digit in them.
  if (!ALLOWED.test(name) || !HAS_LETTER_OR_DIGIT.test(name)) return NAME_HELP
  return null
}

/** True when a normalised name passes the rule. */
export function isValidName(name: string): boolean {
  return nameProblem(name) === null
}
