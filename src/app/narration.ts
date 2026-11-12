import { joinNames } from '../game/core'
import { nightSteps } from '../game/rolesEngine'
import type { NightStep } from '../game/rolesEngine'
import type { RolesGameState } from '../game/types'

export interface NarrationLine {
  text: string
  /** Silence after this line, so the table has time to act. */
  pauseAfterMs: number
}

const NIGHT_ORDER: readonly NightStep[] = ['mafia', 'sheriff', 'detective', 'doctor']

const titles: Record<NightStep, string> = {
  mafia: 'Mafia',
  sheriff: 'Sheriff',
  detective: 'Detective',
  doctor: 'Doctor'
}

const instructions: Record<NightStep, string> = {
  mafia: 'Silently agree on one player to eliminate.',
  sheriff: 'Point at someone to shoot, or shake your head to hold fire.',
  detective: 'Point at the player you suspect.',
  doctor: 'Point at one player to protect. You may choose yourself.'
}

/** How long a "phantom" call waits, so a dead role's turn sounds exactly like a live one. */
export const PHANTOM_PAUSE_MS = 7000

const line = (text: string, pauseAfterMs = 1200): NarrationLine => ({ text, pauseAfterMs })

export function openLines(step: NightStep): NarrationLine[] {
  return [line(`${titles[step]}, open your eyes.`), line(instructions[step], 400)]
}

export function closeLines(step: NightStep): NarrationLine[] {
  return [line(`${titles[step]}, close your eyes.`, 1500)]
}

/**
 * Roles that were dealt but have no living holder. They are still called aloud with a pause, so the
 * table cannot tell from the narration that the doctor or sheriff died in the night.
 */
export function phantomSteps(game: RolesGameState): NightStep[] {
  const live = new Set(nightSteps(game))
  const dealt = new Set(game.players.map((player) => player.role))
  return NIGHT_ORDER.filter((step) => step !== 'mafia' && dealt.has(step) && !live.has(step))
}

function phantomBetween(game: RolesGameState, from: NightStep | null, to: NightStep | null): NightStep[] {
  const start = from ? NIGHT_ORDER.indexOf(from) : -1
  const end = to ? NIGHT_ORDER.indexOf(to) : NIGHT_ORDER.length
  return phantomSteps(game).filter((step) => {
    const position = NIGHT_ORDER.indexOf(step)
    return position > start && position < end
  })
}

function phantomCall(step: NightStep): NarrationLine[] {
  const [open, instruction] = openLines(step)
  return [open, { ...instruction, pauseAfterMs: PHANTOM_PAUSE_MS }, ...closeLines(step)]
}

/** Spoken when the night begins: everyone sleeps, then the first role wakes. */
export function nightStartNarration(game: RolesGameState): NarrationLine[] {
  const first = nightSteps(game)[0]
  return [line('Night falls. Everyone, close your eyes.', 2500), ...phantomBetween(game, null, first).flatMap(phantomCall), ...openLines(first)]
}

/** Spoken when a live step ends: the role sleeps, then any dead roles before `next` are called as usual. */
export function afterStepNarration(game: RolesGameState, from: NightStep, next: NightStep | null): NarrationLine[] {
  return [...closeLines(from), ...phantomBetween(game, from, next).flatMap(phantomCall)]
}

/** Spoken between two live steps (or after the last one when `to` is null), including any phantom calls. */
export function transitionNarration(game: RolesGameState, from: NightStep, to: NightStep | null): NarrationLine[] {
  return [...afterStepNarration(game, from, to), ...(to ? openLines(to) : [])]
}

/** Lines the GM reads to arrive at the current step. */
export function stepNarration(game: RolesGameState, stepIndex: number): NarrationLine[] {
  const steps = nightSteps(game)
  return stepIndex === 0 ? nightStartNarration(game) : transitionNarration(game, steps[stepIndex - 1], steps[stepIndex])
}

/** Public morning announcement: deaths by name and a successful save. Never a role or the detective. */
export function morningNarration(game: RolesGameState): NarrationLine[] {
  const nameOf = (id: string) => game.players.find((player) => player.id === id)?.name ?? 'Someone'
  const deaths = (game.nightSummary?.deaths ?? []).map(nameOf)
  const saved = game.nightSummary?.savedPlayerId ? nameOf(game.nightSummary.savedPlayerId) : null
  return [
    line('Everyone, open your eyes.', 1500),
    ...(saved ? [line(`The mafia struck, but the doctor saved ${saved}.`)] : []),
    line(deaths.length > 0 ? `${joinNames(deaths)} did not survive the night.` : 'Everyone survived the night.')
  ]
}

export function narrationText(lines: readonly NarrationLine[]): string {
  return lines.map((entry) => entry.text).join(' ')
}
