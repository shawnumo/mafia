import { describe, expect, it } from 'vitest'
import { advanceRoleReveal, confirmRoleViewed, createRolesGame, currentRevealPlayer, publicRolesView, resolveNight, startNight, startRolesDiscussion } from './rolesEngine'

const names = ['Ada', 'Ben', 'Cleo', 'Dara', 'Eli', 'Faye', 'Gus']
const stableRandom = () => 0.999999

function withNight(game: ReturnType<typeof createRolesGame>) {
  return startNight(startRolesDiscussion(game))
}

describe('roles game engine', () => {
  it('assigns every configured role at any valid player count', () => {
    const game = createRolesGame({
      playerNames: names,
      playerCount: 7,
      doctorEnabled: true,
      detectiveEnabled: true,
      sheriffEnabled: true
    }, stableRandom)

    expect(game.phase).toBe('reveal')
    expect(game.players.map((player) => player.role).sort()).toEqual(['civilian', 'civilian', 'detective', 'doctor', 'mafia', 'mafia', 'sheriff'].sort())
    expect(publicRolesView(game)).not.toEqual(game.players)
    expect(JSON.stringify(publicRolesView(game))).not.toContain('mafia')
  })

  it('keeps the role-table detective default for larger games', () => {
    const game = createRolesGame({ playerNames: [...names, 'Hana', 'Ivan'], playerCount: 9 }, stableRandom)
    expect(game.players.filter((player) => player.role === 'doctor')).toHaveLength(1)
    expect(game.players.filter((player) => player.role === 'detective')).toHaveLength(1)
    expect(game.players.filter((player) => player.role === 'sheriff')).toHaveLength(0)
  })

  it('requires confirmation before manually advancing every private role reveal', () => {
    let game = createRolesGame({ playerNames: names, playerCount: 7 }, stableRandom)
    const firstPlayer = currentRevealPlayer(game)

    expect(() => advanceRoleReveal(game)).toThrow('confirm')
    game = confirmRoleViewed(game)
    expect(currentRevealPlayer(game)).toEqual(firstPlayer)
    game = advanceRoleReveal(game)

    expect(game.revealIndex).toBe(1)
    expect(game.revealConfirmed).toBe(false)
    expect(game.phase).toBe('reveal')
  })

  it('enters discussion only after the final player confirms and advances', () => {
    let game = createRolesGame({ playerNames: names, playerCount: 7 }, stableRandom)
    for (let index = 0; index < names.length; index += 1) {
      game = advanceRoleReveal(confirmRoleViewed(game))
    }

    expect(game.phase).toBe('discussion')
    expect(game.revealConfirmed).toBe(false)
  })

  it('resolves a mafia kill saved by the doctor and returns private detective feedback', () => {
    const game = withNight(createRolesGame({ playerNames: names, playerCount: 7, doctorEnabled: true, detectiveEnabled: true }, stableRandom))
    const mafiaTarget = game.players.find((player) => player.role === 'civilian')!.id
    const doctorTarget = mafiaTarget
    const detectiveGuess = game.players.find((player) => player.role === 'mafia')!.id
    const result = resolveNight(game, { mafiaTargetId: mafiaTarget, doctorTargetId: doctorTarget, detectiveGuessId: detectiveGuess })

    expect(result.deaths).toEqual([])
    expect(result.savedPlayerId).toBe(mafiaTarget)
    expect(result.detectiveResult).toBe(true)
    expect(result.state.phase).toBe('morning')
  })

  it('resolves an innocent sheriff shot as a sheriff self-kill that cannot be saved', () => {
    const game = withNight(createRolesGame({ playerNames: names, playerCount: 7, doctorEnabled: true, sheriffEnabled: true }, stableRandom))
    const sheriff = game.players.find((player) => player.role === 'sheriff')!
    const innocent = game.players.find((player) => player.role === 'civilian')!
    const mafiaTarget = game.players.find((player) => player.role === 'mafia')!
    const result = resolveNight(game, { mafiaTargetId: mafiaTarget.id, sheriffTargetId: innocent.id, doctorTargetId: sheriff.id })

    expect(result.deaths).toContain(sheriff.id)
    expect(result.deaths).toContain(mafiaTarget.id)
    expect(result.savedPlayerId).toBeNull()
  })

  it('resolves independent mafia and sheriff kills', () => {
    const game = withNight(createRolesGame({ playerNames: names, playerCount: 7, sheriffEnabled: true }, stableRandom))
    const sheriff = game.players.find((player) => player.role === 'sheriff')!
    const mafiaTarget = game.players.find((player) => player.role === 'mafia')!
    const secondMafia = game.players.find((player) => player.role === 'mafia' && player.id !== mafiaTarget.id)!
    const result = resolveNight(game, { mafiaTargetId: mafiaTarget.id, sheriffTargetId: secondMafia.id })

    expect(result.deaths).toEqual(expect.arrayContaining([mafiaTarget.id, secondMafia.id]))
    expect(result.deaths).toHaveLength(2)
    expect(result.state.players.find((player) => player.id === sheriff.id)?.alive).toBe(true)
  })
})
