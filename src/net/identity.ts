import { randomId } from './ids'

/** Funny default names, so you can start without typing. Each fits the 16-character rule. */
export const FUNNY_NAMES = [
  'Gnome Hoarder',
  'Lawn Ranger',
  'Hedge Fund',
  'Turf Lord',
  'Weed Whacker',
  'Snail Mail',
  'Sod Father',
  'Mow Problems',
  'Grass Menace',
  'Compost Mentis'
] as const

const ID_KEY = 'greener-player-id'
const NAME_KEY = 'greener-name'

/** Who you are in every room: a random player id and a display name, kept in `localStorage`. */
export interface Identity {
  id: string
  name: string
}

/** A random funny name. */
export function funnyName(random = Math.random): string {
  return (
    FUNNY_NAMES[Math.floor(random() * FUNNY_NAMES.length)] ?? FUNNY_NAMES[0]
  )
}

/** Your stored identity, creating and saving a fresh one the first time. */
export function loadIdentity(): Identity {
  let id = readStorage(ID_KEY)
  if (!id || !/^[a-z0-9]{8,24}$/.test(id)) {
    id = randomId(12)
    writeStorage(ID_KEY, id)
  }
  let name = readStorage(NAME_KEY)
  if (!name) {
    name = funnyName()
    writeStorage(NAME_KEY, name)
  }
  return { id, name }
}

/** Saves your display name for next time. */
export function saveName(name: string): void {
  writeStorage(NAME_KEY, name)
}

const LOCAL_NAME_KEY = 'greener-local-name'

/**
 * Local test tabs share `localStorage`, so the home screen also keeps the name typed in
 * this tab here. A local room reads it back, or `null` when this tab never typed one.
 */
export function localTabName(): string | null {
  try {
    return sessionStorage.getItem(LOCAL_NAME_KEY)
  } catch {
    return null
  }
}

/** Remembers the name typed in this tab for local test rooms. */
export function saveLocalTabName(name: string): void {
  try {
    sessionStorage.setItem(LOCAL_NAME_KEY, name)
  } catch {
    // Without storage the local room picks a funny name instead.
  }
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private browsing can refuse storage; the identity then lasts for this page only.
  }
}
