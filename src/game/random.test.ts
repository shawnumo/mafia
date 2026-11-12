import { describe, expect, it } from 'vitest'
import { createSeededRandom } from './random'

describe('seeded random source', () => {
  it('repeats exactly for the same seed and differs between seeds', () => {
    const first = createSeededRandom('table-1')
    const second = createSeededRandom('table-1')
    const other = createSeededRandom('table-2')
    const a = Array.from({ length: 20 }, first)
    expect(Array.from({ length: 20 }, second)).toEqual(a)
    expect(Array.from({ length: 20 }, other)).not.toEqual(a)
  })

  it('stays within [0, 1) and spreads values', () => {
    const random = createSeededRandom(42)
    const values = Array.from({ length: 5000 }, random)
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true)
    const buckets = [0, 0, 0, 0]
    values.forEach((value) => { buckets[Math.floor(value * 4)] += 1 })
    buckets.forEach((count) => expect(count).toBeGreaterThan(1000))
  })
})
