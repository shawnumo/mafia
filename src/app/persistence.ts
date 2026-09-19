import type { RolesGameState } from '../game/rolesEngine'
import type { RolelessGameState } from '../game/types'

export const ACTIVE_GAME_KEY = 'mafia-game:v1:active'
const SNAPSHOT_VERSION = 1

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

interface ActiveGameSnapshot {
  version: typeof SNAPSHOT_VERSION
  variant?: 'roleless' | 'roles'
  game?: RolelessGameState | RolesGameState
  session?: RolelessSession
}

export interface RolelessTimerSnapshot {
  mode: 'discussion' | 'defense'
  secondsRemaining: number
  running: boolean
  defenseCandidateIndex: number
}

export interface RolelessSession {
  game: RolelessGameState
  discussionSeconds: number
  defenseSeconds: number
  timer: RolelessTimerSnapshot
}

function browserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

function isRolelessGameState(value: unknown): value is RolelessGameState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RolelessGameState>
  return candidate.variant === 'roleless'
    && typeof candidate.phase === 'string'
    && typeof candidate.round === 'number'
    && Array.isArray(candidate.players)
    && Array.isArray(candidate.votingOrder)
    && typeof candidate.votes === 'object'
    && (candidate.runoff === null || typeof candidate.runoff === 'object')
    && (candidate.revealedPlayerId === null || typeof candidate.revealedPlayerId === 'string')
    && (candidate.winner === null || candidate.winner === 'mafia' || candidate.winner === 'town')
}

function isRolesGameState(value: unknown): value is RolesGameState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RolesGameState>
  return candidate.variant === 'roles'
    && typeof candidate.phase === 'string'
    && typeof candidate.round === 'number'
    && Array.isArray(candidate.players)
    && typeof candidate.revealIndex === 'number'
    && typeof candidate.revealConfirmed === 'boolean'
    && (candidate.winner === null || candidate.winner === 'mafia' || candidate.winner === 'town')
}

function parseActiveSnapshot(raw: string): ActiveGameSnapshot | null {
  const snapshot: unknown = JSON.parse(raw)
  if (!snapshot || typeof snapshot !== 'object') throw new Error('Snapshot is not an object.')
  return snapshot as ActiveGameSnapshot
}

export function saveRolelessGame(game: RolelessGameState, storage: StorageLike | null = browserStorage()): void {
  if (!storage) return
  storage.setItem(ACTIVE_GAME_KEY, JSON.stringify({ version: SNAPSHOT_VERSION, variant: 'roleless', game }))
}

export function saveRolesGame(game: RolesGameState, storage: StorageLike | null = browserStorage()): void {
  if (!storage) return
  storage.setItem(ACTIVE_GAME_KEY, JSON.stringify({ version: SNAPSHOT_VERSION, variant: 'roles', game }))
}

export function saveRolelessSession(session: RolelessSession, storage: StorageLike | null = browserStorage()): void {
  if (!storage) return
  storage.setItem(ACTIVE_GAME_KEY, JSON.stringify({ version: SNAPSHOT_VERSION, variant: 'roleless', session }))
}

export function loadRolelessGame(storage: StorageLike | null = browserStorage()): RolelessGameState | null {
  if (!storage) return null
  const raw = storage.getItem(ACTIVE_GAME_KEY)
  if (!raw) return null

  try {
    const candidate = parseActiveSnapshot(raw)
    if (!candidate) throw new Error('Snapshot is incompatible.')
    const game = candidate.game
    const variant = candidate.variant ?? (isRolelessGameState(game) ? 'roleless' : undefined)
    if (candidate.version !== SNAPSHOT_VERSION || variant !== 'roleless' || !isRolelessGameState(game)) {
      throw new Error('Snapshot is incompatible.')
    }
    return game
  } catch {
    storage.setItem(`${ACTIVE_GAME_KEY}:recovery`, raw)
    storage.removeItem(ACTIVE_GAME_KEY)
    return null
  }
}

export function loadRolesGame(storage: StorageLike | null = browserStorage()): RolesGameState | null {
  if (!storage) return null
  const raw = storage.getItem(ACTIVE_GAME_KEY)
  if (!raw) return null

  try {
    const candidate = parseActiveSnapshot(raw)
    if (!candidate) throw new Error('Snapshot is incompatible.')
    const game = candidate.game
    const variant = candidate.variant ?? (isRolesGameState(game) ? 'roles' : undefined)
    if (candidate.version !== SNAPSHOT_VERSION || variant !== 'roles' || !isRolesGameState(game)) {
      throw new Error('Snapshot is incompatible.')
    }
    return game
  } catch {
    storage.setItem(`${ACTIVE_GAME_KEY}:recovery`, raw)
    storage.removeItem(ACTIVE_GAME_KEY)
    return null
  }
}

export function loadRolelessSession(storage: StorageLike | null = browserStorage()): RolelessSession | null {
  if (!storage) return null
  const raw = storage.getItem(ACTIVE_GAME_KEY)
  if (!raw) return null

  try {
    const candidate = parseActiveSnapshot(raw)
    if (!candidate) throw new Error('Snapshot is incompatible.')
    const session = candidate.session
    const variant = candidate.variant ?? (session && isRolelessGameState(session.game) ? 'roleless' : undefined)
    if (candidate.version !== SNAPSHOT_VERSION || variant !== 'roleless' || !session || !isRolelessGameState(session.game)
      || typeof session.discussionSeconds !== 'number' || typeof session.defenseSeconds !== 'number'
      || !session.timer || (session.timer.mode !== 'discussion' && session.timer.mode !== 'defense')
      || typeof session.timer.secondsRemaining !== 'number' || typeof session.timer.running !== 'boolean'
      || typeof session.timer.defenseCandidateIndex !== 'number') throw new Error('Snapshot is incompatible.')
    return session as RolelessSession
  } catch {
    storage.setItem(`${ACTIVE_GAME_KEY}:recovery`, raw)
    storage.removeItem(ACTIVE_GAME_KEY)
    return null
  }
}

export function clearActiveGame(storage: StorageLike | null = browserStorage()): void {
  storage?.removeItem(ACTIVE_GAME_KEY)
}
