import { alivePlayers, killPlayers, playerById, shuffled, winnerFor } from './core'
import type { BaseGameState, PlayerId, RandomSource, Role, RunoffState } from './types'

type DayState = BaseGameState<Role, string>

export interface TallyEntry {
  playerId: PlayerId
  count: number
}

export type VoteOutcome =
  | { type: 'eliminate'; playerId: PlayerId }
  | { type: 'tie'; runoff: RunoffState }

export function tally(votes: Readonly<Record<PlayerId, PlayerId>>): Map<PlayerId, number> {
  const result = new Map<PlayerId, number>()
  Object.values(votes).forEach((targetId) => result.set(targetId, (result.get(targetId) ?? 0) + 1))
  return result
}

/** Live tally for the GM, highest first; ties keep first-vote order so the list does not jump around. */
export function tallyEntries(votes: Readonly<Record<PlayerId, PlayerId>>): TallyEntry[] {
  return [...tally(votes).entries()]
    .map(([playerId, count]) => ({ playerId, count }))
    .sort((left, right) => right.count - left.count)
}

function leaders(votes: Readonly<Record<PlayerId, PlayerId>>, candidates: readonly PlayerId[]): PlayerId[] {
  const counts = tally(votes)
  const highest = Math.max(...candidates.map((candidate) => counts.get(candidate) ?? 0))
  return candidates.filter((candidate) => (counts.get(candidate) ?? 0) === highest)
}

export function activeVotes(state: DayState): Record<PlayerId, PlayerId> {
  return state.phase === 'runoff' && state.runoff ? state.runoff.votes : state.votes
}

export function activeVoterOrder(state: DayState): PlayerId[] {
  if (state.phase === 'runoff') return state.runoff?.eligibleVoters ?? []
  if (state.phase === 'voting') return state.votingOrder
  return []
}

export function currentVoter(state: DayState): PlayerId | null {
  const votes = activeVotes(state)
  return activeVoterOrder(state).find((id) => votes[id] === undefined) ?? null
}

export function remainingVoters(state: DayState): PlayerId[] {
  const votes = activeVotes(state)
  return activeVoterOrder(state).filter((id) => votes[id] === undefined)
}

/** Every player the current voter may accuse: alive, not themselves, and a tied candidate during a runoff. */
export function voteTargets(state: DayState): PlayerId[] {
  const voter = currentVoter(state)
  if (!voter) return []
  const candidates = state.phase === 'runoff' ? new Set(state.runoff?.candidates ?? []) : null
  return alivePlayers(state.players)
    .map((player) => player.id)
    .filter((id) => id !== voter && (!candidates || candidates.has(id)))
}

export function isVoteComplete(state: DayState): boolean {
  if (state.phase !== 'voting' && state.phase !== 'runoff') return false
  return activeVoterOrder(state).length > 0 && currentVoter(state) === null
}

export function beginVoting<S extends DayState>(state: S, random: RandomSource): S {
  if (state.phase !== 'discussion') throw new Error('Voting can only start from discussion.')
  const voters = alivePlayers(state.players).map((player) => player.id)
  return { ...state, phase: 'voting', votingOrder: shuffled(voters, random), votes: {} }
}

export function recordVote<S extends DayState>(state: S, voterId: PlayerId, targetId: PlayerId): S {
  if (state.phase !== 'voting' && state.phase !== 'runoff') throw new Error('Votes are not being collected.')
  const voter = playerById(state.players, voterId)
  const target = playerById(state.players, targetId)
  if (!voter.alive) throw new Error('Dead players cannot vote.')
  if (!target.alive) throw new Error('Dead players cannot be voted for.')

  const votes = activeVotes(state)
  if (votes[voterId] !== undefined) throw new Error('This player has already voted.')
  if (voterId !== currentVoter(state)) throw new Error('Votes must be entered in the displayed order.')
  if (voterId === targetId) throw new Error('Players cannot vote for themselves.')

  if (state.phase === 'runoff') {
    const runoff = state.runoff
    if (!runoff) throw new Error('A runoff is not active.')
    if (!runoff.candidates.includes(targetId)) throw new Error('Runoff votes must target a tied player.')
    return { ...state, runoff: { ...runoff, votes: { ...runoff.votes, [voterId]: targetId } } }
  }

  return { ...state, votes: { ...votes, [voterId]: targetId } }
}

/**
 * Tied players defend, then everyone else votes. When every living player is tied there is nobody
 * left to exclude, so the runoff becomes a fresh vote of all living players (self-votes still banned).
 */
