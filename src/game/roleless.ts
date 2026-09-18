import { getRoleCounts } from './roles'
import type { PlayerId, RolelessGameState, RolelessPlayer, RunoffState } from './types'

export type RandomSource = () => number

const defaultRandom: RandomSource = Math.random

function shuffled<T>(items: T[], random: RandomSource): T[] {
  const result = [...items]

  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }

  return result
}

function validateNames(names: string[]): string[] {
  if (names.length < 7 || names.length > 15) {
    throw new Error('Roleless games require 7 to 15 players.')
  }

  const normalized = names.map((name) => name.trim())
  if (normalized.some((name) => name.length === 0)) {
    throw new Error('Every player needs a name.')
  }

  const uniqueNames = new Set(normalized.map((name) => name.toLocaleLowerCase()))
  if (uniqueNames.size !== normalized.length) {
    throw new Error('Player names must be unique.')
  }

  return normalized
}

function alivePlayers(state: RolelessGameState): RolelessPlayer[] {
  return state.players.filter((player) => player.alive)
}

function assertPlayer(state: RolelessGameState, playerId: PlayerId): RolelessPlayer {
  const player = state.players.find((candidate) => candidate.id === playerId)
  if (!player) {
    throw new Error('Unknown player.')
  }

  return player
}

function assertAlive(state: RolelessGameState, playerId: PlayerId): RolelessPlayer {
  const player = assertPlayer(state, playerId)
  if (!player.alive) {
    throw new Error('Dead players cannot vote.')
  }

  return player
}

function checkWinner(players: RolelessPlayer[]) {
  const aliveMafia = players.filter((player) => player.alive && player.role === 'mafia').length
  const aliveTown = players.filter((player) => player.alive && player.role === 'civilian').length

  if (aliveMafia === 0) return 'town' as const
  if (aliveMafia === aliveTown) return 'mafia' as const
  return null
}

function nextVotingOrder(state: RolelessGameState, voters: PlayerId[], random: RandomSource): PlayerId[] {
  return shuffled(voters, random)
}

function emptyRunoff(candidates: PlayerId[], state: RolelessGameState, random: RandomSource, number: number): RunoffState {
  const tied = new Set(candidates)
  const eligibleVoters = alivePlayers(state).map((player) => player.id).filter((id) => !tied.has(id))

  return {
    candidates: [...candidates],
    eligibleVoters,
    votes: {},
    number
  }
}

function withElimination(state: RolelessGameState, eliminatedId: PlayerId): RolelessGameState {
  const players = state.players.map((player) => player.id === eliminatedId ? { ...player, alive: false } : player)

  return {
    ...state,
    players,
    phase: 'reveal',
    revealedPlayerId: eliminatedId,
    runoff: null,
    votes: {},
    votingOrder: [],
    winner: checkWinner(players)
  }
}

function tally(votes: Record<PlayerId, PlayerId>): Map<PlayerId, number> {
  const result = new Map<PlayerId, number>()
  Object.values(votes).forEach((targetId) => result.set(targetId, (result.get(targetId) ?? 0) + 1))
  return result
}

function leaders(votes: Record<PlayerId, PlayerId>, candidates: PlayerId[]): PlayerId[] {
  const counts = tally(votes)
  const highest = Math.max(...candidates.map((candidate) => counts.get(candidate) ?? 0))
  return candidates.filter((candidate) => (counts.get(candidate) ?? 0) === highest)
}

export function createRolelessGame(names: string[], mafiaOverride?: number, random: RandomSource = defaultRandom): RolelessGameState {
  const normalizedNames = validateNames(names)
  const roleCounts = getRoleCounts({ playerCount: normalizedNames.length, variant: 'roleless', mafiaOverride })
  const ids = normalizedNames.map((_, index) => `player-${index + 1}`)
  const mafiaIds = new Set(shuffled(ids, random).slice(0, roleCounts.mafia))
  const players = normalizedNames.map((name, index) => ({
    id: ids[index],
    name,
    role: mafiaIds.has(ids[index]) ? 'mafia' as const : 'civilian' as const,
    alive: true
  }))

  return {
    variant: 'roleless',
    phase: 'discussion',
    round: 1,
    players,
    votingOrder: [],
    votes: {},
    runoff: null,
    revealedPlayerId: null,
    winner: null
  }
}

