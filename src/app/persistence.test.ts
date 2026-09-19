import { describe, expect, it } from 'vitest'
import { clearActiveGame, loadRolelessGame, loadRolelessSession, loadRolesGame, saveRolelessGame, saveRolelessSession, saveRolesGame } from './persistence'
import { createRolelessGame } from '../game/roleless'
import { createRolesGame } from '../game/rolesEngine'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    values
  }
}

describe('active game persistence', () => {
  it('round-trips a roleless game snapshot', () => {
    const storage = memoryStorage()
    const game = createRolelessGame(['Ada', 'Ben', 'Cleo', 'Dara', 'Eli', 'Faye', 'Gus'], undefined, () => 0.99)

    saveRolelessGame(game, storage)

    expect(loadRolelessGame(storage)).toEqual(game)
  })

  it('round-trips timer state with the active session', () => {
    const storage = memoryStorage()
    const game = createRolelessGame(['Ada', 'Ben', 'Cleo', 'Dara', 'Eli', 'Faye', 'Gus'], undefined, () => 0.99)
    const session = {
      game,
      discussionSeconds: 300,
      defenseSeconds: 30,
      timer: { mode: 'defense' as const, secondsRemaining: 17, running: true, defenseCandidateIndex: 2 }
    }

    saveRolelessSession(session, storage)

    expect(loadRolelessSession(storage)).toEqual(session)
  })

  it('round-trips a roles game snapshot', () => {
    const storage = memoryStorage()
    const game = createRolesGame({
      playerNames: ['Ada', 'Ben', 'Cleo', 'Dara', 'Eli', 'Faye', 'Gus'],
      playerCount: 7,
      doctorEnabled: true,
      detectiveEnabled: true,
      sheriffEnabled: true
    }, () => 0.99)

    saveRolesGame(game, storage)

    expect(loadRolesGame(storage)).toEqual(game)
  })

  it('preserves corrupt snapshots for recovery and starts clean', () => {
    const storage = memoryStorage()
    storage.setItem('mafia-game:v1:active', '{not valid json')

    expect(loadRolelessGame(storage)).toBeNull()
    expect(storage.values.get('mafia-game:v1:active:recovery')).toBe('{not valid json')
    expect(storage.values.has('mafia-game:v1:active')).toBe(false)
  })

  it('clears the active game without touching recovery data', () => {
    const storage = memoryStorage()
    storage.setItem('mafia-game:v1:active', 'active')
    storage.setItem('mafia-game:v1:active:recovery', 'recovery')

    clearActiveGame(storage)

    expect(storage.values.has('mafia-game:v1:active')).toBe(false)
    expect(storage.values.get('mafia-game:v1:active:recovery')).toBe('recovery')
  })
})
