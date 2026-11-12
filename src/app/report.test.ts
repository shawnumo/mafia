import { describe, expect, it } from 'vitest'
import { createGame } from '../game/engine'
import type { RolesGameState } from '../game/types'
import { buildGameReport } from './report'
import { createSession, DEFAULT_SETTINGS } from './session'
import type { Checkpoint } from './session'

const names = ['Ada', 'Ben', 'Cleo', 'Dara', 'Eli', 'Faye', 'Gus']

describe('shareable game report', () => {
  it('summarizes a finished roles game with roles, the record, and GM notes', () => {
    const created = createGame({ variant: 'roles', playerCount: 7, playerNames: names }, () => 0.999999) as RolesGameState
    const game: RolesGameState = {
      ...created,
      phase: 'ended',
      winner: 'town',
      round: 2,
      players: created.players.map((player, index) => index === 0 ? { ...player, alive: false } : player),
      eventLog: ['Night 1: Ada and Ben decided to kill Cleo.', 'Day 1: Ada was voted out.']
    }
    const checkpoint: Checkpoint = { id: '1', timestamp: '', label: 'Day 1 started', note: 'Ben arrived late', game, timer: createSession(game, DEFAULT_SETTINGS).timer }
    const report = buildGameReport({ ...createSession(game, DEFAULT_SETTINGS), timeline: [checkpoint] }, Date.UTC(2026, 10, 6))

    expect(report.split('\n')[0]).toBe('Mafia: Town wins')
    expect(report).toContain('Roles game · 7 players · 2 nights')
    expect(report).toContain(`- Ada: ${game.players[0].role} (out)`)
    expect(report).toContain('- Day 1: Ada was voted out.')
    expect(report).toContain('GM notes\n- Day 1 started: Ben arrived late')
  })

  it('uses public checkpoint labels for games without roles, minus individual votes', () => {
    const created = createGame({ variant: 'roleless', playerCount: 7, playerNames: names }, () => 0.5)
    const game = { ...created, phase: 'ended' as const, winner: 'mafia' as const }
    const session = createSession(game, DEFAULT_SETTINGS)
    const labels = ['Game started · 7 players · no roles', 'Vote: Ada → Ben', 'Voted out: Ben']
    const report = buildGameReport({ ...session, timeline: labels.map((label, index) => ({ id: String(index), timestamp: '', label, note: '', game, timer: session.timer })) })

    expect(report).toContain('- Voted out: Ben')
    expect(report).not.toContain('Vote: Ada')
  })

  it('is only available once the game is over', () => {
    const game = createGame({ variant: 'roleless', playerCount: 7, playerNames: names }, () => 0.5)
    expect(() => buildGameReport(createSession(game, DEFAULT_SETTINGS))).toThrow('game is over')
  })
})
