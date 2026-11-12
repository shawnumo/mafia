import type { Role, Variant } from '../game/types'
import type { StorageLike } from './persistence'
import type { Session } from './session'

export const HISTORY_KEY = 'mafia-game:v1:history'
export const HISTORY_LIMIT = 200

/** One finished game, kept on this device only. Roles are stored because the game is over and public. */
export interface GameRecord {
  id: string
  endedAt: string
  variant: Variant
  winner: 'mafia' | 'town'
  rounds: number
  players: Array<{ name: string; role: Role; survived: boolean }>
}

export interface RoleStats {
  games: number
  wins: number
}

export interface PlayerStats {
  name: string
  games: number
  wins: number
  survived: number
  roles: Partial<Record<Role, number>>
}

export interface Stats {
  games: number
  townWins: number
  mafiaWins: number
  byRole: Partial<Record<Role, RoleStats>>
  players: PlayerStats[]
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function recordFromSession(session: Session, now: number): GameRecord | null {
  const { game } = session
  if (game.phase !== 'ended' || !game.winner) return null
  return {
    id: session.id,
    endedAt: new Date(now).toISOString(),
    variant: game.variant,
    winner: game.winner,
    rounds: game.round,
    players: game.players.map((player) => ({ name: player.name, role: player.role, survived: player.alive }))
  }
}

/** Newest first; replaces an earlier record for the same game (for example after an undo and a new ending). */
export function upsertRecord(history: readonly GameRecord[], record: GameRecord): GameRecord[] {
  return [record, ...history.filter((entry) => entry.id !== record.id)].slice(0, HISTORY_LIMIT)
}

export function removeRecord(history: readonly GameRecord[], id: string): GameRecord[] {
  return history.filter((entry) => entry.id !== id)
}

function isRecord(value: unknown): value is GameRecord {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<GameRecord>
  return typeof candidate.id === 'string'
    && typeof candidate.endedAt === 'string'
    && (candidate.variant === 'roleless' || candidate.variant === 'roles')
    && (candidate.winner === 'mafia' || candidate.winner === 'town')
    && typeof candidate.rounds === 'number'
    && Array.isArray(candidate.players)
    && candidate.players.every((player) => typeof player?.name === 'string' && typeof player.role === 'string' && typeof player.survived === 'boolean')
}

export function loadHistory(storage: StorageLike | null = browserStorage()): GameRecord[] {
  if (!storage) return []
  try {
    const parsed: unknown = JSON.parse(storage.getItem(HISTORY_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isRecord).slice(0, HISTORY_LIMIT) : []
  } catch {
    return []
  }
}

export function saveHistory(history: readonly GameRecord[], storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify(history))
    return true
  } catch {
    return false
  }
}

function won(role: Role, winner: 'mafia' | 'town'): boolean {
  return (role === 'mafia') === (winner === 'mafia')
}

/** Win rates overall, by role, and by player (matched by name, ignoring case). */
export function computeStats(history: readonly GameRecord[]): Stats {
  const byRole: Partial<Record<Role, RoleStats>> = {}
  const players = new Map<string, PlayerStats>()

  for (const game of history) {
    for (const player of game.players) {
      const win = won(player.role, game.winner)
      const role = byRole[player.role] ?? { games: 0, wins: 0 }
      byRole[player.role] = { games: role.games + 1, wins: role.wins + Number(win) }

      const key = player.name.trim().toLocaleLowerCase()
      const current = players.get(key) ?? { name: player.name.trim(), games: 0, wins: 0, survived: 0, roles: {} }
      players.set(key, {
        name: current.name,
        games: current.games + 1,
        wins: current.wins + Number(win),
        survived: current.survived + Number(player.survived),
        roles: { ...current.roles, [player.role]: (current.roles[player.role] ?? 0) + 1 }
      })
    }
  }

  return {
    games: history.length,
    townWins: history.filter((game) => game.winner === 'town').length,
    mafiaWins: history.filter((game) => game.winner === 'mafia').length,
    byRole,
    players: [...players.values()].sort((left, right) => right.games - left.games || right.wins - left.wins || left.name.localeCompare(right.name))
  }
}
