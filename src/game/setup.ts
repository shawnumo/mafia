import { defaultDetectiveEnabled, defaultMafiaCount, MAX_PLAYERS, MIN_PLAYERS } from './roles'
import type { SetupOptions } from './types'

const DISCUSSION_MINUTES_RANGE = { min: 1, max: 30 } as const
const DEFENSE_SECONDS_RANGE = { min: 5, max: 300 } as const

export function validateSetup(
  options: SetupOptions,
  playerNames: readonly string[],
  discussionMinutes: number,
  defenseSeconds: number
): string[] {
  const errors: string[] = []

  if (!Number.isInteger(options.playerCount) || options.playerCount < MIN_PLAYERS || options.playerCount > MAX_PLAYERS) {
    errors.push('Choose between 7 and 15 players.')
  } else {
    const activeNames = playerNames.slice(0, options.playerCount).map((name) => name.trim())
    if (activeNames.length !== options.playerCount) errors.push('Add a name for every player seat.')
    if (activeNames.some((name) => name.length === 0)) errors.push('Every player needs a name.')
    if (new Set(activeNames.map((name) => name.toLocaleLowerCase())).size !== activeNames.length) {
      errors.push('Player names must be unique.')
    }

    const defaultMafia = defaultMafiaCount(options.playerCount)
    const selectedMafia = options.mafiaOverride ?? defaultMafia
    if (!Number.isInteger(selectedMafia) || selectedMafia < defaultMafia - 1 || selectedMafia > defaultMafia + 1) {
      errors.push('Mafia count can only vary by one from the default.')
    }

    const specialRoleCount = options.variant === 'roles'
      ? Number(options.doctorEnabled !== false)
        + Number(options.detectiveEnabled ?? defaultDetectiveEnabled(options.playerCount))
        + Number(Boolean(options.sheriffEnabled))
      : 0
    if (selectedMafia < 1 || options.playerCount - selectedMafia - specialRoleCount < 0) {
      errors.push('The selected role mix does not fit the player count.')
    } else if (selectedMafia >= options.playerCount - selectedMafia) {
      errors.push('Mafia must start outnumbered by the town.')
    }
  }

  if (!Number.isInteger(discussionMinutes) || discussionMinutes < DISCUSSION_MINUTES_RANGE.min || discussionMinutes > DISCUSSION_MINUTES_RANGE.max) {
    errors.push('Discussion time must be a whole number between 1 and 30 minutes.')
  }

  if (!Number.isInteger(defenseSeconds) || defenseSeconds < DEFENSE_SECONDS_RANGE.min || defenseSeconds > DEFENSE_SECONDS_RANGE.max) {
    errors.push('Defense time must be a whole number between 5 and 300 seconds.')
  }

  return errors
}
