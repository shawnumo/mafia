import { describe, expect, it } from 'vitest'
import {
  advanceRoleReveal,
  castRoleVote,
  confirmRoleReveal,
  confirmRoleViewed,
  createRolesGame,
  currentRevealPlayer,
  detectiveAnswer,
  nightSteps,
  nightTargetIds,
  publicRolesView,
  resolveNight,
  resolveRolesRunoff,
  resolveRolesVote,
  retractRoleVote,
  startRolesDay,
  startRolesRunoff,
  startRolesVoting
} from './rolesEngine'
import type { RolesSetupOptions } from './rolesEngine'
import type { Role, RolesGameState } from './types'

const names = ['Ada', 'Ben', 'Cleo', 'Dara', 'Eli', 'Faye', 'Gus']
const stableRandom = () => 0.999999

function dealt(options: Partial<RolesSetupOptions> = {}): RolesGameState {
  let game = createRolesGame({ playerNames: names, playerCount: names.length, ...options }, stableRandom)
  for (let index = 0; index < names.length; index += 1) {
    game = advanceRoleReveal(confirmRoleViewed(game))
  }
  return game
}

function byRole(game: RolesGameState, role: Role, skip = 0) {
  const player = game.players.filter((candidate) => candidate.role === role && candidate.alive)[skip]
  if (!player) throw new Error(`No living ${role}.`)
  return player
}

/** Night 1 with a quiet kill, then into Day 1's vote. */
function firstDayVote(options: Partial<RolesSetupOptions> = {}): RolesGameState {
  const night = dealt(options)
  const morning = resolveNight(night, nightActionsFor(night, byRole(night, 'civilian').id)).state
  return startRolesVoting(startRolesDay(morning), stableRandom)
}

function nightActionsFor(game: RolesGameState, mafiaTargetId: string) {
  return {
    mafiaTargetId,
    ...(game.players.some((player) => player.alive && player.role === 'sheriff') ? { sheriffAbstained: true } : {})
  }
}

function killTwoCivilians(game: RolesGameState): RolesGameState {
  const civilians = game.players.filter((player) => player.role === 'civilian').slice(0, 2).map((player) => player.id)
  return { ...game, players: game.players.map((player) => civilians.includes(player.id) ? { ...player, alive: false } : player) }
}

