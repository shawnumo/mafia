import type { RandomSource } from './types'

/** FNV-1a: turns any seed string into a 32-bit starting state. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * Deterministic RandomSource (mulberry32). The same seed always produces the same deals and voting
 * orders, which makes simulations and end-to-end runs repeatable. Never used for real games.
 */
export function createSeededRandom(seed: string | number): RandomSource {
  let state = hashSeed(String(seed))
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
