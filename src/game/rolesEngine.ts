import { getRoleCounts } from './roles'
import type { PlayerId, Role, SetupOptions, Winner } from './types'

export type RolesPhase = 'reveal' | 'discussion' | 'night' | 'morning' | 'ended'
export type RandomSource = () => number

export interface RolesPlayer {
  id: PlayerId
  name: string
  role: Role
  alive: boolean
}

export interface RolesGameState {
  variant: 'roles'
  phase: RolesPhase
  round: number
  players: RolesPlayer[]
  revealIndex: number
  revealConfirmed: boolean
  winner: Winner
}

export interface NightActions {
  mafiaTargetId: PlayerId
  sheriffTargetId?: PlayerId
  detectiveGuessId?: PlayerId
  doctorTargetId?: PlayerId
}

export interface RolesSetupOptions extends Omit<SetupOptions, 'variant'> {
  variant?: 'roles'
  playerNames: string[]
}

export interface NightResolution {
  state: RolesGameState
  deaths: PlayerId[]
  savedPlayerId: PlayerId | null
  detectiveResult: boolean | null
}

function shuffled<T>(items: T[], random: RandomSource): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

function validateNames(names: string[]): string[] {
  if (names.length < 7 || names.length > 15) throw new Error('Roles games require 7 to 15 players.')
  const normalized = names.map((name) => name.trim())
  if (normalized.some((name) => name.length === 0)) throw new Error('Every player needs a name.')
  if (new Set(normalized.map((name) => name.toLocaleLowerCase())).size !== normalized.length) throw new Error('Player names must be unique.')
  return normalized
}

function winnerFor(players: RolesPlayer[]): Winner {
  const mafia = players.filter((player) => player.alive && player.role === 'mafia').length
  const town = players.filter((player) => player.alive && player.role !== 'mafia').length
  if (mafia === 0) return 'town'
  if (mafia === town) return 'mafia'
  return null
}

function playerById(players: RolesPlayer[], id: PlayerId): RolesPlayer {
  const player = players.find((candidate) => candidate.id === id)
  if (!player) throw new Error('Unknown player.')
  return player
}

function alivePlayerById(players: RolesPlayer[], id: PlayerId): RolesPlayer {
  const player = playerById(players, id)
  if (!player.alive) throw new Error('Dead players cannot be selected.')
  return player
}

export function createRolesGame(options: RolesSetupOptions, random: RandomSource = Math.random): RolesGameState {
  const names = validateNames(options.playerNames)
  const roleCounts = getRoleCounts({ ...options, variant: 'roles' })
  const ids = names.map((_, index) => `player-${index + 1}`)
  const shuffledIds = shuffled(ids, random)
  const assignments = new Map<PlayerId, Role>()
  let offset = 0
  const groups: Array<[Role, number]> = [
    ['mafia', roleCounts.mafia],
    ['doctor', roleCounts.doctor],
    ['detective', roleCounts.detective],
    ['sheriff', roleCounts.sheriff],
    ['civilian', roleCounts.civilian]
  ]
  groups.forEach(([role, count]) => {
    shuffledIds.slice(offset, offset + count).forEach((id) => assignments.set(id, role))
    offset += count
  })

  return {
    variant: 'roles',
    phase: 'reveal',
    round: 1,
    players: names.map((name, index) => ({ id: ids[index], name, role: assignments.get(ids[index])!, alive: true })),
    revealIndex: 0,
    revealConfirmed: false,
    winner: null
  }
}

export function currentRevealPlayer(state: RolesGameState): RolesPlayer {
  if (state.phase !== 'reveal') throw new Error('There is no active role reveal.')
  return state.players[state.revealIndex]
}

export function confirmRoleViewed(state: RolesGameState): RolesGameState {
  if (state.phase !== 'reveal') throw new Error('Role confirmation is only available during role reveal.')
  if (state.revealConfirmed) throw new Error('This role is already confirmed.')
  return { ...state, revealConfirmed: true }
}

export function advanceRoleReveal(state: RolesGameState): RolesGameState {
  if (state.phase !== 'reveal') throw new Error('Role reveal is not active.')
  if (!state.revealConfirmed) throw new Error('The current player must confirm their role first.')
  const nextIndex = state.revealIndex + 1
  if (nextIndex >= state.players.length) return { ...state, phase: 'discussion', revealConfirmed: false }
  return { ...state, revealIndex: nextIndex, revealConfirmed: false }
}

export function startRolesDiscussion(state: RolesGameState): RolesGameState {
  if (state.phase !== 'reveal') throw new Error('Discussion can only start after role reveal.')
  return { ...state, phase: 'discussion' }
}

export function startNight(state: RolesGameState): RolesGameState {
  if (state.phase !== 'discussion' && state.phase !== 'morning') throw new Error('Night can only start after a day phase.')
  return { ...state, phase: 'night' }
}

export function resolveNight(state: RolesGameState, actions: NightActions): NightResolution {
  if (state.phase !== 'night') throw new Error('Night actions can only resolve during the night phase.')
  const alivePlayers = state.players.filter((player) => player.alive)
  const mafiaTarget = alivePlayerById(state.players, actions.mafiaTargetId)

  const doctor = alivePlayers.find((player) => player.role === 'doctor')
  const detective = alivePlayers.find((player) => player.role === 'detective')
  const sheriff = alivePlayers.find((player) => player.role === 'sheriff')
  if (!doctor && actions.doctorTargetId) throw new Error('There is no living doctor.')
  if (!detective && actions.detectiveGuessId) throw new Error('There is no living detective.')
  if (!sheriff && actions.sheriffTargetId) throw new Error('There is no living sheriff.')
  const doctorTarget = actions.doctorTargetId ? alivePlayerById(state.players, actions.doctorTargetId) : null
  const protectedMafiaTarget = doctorTarget?.id === mafiaTarget.id
  const deaths = new Set<PlayerId>()
  let savedPlayerId: PlayerId | null = protectedMafiaTarget ? mafiaTarget.id : null

  if (!protectedMafiaTarget) deaths.add(mafiaTarget.id)

  if (sheriff && actions.sheriffTargetId) {
    const sheriffTarget = alivePlayerById(state.players, actions.sheriffTargetId)
    if (sheriffTarget.role === 'mafia') deaths.add(sheriffTarget.id)
    else deaths.add(sheriff.id)
  }

  const players = state.players.map((player) => deaths.has(player.id) ? { ...player, alive: false } : player)
  const detectiveResult = detective && actions.detectiveGuessId ? playerById(state.players, actions.detectiveGuessId).role === 'mafia' : null
  const winner = winnerFor(players)

  return {
    state: { ...state, phase: winner ? 'ended' : 'morning', players, winner },
    deaths: [...deaths],
    savedPlayerId,
    detectiveResult
  }
}

export function publicRolesView(state: RolesGameState): Array<Pick<RolesPlayer, 'id' | 'name' | 'alive'>> {
  return state.players.map(({ id, name, alive }) => ({ id, name, alive }))
}
