import { createStore, useStore, type Store } from './store'

/** A job the player must finish before they can do certain actions. */
export interface Chore {
  id: string
  label: string
  detail?: string
  /** Action ids this chore blocks until it is complete. */
  blocks: readonly string[]
  /** `Date.now()` when the chore was added. */
  createdAt: number
}

/** Input for `ChoreBoard.add`. `blocks` defaults to none, `createdAt` to now. */
export interface NewChore {
  id: string
  label: string
  detail?: string
  blocks?: readonly string[]
  createdAt?: number
}

/** The open chores, in the order they were added. */
export interface ChoreBoardState {
  chores: readonly Chore[]
}

/** Tracks "this must be done before that" rules. */
export interface ChoreBoard {
  /** Backing store. Read it in React with `useChores`. */
  store: Store<ChoreBoardState>
  /** Adds a chore. Returns false and changes nothing when a chore with that id is already open. */
  add(chore: NewChore): boolean
  /** Removes a chore. Returns false when it wasn't open. */
  complete(id: string): boolean
  has(id: string): boolean
  list(): readonly Chore[]
  /** Open chores that block `action`, oldest first. */
  blockersFor(action: string): Chore[]
  /** True when no open chore blocks `action`. */
  canDo(action: string): boolean
  subscribe(listener: () => void): () => void
}

/**
 * Creates an empty chore board.
 *
 * @example
 * const chores = createChoreBoard()
 * chores.add({ id: 'mop', label: 'Mop the splat', blocks: ['carry-tray'] })
 * chores.canDo('carry-tray') // false until chores.complete('mop')
 */
export function createChoreBoard(): ChoreBoard {
  const store = createStore<ChoreBoardState>({ chores: [] })
  const list = () => store.get().chores
  const has = (id: string) => list().some(chore => chore.id === id)
  const blockersFor = (action: string) =>
    list().filter(chore => chore.blocks.includes(action))

  return {
    store,
    list,
    has,
    blockersFor,
    add(chore) {
      if (has(chore.id)) return false
      const next: Chore = {
        id: chore.id,
        label: chore.label,
        blocks: chore.blocks ?? [],
        createdAt: chore.createdAt ?? Date.now()
      }
      if (chore.detail !== undefined) next.detail = chore.detail
      store.set(s => ({ chores: [...s.chores, next] }))
      return true
    },
    complete(id) {
      if (!has(id)) return false
      store.set(s => ({ chores: s.chores.filter(chore => chore.id !== id) }))
      return true
    },
    canDo: action => !list().some(chore => chore.blocks.includes(action)),
    subscribe: store.subscribe
  }
}

/** Re-renders with the open chores whenever the board changes. */
export function useChores(board: ChoreBoard): readonly Chore[] {
  return useStore(board.store, selectChores)
}

function selectChores(state: ChoreBoardState): readonly Chore[] {
  return state.chores
}
