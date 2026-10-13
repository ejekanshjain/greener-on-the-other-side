/** Round wins as prize rosettes, `className` sizing each one (24 by 20 px by default). */
export function Rosettes({
  wins,
  label,
  className
}: {
  wins: number
  label: string
  className?: string
}) {
  if (wins <= 0) return null
  return (
    <span
      role="img"
      aria-label={label}
      data-testid="rosettes"
      className="flex shrink-0 gap-0.5"
    >
      {Array.from({ length: wins }, (_, i) => (
        <svg
          key={i}
          viewBox="0 0 20 26"
          className={className ?? 'h-6 w-5'}
          aria-hidden
        >
          <path d="M6 14 L3 25 L7 22 L10 25 L10 15 Z" fill="#c92a2a" />
          <path d="M14 14 L17 25 L13 22 L10 25 L10 15 Z" fill="#a61e1e" />
          <circle
            cx="10"
            cy="10"
            r="8.5"
            fill="#1864ab"
            stroke="#222"
            strokeWidth="1.6"
            strokeDasharray="3 1.2"
          />
          <circle cx="10" cy="10" r="4" fill="#fcc419" stroke="#222" />
        </svg>
      ))}
    </span>
  )
}