describe('roles game engine', () => {
  it('assigns every configured role and keeps public views role-free', () => {
    const game = createRolesGame({ playerNames: names, playerCount: 7, doctorEnabled: true, detectiveEnabled: true, sheriffEnabled: true }, stableRandom)

    expect(game.phase).toBe('deal')
    expect(game.players.map((player) => player.role).sort()).toEqual(['civilian', 'civilian', 'detective', 'doctor', 'mafia', 'mafia', 'sheriff'].sort())
    expect(JSON.stringify(publicRolesView(game))).not.toMatch(/mafia|doctor|detective|sheriff|civilian/)
  })

  it('keeps the role-table detective default for larger games', () => {
    const game = createRolesGame({ playerNames: [...names, 'Hana', 'Ivan'], playerCount: 9 }, stableRandom)
    expect(game.players.filter((player) => player.role === 'doctor')).toHaveLength(1)
    expect(game.players.filter((player) => player.role === 'detective')).toHaveLength(1)
    expect(game.players.filter((player) => player.role === 'sheriff')).toHaveLength(0)
  })

  it('requires confirmation before each private reveal advances, then starts Night 1', () => {
    let game = createRolesGame({ playerNames: names, playerCount: 7 }, stableRandom)
    const firstPlayer = currentRevealPlayer(game)

    expect(() => advanceRoleReveal(game)).toThrow('confirm')
    game = confirmRoleViewed(game)
    expect(() => confirmRoleViewed(game)).toThrow('already confirmed')
    game = advanceRoleReveal(game)
    expect(game.revealIndex).toBe(1)
    expect(currentRevealPlayer(game)).not.toEqual(firstPlayer)

    const night = dealt()
    expect(night.phase).toBe('night')
    expect(night.round).toBe(1)
    expect(() => currentRevealPlayer(night)).toThrow('no active role reveal')
  })

  it('never treats an elimination reveal as the private deal', () => {
    const vote = firstDayVote()
    const target = vote.votingOrder[1]
    const reveal = resolveRolesVote(vote.votingOrder.reduce((current, voterId) => castRoleVote(current, voterId, voterId === target ? vote.votingOrder[0] : target), vote))

    expect(reveal.phase).toBe('reveal')
    expect(() => confirmRoleViewed(reveal)).toThrow('private role reveal')
    expect(() => advanceRoleReveal(reveal)).toThrow('private role reveal')
  })

  it('lists night steps in fixed order for living roles only', () => {
    const night = dealt({ doctorEnabled: true, detectiveEnabled: true, sheriffEnabled: true })
    expect(nightSteps(night)).toEqual(['mafia', 'sheriff', 'detective', 'doctor'])
    const withoutSheriff = { ...night, players: night.players.map((player) => player.role === 'sheriff' ? { ...player, alive: false } : player) }
    expect(nightSteps(withoutSheriff)).toEqual(['mafia', 'detective', 'doctor'])
  })

  it('saves the mafia target when the doctor protects them and keeps the detective result out of the summary', () => {
    const game = dealt({ doctorEnabled: true, detectiveEnabled: true })
    const mafiaTarget = byRole(game, 'civilian').id
    const detectiveGuess = byRole(game, 'mafia').id

    expect(detectiveAnswer(game, detectiveGuess)).toBe(true)
    expect(detectiveAnswer(game, mafiaTarget)).toBe(false)

    const result = resolveNight(game, { mafiaTargetId: mafiaTarget, doctorTargetId: mafiaTarget, detectiveGuessId: detectiveGuess })
    expect(result.deaths).toEqual([])
    expect(result.savedPlayerId).toBe(mafiaTarget)
    expect(result.state.phase).toBe('morning')
    expect(result.state.nightSummary).toEqual({ deaths: [], savedPlayerId: mafiaTarget })
    expect(result.state.eventLog.some((event) => event.includes('decided to kill'))).toBe(true)
    expect(result.state.eventLog.some((event) => event.includes('checked') && event.includes('thumbs up'))).toBe(true)
    expect(result.state.eventLog.some((event) => event.includes('protection saved'))).toBe(true)
  })

  it('rejects night targets the house rules do not allow', () => {
    const game = dealt({ doctorEnabled: true, detectiveEnabled: true, sheriffEnabled: true })
    const mafia = byRole(game, 'mafia')
    const sheriff = byRole(game, 'sheriff')
    const detective = byRole(game, 'detective')
    const doctor = byRole(game, 'doctor')
    const civilian = byRole(game, 'civilian')

    expect(() => resolveNight(game, { mafiaTargetId: byRole(game, 'mafia', 1).id, sheriffAbstained: true })).toThrow('their own')
    expect(() => resolveNight(game, { mafiaTargetId: civilian.id, sheriffTargetId: sheriff.id })).toThrow('cannot shoot themselves')
    expect(() => resolveNight(game, { mafiaTargetId: civilian.id, sheriffAbstained: true, detectiveGuessId: detective.id })).toThrow('cannot investigate themselves')
    expect(() => detectiveAnswer(game, detective.id)).toThrow('cannot investigate themselves')

    const deadCivilian = { ...game, players: game.players.map((player) => player.id === civilian.id ? { ...player, alive: false } : player) }
    expect(() => resolveNight(deadCivilian, { mafiaTargetId: civilian.id, sheriffAbstained: true })).toThrow('Dead players')

    expect(nightTargetIds(game, 'mafia')).not.toContain(mafia.id)
    expect(nightTargetIds(game, 'doctor')).toContain(doctor.id)
  })

  it('resolves an innocent sheriff shot as a self-kill the doctor cannot prevent', () => {
    const game = dealt({ doctorEnabled: true, sheriffEnabled: true })
    const sheriff = byRole(game, 'sheriff')
    const innocent = byRole(game, 'civilian')
    const mafiaTarget = byRole(game, 'civilian', 1)
    const result = resolveNight(game, { mafiaTargetId: mafiaTarget.id, sheriffTargetId: innocent.id, doctorTargetId: sheriff.id })

    expect(result.deaths).toEqual(expect.arrayContaining([sheriff.id, mafiaTarget.id]))
    expect(result.deaths).not.toContain(innocent.id)
    expect(result.savedPlayerId).toBeNull()
  })

  it('requires the living sheriff to shoot or abstain, and records an abstention', () => {
    const game = dealt({ sheriffEnabled: true })
    const sheriff = byRole(game, 'sheriff')
    const target = byRole(game, 'civilian').id
    const result = resolveNight(game, { mafiaTargetId: target, sheriffAbstained: true })

    expect(result.deaths).toEqual([target])
    expect(result.state.players.find((player) => player.id === sheriff.id)?.alive).toBe(true)
    expect(result.state.eventLog).toContain(`Night 1: Sheriff ${sheriff.name} abstained from shooting.`)
    expect(() => resolveNight(game, { mafiaTargetId: target })).toThrow('choose a target or abstain')
  })

  it('resolves independent mafia and sheriff kills on the same night', () => {
    const game = dealt({ sheriffEnabled: true })
    const sheriff = byRole(game, 'sheriff')
    const mafiaTarget = byRole(game, 'civilian')
    const shotMafia = byRole(game, 'mafia')
    const result = resolveNight(game, { mafiaTargetId: mafiaTarget.id, sheriffTargetId: shotMafia.id })

    expect(result.deaths).toEqual(expect.arrayContaining([mafiaTarget.id, shotMafia.id]))
    expect(result.deaths).toHaveLength(2)
    expect(result.state.players.find((player) => player.id === sheriff.id)?.alive).toBe(true)
  })

  it('declares a mafia win when one night overshoots parity, after the morning report', () => {
    // 2 mafia vs 3 town (doctor, sheriff, civilian). The mafia kill the civilian and the sheriff shoots the doctor and dies: 2 vs 1.
    const game = killTwoCivilians(dealt({ doctorEnabled: true, sheriffEnabled: true }))
    const result = resolveNight(game, {
      mafiaTargetId: byRole(game, 'civilian').id,
      sheriffTargetId: byRole(game, 'doctor').id,
      doctorTargetId: byRole(game, 'doctor').id
    })

    expect(result.state.players.filter((player) => player.alive).map((player) => player.role).sort()).toEqual(['doctor', 'mafia', 'mafia'])
    expect(result.state.winner).toBe('mafia')
    expect(result.state.phase).toBe('morning')
    expect(startRolesDay(result.state).phase).toBe('ended')
  })

  it('runs Night N then Day N, and advances the round when the next night starts', () => {
    const vote = firstDayVote()
    expect(vote.round).toBe(1)
    const target = byRole(vote, 'civilian').id
    const reveal = resolveRolesVote(vote.votingOrder.reduce((current, voterId) => castRoleVote(current, voterId, voterId === target ? vote.votingOrder.find((id) => id !== target)! : target), vote))

    expect(reveal.eventLog.at(-1)).toMatch(/^Day 1: .+ was voted out\.$/)
    const nextNight = confirmRoleReveal(reveal)
    expect(nextNight.phase).toBe('night')
    expect(nextNight.round).toBe(2)
    expect(() => startRolesDay(nextNight)).toThrow('morning')
  })

  it('rejects a player voting for themselves', () => {
    const live = firstDayVote()
    const voterId = live.votingOrder[0]
    expect(() => castRoleVote(live, voterId, voterId)).toThrow('themselves')
  })

  it('sends tied players to defense and repeats runoffs until the tie breaks', () => {
    const live = firstDayVote({ doctorEnabled: true })
    const [first, second, third] = live.votingOrder
    const tied = live.votingOrder.reduce((current, voterId, index) => castRoleVote(current, voterId, [second, first, second, first, third, third][index]), live)
    const defense = resolveRolesVote(tied)

    expect(defense.phase).toBe('defense')
    expect(defense.runoff?.candidates).toEqual([first, second, third])

    const runoff = startRolesRunoff(defense, stableRandom)
    expect(runoff.runoff?.eligibleVoters).toHaveLength(3)
    expect(runoff.runoff?.eligibleVoters).not.toContain(first)
    const tiedAgain = runoff.runoff!.eligibleVoters.reduce((current, voterId, index) => castRoleVote(current, voterId, [first, second, third][index]), runoff)
    const again = resolveRolesRunoff(tiedAgain)
    expect(again.phase).toBe('defense')
    expect(again.runoff?.number).toBe(2)

    const secondRunoff = startRolesRunoff(again, stableRandom)
    const broken = secondRunoff.runoff!.eligibleVoters.reduce((current, voterId) => castRoleVote(current, voterId, second), secondRunoff)
    const resolved = resolveRolesRunoff(broken)
    expect(resolved.phase).toBe('reveal')
    expect(resolved.revealedPlayerId).toBe(second)
  })

  it('records a vote correction in the end-of-game record', () => {
    const live = firstDayVote()
    const voter = live.votingOrder[0]
    const target = live.votingOrder[1]
    const corrected = retractRoleVote(castRoleVote(live, voter, target))
    const voterName = live.players.find((player) => player.id === voter)!.name
    const targetName = live.players.find((player) => player.id === target)!.name

    expect(corrected.votes).toEqual({})
    expect(corrected.eventLog.at(-1)).toBe(`Day 1 correction: ${voterName}'s vote for ${targetName} was withdrawn.`)
  })
})
