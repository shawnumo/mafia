import { MAX_PLAYERS, MIN_PLAYERS } from './roles'
import type { BaseGameState, Player, PlayerId, RandomSource, Role, Winner } from './types'

export function shuffled<T>(items: readonly T[], random: RandomSource): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

export function validateNames(names: readonly string[]): string[] {
  if (names.length < MIN_PLAYERS || names.length > MAX_PLAYERS) {
    throw new Error('Games require 7 to 15 players.')
  }

  const normalized = names.map((name) => name.trim())
  if (normalized.some((name) => name.length === 0)) throw new Error('Every player needs a name.')
  if (new Set(normalized.map((name) => name.toLocaleLowerCase())).size !== normalized.length) {
    throw new Error('Player names must be unique.')
  }

  return normalized
}

export function playerIds(count: number): PlayerId[] {
  return Array.from({ length: count }, (_, index) => `player-${index + 1}`)
}

export function playerById<R extends Role>(players: ReadonlyArray<Player<R>>, id: PlayerId): Player<R> {
  const player = players.find((candidate) => candidate.id === id)
  if (!player) throw new Error('Unknown player.')
  return player
}

export function alivePlayers<R extends Role>(players: ReadonlyArray<Player<R>>): Array<Player<R>> {
  return players.filter((player) => player.alive)
}

/**
 * Town wins when no mafia remain. Mafia win once they equal or outnumber the town:
 * a single roles night can remove two town players, so parity can be overshot.
 */
export function winnerFor(players: ReadonlyArray<Player>): Winner {
  const mafia = players.filter((player) => player.alive && player.role === 'mafia').length
  const town = players.filter((player) => player.alive && player.role !== 'mafia').length
  if (mafia === 0) return 'town'
  if (mafia >= town) return 'mafia'
  return null
}

export function killPlayers<R extends Role>(players: ReadonlyArray<Player<R>>, ids: ReadonlySet<PlayerId>): Array<Player<R>> {
  return players.map((player) => ids.has(player.id) ? { ...player, alive: false } : player)
}

type DealState = Pick<BaseGameState<Role, string>, 'phase' | 'players' | 'revealIndex' | 'revealConfirmed'>

export function currentDealPlayer<S extends DealState>(state: S): S['players'][number] {
  if (state.phase !== 'deal') throw new Error('There is no active role reveal.')
  return state.players[state.revealIndex]
}

export function confirmDealViewed<S extends DealState>(state: S): S {
  if (state.phase !== 'deal') throw new Error('Role confirmation is only available during the private role reveal.')
  if (state.revealConfirmed) throw new Error('This role is already confirmed.')
  return { ...state, revealConfirmed: true }
}

/** Returns the next deal state, or null when the final player has confirmed and the deal is over. */
export function nextDealState<S extends DealState>(state: S): S | null {
  if (state.phase !== 'deal') throw new Error('The private role reveal is not active.')
  if (!state.revealConfirmed) throw new Error('The current player must confirm their role first.')
  const nextIndex = state.revealIndex + 1
  if (nextIndex >= state.players.length) return null
  return { ...state, revealIndex: nextIndex, revealConfirmed: false }
}

/** "Ada", "Ada and Ben", "Ada, Ben and Cleo". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
