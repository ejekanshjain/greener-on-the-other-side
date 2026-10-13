/** A tiny set of listeners with typed arguments. */
export class Listeners<A extends unknown[]> {
  private readonly set = new Set<(...args: A) => void>()

  /** Adds a listener and returns a function that removes it. */
  add(fn: (...args: A) => void): () => void {
    this.set.add(fn)
    return () => {
      this.set.delete(fn)
    }
  }

  emit(...args: A): void {
    for (const fn of this.set) fn(...args)
  }

  clear(): void {
    this.set.clear()
  }
}
