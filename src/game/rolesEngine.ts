import { alivePlayers, confirmDealViewed, currentDealPlayer, joinNames, killPlayers, nextDealState, playerById, playerIds, shuffled, validateNames, winnerFor } from './core'
import { getRoleCounts } from './roles'
import type { NightActions, NightSummary, PlayerId, RandomSource, Role, RolesGameState, RolesPlayer, SetupOptions } from './types'
import { activeVotes, beginRunoff, beginVoting, eliminate, enterDefense, lastVoter, mainVoteOutcome, recordVote, retractLastVote, runoffOutcome } from './voting'
import type { VoteOutcome } from './voting'

export type NightStep = 'mafia' | 'sheriff' | 'detective' | 'doctor'

export interface RolesSetupOptions extends Omit<SetupOptions, 'variant'> {
  playerNames: readonly string[]
}

export interface NightResolution {
  state: RolesGameState
  deaths: PlayerId[]
  savedPlayerId: PlayerId | null
}

export function createRolesGame(options: RolesSetupOptions, random: RandomSource): RolesGameState {
  const names = validateNames(options.playerNames)
  const roleCounts = getRoleCounts({ ...options, playerCount: names.length, variant: 'roles' })
  const ids = playerIds(names.length)
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
    phase: 'deal',
    round: 1,
    players: names.map((name, index) => ({ id: ids[index], name, role: assignments.get(ids[index]) ?? 'civilian', alive: true })),
    revealIndex: 0,
    revealConfirmed: false,
    winner: null,
    nightSummary: null,
    votingOrder: [],
    votes: {},
    runoff: null,
    revealedPlayerId: null,
    eventLog: []
  }
}

export function currentRevealPlayer(state: RolesGameState): RolesPlayer {
  return currentDealPlayer(state)
}

export function confirmRoleViewed(state: RolesGameState): RolesGameState {
  return confirmDealViewed(state)
}

/** Moves to the next private reveal, or into Night 1 once everyone has confirmed. */
export function advanceRoleReveal(state: RolesGameState): RolesGameState {
  return nextDealState(state) ?? { ...state, phase: 'night', revealConfirmed: false }
}

function livingWithRole(state: RolesGameState, role: Role): RolesPlayer | undefined {
  return state.players.find((player) => player.alive && player.role === role)
}

/** The fixed night order, limited to roles that are in the game and still alive. */
export function nightSteps(state: RolesGameState): NightStep[] {
  return [
    'mafia',
    ...(livingWithRole(state, 'sheriff') ? ['sheriff' as const] : []),
    ...(livingWithRole(state, 'detective') ? ['detective' as const] : []),
    ...(livingWithRole(state, 'doctor') ? ['doctor' as const] : [])
  ]
}

/** Valid targets for a night step. The doctor may protect themselves; nobody else may target their own side or self. */
export function nightTargetIds(state: RolesGameState, step: NightStep): PlayerId[] {
  const alive = alivePlayers(state.players)
  const excluded: Record<NightStep, (player: RolesPlayer) => boolean> = {
    mafia: (player) => player.role === 'mafia',
    sheriff: (player) => player.role === 'sheriff',
    detective: (player) => player.role === 'detective',
    doctor: () => false
  }
  return alive.filter((player) => !excluded[step](player)).map((player) => player.id)
}

function assertNightTarget(state: RolesGameState, step: NightStep, targetId: PlayerId): RolesPlayer {
  const target = playerById(state.players, targetId)
  if (!target.alive) throw new Error('Dead players cannot be selected.')
  if (!nightTargetIds(state, step).includes(targetId)) {
    const messages: Record<NightStep, string> = {
      mafia: 'The mafia cannot target one of their own.',
      sheriff: 'The sheriff cannot shoot themselves.',
      detective: 'The detective cannot investigate themselves.',
      doctor: 'That player cannot be protected.'
    }
    throw new Error(messages[step])
  }
  return target
}

/** Private GM answer for the detective's guess: true is thumbs-up (mafia), false is thumbs-down. */
export function detectiveAnswer(state: RolesGameState, guessId: PlayerId): boolean {
  if (state.phase !== 'night') throw new Error('The detective only investigates at night.')
  if (!livingWithRole(state, 'detective')) throw new Error('There is no living detective.')
  return assertNightTarget(state, 'detective', guessId).role === 'mafia'
}

