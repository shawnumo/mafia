import type { Session } from './session'

/**
 * Plain-text summary of a finished game for the share sheet or clipboard. Only built at game end,
 * when every role is public anyway.
 */
export function buildGameReport(session: Session, now = Date.now()): string {
  const { game, timeline } = session
  if (game.phase !== 'ended') throw new Error('The report is available once the game is over.')

  const winner = game.winner === 'mafia' ? 'Mafia' : 'Town'
  const date = new Date(now).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  const variant = game.variant === 'roles' ? 'Roles game' : 'No-roles game'
  const length = game.variant === 'roles' ? `${game.round} ${game.round === 1 ? 'night' : 'nights'}` : `${game.round} ${game.round === 1 ? 'round' : 'rounds'}`

  const roles = game.players.map((player) => `- ${player.name}: ${player.role}${player.alive ? '' : ' (out)'}`)
  const record = game.variant === 'roles'
    ? game.eventLog
    : timeline.map((entry) => entry.label).filter((label) => !label.startsWith('Vote: '))
  const notes = timeline.filter((entry) => entry.note.trim()).map((entry) => `- ${entry.label}: ${entry.note.trim()}`)

  return [
    `Mafia: ${winner} wins`,
    `${variant} · ${game.players.length} players · ${length} · ${date}`,
    '',
    'Final roles',
    ...roles,
    '',
    'Game record',
    ...(record.length > 0 ? record.map((event) => `- ${event}`) : ['- No recorded events.']),
    ...(notes.length > 0 ? ['', 'GM notes', ...notes] : [])
  ].join('\n')
}
