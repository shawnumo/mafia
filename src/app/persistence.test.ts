import { describe, expect, it } from 'vitest'
import { applyAction, createGame } from '../game/engine'
import { ACTIVE_GAME_KEY, clearActiveGame, loadSession, RECOVERY_KEY, saveSession } from './persistence'
import { commitGame, createSession, DEFAULT_SETTINGS, describeAction } from './session'
import type { Session } from './session'

const names = ['Ada', 'Ben', 'Cleo', 'Dara', 'Eli', 'Faye', 'Gus']
const stableRandom = () => 0.999999

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
    values
  }
}

function startedSession(variant: 'roleless' | 'roles'): Session {
  let session = createSession(createGame({ variant, playerCount: 7, playerNames: names }, stableRandom), DEFAULT_SETTINGS)
  for (let index = 0; index < names.length; index += 1) {
    for (const action of [{ type: 'confirmRoleViewed' as const }, { type: 'advanceReveal' as const }]) {
      const next = applyAction(session.game, action, stableRandom)
      session = commitGame(session, next, describeAction(action, session.game, next), 1_000)
    }
  }
  return session
}

describe('active game persistence', () => {
  it('round-trips a full session for both variants', () => {
    for (const variant of ['roleless', 'roles'] as const) {
      const storage = memoryStorage()
      const session = startedSession(variant)
      expect(saveSession(session, storage)).toBe(true)
      expect(loadSession(storage)).toEqual({ session, recovered: false })
    }
  })

  it('moves corrupt or tampered saves to the recovery key and reports it', () => {
    const corrupt = memoryStorage()
    corrupt.setItem(ACTIVE_GAME_KEY, '{not valid json')
    expect(loadSession(corrupt)).toEqual({ session: null, recovered: true })
    expect(corrupt.values.get(RECOVERY_KEY)).toBe('{not valid json')
    expect(corrupt.values.has(ACTIVE_GAME_KEY)).toBe(false)

    const session = startedSession('roleless')
    const tamperedCases = [
      { ...session, game: { ...session.game, phase: 'banquet' } },
      { ...session, game: { ...session.game, players: session.game.players.map((player, index) => index === 0 ? { ...player, role: 'sheriff' } : player) } },
      { ...session, game: { ...session.game, phase: 'reveal', revealedPlayerId: null } },
      { ...session, game: { ...session.game, votes: { 'player-1': 'player-99' } } },
      { ...session, timer: { mode: 'discussion', secondsRemaining: 10 } }
    ]
    for (const tampered of tamperedCases) {
      const storage = memoryStorage()
      storage.setItem(ACTIVE_GAME_KEY, JSON.stringify({ version: 2, session: tampered }))
      expect(loadSession(storage).recovered).toBe(true)
    }
  })

  it('reports storage write failures instead of throwing', () => {
    const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError') }, removeItem: () => { throw new Error('blocked') } }
    expect(saveSession(startedSession('roleless'), full)).toBe(false)
    expect(clearActiveGame(full)).toBe(false)
    expect(saveSession(startedSession('roleless'), null)).toBe(false)
  })

  it('clears the active game without touching recovery data', () => {
    const storage = memoryStorage()
    storage.setItem(ACTIVE_GAME_KEY, 'active')
    storage.setItem(RECOVERY_KEY, 'recovery')

    expect(clearActiveGame(storage)).toBe(true)
    expect(storage.values.has(ACTIVE_GAME_KEY)).toBe(false)
    expect(storage.values.get(RECOVERY_KEY)).toBe('recovery')
  })

  it('fills settings added later with defaults and keeps an id-less save on one stable id', () => {
    const session = startedSession('roles')
    const { id, ...withoutId } = session
    void id
    const { readAloud, haptics, ...olderSettings } = session.settings
    void readAloud
    void haptics
    const storage = memoryStorage()
    storage.setItem(ACTIVE_GAME_KEY, JSON.stringify({ version: 2, session: { ...withoutId, settings: olderSettings } }))

    const first = loadSession(storage).session
    const second = loadSession(storage).session
    expect(first?.settings).toMatchObject({ readAloud: false, haptics: true })
    expect(first?.id).toMatch(/^legacy-/)
    expect(second?.id).toBe(first?.id)
  })
})

