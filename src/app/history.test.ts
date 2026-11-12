import { describe, expect, it } from 'vitest'
import { computeStats, HISTORY_KEY, HISTORY_LIMIT, loadHistory, recordFromSession, removeRecord, saveHistory, upsertRecord } from './history'
import type { GameRecord } from './history'
import { createSession, DEFAULT_SETTINGS } from './session'
import { createGame } from '../game/engine'

const names = ['Ada', 'Ben', 'Cleo', 'Dara', 'Eli', 'Faye', 'Gus']

function record(id: string, winner: 'mafia' | 'town', roles: Record<string, GameRecord['players'][number]['role']>): GameRecord {
  return {
    id,
    endedAt: '2026-11-06T00:00:00.000Z',
    variant: 'roles',
    winner,
    rounds: 2,
    players: Object.entries(roles).map(([name, role]) => ({ name, role, survived: role !== 'civilian' }))
  }
}

describe('local game history', () => {
  it('records only finished games, with roles and survivors', () => {
    const game = createGame({ variant: 'roleless', playerCount: 7, playerNames: names }, () => 0.5)
    const session = createSession(game, DEFAULT_SETTINGS, 'game-1')
    expect(recordFromSession(session, 0)).toBeNull()

    const ended = { ...session, game: { ...game, phase: 'ended' as const, winner: 'town' as const } }
    const entry = recordFromSession(ended, Date.UTC(2026, 10, 6))
    expect(entry).toMatchObject({ id: 'game-1', winner: 'town', variant: 'roleless', endedAt: '2026-11-06T00:00:00.000Z' })
    expect(entry?.players).toHaveLength(7)
  })

  it('replaces a record for the same game and caps the list', () => {
    const first = record('a', 'town', { Ada: 'mafia' })
    const replaced = upsertRecord([first], { ...first, winner: 'mafia' })
    expect(replaced).toHaveLength(1)
    expect(replaced[0].winner).toBe('mafia')
    expect(removeRecord(replaced, 'a')).toEqual([])

    const many = Array.from({ length: HISTORY_LIMIT + 5 }, (_, index) => record(String(index), 'town', { Ada: 'civilian' }))
      .reduce<GameRecord[]>((history, entry) => upsertRecord(history, entry), [])
    expect(many).toHaveLength(HISTORY_LIMIT)
    expect(many[0].id).toBe(String(HISTORY_LIMIT + 4))
  })

  it('computes win rates overall, by role, and by player (names match regardless of case)', () => {
    const history = [
      record('1', 'town', { Ada: 'mafia', Ben: 'doctor', Cleo: 'civilian' }),
      record('2', 'mafia', { ada: 'mafia', Ben: 'civilian', Cleo: 'civilian' }),
      record('3', 'town', { Ada: 'civilian', Ben: 'mafia', Cleo: 'detective' })
    ]
    const stats = computeStats(history)

    expect(stats).toMatchObject({ games: 3, townWins: 2, mafiaWins: 1 })
    expect(stats.byRole.mafia).toEqual({ games: 3, wins: 1 })
    expect(stats.byRole.civilian).toEqual({ games: 4, wins: 2 })
    const ada = stats.players.find((player) => player.name === 'Ada')!
    expect(ada).toMatchObject({ games: 3, wins: 2, roles: { mafia: 2, civilian: 1 } })
    expect(stats.players).toHaveLength(3)
  })

  it('round-trips through storage and skips malformed entries', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
    const history = [record('1', 'town', { Ada: 'mafia' })]
    expect(saveHistory(history, storage)).toBe(true)
    expect(loadHistory(storage)).toEqual(history)
    values.set(HISTORY_KEY, JSON.stringify([{ id: 'x' }, ...history]))
    expect(loadHistory(storage)).toEqual(history)
  })
})