function buildRunoff(state: DayState, candidates: PlayerId[], number: number): RunoffState {
  const tied = new Set(candidates)
  const alive = alivePlayers(state.players).map((player) => player.id)
  const others = alive.filter((id) => !tied.has(id))
  return { candidates: [...candidates], eligibleVoters: others.length > 0 ? others : alive, votes: {}, number }
}

export function mainVoteOutcome(state: DayState): VoteOutcome {
  if (state.phase !== 'voting' || !isVoteComplete(state)) throw new Error('The main vote is not complete.')
  const tied = leaders(state.votes, alivePlayers(state.players).map((player) => player.id))
  if (tied.length > 1) return { type: 'tie', runoff: buildRunoff(state, tied, 1) }
  return { type: 'eliminate', playerId: tied[0] }
}

export function runoffOutcome(state: DayState): VoteOutcome {
  const runoff = state.runoff
  if (state.phase !== 'runoff' || !runoff || !isVoteComplete(state)) throw new Error('The runoff is not complete.')
  const tied = leaders(runoff.votes, runoff.candidates)
  if (tied.length > 1) return { type: 'tie', runoff: buildRunoff(state, tied, runoff.number + 1) }
  return { type: 'eliminate', playerId: tied[0] }
}

export function enterDefense<S extends DayState>(state: S, runoff: RunoffState): S {
  return { ...state, phase: 'defense', runoff, votes: {}, votingOrder: [] }
}

export function beginRunoff<S extends DayState>(state: S, random: RandomSource): S {
  if (state.phase !== 'defense' || !state.runoff) throw new Error('A runoff defense is not active.')
  const runoff = { ...state.runoff, eligibleVoters: shuffled(state.runoff.eligibleVoters, random), votes: {} }
  return { ...state, phase: 'runoff', runoff }
}

export function eliminate<S extends DayState>(state: S, playerId: PlayerId): S {
  const players = killPlayers(state.players, new Set([playerId]))
  return {
    ...state,
    players,
    phase: 'reveal',
    revealedPlayerId: playerId,
    runoff: null,
    votes: {},
    votingOrder: [],
    winner: winnerFor(players)
  }
}

export interface VoteProgress {
  cast: number
  total: number
  remaining: number
  /** More than half of this vote's ballots. Plurality still decides; this is a reading aid for the GM. */
  majority: number
  leaders: PlayerId[]
  leaderCount: number
  /** The sole leader once nobody can tie or pass them with the votes still to come. */
  clinchedId: PlayerId | null
}

export function voteProgress(state: DayState): VoteProgress {
  const order = activeVoterOrder(state)
  const votes = activeVotes(state)
  const cast = order.filter((id) => votes[id] !== undefined).length
  const total = order.length
  const remaining = total - cast
  const counts = tally(votes)
  const candidates = state.phase === 'runoff' && state.runoff
    ? state.runoff.candidates
    : alivePlayers(state.players).map((player) => player.id)
  const leaderCount = Math.max(0, ...candidates.map((id) => counts.get(id) ?? 0))
  const leaders = leaderCount === 0 ? [] : candidates.filter((id) => (counts.get(id) ?? 0) === leaderCount)
  const runnerUp = Math.max(0, ...candidates.filter((id) => !leaders.includes(id)).map((id) => counts.get(id) ?? 0))
  // Conservative: assumes every remaining vote could go to the runner-up, so "clinched" is never wrong.
  const clinchedId = leaders.length === 1 && leaderCount > runnerUp + remaining ? leaders[0] : null

  return { cast, total, remaining, majority: Math.floor(total / 2) + 1, leaders, leaderCount, clinchedId }
}

/** The voter whose ballot was entered most recently in the current vote, if any. */
export function lastVoter(state: DayState): PlayerId | null {
  const votes = activeVotes(state)
  const voted = activeVoterOrder(state).filter((id) => votes[id] !== undefined)
  return voted[voted.length - 1] ?? null
}

/** Explicit GM correction: withdraws the latest ballot so that voter is up again. */
export function retractLastVote<S extends DayState>(state: S): S {
  if (state.phase !== 'voting' && state.phase !== 'runoff') throw new Error('Votes are not being collected.')
  const voterId = lastVoter(state)
  if (!voterId) throw new Error('There is no vote to change yet.')

  const without = (votes: Record<PlayerId, PlayerId>) => {
    const next = { ...votes }
    delete next[voterId]
    return next
  }
  if (state.phase === 'runoff' && state.runoff) return { ...state, runoff: { ...state.runoff, votes: without(state.runoff.votes) } }
  return { ...state, votes: without(state.votes) }
}