export function startVoting(state: RolelessGameState, random: RandomSource = defaultRandom): RolelessGameState {
  if (state.phase !== 'discussion') throw new Error('Voting can only start from discussion.')
  const voters = alivePlayers(state).map((player) => player.id)

  return { ...state, phase: 'voting', votingOrder: nextVotingOrder(state, voters, random), votes: {} }
}

export function castVote(state: RolelessGameState, voterId: PlayerId, targetId: PlayerId): RolelessGameState {
  if (state.phase !== 'voting' && state.phase !== 'runoff') throw new Error('Votes are not being collected.')
  const voter = assertAlive(state, voterId)
  const target = assertAlive(state, targetId)
  const voteState = state.phase === 'runoff' ? state.runoff : null
  const votes = voteState?.votes ?? state.votes
  const votingOrder = voteState?.eligibleVoters ?? state.votingOrder
  const expectedVoter = votingOrder.find((id) => votes[id] === undefined)

  if (votes[voterId] !== undefined) throw new Error('This player has already voted.')
  if (voter.id !== expectedVoter) throw new Error('Votes must be entered in the displayed order.')
  if (state.phase === 'runoff' && !voteState?.candidates.includes(target.id)) throw new Error('Runoff votes must target a tied player.')

  const nextVotes = { ...votes, [voterId]: targetId }
  if (state.phase === 'runoff') {
    return { ...state, runoff: { ...voteState!, votes: nextVotes } }
  }

  return { ...state, votes: nextVotes }
}

export function resolveVote(state: RolelessGameState): RolelessGameState {
  if (state.phase !== 'voting' || Object.keys(state.votes).length !== state.votingOrder.length) {
    throw new Error('The main vote is not complete.')
  }

  const tied = leaders(state.votes, alivePlayers(state).map((player) => player.id))
  if (tied.length > 1) {
    return { ...state, phase: 'defense', runoff: emptyRunoff(tied, state, defaultRandom, 1), votes: {} }
  }

  return withElimination(state, tied[0])
}

export function startRunoff(state: RolelessGameState, random: RandomSource = defaultRandom): RolelessGameState {
  if (state.phase !== 'defense' || !state.runoff) throw new Error('A runoff defense is not active.')
  const runoff = { ...state.runoff, eligibleVoters: nextVotingOrder(state, state.runoff.eligibleVoters, random), votes: {} }
  return { ...state, phase: 'runoff', runoff }
}

export function resolveRunoff(state: RolelessGameState): RolelessGameState {
  if (state.phase !== 'runoff' || !state.runoff || Object.keys(state.runoff.votes).length !== state.runoff.eligibleVoters.length) {
    throw new Error('The runoff is not complete.')
  }

  const tied = leaders(state.runoff.votes, state.runoff.candidates)
  if (tied.length > 1) {
    return { ...state, phase: 'defense', runoff: emptyRunoff(tied, state, defaultRandom, state.runoff.number + 1) }
  }

  return withElimination(state, tied[0])
}

export function confirmReveal(state: RolelessGameState): RolelessGameState {
  if (state.phase !== 'reveal' || !state.revealedPlayerId) throw new Error('There is no elimination to reveal.')
  if (state.winner) return { ...state, phase: 'ended' }

  return { ...state, phase: 'discussion', round: state.round + 1, revealedPlayerId: null }
}

export function publicPlayers(state: RolelessGameState): Array<Pick<RolelessPlayer, 'id' | 'name' | 'alive'>> {
  return state.players.map(({ id, name, alive }) => ({ id, name, alive }))
}