describe('version 1 migration', () => {
  const v1Timer = { mode: 'discussion', secondsRemaining: 240, running: true, defenseCandidateIndex: 0 }

  function v1RolelessGame(overrides: Record<string, unknown> = {}) {
    const { phase, revealIndex, revealConfirmed, ...rest } = createGame({ variant: 'roleless', playerCount: 7, playerNames: names }, stableRandom)
    void phase
    return { ...rest, phase: 'discussion', roleRevealIndex: revealIndex, roleRevealConfirmed: revealConfirmed, roleRevealComplete: true, ...overrides }
  }

  it('converts a roleless session, pausing the timer and keeping the GM note', () => {
    const storage = memoryStorage()
    const game = v1RolelessGame()
    storage.setItem(ACTIVE_GAME_KEY, JSON.stringify({
      version: 1,
      variant: 'roleless',
      session: {
        game,
        discussionSeconds: 240,
        defenseSeconds: 25,
        timer: v1Timer,
        undoHistory: [],
        timeline: [{ id: 't-1', timestamp: '2026-10-19T00:00:00.000Z', label: 'Game started', note: 'Remember Ada joined late', game, timer: v1Timer }]
      }
    }))

    const { session, recovered } = loadSession(storage, 5_000)
    expect(recovered).toBe(false)
    expect(session?.game.phase).toBe('discussion')
    expect(session?.settings).toMatchObject({ discussionSeconds: 240, defenseSeconds: 25 })
    expect(session?.timer).toMatchObject({ endsAt: null, remainingMs: 240_000, durationMs: 240_000 })
    expect(session?.timeline.map((entry) => entry.label)).toEqual(['Game started', 'Resumed saved game'])
    expect(session?.timeline[0].note).toBe('Remember Ada joined late')
  })

  it('turns an unfinished roleless reveal into the deal phase', () => {
    const storage = memoryStorage()
    storage.setItem(ACTIVE_GAME_KEY, JSON.stringify({
      version: 1,
      variant: 'roleless',
      session: { game: v1RolelessGame({ roleRevealIndex: 3, roleRevealComplete: false }), discussionSeconds: 300, defenseSeconds: 30, timer: v1Timer }
    }))

    const { session } = loadSession(storage)
    expect(session?.game).toMatchObject({ phase: 'deal', revealIndex: 3 })
    expect(session?.timeline).toEqual([])
  })

  it('splits the roles deal from elimination reveals and drops stored detective results', () => {
    const storage = memoryStorage()
    const created = createGame({ variant: 'roles', playerCount: 7, playerNames: names }, stableRandom)
    const dealing = { ...created, phase: 'reveal', revealIndex: 2 }
    storage.setItem(ACTIVE_GAME_KEY, JSON.stringify({ version: 1, variant: 'roles', session: { game: dealing, discussionSeconds: 300, defenseSeconds: 30, timer: v1Timer } }))
    expect(loadSession(storage).session?.game).toMatchObject({ phase: 'deal', revealIndex: 2 })

    const morning = { ...created, phase: 'morning', nightSummary: { deaths: ['player-1'], savedPlayerId: null, detectiveResult: true } }
    storage.setItem(ACTIVE_GAME_KEY, JSON.stringify({ version: 1, variant: 'roles', game: morning }))
    const loaded = loadSession(storage).session
    expect(loaded?.game.variant === 'roles' && loaded.game.nightSummary).toEqual({ deaths: ['player-1'], savedPlayerId: null })
    expect(JSON.stringify(loaded)).not.toContain('detectiveResult')
  })
})
