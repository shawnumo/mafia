import { describe, expect, it } from 'vitest'
import { applyGroup, defaultRoster, GROUPS_KEY, loadGroups, loadRoster, moveEntry, nextPlaceholder, playingNames, ROSTER_KEY, rosterFromNames, saveGroups, saveRoster } from './roster'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
    values
  }
}

describe('roster and saved groups', () => {
  it('starts with seven placeholder players, all playing', () => {
    const roster = defaultRoster()
    expect(playingNames(roster)).toEqual(['Player 01', 'Player 02', 'Player 03', 'Player 04', 'Player 05', 'Player 06', 'Player 07'])
    expect(nextPlaceholder(roster)).toBe('Player 08')
    expect(new Set(roster.map((entry) => entry.id)).size).toBe(7)
  })

  it('round-trips the roster with who is playing, and keeps seating order', () => {
    const storage = memoryStorage()
    const roster = rosterFromNames(['Ada', 'Ben', 'Cleo']).map((entry, index) => ({ ...entry, playing: index !== 1 }))
    expect(saveRoster(roster, storage)).toBe(true)
    expect(loadRoster(storage)?.map(({ name, playing }) => ({ name, playing }))).toEqual([
      { name: 'Ada', playing: true },
      { name: 'Ben', playing: false },
      { name: 'Cleo', playing: true }
    ])
  })

  it('converts the original 15-seat roster and drops untouched placeholders past seat 7', () => {
    const storage = memoryStorage()
    const oldSeats = Array.from({ length: 15 }, (_, index) => `Player ${String(index + 1).padStart(2, '0')}`)
    oldSeats[0] = 'Ada'
    oldSeats[9] = 'Jo'
    storage.setItem(ROSTER_KEY, JSON.stringify(oldSeats))

    const roster = loadRoster(storage)!
    expect(roster.map((entry) => entry.name)).toEqual(['Ada', 'Player 02', 'Player 03', 'Player 04', 'Player 05', 'Player 06', 'Player 07', 'Jo'])
    expect(playingNames(roster)).toHaveLength(7)
    expect(roster[7].playing).toBe(false)
  })

  it('ignores unreadable roster data', () => {
    const storage = memoryStorage()
    storage.setItem(ROSTER_KEY, '{oops')
    expect(loadRoster(storage)).toBeNull()
    storage.setItem(ROSTER_KEY, JSON.stringify({ version: 2, players: [] }))
    expect(loadRoster(storage)).toBeNull()
  })

  it('moves a player one seat at a time and stops at the ends', () => {
    const roster = rosterFromNames(['Ada', 'Ben', 'Cleo'])
    expect(moveEntry(roster, roster[2].id, -1).map((entry) => entry.name)).toEqual(['Ada', 'Cleo', 'Ben'])
    expect(moveEntry(roster, roster[0].id, -1).map((entry) => entry.name)).toEqual(['Ada', 'Ben', 'Cleo'])
  })

  it('loads a group in its seating order, adds missing members, and benches everyone else', () => {
    const roster = rosterFromNames(['Ada', 'Ben', 'Cleo', 'Dara'])
    const loaded = applyGroup(roster, { id: 'g-1', name: 'Friday', players: ['cleo', 'Ada', 'Eli'] })

    expect(loaded.map((entry) => [entry.name, entry.playing])).toEqual([
      ['Cleo', true], ['Ada', true], ['Eli', true], ['Ben', false], ['Dara', false]
    ])
    expect(loaded[0].id).toBe(roster[2].id)
  })

  it('round-trips saved groups and drops malformed ones', () => {
    const storage = memoryStorage()
    saveGroups([{ id: 'g-1', name: 'Friday', players: ['Ada', 'Ben'] }], storage)
    expect(loadGroups(storage)).toEqual([{ id: 'g-1', name: 'Friday', players: ['Ada', 'Ben'] }])
    storage.setItem(GROUPS_KEY, JSON.stringify([{ id: 'g-2', name: 'Broken', players: [1] }]))
    expect(loadGroups(storage)).toEqual([])
  })
})
