import { describe, expect, it } from 'vitest'
import {
  advanceRolelessReveal,
  castVote,
  confirmReveal,
  confirmRolelessViewed,
  createRolelessGame,
  currentRolelessRevealPlayer,
  publicPlayers,
  resolveRunoff,
  resolveVote,
  startRunoff,
  startVoting
} from './roleless'
import type { RolelessGameState } from './types'

const names = ['Ada', 'Ben', 'Cleo', 'Dara', 'Eli', 'Faye', 'Gus']
const stableRandom = () => 0.999999

function voteFor(state: RolelessGameState, targetId: string): RolelessGameState {
  return state.votingOrder.reduce((current, voterId) => {
    const alternateTarget = state.players.find((player) => player.id !== voterId && player.alive)?.id
    return castVote(current, voterId, voterId === targetId ? alternateTarget! : targetId)
  }, state)
}

function completeRoleReveal(state: RolelessGameState): RolelessGameState {
  let current = state
  for (let index = 0; index < current.players.length; index += 1) {
    current = advanceRolelessReveal(confirmRolelessViewed(current))
  }
  return current
}

function liveGame(mafiaOverride?: number): RolelessGameState {
  return startVoting(completeRoleReveal(createRolelessGame(names, mafiaOverride, stableRandom)), stableRandom)
}

