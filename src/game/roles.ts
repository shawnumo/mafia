import type { RoleCounts, SetupOptions } from './types'

export function defaultMafiaCount(playerCount: number): number {
  if (playerCount < 7 || playerCount > 15) {
    throw new Error('Mafia games require 7 to 15 players.')
  }

  return playerCount >= 14 ? 4 : playerCount >= 9 ? 3 : 2
}

export function getRoleCounts(options: SetupOptions): RoleCounts {
  const mafia = options.mafiaOverride ?? defaultMafiaCount(options.playerCount)
  const doctor = options.variant === 'roles' && options.doctorEnabled !== false ? 1 : 0
  const detectiveDefault = options.playerCount >= 9
  const detective = options.variant === 'roles' && (options.detectiveEnabled ?? detectiveDefault) ? 1 : 0
  const sheriff = options.variant === 'roles' && options.sheriffEnabled ? 1 : 0
  const civilian = options.playerCount - mafia - doctor - detective - sheriff

  if (mafia < 1 || civilian < 0) {
    throw new Error('The selected role mix does not fit the player count.')
  }

  return { mafia, doctor, detective, sheriff, civilian }
}
