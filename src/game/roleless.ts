import { confirmDealViewed, currentDealPlayer, nextDealState, playerIds, shuffled, validateNames } from './core'
import { getRoleCounts } from './roles'
import type { PlayerId, RandomSource, RolelessGameState, RolelessPlayer } from './types'
import { beginRunoff, beginVoting, eliminate, enterDefense, mainVoteOutcome, recordVote, retractLastVote, runoffOutcome } from './voting'
import type { VoteOutcome } from './voting'

export function createRolelessGame(names: readonly string[], mafiaOverride: number | undefined, random: RandomSource): RolelessGameState {
  const normalizedNames = validateNames(names)
  const roleCounts = getRoleCounts({ playerCount: normalizedNames.length, variant: 'roleless', mafiaOverride })
  const ids = playerIds(normalizedNames.length)
  const mafiaIds = new Set(shuffled(ids, random).slice(0, roleCounts.mafia))
  const players: RolelessPlayer[] = normalizedNames.map((name, index) => ({
    id: ids[index],
    name,
    role: mafiaIds.has(ids[index]) ? 'mafia' : 'civilian',
    alive: true
  }))

  return {
    variant: 'roleless',
    phase: 'deal',
    round: 1,
    players,
    revealIndex: 0,
    revealConfirmed: false,
    votingOrder: [],
    votes: {},
    runoff: null,
    revealedPlayerId: null,
    winner: null
  }
}

export function currentRolelessRevealPlayer(state: RolelessGameState): RolelessPlayer {
  return currentDealPlayer(state)
}

export function confirmRolelessViewed(state: RolelessGameState): RolelessGameState {
  return confirmDealViewed(state)
}

/** Moves to the next private reveal, or into the first discussion once everyone has confirmed. */
export function advanceRolelessReveal(state: RolelessGameState): RolelessGameState {
  return nextDealState(state) ?? { ...state, phase: 'discussion', revealConfirmed: false }
}

export function startVoting(state: RolelessGameState, random: RandomSource): RolelessGameState {
  return beginVoting(state, random)
}

export function castVote(state: RolelessGameState, voterId: PlayerId, targetId: PlayerId): RolelessGameState {
  return recordVote(state, voterId, targetId)
}

export function retractVote(state: RolelessGameState): RolelessGameState {
  return retractLastVote(state)
}

function applyOutcome(state: RolelessGameState, outcome: VoteOutcome): RolelessGameState {
  return outcome.type === 'tie' ? enterDefense(state, outcome.runoff) : eliminate(state, outcome.playerId)
}

export function resolveVote(state: RolelessGameState): RolelessGameState {
  return applyOutcome(state, mainVoteOutcome(state))
}

export function startRunoff(state: RolelessGameState, random: RandomSource): RolelessGameState {
  return beginRunoff(state, random)
}

export function resolveRunoff(state: RolelessGameState): RolelessGameState {
  return applyOutcome(state, runoffOutcome(state))
}

export function confirmReveal(state: RolelessGameState): RolelessGameState {
  if (state.phase !== 'reveal' || !state.revealedPlayerId) throw new Error('There is no elimination to reveal.')
  if (state.winner) return { ...state, phase: 'ended', revealedPlayerId: null }
  return { ...state, phase: 'discussion', round: state.round + 1, revealedPlayerId: null }
}

export function publicPlayers(state: RolelessGameState): Array<Pick<RolelessPlayer, 'id' | 'name' | 'alive'>> {
  return state.players.map(({ id, name, alive }) => ({ id, name, alive }))
}