describe('roleless game engine', () => {
  it('creates a game in the private deal with deterministic mafia assignment and no public role leak', () => {
    const state = createRolelessGame(names, undefined, stableRandom)

    expect(state.phase).toBe('deal')
    expect(state.revealIndex).toBe(0)
    expect(state.players.filter((player) => player.role === 'mafia')).toHaveLength(2)
    expect(publicPlayers(state)).toEqual(state.players.map(({ id, name, alive }) => ({ id, name, alive })))
    expect(JSON.stringify(publicPlayers(state))).not.toMatch(/mafia|civilian/)
  })

  it('requires every player to confirm their private role before discussion opens', () => {
    const state = createRolelessGame(names, undefined, stableRandom)
    expect(currentRolelessRevealPlayer(state).name).toBe('Ada')
    expect(() => advanceRolelessReveal(state)).toThrow('confirm')
    expect(() => startVoting(state, stableRandom)).toThrow('discussion')

    const revealed = completeRoleReveal(state)
    expect(revealed.phase).toBe('discussion')
    expect(() => currentRolelessRevealPlayer(revealed)).toThrow('no active role reveal')
    expect(() => confirmRolelessViewed(revealed)).toThrow('private role reveal')
    expect(startVoting(revealed, stableRandom).phase).toBe('voting')
  })

  it('rejects invalid rosters', () => {
    expect(() => createRolelessGame(['Ada', 'Ben'], undefined, stableRandom)).toThrow('7 to 15')
    expect(() => createRolelessGame([...names.slice(0, 6), 'Ada'], undefined, stableRandom)).toThrow('unique')
    expect(() => createRolelessGame([...names.slice(0, 6), ''], undefined, stableRandom)).toThrow('name')
  })

  it('collects one live vote per player in randomized order and eliminates the plurality leader', () => {
    const state = liveGame()
    const targetId = state.players[1].id
    const voted = voteFor(state, targetId)
    const resolved = resolveVote(voted)

    expect(voted.votes).toHaveProperty(state.votingOrder[0], targetId)
    expect(resolved.phase).toBe('reveal')
    expect(resolved.revealedPlayerId).toBe(targetId)
    expect(resolved.players.find((player) => player.id === targetId)?.alive).toBe(false)
  })

  it('enforces the displayed order and rejects self and dead targets with clear messages', () => {
    const state = liveGame()
    const [firstVoter, secondVoter] = state.votingOrder
    const targetId = state.players[0].id === firstVoter ? state.players[1].id : state.players[0].id

    expect(() => castVote(state, secondVoter, targetId)).toThrow('displayed order')
    expect(() => castVote(state, firstVoter, firstVoter)).toThrow('themselves')
    const next = castVote(state, firstVoter, targetId)
    expect(() => castVote(next, firstVoter, targetId)).toThrow('already voted')

    const dead = { ...state, players: state.players.map((player) => player.id === targetId ? { ...player, alive: false } : player) }
    expect(() => castVote(dead, firstVoter, targetId)).toThrow('Dead players cannot be voted for.')
  })

  it('runs a runoff excluding all tied candidates and repeats until broken', () => {
    const state = liveGame()
    const [first, second, third, fourth, fifth, sixth, seventh] = state.votingOrder
    const tiedVoteTargets = [second, first, second, first, third, third, fourth]
    const voted = state.votingOrder.reduce((current, voterId, index) => castVote(current, voterId, tiedVoteTargets[index]), state)
    const defense = resolveVote(voted)

    expect(defense.phase).toBe('defense')
    expect(defense.runoff?.candidates).toEqual([first, second, third])

    const runoff = startRunoff(defense, stableRandom)
    expect(new Set(runoff.runoff?.eligibleVoters)).toEqual(new Set([fourth, fifth, sixth, seventh]))
    const tiedAgain = runoff.runoff!.eligibleVoters.reduce((current, voterId, index) => castVote(current, voterId, [first, second, first, second][index]), runoff)
    const secondDefense = resolveRunoff(tiedAgain)

    expect(secondDefense.phase).toBe('defense')
    expect(secondDefense.runoff?.number).toBe(2)
    expect(secondDefense.runoff?.candidates).toEqual([first, second])
    expect(secondDefense.runoff?.eligibleVoters).toContain(third)

    const secondRunoff = startRunoff(secondDefense, stableRandom)
    const broken = secondRunoff.runoff!.eligibleVoters.reduce((current, voterId) => castVote(current, voterId, first), secondRunoff)
    expect(resolveRunoff(broken).revealedPlayerId).toBe(first)
  })

  it('turns a tie of every living player into a full revote instead of a random elimination', () => {
    const game = liveGame()
    const order = game.votingOrder
    const tied = order.reduce((current, voterId, index) => castVote(current, voterId, order[(index + 1) % order.length]), game)
    const defense = resolveVote(tied)
    expect(defense.runoff?.candidates).toHaveLength(order.length)

    const runoff = startRunoff(defense, stableRandom)
    expect(new Set(runoff.runoff?.eligibleVoters)).toEqual(new Set(order))

    const target = order[0]
    const broken = runoff.runoff!.eligibleVoters.reduce((current, voterId) => castVote(current, voterId, voterId === target ? order[1] : target), runoff)
    const resolved = resolveRunoff(broken)
    expect(resolved.phase).toBe('reveal')
    expect(resolved.revealedPlayerId).toBe(target)
  })

  it('detects town and mafia wins immediately after an elimination is revealed', () => {
    const townWinGame = liveGame(1)
    const mafiaId = townWinGame.players.find((player) => player.role === 'mafia')!.id
    const townWin = resolveVote(voteFor(townWinGame, mafiaId))
    expect(townWin.winner).toBe('town')
    expect(confirmReveal(townWin).phase).toBe('ended')

    const mafiaWinGame = liveGame(3)
    const civilianId = mafiaWinGame.players.find((player) => player.role === 'civilian')!.id
    const mafiaWin = resolveVote(voteFor(mafiaWinGame, civilianId))
    expect(mafiaWin.winner).toBe('mafia')
    expect(confirmReveal(mafiaWin).phase).toBe('ended')
  })

  it('advances the round after a non-winning reveal', () => {
    const game = liveGame()
    const civilianId = game.players.find((player) => player.role === 'civilian')!.id
    const next = confirmReveal(resolveVote(voteFor(game, civilianId)))
    expect(next.phase).toBe('discussion')
    expect(next.round).toBe(2)
    expect(next.revealedPlayerId).toBeNull()
  })
})
