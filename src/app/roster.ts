import type { StorageLike } from './persistence'

export const ROSTER_KEY = 'mafia-game:v1:roster'
export const GROUPS_KEY = 'mafia-game:v1:groups'
export const ROSTER_LIMIT = 40
export const GROUP_LIMIT = 20

/** A remembered player. List order is the seating order around the table. */
export interface RosterEntry {
  id: string
  name: string
  playing: boolean
}

/** A named set of players in seating order, for example "Friday crew". */
export interface SavedGroup {
  id: string
  name: string
  players: string[]
}

let sequence = 0
export function rosterId(prefix = 'p'): string {
  sequence += 1
  return `${prefix}-${Date.now().toString(36)}-${sequence}`
}

function placeholder(index: number): string {
  return `Player ${String(index + 1).padStart(2, '0')}`
}

/** Seven placeholder players, all playing, so a first game can start immediately. */
export function defaultRoster(): RosterEntry[] {
  return Array.from({ length: 7 }, (_, index) => ({ id: rosterId(), name: placeholder(index), playing: true }))
}

export function rosterFromNames(names: readonly string[]): RosterEntry[] {
  return names.map((name) => ({ id: rosterId(), name, playing: true }))
}

export function nextPlaceholder(roster: readonly RosterEntry[]): string {
  const taken = new Set(roster.map((entry) => entry.name.trim().toLocaleLowerCase()))
  for (let index = 0; ; index += 1) {
    const name = placeholder(index)
    if (!taken.has(name.toLocaleLowerCase())) return name
  }
}

export function playingNames(roster: readonly RosterEntry[]): string[] {
  return roster.filter((entry) => entry.playing).map((entry) => entry.name)
}

export function moveEntry(roster: readonly RosterEntry[], id: string, offset: -1 | 1): RosterEntry[] {
  const index = roster.findIndex((entry) => entry.id === id)
  const target = index + offset
  if (index < 0 || target < 0 || target >= roster.length) return [...roster]
  const next = [...roster]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/**
 * Loads a group: its players play tonight in the group's seating order and go first in the list.
 * Group members missing from the roster are added; everyone else stays remembered but sits out.
 */
export function applyGroup(roster: readonly RosterEntry[], group: SavedGroup): RosterEntry[] {
  const byName = new Map(roster.map((entry) => [entry.name.trim().toLocaleLowerCase(), entry]))
  const members = group.players.map((name) => {
    const existing = byName.get(name.trim().toLocaleLowerCase())
    return existing ? { ...existing, playing: true } : { id: rosterId(), name, playing: true }
  })
  const memberIds = new Set(members.map((entry) => entry.id))
  const others = roster.filter((entry) => !memberIds.has(entry.id)).map((entry) => ({ ...entry, playing: false }))
  return [...members, ...others].slice(0, ROSTER_LIMIT)
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/**
 * Reads the roster. The original format was a bare array of 15 seat names with no record of who played;
 * it becomes the first seven seats playing, and untouched "Player 08".."Player 15" placeholders are dropped.
 */
export function loadRoster(storage: StorageLike | null = browserStorage()): RosterEntry[] | null {
  if (!storage) return null
  try {
    const parsed: unknown = JSON.parse(storage.getItem(ROSTER_KEY) ?? 'null')
    if (Array.isArray(parsed) && parsed.every((name) => typeof name === 'string')) {
      return parsed
        .map((name, index) => ({ id: rosterId(), name, playing: index < 7 }))
        .filter((entry, index) => index < 7 || entry.name !== placeholder(index))
    }
    if (typeof parsed === 'object' && parsed !== null && (parsed as { version?: unknown }).version === 2) {
      const players = (parsed as { players?: unknown }).players
      if (!Array.isArray(players)) return null
      const entries = players
        .filter((entry): entry is { name: string; playing: boolean } => typeof entry?.name === 'string' && typeof entry?.playing === 'boolean')
        .slice(0, ROSTER_LIMIT)
        .map((entry) => ({ id: rosterId(), name: entry.name, playing: entry.playing }))
      return entries.length > 0 ? entries : null
    }
    return null
  } catch {
    return null
  }
}

export function saveRoster(roster: readonly RosterEntry[], storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false
  try {
    storage.setItem(ROSTER_KEY, JSON.stringify({ version: 2, players: roster.map(({ name, playing }) => ({ name, playing })) }))
    return true
  } catch {
    return false
  }
}

export function loadGroups(storage: StorageLike | null = browserStorage()): SavedGroup[] {
  if (!storage) return []
  try {
    const parsed: unknown = JSON.parse(storage.getItem(GROUPS_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((group): group is SavedGroup => typeof group?.id === 'string'
      && typeof group.name === 'string'
      && Array.isArray(group.players)
      && group.players.every((name: unknown) => typeof name === 'string')).slice(0, GROUP_LIMIT)
  } catch {
    return []
  }
}

export function saveGroups(groups: readonly SavedGroup[], storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false
  try {
    storage.setItem(GROUPS_KEY, JSON.stringify(groups))
    return true
  } catch {
    return false
  }
}
