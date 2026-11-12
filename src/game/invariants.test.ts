import { describe, expect, it } from 'vitest'
import { isGameState } from '../app/persistence'
import { winnerFor } from './core'
import { applyAction, createGame } from './engine'
import type { GameAction } from './engine'
import { createSeededRandom } from './random'
import { defaultMafiaCount } from './roles'
import { detectiveAnswer, nightSteps, nightTargetIds } from './rolesEngine'
import type { GameState, RandomSource, Variant } from './types'
import { activeVotes, currentVoter, isVoteComplete, voteTargets } from './voting'

const ACTION_LIMIT = 3000

function pick<T>(items: readonly T[], random: RandomSource): T {
  if (items.length === 0) throw new Error('Nothing to pick from.')
  return items[Math.floor(random() * items.length)]
}

/** A random legal GM action for the current phase, the way a careless but honest GM might play. */
function randomAction(game: GameState, random: RandomSource): GameAction {
  switch (game.phase) {
    case 'deal':
      return game.revealConfirmed ? { type: 'advanceReveal' } : { type: 'confirmRoleViewed' }
    case 'discussion':
      return { type: 'startVoting' }
    case 'voting':
    case 'runoff': {
      if (isVoteComplete(game)) return { type: game.phase === 'voting' ? 'resolveVote' : 'resolveRunoff' }
      // Occasionally exercise the explicit correction path.
      if (Object.keys(activeVotes(game)).length > 0 && random() < 0.05) return { type: 'retractVote' }
      return { type: 'castVote', voterId: currentVoter(game)!, targetId: pick(voteTargets(game), random) }
    }
    case 'defense':
      return { type: 'startRunoff' }
    case 'reveal':
      return { type: 'confirmElimination' }
    case 'night': {
      if (game.variant !== 'roles') throw new Error('Roleless games have no night.')
      const steps = nightSteps(game)
      const sheriffShoots = steps.includes('sheriff') && random() < 0.6
      return {
        type: 'resolveNight',
        actions: {
          mafiaTargetId: pick(nightTargetIds(game, 'mafia'), random),
          ...(steps.includes('sheriff') ? (sheriffShoots ? { sheriffTargetId: pick(nightTargetIds(game, 'sheriff'), random) } : { sheriffAbstained: true }) : {}),
          ...(steps.includes('detective') ? { detectiveGuessId: pick(nightTargetIds(game, 'detective'), random) } : {}),
          ...(steps.includes('doctor') ? { doctorTargetId: pick(nightTargetIds(game, 'doctor'), random) } : {})
        }
      }
    }
    case 'morning':
      return { type: 'startDay' }
    case 'ended':
      throw new Error('The game is over.')
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

/** Plain assertions keep thousands of checks per game fast; each failure names the broken rule. */
function checkInvariants(previous: GameState, next: GameState, action: GameAction): void {
  assert(isGameState(next), 'the state stays structurally valid')

  next.players.forEach((player, index) => {
    const before = previous.players[index]
    assert(player.id === before.id && player.name === before.name && player.role === before.role, 'identities and roles never change')
    assert(before.alive || !player.alive, 'nobody comes back to life')
  })

  const deaths = previous.players.filter((player, index) => player.alive && !next.players[index].alive).length
  if (deaths > 0) assert(['resolveVote', 'resolveRunoff', 'resolveNight'].includes(action.type), `deaths only come from a vote or a night (${action.type})`)
  if (action.type === 'resolveVote' || action.type === 'resolveRunoff') assert(deaths <= 1, 'a vote removes at most one player')
  if (action.type === 'resolveNight') assert(deaths <= 2, 'a night removes at most two players')

  const expected = winnerFor(next.players)
  if (next.phase === 'reveal' || next.phase === 'morning' || next.phase === 'ended') assert(next.winner === expected, 'the win check follows every death event')
  if (next.phase === 'ended') assert(next.winner !== null, 'an ended game has a winner')
  if (['discussion', 'voting', 'defense', 'runoff', 'night'].includes(next.phase)) assert(expected === null, 'play only continues while the game is undecided')

  const alive = new Set(next.players.filter((player) => player.alive).map((player) => player.id))
  for (const [voter, target] of Object.entries(activeVotes(next))) {
    assert(voter !== target, 'nobody votes for themselves')
    assert(alive.has(voter) && alive.has(target), 'votes come from and go to living players')
    if (next.phase === 'runoff') assert(next.runoff?.candidates.includes(target), 'runoff votes go to tied players')
  }

  if (next.runoff) {
    const everyoneTied = next.runoff.candidates.length === alive.size
    if (!everyoneTied) assert(next.runoff.candidates.every((id) => !next.runoff?.eligibleVoters.includes(id)), 'tied players do not vote in their runoff')
    assert(next.runoff.eligibleVoters.length > 0, 'a runoff always has voters')
  }

  if (next.phase === 'reveal') assert(!alive.has(next.revealedPlayerId ?? ''), 'the revealed player is out')
}

function playRandomGame(seed: number, variant: Variant) {
  const random = createSeededRandom(`invariants-${variant}-${seed}`)
  const playerCount = 7 + Math.floor(random() * 9)
  const mafiaDefault = defaultMafiaCount(playerCount)
  const playerNames = Array.from({ length: playerCount }, (_, index) => `Seat ${index + 1}`)
  let game = createGame({
    variant,
    playerCount,
    playerNames,
    mafiaOverride: mafiaDefault - 1 + Math.floor(random() * 3),
    doctorEnabled: random() < 0.8,
    detectiveEnabled: random() < 0.7,
    sheriffEnabled: random() < 0.5
  }, random)

  for (let step = 0; step < ACTION_LIMIT && game.phase !== 'ended'; step += 1) {
    if (game.phase === 'night' && game.variant === 'roles' && nightSteps(game).includes('detective')) {
      const guess = pick(nightTargetIds(game, 'detective'), random)
      assert(detectiveAnswer(game, guess) === (game.players.find((player) => player.id === guess)?.role === 'mafia'), 'the detective answer matches the role')
    }
    const action = randomAction(game, random)
    const next = applyAction(game, action, random)
    try {
      checkInvariants(game, next, action)
    } catch (error) {
      throw new Error(`${variant} seed ${seed}, step ${step}, ${action.type}: ${(error as Error).message}`)
    }
    game = next
  }
  return game
}

describe('engine invariants over seeded random games', () => {
  for (const variant of ['roleless', 'roles'] as const) {
    it(`keeps every house-rule invariant across 250 ${variant} games, and every game ends`, () => {
      const winners = { mafia: 0, town: 0 }
      for (let seed = 0; seed < 250; seed += 1) {
        const final = playRandomGame(seed, variant)
        expect(final.phase).toBe('ended')
        winners[final.winner!] += 1
      }
      // Random play should produce both outcomes; a zero would point at a broken win check.
      expect(winners.mafia).toBeGreaterThan(0)
      expect(winners.town).toBeGreaterThan(0)
    }, 60_000)
  }
})
