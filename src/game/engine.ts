import { advanceRolelessReveal, castVote, confirmReveal, confirmRolelessViewed, createRolelessGame, resolveRunoff, resolveVote, retractVote, startRunoff, startVoting } from './roleless'
import {
  advanceRoleReveal,
  castRoleVote,
  confirmRoleReveal,
  confirmRoleViewed,
  createRolesGame,
  resolveNight,
  resolveRolesRunoff,
  resolveRolesVote,
  retractRoleVote,
  startRolesDay,
  startRolesRunoff,
  startRolesVoting
} from './rolesEngine'
import type { GameState, NightActions, PlayerId, RandomSource, SetupOptions } from './types'

/** Every GM action the UI can request. The engine validates each one against the current phase. */
export type GameAction =
  | { type: 'confirmRoleViewed' }
  | { type: 'advanceReveal' }
  | { type: 'startVoting' }
  | { type: 'castVote'; voterId: PlayerId; targetId: PlayerId }
  | { type: 'retractVote' }
  | { type: 'resolveVote' }
  | { type: 'startRunoff' }
  | { type: 'resolveRunoff' }
  | { type: 'confirmElimination' }
  | { type: 'resolveNight'; actions: NightActions }
  | { type: 'startDay' }

export interface NewGameOptions extends SetupOptions {
  playerNames: readonly string[]
}

export function createGame(options: NewGameOptions, random: RandomSource): GameState {
  if (options.variant === 'roleless') return createRolelessGame(options.playerNames, options.mafiaOverride, random)
  return createRolesGame(options, random)
}

export function applyAction(state: GameState, action: GameAction, random: RandomSource): GameState {
  if (state.variant === 'roleless') {
    switch (action.type) {
      case 'confirmRoleViewed': return confirmRolelessViewed(state)
      case 'advanceReveal': return advanceRolelessReveal(state)
      case 'startVoting': return startVoting(state, random)
      case 'castVote': return castVote(state, action.voterId, action.targetId)
      case 'retractVote': return retractVote(state)
      case 'resolveVote': return resolveVote(state)
      case 'startRunoff': return startRunoff(state, random)
      case 'resolveRunoff': return resolveRunoff(state)
      case 'confirmElimination': return confirmReveal(state)
      case 'resolveNight':
      case 'startDay':
        throw new Error('Games without roles have no night phase.')
    }
  }

  switch (action.type) {
    case 'confirmRoleViewed': return confirmRoleViewed(state)
    case 'advanceReveal': return advanceRoleReveal(state)
    case 'startVoting': return startRolesVoting(state, random)
    case 'castVote': return castRoleVote(state, action.voterId, action.targetId)
    case 'retractVote': return retractRoleVote(state)
    case 'resolveVote': return resolveRolesVote(state)
    case 'startRunoff': return startRolesRunoff(state, random)
    case 'resolveRunoff': return resolveRolesRunoff(state)
    case 'confirmElimination': return confirmRoleReveal(state)
    case 'resolveNight': return resolveNight(state, action.actions).state
    case 'startDay': return startRolesDay(state)
  }
}
