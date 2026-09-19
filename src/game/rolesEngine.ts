import { getRoleCounts } from './roles'
import type { PlayerId, Role, RolelessPlayer, RunoffState, SetupOptions, Winner } from './types'

export type RolesPhase = 'reveal' | 'discussion' | 'voting' | 'defense' | 'runoff' | 'night' | 'morning' | 'ended'
export type RandomSource = () => number

export interface RolesPlayer {
  id: PlayerId
  name: string
  role: Role
  alive: boolean
}

export interface NightSummary {
  deaths: PlayerId[]
  savedPlayerId: PlayerId | null
  detectiveResult: boolean | null
}

export interface RolesGameState {
  variant: 'roles'
  phase: RolesPhase
  round: number
  players: RolesPlayer[]
  revealIndex: number
  revealConfirmed: boolean
  winner: Winner
  nightSummary: NightSummary | null
  votingOrder: PlayerId[]
  votes: Record<PlayerId, PlayerId>
  runoff: RunoffState | null
  revealedPlayerId: PlayerId | null
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

function alivePlayers(state: RolesGameState): RolesPlayer[] {
  return state.players.filter((player) => player.alive)
}

function nextVotingOrder(state: RolesGameState, voters: PlayerId[], random: RandomSource): PlayerId[] {
  const result = [...voters]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

function emptyRunoff(candidates: PlayerId[], state: RolesGameState, number: number): RunoffState {
  const tied = new Set(candidates)
  const eligibleVoters = alivePlayers(state).map((player) => player.id).filter((id) => !tied.has(id))
  return { candidates: [...candidates], eligibleVoters, votes: {}, number }
}

function tally(votes: Record<PlayerId, PlayerId>): Map<PlayerId, number> {
  const result = new Map<PlayerId, number>()
  Object.values(votes).forEach((targetId) => result.set(targetId, (result.get(targetId) ?? 0) + 1))
  return result
}

function leaders(votes: Record<PlayerId, PlayerId>, candidates: PlayerId[]): PlayerId[] {
  const counts = tally(votes)
  const highest = Math.max(...candidates.map((candidate) => counts.get(candidate) ?? 0))
  return candidates.filter((candidate) => (counts.get(candidate) ?? 0) === highest)
}

function withElimination(state: RolesGameState, eliminatedId: PlayerId): RolesGameState {
  const players = state.players.map((player) => player.id === eliminatedId ? { ...player, alive: false } : player)
  const winner = winnerFor(players)

  return {
    ...state,
    players,
    phase: 'reveal',
    votes: {},
    runoff: null,
    votingOrder: [],
    revealedPlayerId: eliminatedId,
    winner
  }
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
    winner: null,
    nightSummary: null,
    votingOrder: [],
    votes: {},
    runoff: null,
    revealedPlayerId: null
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

export function startRolesVoting(state: RolesGameState, random: RandomSource = Math.random): RolesGameState {
  if (state.phase !== 'discussion') throw new Error('Voting can only start from discussion.')
  const voters = alivePlayers(state).map((player) => player.id)
  return { ...state, phase: 'voting', votingOrder: nextVotingOrder(state, voters, random), votes: {} }
}

export function castRoleVote(state: RolesGameState, voterId: PlayerId, targetId: PlayerId): RolesGameState {
  if (state.phase !== 'voting' && state.phase !== 'runoff') throw new Error('Votes are not being collected.')
  const voter = state.players.find((player) => player.id === voterId)
  const target = state.players.find((player) => player.id === targetId)
  if (!voter || !target) throw new Error('Unknown player.')
  if (!voter.alive) throw new Error('Dead players cannot vote.')
  if (!target.alive) throw new Error('Dead players cannot be voted for.')

  const voteState = state.phase === 'runoff' ? state.runoff : null
  const votes = voteState?.votes ?? state.votes
  const votingOrder = voteState?.eligibleVoters ?? state.votingOrder
  const expectedVoter = votingOrder.find((id) => votes[id] === undefined)

  if (votes[voterId] !== undefined) throw new Error('This player has already voted.')
  if (voterId !== expectedVoter) throw new Error('Votes must be entered in the displayed order.')
  if (state.phase === 'runoff' && !voteState?.candidates.includes(targetId)) throw new Error('Runoff votes must target a tied player.')

  const nextVotes = { ...votes, [voterId]: targetId }
  if (state.phase === 'runoff') {
    return { ...state, runoff: { ...voteState!, votes: nextVotes } }
  }

  return { ...state, votes: nextVotes }
}

export function resolveRolesVote(state: RolesGameState): RolesGameState {
  if (state.phase !== 'voting' || Object.keys(state.votes).length !== state.votingOrder.length) {
    throw new Error('The main vote is not complete.')
  }

  const tied = leaders(state.votes, alivePlayers(state).map((player) => player.id))
  if (tied.length > 1) {
    return { ...state, phase: 'defense', runoff: emptyRunoff(tied, state, 1), votes: {} }
  }

  return withElimination(state, tied[0])
}

export function startRolesRunoff(state: RolesGameState, random: RandomSource = Math.random): RolesGameState {
  if (state.phase !== 'defense' || !state.runoff) throw new Error('A runoff defense is not active.')
  const runoff = { ...state.runoff, eligibleVoters: nextVotingOrder(state, state.runoff.eligibleVoters, random), votes: {} }
  return { ...state, phase: 'runoff', runoff }
}

export function resolveRolesRunoff(state: RolesGameState): RolesGameState {
  if (state.phase !== 'runoff' || !state.runoff || Object.keys(state.runoff.votes).length !== state.runoff.eligibleVoters.length) {
    throw new Error('The runoff is not complete.')
  }

  const tied = leaders(state.runoff.votes, state.runoff.candidates)
  if (tied.length > 1) {
    return { ...state, phase: 'defense', runoff: emptyRunoff(tied, state, state.runoff.number + 1) }
  }

  return withElimination(state, tied[0])
}

export function confirmRoleReveal(state: RolesGameState): RolesGameState {
  if (state.phase !== 'reveal' || !state.revealedPlayerId) throw new Error('There is no elimination to reveal.')
  if (state.winner) return { ...state, phase: 'ended', revealedPlayerId: null }
  return { ...state, phase: 'night', revealedPlayerId: null }
}

export function startNight(state: RolesGameState): RolesGameState {
  if (state.phase !== 'discussion' && state.phase !== 'morning' && state.phase !== 'night') throw new Error('Night can only start after a day phase.')
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

  const nightSummary: NightSummary = {
    deaths: [...deaths],
    savedPlayerId,
    detectiveResult
  }

  return {
    state: { ...state, phase: winner ? 'ended' : 'morning', players, winner, nightSummary, votingOrder: [], votes: {}, runoff: null, revealedPlayerId: null },
    deaths: [...deaths],
    savedPlayerId,
    detectiveResult
  }
}

export function publicRolesView(state: RolesGameState): Array<Pick<RolesPlayer, 'id' | 'name' | 'alive'>> {
  return state.players.map(({ id, name, alive }) => ({ id, name, alive }))
}
