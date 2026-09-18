import { describe, expect, it } from 'vitest'
import {
  castVote,
  confirmReveal,
  createRolelessGame,
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
  return state.votingOrder.reduce((current, voterId) => castVote(current, voterId, targetId), state)
}

describe('roleless game engine', () => {
  it('creates a roleless game with deterministic mafia assignment and no public role leak', () => {
    const state = createRolelessGame(names, undefined, stableRandom)

    expect(state.phase).toBe('discussion')
    expect(state.players.filter((player) => player.role === 'mafia')).toHaveLength(2)
    expect(publicPlayers(state)).toEqual(state.players.map(({ id, name, alive }) => ({ id, name, alive })))
    expect(JSON.stringify(publicPlayers(state))).not.toContain('mafia')
  })

  it('rejects invalid rosters', () => {
    expect(() => createRolelessGame(['Ada', 'Ben'])).toThrow('7 to 15')
    expect(() => createRolelessGame([...names.slice(0, 6), 'Ada'])).toThrow('unique')
    expect(() => createRolelessGame([...names.slice(0, 6), ''])).toThrow('name')
  })

  it('collects one live vote per player in randomized order and eliminates the plurality leader', () => {
    const state = startVoting(createRolelessGame(names, undefined, stableRandom), stableRandom)
    const targetId = state.players[0].id
    const voted = voteFor(state, targetId)
    const resolved = resolveVote(voted)

    expect(voted.votes).toHaveProperty(state.votingOrder[0], targetId)
    expect(resolved.phase).toBe('reveal')
    expect(resolved.revealedPlayerId).toBe(targetId)
    expect(resolved.players.find((player) => player.id === targetId)?.alive).toBe(false)
  })

  it('enforces the displayed order and rejects voting for dead players', () => {
    const state = startVoting(createRolelessGame(names, undefined, stableRandom), stableRandom)
    const firstVoter = state.votingOrder[0]
    const secondVoter = state.votingOrder[1]
    const targetId = state.players[0].id

    expect(() => castVote(state, secondVoter, targetId)).toThrow('displayed order')
    const next = castVote(state, firstVoter, targetId)
    expect(() => castVote(next, firstVoter, targetId)).toThrow('already voted')
  })

  it('runs a runoff excluding all tied candidates and repeats until broken', () => {
    const state = startVoting(createRolelessGame(names, undefined, stableRandom), stableRandom)
    const [first, second, third, fourth, fifth, sixth, seventh] = state.votingOrder
    const tiedVoteTargets = [first, first, second, second, third, third, fourth]
    const voted = state.votingOrder.reduce((current, voterId, index) => castVote(current, voterId, tiedVoteTargets[index]), state)
    const defense = resolveVote(voted)

    expect(defense.phase).toBe('defense')
    expect(defense.runoff?.candidates).toEqual([first, second, third])

    const runoff = startRunoff(defense, stableRandom)
    expect(runoff.runoff?.eligibleVoters).toEqual([fourth, fifth, sixth, seventh])
    const tiedAgain = runoff.runoff!.eligibleVoters.reduce((current, voterId, index) => castVote(current, voterId, [first, second, first, second][index]), runoff)
    const secondDefense = resolveRunoff(tiedAgain)

    expect(secondDefense.phase).toBe('defense')
    expect(secondDefense.runoff?.number).toBe(2)
    expect(secondDefense.runoff?.candidates).toEqual([first, second])

    const secondRunoff = startRunoff(secondDefense, stableRandom)
    const broken = secondRunoff.runoff!.eligibleVoters.reduce((current, voterId) => castVote(current, voterId, first), secondRunoff)
    expect(resolveRunoff(broken).revealedPlayerId).toBe(first)
  })

  it('detects town and mafia wins immediately after an elimination is revealed', () => {
    const townWinGame = startVoting(createRolelessGame(names, 1, stableRandom), stableRandom)
    const mafiaId = townWinGame.players.find((player) => player.role === 'mafia')!.id
    const townWin = resolveVote(voteFor(townWinGame, mafiaId))
    expect(townWin.winner).toBe('town')
    expect(confirmReveal(townWin).phase).toBe('ended')

    const mafiaWinGame = startVoting(createRolelessGame(names, 3, stableRandom), stableRandom)
    const civilianId = mafiaWinGame.players.find((player) => player.role === 'civilian')!.id
    const mafiaWin = resolveVote(voteFor(mafiaWinGame, civilianId))
    expect(mafiaWin.winner).toBe('mafia')
    expect(mafiaWin.players.filter((player) => player.alive && player.role === 'mafia')).toHaveLength(3)
    expect(mafiaWin.players.filter((player) => player.alive && player.role === 'civilian')).toHaveLength(3)
    expect(confirmReveal(mafiaWin).phase).toBe('ended')
  })
})
