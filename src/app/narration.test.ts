import { describe, expect, it } from 'vitest'
import { createGame, applyAction } from '../game/engine'
import type { RolesGameState } from '../game/types'
import { morningNarration, narrationText, nightStartNarration, phantomSteps, PHANTOM_PAUSE_MS, stepNarration, transitionNarration } from './narration'

const names = ['Ada', 'Ben', 'Cleo', 'Dara', 'Eli', 'Faye', 'Gus', 'Hana', 'Ivan']
const stableRandom = () => 0.999999

function night(options: { sheriffEnabled?: boolean } = {}): RolesGameState {
  let game = createGame({ variant: 'roles', playerCount: 9, playerNames: names, ...options }, stableRandom)
  for (let index = 0; index < names.length; index += 1) {
    game = applyAction(applyAction(game, { type: 'confirmRoleViewed' }, stableRandom), { type: 'advanceReveal' }, stableRandom)
  }
  if (game.variant !== 'roles') throw new Error('Expected a roles game.')
  return game
}

function kill(game: RolesGameState, role: string): RolesGameState {
  return { ...game, players: game.players.map((player) => player.role === role ? { ...player, alive: false } : player) }
}

describe('night narration', () => {
  it('opens the night and wakes the mafia without naming anyone', () => {
    const game = night()
    const text = narrationText(nightStartNarration(game))
    expect(text).toBe('Night falls. Everyone, close your eyes. Mafia, open your eyes. Silently agree on one player to eliminate.')
    expect(stepNarration(game, 0)).toEqual(nightStartNarration(game))
  })

  it('never says a player name during the night', () => {
    const game = night({ sheriffEnabled: true })
    const scripts = [0, 1, 2, 3].map((index) => narrationText(stepNarration(game, index)))
    scripts.push(narrationText(transitionNarration(game, 'doctor', null)))
    for (const script of scripts) {
      for (const name of names) expect(script).not.toContain(name)
    }
  })

  it('still calls a dead doctor or sheriff, with a pause, so the table cannot tell they are gone', () => {
    const game = kill(kill(night({ sheriffEnabled: true }), 'doctor'), 'sheriff')
    expect(phantomSteps(game)).toEqual(['sheriff', 'doctor'])

    const afterMafia = transitionNarration(game, 'mafia', 'detective')
    expect(narrationText(afterMafia)).toContain('Mafia, close your eyes. Sheriff, open your eyes.')
    expect(narrationText(afterMafia)).toContain('Sheriff, close your eyes. Detective, open your eyes.')
    expect(afterMafia.some((line) => line.pauseAfterMs === PHANTOM_PAUSE_MS)).toBe(true)

    const afterDetective = narrationText(transitionNarration(game, 'detective', null))
    expect(afterDetective).toBe('Detective, close your eyes. Doctor, open your eyes. Point at one player to protect. You may choose yourself. Doctor, close your eyes.')
  })

  it('never calls a role that was not dealt', () => {
    const game = night()
    expect(phantomSteps(game)).toEqual([])
    expect(narrationText(transitionNarration(game, 'detective', 'doctor'))).not.toContain('Sheriff')
  })
})

describe('morning narration', () => {
  it('announces deaths and a successful save, never a role or the detective', () => {
    const game = night()
    const civilian = game.players.find((player) => player.role === 'civilian')!
    const saved = applyAction(game, { type: 'resolveNight', actions: { mafiaTargetId: civilian.id, doctorTargetId: civilian.id, detectiveGuessId: civilian.id } }, stableRandom)
    if (saved.variant !== 'roles') throw new Error('Expected a roles game.')
    expect(narrationText(morningNarration(saved))).toBe(`Everyone, open your eyes. The mafia struck, but the doctor saved ${civilian.name}. Everyone survived the night.`)

    const killed = applyAction(game, { type: 'resolveNight', actions: { mafiaTargetId: civilian.id } }, stableRandom)
    if (killed.variant !== 'roles') throw new Error('Expected a roles game.')
    const text = narrationText(morningNarration(killed))
    expect(text).toBe(`Everyone, open your eyes. ${civilian.name} did not survive the night.`)
    expect(text).not.toMatch(/detective|civilian|sheriff/i)
  })
})