export function resolveNight(state: RolesGameState, actions: NightActions): NightResolution {
  if (state.phase !== 'night') throw new Error('Night actions can only resolve during the night phase.')
  const doctor = livingWithRole(state, 'doctor')
  const detective = livingWithRole(state, 'detective')
  const sheriff = livingWithRole(state, 'sheriff')
  if (!doctor && actions.doctorTargetId) throw new Error('There is no living doctor.')
  if (!detective && actions.detectiveGuessId) throw new Error('There is no living detective.')
  if (!sheriff && (actions.sheriffTargetId || actions.sheriffAbstained)) throw new Error('There is no living sheriff.')
  if (sheriff && Boolean(actions.sheriffTargetId) === Boolean(actions.sheriffAbstained)) {
    throw new Error('The sheriff must choose a target or abstain.')
  }

  const mafiaTarget = assertNightTarget(state, 'mafia', actions.mafiaTargetId)
  const sheriffTarget = actions.sheriffTargetId ? assertNightTarget(state, 'sheriff', actions.sheriffTargetId) : null
  const detectiveTarget = actions.detectiveGuessId ? assertNightTarget(state, 'detective', actions.detectiveGuessId) : null
  const doctorTarget = actions.doctorTargetId ? assertNightTarget(state, 'doctor', actions.doctorTargetId) : null

  const saved = doctorTarget?.id === mafiaTarget.id
  const deaths = new Set<PlayerId>()
  if (!saved) deaths.add(mafiaTarget.id)
  if (sheriff && sheriffTarget) deaths.add(sheriffTarget.role === 'mafia' ? sheriffTarget.id : sheriff.id)

  const players = killPlayers(state.players, deaths)
  const label = `Night ${state.round}`
  const mafiaNames = joinNames(alivePlayers(state.players).filter((player) => player.role === 'mafia').map((player) => player.name))
  const eventLog = [
    ...state.eventLog,
    `${label}: ${mafiaNames} decided to kill ${mafiaTarget.name}.`,
    ...(sheriff
      ? [sheriffTarget ? `${label}: Sheriff ${sheriff.name} shot ${sheriffTarget.name}.` : `${label}: Sheriff ${sheriff.name} abstained from shooting.`]
      : []),
    ...(detective && detectiveTarget
      ? [`${label}: Detective ${detective.name} checked ${detectiveTarget.name} and was told ${detectiveTarget.role === 'mafia' ? 'mafia (thumbs up)' : 'innocent (thumbs down)'}.`]
      : []),
    ...(doctor && doctorTarget ? [`${label}: Doctor ${doctor.name} protected ${doctorTarget.name}.`] : []),
    ...[...deaths].map((id) => `${label} consequence: ${playerById(state.players, id).name} was killed.`),
    ...(saved ? [`${label} consequence: Doctor protection saved ${mafiaTarget.name}.`] : []),
    ...(doctor && doctorTarget && !saved ? [`${label} consequence: Doctor protection did not prevent the mafia kill.`] : []),
    ...(sheriff && sheriffTarget
      ? [sheriffTarget.role === 'mafia'
        ? `${label} consequence: Sheriff ${sheriff.name} killed mafia ${sheriffTarget.name} and survived.`
        : `${label} consequence: Sheriff ${sheriff.name} died after shooting an innocent player.`]
      : [])
  ]

  const nightSummary: NightSummary = { deaths: [...deaths], savedPlayerId: saved ? mafiaTarget.id : null }

  return {
    state: {
      ...state,
      phase: 'morning',
      players,
      winner: winnerFor(players),
      nightSummary,
      votingOrder: [],
      votes: {},
      runoff: null,
      revealedPlayerId: null,
      eventLog
    },
    deaths: nightSummary.deaths,
    savedPlayerId: nightSummary.savedPlayerId
  }
}

/** After the morning announcement: open the day's discussion, or end the game if the night decided it. */
export function startRolesDay(state: RolesGameState): RolesGameState {
  if (state.phase !== 'morning') throw new Error('The day starts after the morning announcement.')
  if (state.winner) return { ...state, phase: 'ended', nightSummary: null }
  return { ...state, phase: 'discussion', nightSummary: null }
}

export function startRolesVoting(state: RolesGameState, random: RandomSource): RolesGameState {
  return beginVoting(state, random)
}

export function castRoleVote(state: RolesGameState, voterId: PlayerId, targetId: PlayerId): RolesGameState {
  return recordVote(state, voterId, targetId)
}

/** GM correction: withdraws the latest ballot and notes it in the end-of-game record. */
export function retractRoleVote(state: RolesGameState): RolesGameState {
  const voterId = lastVoter(state)
  const next = retractLastVote(state)
  const targetId = voterId ? activeVotes(state)[voterId] : undefined
  const voter = voterId ? playerById(state.players, voterId).name : 'A player'
  const target = targetId ? playerById(state.players, targetId).name : 'a player'
  return { ...next, eventLog: [...state.eventLog, `Day ${state.round} correction: ${voter}'s vote for ${target} was withdrawn.`] }
}

function applyOutcome(state: RolesGameState, outcome: VoteOutcome): RolesGameState {
  if (outcome.type === 'tie') return enterDefense(state, outcome.runoff)
  const eliminated = eliminate(state, outcome.playerId)
  const name = playerById(state.players, outcome.playerId).name
  return { ...eliminated, eventLog: [...state.eventLog, `Day ${state.round}: ${name} was voted out.`] }
}

export function resolveRolesVote(state: RolesGameState): RolesGameState {
  return applyOutcome(state, mainVoteOutcome(state))
}

export function startRolesRunoff(state: RolesGameState, random: RandomSource): RolesGameState {
  return beginRunoff(state, random)
}

export function resolveRolesRunoff(state: RolesGameState): RolesGameState {
  return applyOutcome(state, runoffOutcome(state))
}

/** After a voted-out reveal: end the game, or start the next night (rounds run Night N, then Day N). */
export function confirmRoleReveal(state: RolesGameState): RolesGameState {
  if (state.phase !== 'reveal' || !state.revealedPlayerId) throw new Error('There is no elimination to reveal.')
  if (state.winner) return { ...state, phase: 'ended', revealedPlayerId: null }
  return { ...state, phase: 'night', round: state.round + 1, revealedPlayerId: null }
}

export function publicRolesView(state: RolesGameState): Array<Pick<RolesPlayer, 'id' | 'name' | 'alive'>> {
  return state.players.map(({ id, name, alive }) => ({ id, name, alive }))
}
