import { describe, expect, it } from 'vitest'
import { validateSetup } from './setup'

const names = ['Ada', 'Ben', 'Cleo', 'Dara', 'Eli', 'Faye', 'Gus']
const validOptions = { playerCount: 7, variant: 'roles' as const, doctorEnabled: true }

describe('setup validation', () => {
  it('accepts a valid role mix, roster, and timer configuration', () => {
    expect(validateSetup(validOptions, names, 5, 30)).toEqual([])
  })

  it('reports blank and duplicate names before role assignment', () => {
    expect(validateSetup(validOptions, ['Ada', 'Ben', 'Cleo', 'Dara', 'Eli', 'Faye', ' '], 5, 30))
      .toContain('Every player needs a name.')
    expect(validateSetup(validOptions, ['Ada', 'Ben', 'Cleo', 'Dara', 'Eli', 'Faye', ' ada '], 5, 30))
      .toContain('Player names must be unique.')
  })

  it('rejects a mafia count outside the allowed preset range', () => {
    const options = { ...validOptions, mafiaOverride: 4, detectiveEnabled: true, sheriffEnabled: true }

    expect(validateSetup(options, names, 5, 30)).toContain('Mafia count can only vary by one from the default.')
  })

  it('validates timer bounds and requires whole minutes and seconds', () => {
    expect(validateSetup(validOptions, names, 0, 30)).toContain('Discussion time must be a whole number between 1 and 30 minutes.')
    expect(validateSetup(validOptions, names, 1.5, 30)).toContain('Discussion time must be a whole number between 1 and 30 minutes.')
    expect(validateSetup(validOptions, names, 5, 5.5)).toContain('Defense time must be a whole number between 5 and 300 seconds.')
  })

  it('accepts the table defaults and every allowed override at every player count', () => {
    const roster = Array.from({ length: 15 }, (_, index) => `Seat ${index + 1}`)
    for (let playerCount = 7; playerCount <= 15; playerCount += 1) {
      for (const variant of ['roleless', 'roles'] as const) {
        expect(validateSetup({ playerCount, variant }, roster, 5, 30)).toEqual([])
        const allRoles = { playerCount, variant, doctorEnabled: true, detectiveEnabled: true, sheriffEnabled: true }
        expect(validateSetup({ ...allRoles, mafiaOverride: playerCount >= 14 ? 5 : playerCount >= 9 ? 4 : 3 }, roster, 5, 30)).toEqual([])
      }
    }
  })
})
