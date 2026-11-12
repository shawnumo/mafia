import type { GameAction } from '../game/engine'
import { appendTimelineEntry, previousTimelineEntry, restoreTimelineEntry, updateTimelineNote } from '../game/timeline'
import type { TimelineEntry } from '../game/timeline'
import type { GameState, PlayerId } from '../game/types'
import { activeVotes, lastVoter } from '../game/voting'
import { createTimer, freezeTimer } from './timer'
import type { TimerState } from './timer'

export interface GameSettings {
  discussionSeconds: number
  defenseSeconds: number
  soundAlerts: boolean
  vibrationAlerts: boolean
  /** Speak the night and morning narration with the browser's built-in voice. */
  readAloud: boolean
  /** A short vibration on key confirmations. */
  haptics: boolean
}

/** In-progress night picks. Saved with the session so a reload mid-night keeps them; never part of the engine state. */
export interface NightDraft {
  stepIndex: number
  mafiaTargetId?: PlayerId
  sheriffTargetId?: PlayerId
  sheriffAbstained?: boolean
  detectiveGuessId?: PlayerId
  doctorTargetId?: PlayerId
}

export type Checkpoint = TimelineEntry<GameState, TimerState>

export interface Session {
  /** Stable per game, so the local history can replace a record if an ending is undone and replayed. */
  id: string
  game: GameState
  settings: GameSettings
  timer: TimerState
  nightDraft: NightDraft | null
  timeline: Checkpoint[]
}

export const DEFAULT_SETTINGS: GameSettings = {
  discussionSeconds: 300,
  defenseSeconds: 30,
  soundAlerts: true,
  vibrationAlerts: true,
  readAloud: false,
  haptics: true
}

function timerForPhase(game: GameState, settings: GameSettings): TimerState {
  return game.phase === 'defense'
    ? createTimer('defense', settings.defenseSeconds * 1000)
    : createTimer('discussion', settings.discussionSeconds * 1000)
}

function nextSequence(timeline: readonly Checkpoint[]): number {
  const last = Number(timeline[timeline.length - 1]?.id.split('-').pop())
  return Number.isFinite(last) ? last + 1 : timeline.length
}

function checkpoint(game: GameState, timer: TimerState, label: string, now: number, sequence: number): Checkpoint {
  const timestamp = new Date(now).toISOString()
  return { id: `${now}-${sequence}`, timestamp, label, note: '', game, timer: freezeTimer(timer, now) }
}

export function newSessionId(): string {
  const cryptoApi = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined
  return cryptoApi?.randomUUID ? cryptoApi.randomUUID() : `game-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`
}

export function createSession(game: GameState, settings: GameSettings, id = newSessionId()): Session {
  return { id, game, settings, timer: timerForPhase(game, settings), nightDraft: game.phase === 'night' ? { stepIndex: 0 } : null, timeline: [] }
}

function phaseKey(game: GameState): string {
  return `${game.phase}:${game.runoff?.number ?? 0}:${game.round}`
}

/**
 * Applies an accepted engine result. A phase change resets the timer for the new phase; private-deal
 * steps never create checkpoints, so undo and restore can never land back on a role reveal.
 */
export function commitGame(session: Session, next: GameState, label: string | null, now: number): Session {
  const phaseChanged = phaseKey(session.game) !== phaseKey(next)
  const timer = phaseChanged ? timerForPhase(next, session.settings) : session.timer
  const nightDraft = next.phase === 'night'
    ? (session.game.phase === 'night' && session.nightDraft ? session.nightDraft : { stepIndex: 0 })
    : null
  const timeline = next.phase === 'deal' || label === null
    ? session.timeline
    : appendTimelineEntry(session.timeline, checkpoint(next, timer, label, now, nextSequence(session.timeline)))

  return { ...session, game: next, timer, nightDraft, timeline }
}

export function isRestorable(entry: Checkpoint): boolean {
  return entry.game.phase !== 'deal'
}

export function canUndo(session: Session): boolean {
  const previous = previousTimelineEntry(session.timeline)
  return previous !== null && isRestorable(previous)
}

function applySnapshot(session: Session, game: GameState, timer: TimerState, timeline: Checkpoint[]): Session {
  return { ...session, game, timer, timeline, nightDraft: game.phase === 'night' ? { stepIndex: 0 } : null }
}

export function undoSession(session: Session): Session {
  const previous = previousTimelineEntry(session.timeline)
  if (!previous || !isRestorable(previous)) return session
  return applySnapshot(session, previous.game, previous.timer, session.timeline.slice(0, -1))
}

export function restoreCheckpoint(session: Session, id: string): Session {
  const target = session.timeline.find((entry) => entry.id === id)
  if (!target || !isRestorable(target)) return session
  const result = restoreTimelineEntry(session.timeline, id)
  if (!result.snapshot) return session
  return applySnapshot(session, result.snapshot.game, result.snapshot.timer, result.entries)
}

export function setCheckpointNote(session: Session, id: string, note: string): Session {
  return { ...session, timeline: updateTimelineNote(session.timeline, id, note) }
}

export function setTimer(session: Session, timer: TimerState): Session {
  return { ...session, timer }
}

export function setNightDraft(session: Session, nightDraft: NightDraft): Session {
  return session.game.phase === 'night' ? { ...session, nightDraft } : session
}

function nameOf(game: GameState, id: PlayerId | null | undefined): string {
  return game.players.find((player) => player.id === id)?.name ?? 'Unknown player'
}

function dayLabel(game: GameState): string {
  return game.variant === 'roles' ? `Day ${game.round}` : `Round ${game.round}`
}

function outcomeLabel(next: GameState): string {
  if (next.phase === 'defense' && next.runoff) {
    return `Tie: ${next.runoff.candidates.map((id) => nameOf(next, id)).join(', ')}`
  }
  return `Voted out: ${nameOf(next, next.revealedPlayerId)}`
}

function winnerLabel(next: GameState): string {
  return `Game over · ${next.winner === 'mafia' ? 'Mafia' : 'Town'} wins`
}

/** Neutral checkpoint labels. They name public events only and never include a secret role. */
export function describeAction(action: GameAction, previous: GameState, next: GameState): string | null {
  switch (action.type) {
    case 'confirmRoleViewed':
      return null
    case 'advanceReveal':
      return next.phase === 'deal' ? null : `Game started · ${next.players.length} players · ${next.variant === 'roles' ? 'roles' : 'no roles'}`
    case 'startVoting':
      return `${dayLabel(next)} · voting started`
    case 'castVote':
      return `Vote: ${nameOf(next, action.voterId)} → ${nameOf(next, action.targetId)}`
    case 'retractVote': {
      const voterId = lastVoter(previous)
      const targetId = voterId ? activeVotes(previous)[voterId] : null
      return `Correction: ${nameOf(previous, voterId)}'s vote for ${nameOf(previous, targetId)} withdrawn`
    }
    case 'resolveVote':
    case 'resolveRunoff':
      return outcomeLabel(next)
    case 'startRunoff':
      return `Runoff ${next.runoff?.number ?? 1} started`
    case 'confirmElimination':
      if (next.phase === 'ended') return winnerLabel(next)
      return next.variant === 'roles' ? `Night ${next.round} started` : `Round ${next.round} discussion`
    case 'resolveNight':
      return `Night ${previous.round} resolved`
    case 'startDay':
      return next.phase === 'ended' ? winnerLabel(next) : `Day ${next.round} started`
  }
}
