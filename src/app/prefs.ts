import { createStore } from './store'

export const PREFS_KEY = 'mafia-game:v1:prefs'

/** Device-level display preferences. Not part of a game, so they survive new games and resets. */
export interface Prefs {
  boardView: 'list' | 'circle'
}

const DEFAULT_PREFS: Prefs = { boardView: 'list' }

function readPrefs(): Prefs {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? 'null')
    const boardView = (parsed as Partial<Prefs> | null)?.boardView
    return { boardView: boardView === 'circle' ? 'circle' : 'list' }
  } catch {
    return DEFAULT_PREFS
  }
}

export const prefsStore = createStore<Prefs>(typeof window === 'undefined' ? DEFAULT_PREFS : readPrefs())

export function setPrefs(change: Partial<Prefs>): void {
  prefsStore.setState((current) => ({ ...current, ...change }))
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefsStore.getState()))
  } catch {
    // Preferences are a convenience; failing to save them is harmless.
  }
}
