export type Variant = 'roleless' | 'roles'

export type Role = 'mafia' | 'doctor' | 'detective' | 'sheriff' | 'civilian'

export type PlayerId = string

export type RolelessPhase = 'discussion' | 'voting' | 'defense' | 'runoff' | 'reveal' | 'ended'

export type Winner = 'mafia' | 'town' | null

export interface RolelessPlayer {
  id: PlayerId
  name: string
  role: 'mafia' | 'civilian'
  alive: boolean
}

export interface RunoffState {
  candidates: PlayerId[]
  eligibleVoters: PlayerId[]
  votes: Record<PlayerId, PlayerId>
  number: number
}

export interface RolelessGameState {
  variant: 'roleless'
  phase: RolelessPhase
  round: number
  players: RolelessPlayer[]
  votingOrder: PlayerId[]
  votes: Record<PlayerId, PlayerId>
  runoff: RunoffState | null
  revealedPlayerId: PlayerId | null
  winner: Winner
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
