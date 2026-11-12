import { createStore } from './store'

/**
 * Service worker updates wait for the GM instead of reloading mid-game. main.tsx registers the worker
 * and reports here; the setup and end screens offer the update.
 */
export const updateStore = createStore<{ ready: boolean; apply: (() => void) | null }>({ ready: false, apply: null })

export function announceUpdate(apply: () => void): void {
  updateStore.setState({ ready: true, apply })
}
