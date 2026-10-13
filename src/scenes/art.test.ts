import { describe, expect, it } from 'vitest'

import { GRASS_RAMP } from './art'

/** Colour-vision matrices in linear RGB (Machado 2009, full severity), as `?cvd` uses. */
const VIEWS = {
  normal: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  protan: [
    0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882,
    -0.048116, 1.051998
  ],
  deutan: [
    0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182,
    0.04294, 0.968881
  ]
}

const linear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4

/** CIE L* of a hex colour as a viewer with matrix `m` sees it. */
function lightness(hex: string, m: number[]): number {
  const [r, g, b] = [1, 3, 5].map(i =>
    linear(parseInt(hex.slice(i, i + 2), 16) / 255)
  ) as [number, number, number]
  const row = (k: number) =>
    Math.min(1, Math.max(0, m[k]! * r + m[k + 1]! * g + m[k + 2]! * b))
  const y = 0.2126 * row(0) + 0.7152 * row(3) + 0.0722 * row(6)
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y
}

describe('grass ramp', () => {
  it.each(Object.entries(VIEWS))(
    'rises at least 7.5 L* per health level for %s vision',
    (_name, m) => {
      const ls = GRASS_RAMP.map(hex => lightness(hex, m))
      for (let i = 1; i < ls.length; i++)
        expect(ls[i]! - ls[i - 1]!).toBeGreaterThanOrEqual(7.5)
    }
  )
})
