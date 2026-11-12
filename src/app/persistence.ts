import { MAX_PLAYERS, MIN_PLAYERS } from '../game/roles'
import { TIMELINE_LIMIT } from '../game/timeline'
import { ROLELESS_PHASES, ROLES_PHASES } from '../game/types'
import type { GameState, PlayerId, Role } from '../game/types'
import { commitGame, DEFAULT_SETTINGS, newSessionId } from './session'
import type { Checkpoint, GameSettings, NightDraft, Session } from './session'
import { createTimer } from './timer'
import type { TimerState } from './timer'

export const ACTIVE_GAME_KEY = 'mafia-game:v1:active'
export const RECOVERY_KEY = `${ACTIVE_GAME_KEY}:recovery`
export const SNAPSHOT_VERSION = 2

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface LoadResult {
  session: Session | null
  /** True when an unreadable save was moved to the recovery key, so the UI can say so. */
  recovered: boolean
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isInteger(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

const ROLELESS_ROLES: readonly Role[] = ['mafia', 'civilian']
const ALL_ROLES: readonly Role[] = ['mafia', 'doctor', 'detective', 'sheriff', 'civilian']

function playerIdSet(value: unknown, roles: readonly Role[]): Set<PlayerId> | null {
  if (!Array.isArray(value) || value.length < MIN_PLAYERS || value.length > MAX_PLAYERS) return null
  const ids = new Set<PlayerId>()
  for (const player of value) {
    if (!isRecord(player)
      || typeof player.id !== 'string'
      || typeof player.name !== 'string'
      || player.name.trim().length === 0
      || typeof player.alive !== 'boolean'
      || !roles.includes(player.role as Role)
      || ids.has(player.id)) return null
    ids.add(player.id)
  }
  return ids
}

function isIdList(value: unknown, ids: Set<PlayerId>): value is PlayerId[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string' && ids.has(id))
}

function isVoteMap(value: unknown, ids: Set<PlayerId>): boolean {
  return isRecord(value) && Object.entries(value).every(([voter, target]) => ids.has(voter) && typeof target === 'string' && ids.has(target))
}

function isOptionalId(value: unknown, ids: Set<PlayerId>): boolean {
  return value === null || (typeof value === 'string' && ids.has(value))
}

/** Full structural check, so a tampered or stale save can never render a blank screen. */
export function isGameState(value: unknown): value is GameState {
  if (!isRecord(value)) return false
  const roles = value.variant === 'roleless' ? ROLELESS_ROLES : value.variant === 'roles' ? ALL_ROLES : null
  const phases: readonly string[] = value.variant === 'roleless' ? ROLELESS_PHASES : ROLES_PHASES
  if (!roles || typeof value.phase !== 'string' || !phases.includes(value.phase)) return false

  const ids = playerIdSet(value.players, roles)
  if (!ids) return false

  const runoff = value.runoff
  const runoffValid = runoff === null || (isRecord(runoff)
    && isIdList(runoff.candidates, ids)
    && runoff.candidates.length >= 2
    && isIdList(runoff.eligibleVoters, ids)
    && isVoteMap(runoff.votes, ids)
    && isInteger(runoff.number, 1))

  const commonValid = isInteger(value.round, 1)
    && isInteger(value.revealIndex, 0, ids.size - 1)
    && typeof value.revealConfirmed === 'boolean'
    && isIdList(value.votingOrder, ids)
    && isVoteMap(value.votes, ids)
    && runoffValid
    && isOptionalId(value.revealedPlayerId, ids)
    && (value.winner === null || value.winner === 'mafia' || value.winner === 'town')
    && (value.phase !== 'reveal' || value.revealedPlayerId !== null)
    && ((value.phase !== 'defense' && value.phase !== 'runoff') || value.runoff !== null)
    && (value.phase !== 'ended' || value.winner !== null)
  if (!commonValid) return false
  if (value.variant === 'roleless') return true

  const summary = value.nightSummary
  return (summary === null || (isRecord(summary) && isIdList(summary.deaths, ids) && isOptionalId(summary.savedPlayerId, ids)))
    && Array.isArray(value.eventLog)
    && value.eventLog.every((event) => typeof event === 'string')
}

export function isTimerState(value: unknown): value is TimerState {
  return isRecord(value)
    && (value.mode === 'discussion' || value.mode === 'defense')
    && isInteger(value.durationMs, 0)
    && (value.endsAt === null || (typeof value.endsAt === 'number' && Number.isFinite(value.endsAt)))
    && typeof value.remainingMs === 'number' && Number.isFinite(value.remainingMs) && value.remainingMs >= 0
    && isInteger(value.defenseCandidateIndex, 0)
}

/** Settings added after a save was written fall back to their defaults instead of failing the load. */
function normalizeSettings(value: unknown): GameSettings | null {
  if (!isRecord(value)) return null
  const settings = { ...DEFAULT_SETTINGS, ...value }
  const valid = isInteger(settings.discussionSeconds, 60, 1800)
    && isInteger(settings.defenseSeconds, 5, 300)
    && typeof settings.soundAlerts === 'boolean'
    && typeof settings.vibrationAlerts === 'boolean'
    && typeof settings.readAloud === 'boolean'
    && typeof settings.haptics === 'boolean'
  return valid ? {
    discussionSeconds: settings.discussionSeconds,
    defenseSeconds: settings.defenseSeconds,
    soundAlerts: settings.soundAlerts,
    vibrationAlerts: settings.vibrationAlerts,
    readAloud: settings.readAloud,
    haptics: settings.haptics
  } : null
}

function isNightDraft(value: unknown, ids: Set<PlayerId>): value is NightDraft {
  if (!isRecord(value) || !isInteger(value.stepIndex, 0, 3)) return false
  const idFields = ['mafiaTargetId', 'sheriffTargetId', 'detectiveGuessId', 'doctorTargetId'] as const
  return idFields.every((field) => value[field] === undefined || (typeof value[field] === 'string' && ids.has(value[field] as string)))
    && (value.sheriffAbstained === undefined || typeof value.sheriffAbstained === 'boolean')
}

function isCheckpoint(value: unknown): value is Checkpoint {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.timestamp === 'string'
    && typeof value.label === 'string'
    && typeof value.note === 'string'
    && isGameState(value.game)
    && isTimerState(value.timer)
}

function validateSession(value: unknown): Session {
  if (!isRecord(value) || !isGameState(value.game)) throw new Error('Saved game is incompatible.')
  const ids = new Set(value.game.players.map((player) => player.id))
  const settings = normalizeSettings(value.settings)
  if (!settings
    || (value.id !== undefined && typeof value.id !== 'string')
    || !isTimerState(value.timer)
    || !(value.nightDraft === null || isNightDraft(value.nightDraft, ids))
    || !Array.isArray(value.timeline)
    || value.timeline.length > TIMELINE_LIMIT
    || !value.timeline.every(isCheckpoint)) {
    throw new Error('Saved game is incompatible.')
  }
  return { ...(value as unknown as Session), id: typeof value.id === 'string' ? value.id : legacySessionId(value as unknown as Session), settings }
}

/** Saves written before sessions had ids get a stable one, so reloading never creates a second history entry. */
function legacySessionId(session: Pick<Session, 'game' | 'timeline'>): string {
  const anchor = session.timeline[0]?.id ?? session.game.players.map((player) => player.name).join('|')
  return `legacy-${anchor}`
}

// ---- Version 1 migration -------------------------------------------------------------------

function migrateGameV1(value: unknown): GameState | null {
  if (!isRecord(value)) return null
  if (value.variant === 'roleless') {
    const { roleRevealIndex, roleRevealConfirmed, roleRevealComplete, ...rest } = value
    const migrated = {
      ...rest,
      phase: roleRevealComplete === false ? 'deal' : rest.phase,
      revealIndex: roleRevealComplete === false ? roleRevealIndex : 0,
      revealConfirmed: roleRevealComplete === false ? roleRevealConfirmed : false,
      revealedPlayerId: rest.revealedPlayerId ?? null
    }
    return isGameState(migrated) ? migrated : null
  }
  if (value.variant === 'roles') {
    const summary = isRecord(value.nightSummary) ? { deaths: value.nightSummary.deaths, savedPlayerId: value.nightSummary.savedPlayerId } : null
    const migrated = {
      ...value,
      phase: value.phase === 'reveal' && value.revealedPlayerId === null ? 'deal' : value.phase,
      nightSummary: summary
    }
    return isGameState(migrated) ? migrated : null
  }
  return null
}

function migrateTimerV1(value: unknown, settings: GameSettings): TimerState {
  if (!isRecord(value) || (value.mode !== 'discussion' && value.mode !== 'defense')) {
    return createTimer('discussion', settings.discussionSeconds * 1000)
  }
  const durationMs = (value.mode === 'defense' ? settings.defenseSeconds : settings.discussionSeconds) * 1000
  const seconds = typeof value.secondsRemaining === 'number' ? Math.max(0, Math.round(value.secondsRemaining)) : durationMs / 1000
  const index = isInteger(value.defenseCandidateIndex, 0) ? value.defenseCandidateIndex : 0
  return { ...createTimer(value.mode, durationMs, index), remainingMs: Math.min(durationMs, seconds * 1000) }
}

function migrateV1(snapshot: UnknownRecord, now: number): Session {
  const stored = isRecord(snapshot.session) ? snapshot.session : null
  const game = migrateGameV1(stored ? stored.game : snapshot.game)
  if (!game) throw new Error('Saved game is incompatible.')

  const settings: GameSettings = {
    ...DEFAULT_SETTINGS,
    discussionSeconds: stored && isInteger(stored.discussionSeconds, 60, 1800) ? stored.discussionSeconds : DEFAULT_SETTINGS.discussionSeconds,
    defenseSeconds: stored && isInteger(stored.defenseSeconds, 5, 300) ? stored.defenseSeconds : DEFAULT_SETTINGS.defenseSeconds
  }
  const timeline: Checkpoint[] = (stored && Array.isArray(stored.timeline) ? stored.timeline : [])
    .flatMap((entry: unknown) => {
      if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.timestamp !== 'string' || typeof entry.label !== 'string') return []
      const entryGame = migrateGameV1(entry.game)
      if (!entryGame || entryGame.phase === 'deal') return []
      return [{ id: entry.id, timestamp: entry.timestamp, label: entry.label, note: typeof entry.note === 'string' ? entry.note : '', game: entryGame, timer: migrateTimerV1(entry.timer, settings) }]
    })

  const timer = migrateTimerV1(stored?.timer, settings)
  const base: Session = { id: newSessionId(), game, settings, timer, nightDraft: game.phase === 'night' ? { stepIndex: 0 } : null, timeline }
  // Append a checkpoint for the current state so undo steps back from where the GM actually is.
  return commitGame(base, game, game.phase === 'deal' ? null : 'Resumed saved game', now)
}

// ---- Public API ------------------------------------------------------------------------------

export function parseStoredSession(raw: string, now: number): Session {
  const snapshot: unknown = JSON.parse(raw)
  if (!isRecord(snapshot)) throw new Error('Saved game is not an object.')
  if (snapshot.version === SNAPSHOT_VERSION) return validateSession(snapshot.session)
  if (snapshot.version === 1) return validateSession(migrateV1(snapshot, now))
  throw new Error('Saved game version is not supported.')
}

export function loadSession(storage: StorageLike | null = browserStorage(), now = Date.now()): LoadResult {
  if (!storage) return { session: null, recovered: false }
  let raw: string | null
  try {
    raw = storage.getItem(ACTIVE_GAME_KEY)
  } catch {
    return { session: null, recovered: false }
  }
  if (!raw) return { session: null, recovered: false }

  try {
    return { session: parseStoredSession(raw, now), recovered: false }
  } catch {
    try {
      storage.setItem(RECOVERY_KEY, raw)
      storage.removeItem(ACTIVE_GAME_KEY)
    } catch {
      // Storage is unavailable; starting clean is still the safest option.
    }
    return { session: null, recovered: true }
  }
}

/** Returns false instead of throwing when storage is full or blocked (for example Safari private mode). */
export function saveSession(session: Session, storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false
  try {
    storage.setItem(ACTIVE_GAME_KEY, JSON.stringify({ version: SNAPSHOT_VERSION, session }))
    return true
  } catch {
    return false
  }
}

export function clearActiveGame(storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false
  try {
    storage.removeItem(ACTIVE_GAME_KEY)
    return true
  } catch {
    return false
  }
}
