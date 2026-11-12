import type { Role } from '../game/types'

const onDark: Record<Role, string> = {
  mafia: 'text-red-400',
  doctor: 'text-green-400',
  sheriff: 'text-yellow-300',
  detective: 'text-sky-300',
  civilian: 'text-paper/75'
}

const onLight: Record<Role, string> = {
  mafia: 'text-red-700',
  doctor: 'text-green-700',
  sheriff: 'text-yellow-800',
  detective: 'text-blue-700',
  civilian: 'text-ink/70'
}

export function roleTextClass(role: Role, darkSurface = false): string {
  return (darkSurface ? onDark : onLight)[role]
}
