export interface Store<T> {
  getState: () => T
  setState: (next: T | ((current: T) => T)) => void
  subscribe: (listener: () => void) => () => void
}

/**
 * Minimal external store for useSyncExternalStore. Event handlers read the latest state synchronously,
 * so two quick taps never act on a stale snapshot.
 */
export function createStore<T>(initial: T): Store<T> {
  let state = initial
  const listeners = new Set<() => void>()

  return {
    getState: () => state,
    setState: (next) => {
      const resolved = typeof next === 'function' ? (next as (current: T) => T)(state) : next
      if (Object.is(resolved, state)) return
      state = resolved
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
