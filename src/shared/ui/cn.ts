/**
 * Joins class names, skipping falsy values.
 *
 * @example cn('px-4', active && 'bg-marker-yellow', className)
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
