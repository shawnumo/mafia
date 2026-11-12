export type Variant = 'roleless' | 'roles'

export type Role = 'mafia' | 'doctor' | 'detective' | 'sheriff' | 'civilian'

export type PlayerId = string

export type Winner = 'mafia' | 'town' | null

/** Injected randomness: returns a float in [0, 1). The engine never calls Math.random itself. */
export type RandomSource = () => number

export interface Player<R extends Role = Role> {
  id: PlayerId
  name: string
  role: R
  alive: boolean
}

export interface RunoffState {
  candidates: PlayerId[]
  eligibleVoters: PlayerId[]
  votes: Record<PlayerId, PlayerId>
  number: number
}

/** Fields shared by both variants: the private deal plus the day loop. */
export interface BaseGameState<R extends Role, P extends string> {
  phase: P
  round: number
  players: Array<Player<R>>
  revealIndex: number
  revealConfirmed: boolean
  votingOrder: PlayerId[]
  votes: Record<PlayerId, PlayerId>
  runoff: RunoffState | null
  revealedPlayerId: PlayerId | null
  winner: Winner
}

export const ROLELESS_PHASES = ['deal', 'discussion', 'voting', 'defense', 'runoff', 'reveal', 'ended'] as const
export type RolelessPhase = typeof ROLELESS_PHASES[number]

export type RolelessPlayer = Player<'mafia' | 'civilian'>

export interface RolelessGameState extends BaseGameState<'mafia' | 'civilian', RolelessPhase> {
  variant: 'roleless'
}

export const ROLES_PHASES = ['deal', 'night', 'morning', 'discussion', 'voting', 'defense', 'runoff', 'reveal', 'ended'] as const
export type RolesPhase = typeof ROLES_PHASES[number]

export type RolesPlayer = Player<Role>

export interface NightSummary {
  deaths: PlayerId[]
  savedPlayerId: PlayerId | null
}

export interface RolesGameState extends BaseGameState<Role, RolesPhase> {
  variant: 'roles'
  nightSummary: NightSummary | null
  eventLog: string[]
}

export type GameState = RolelessGameState | RolesGameState

export interface NightActions {
  mafiaTargetId: PlayerId
  sheriffTargetId?: PlayerId
  sheriffAbstained?: boolean
  detectiveGuessId?: PlayerId
  doctorTargetId?: PlayerId
}

export interface RoleCounts {
  mafia: number
  doctor: number
  detective: number
  sheriff: number
  civilian: number
}

export interface SetupOptions {
  playerCount: number
  variant: Variant
  mafiaOverride?: number
  doctorEnabled?: boolean
  detectiveEnabled?: boolean
  sheriffEnabled?: boolean
}
