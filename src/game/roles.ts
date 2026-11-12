import type { RoleCounts, SetupOptions } from './types'

export const MIN_PLAYERS = 7
export const MAX_PLAYERS = 15

export function defaultMafiaCount(playerCount: number): number {
  if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new Error('Mafia games require 7 to 15 players.')
  }

  return playerCount >= 14 ? 4 : playerCount >= 9 ? 3 : 2
}

/** The role table includes a detective from 9 players up; the GM may override it either way. */
export function defaultDetectiveEnabled(playerCount: number): boolean {
  return playerCount >= 9
}

export function getRoleCounts(options: SetupOptions): RoleCounts {
  const mafia = options.mafiaOverride ?? defaultMafiaCount(options.playerCount)
  const roles = options.variant === 'roles'
  const doctor = roles && options.doctorEnabled !== false ? 1 : 0
  const detective = roles && (options.detectiveEnabled ?? defaultDetectiveEnabled(options.playerCount)) ? 1 : 0
  const sheriff = roles && options.sheriffEnabled ? 1 : 0
  const civilian = options.playerCount - mafia - doctor - detective - sheriff

  if (mafia < 1 || civilian < 0) {
    throw new Error('The selected role mix does not fit the player count.')
  }

  if (mafia >= options.playerCount - mafia) {
    throw new Error('Mafia must start outnumbered by the town.')
  }

  return { mafia, doctor, detective, sheriff, civilian }
}
