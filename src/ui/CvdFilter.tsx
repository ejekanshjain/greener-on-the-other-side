'use client'

/** Colour-vision matrices (Machado, Oliveira and Fernandes 2009, full severity). */
const MATRICES = {
  protan:
    '0.152286 1.052583 -0.204868 0 0 0.114503 0.786281 0.099216 0 0 -0.003882 -0.048116 1.051998 0 0 0 0 0 1 0',
  deutan:
    '0.367322 0.860646 -0.227968 0 0 0.280085 0.672501 0.047413 0 0 -0.011820 0.042940 0.968881 0 0 0 0 0 1 0'
} as const

/** The SVG filter id the canvas uses under `?cvd`. */
export const CVD_FILTER_ID = 'greener-cvd'

/** Dev only: an SVG filter that shows the canvas as a protan or deutan viewer sees it. */
export function CvdFilter({ kind }: { kind: keyof typeof MATRICES }) {
  return (
    <svg aria-hidden className="absolute size-0">
      <filter id={CVD_FILTER_ID}>
        <feColorMatrix type="matrix" values={MATRICES[kind]} />
      </filter>
    </svg>
  )
}
