import { describe, expect, it } from 'vitest'
import { applyAction, createGame } from './engine'

const names = ['Ada', 'Ben', 'Cleo', 'Dara', 'Eli', 'Faye', 'Gus']
const stableRandom = () => 0.999999

describe('engine action dispatch', () => {
  it('creates either variant from one entry point', () => {
    expect(createGame({ variant: 'roleless', playerCount: 7, playerNames: names }, stableRandom).variant).toBe('roleless')
    expect(createGame({ variant: 'roles', playerCount: 7, playerNames: names }, stableRandom).variant).toBe('roles')
  })

  it('routes actions through the variant engine and validates the phase', () => {
    let game = createGame({ variant: 'roles', playerCount: 7, playerNames: names }, stableRandom)
    expect(() => applyAction(game, { type: 'startVoting' }, stableRandom)).toThrow('discussion')

    for (let index = 0; index < names.length; index += 1) {
      game = applyAction(applyAction(game, { type: 'confirmRoleViewed' }, stableRandom), { type: 'advanceReveal' }, stableRandom)
    }
    expect(game.phase).toBe('night')

    const target = game.players.find((player) => player.role === 'civilian')!.id
    game = applyAction(game, { type: 'resolveNight', actions: { mafiaTargetId: target } }, stableRandom)
    expect(game.phase).toBe('morning')
    expect(applyAction(game, { type: 'startDay' }, stableRandom).phase).toBe('discussion')
  })

  it('rejects night actions in games without roles', () => {
    const game = createGame({ variant: 'roleless', playerCount: 7, playerNames: names }, stableRandom)
    expect(() => applyAction(game, { type: 'startDay' }, stableRandom)).toThrow('no night')
  })
})
