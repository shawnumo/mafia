import { describe, expect, it } from 'vitest'
import { advanceRolelessReveal, confirmRolelessViewed, createRolelessGame, startVoting } from './roleless'
import type { RolelessGameState } from './types'
import { currentVoter, isVoteComplete, lastVoter, recordVote, remainingVoters, retractLastVote, tallyEntries, voteProgress, voteTargets } from './voting'

const names = ['Ada', 'Ben', 'Cleo', 'Dara', 'Eli', 'Faye', 'Gus']
const stableRandom = () => 0.999999

function liveVote(): RolelessGameState {
  let game = createRolelessGame(names, undefined, stableRandom)
  for (let index = 0; index < names.length; index += 1) game = advanceRolelessReveal(confirmRolelessViewed(game))
  return startVoting(game, stableRandom)
}

describe('shared voting helpers', () => {
  it('builds a live tally sorted by count', () => {
    expect(tallyEntries({ a: 'x', b: 'y', c: 'y', d: 'z', e: 'y', f: 'x' })).toEqual([
      { playerId: 'y', count: 3 },
      { playerId: 'x', count: 2 },
      { playerId: 'z', count: 1 }
    ])
    expect(tallyEntries({})).toEqual([])
  })

  it('exposes the current voter, their legal targets, and the remaining queue', () => {
    const game = liveVote()
    const voter = currentVoter(game)!
    expect(voter).toBe(game.votingOrder[0])
    expect(voteTargets(game)).not.toContain(voter)
    expect(voteTargets(game)).toHaveLength(names.length - 1)
    expect(remainingVoters(game)).toEqual(game.votingOrder)

    const next = recordVote(game, voter, voteTargets(game)[0])
    expect(remainingVoters(next)).toEqual(game.votingOrder.slice(1))
    expect(isVoteComplete(next)).toBe(false)
  })

  it('excludes dead players from targets and reports completion', () => {
    const game = liveVote()
    const dead = game.players[6].id
    const withDead = { ...game, players: game.players.map((player) => player.id === dead ? { ...player, alive: false } : player), votingOrder: game.votingOrder.filter((id) => id !== dead) }
    expect(voteTargets(withDead)).not.toContain(dead)

    const complete = withDead.votingOrder.reduce((current, voterId) => recordVote(current, voterId, voteTargets(current)[0]), withDead)
    expect(isVoteComplete(complete)).toBe(true)
    expect(currentVoter(complete)).toBeNull()
    expect(voteTargets(complete)).toEqual([])
  })

  it('reports progress and a leader who can no longer be caught', () => {
    const game = liveVote()
    const [a, b] = game.players.map((player) => player.id)
    expect(voteProgress(game)).toMatchObject({ cast: 0, total: 7, remaining: 7, majority: 4, leaders: [], clinchedId: null })

    // Five of seven votes for A (voters who are A vote for B instead).
    let current = game
    for (let index = 0; index < 5; index += 1) {
      const voter = currentVoter(current)!
      current = recordVote(current, voter, voter === a ? b : a)
    }
    const progress = voteProgress(current)
    expect(progress).toMatchObject({ cast: 5, remaining: 2 })
    expect(progress.leaders).toEqual([a])
    // A leads 4-1 or 5-0 with two ballots left, so nobody can catch up.
    expect(progress.clinchedId).toBe(a)
  })

  it('does not call a lead clinched while it can still be tied', () => {
    const game = liveVote()
    const [a, b] = game.players.map((player) => player.id)
    const voter = currentVoter(game)!
    const one = recordVote(game, voter, voter === a ? b : a)
    expect(voteProgress(one).clinchedId).toBeNull()
  })

  it('withdraws the most recent ballot so that voter is up again', () => {
    const game = liveVote()
    expect(lastVoter(game)).toBeNull()
    expect(() => retractLastVote(game)).toThrow('no vote to change')

    const first = currentVoter(game)!
    const once = recordVote(game, first, voteTargets(game)[0])
    const second = currentVoter(once)!
    const twice = recordVote(once, second, voteTargets(once)[0])
    expect(lastVoter(twice)).toBe(second)

    const corrected = retractLastVote(twice)
    expect(corrected.votes).toEqual(once.votes)
    expect(currentVoter(corrected)).toBe(second)
  })
})
