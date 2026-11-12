import { createSeededRandom } from '../game/random'
import type { RandomSource } from '../game/types'

/** Float in [0, 1) from the platform's cryptographic generator; falls back to Math.random where unavailable. */
export const cryptoRandom: RandomSource = () => {
  const cryptoApi = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined
  if (!cryptoApi?.getRandomValues) return Math.random()
  const buffer = new Uint32Array(1)
  cryptoApi.getRandomValues(buffer)
  return buffer[0] / 2 ** 32
}

export const E2E_SEED_KEY = 'mafia-e2e:seed'

/**
 * Only builds made with `vite build --mode e2e` use a seeded generator, so test runs are repeatable.
 * A test may pick its own seed through localStorage before the page loads. Production builds always use
 * the cryptographic source; this branch is compiled out of them.
 */
function createAppRandom(): RandomSource {
  if (import.meta.env.MODE !== 'e2e') return cryptoRandom
  let seed = 'mafia-e2e'
  try {
    seed = window.localStorage.getItem(E2E_SEED_KEY) ?? seed
  } catch {
    // Keep the default seed.
  }
  return createSeededRandom(seed)
}

export const appRandom: RandomSource = createAppRandom()
