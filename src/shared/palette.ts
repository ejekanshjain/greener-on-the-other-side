/**
 * Colours for canvas drawing. They match the `paper`, `ink` and `marker-*` Tailwind colours.
 * Red, green and blue reach 4.5:1 contrast with white and with paper, so UI text can use them.
 */
export const palette = {
  paper: '#fdf6e3',
  paperDark: '#efe3c4',
  ink: '#222222',
  inkSoft: '#5c5c5c',
  red: '#c92a2a',
  orange: '#f08c00',
  yellow: '#fcc419',
  green: '#237a33',
  blue: '#1864ab',
  water: '#74c0fc',
  purple: '#7048e8',
  pink: '#e64980',
  brown: '#8d5524',
  jelly: '#ff6b6b'
} as const

export type PaletteColor = keyof typeof palette
