import { describe, expect, it } from 'vitest'
import { defaultMafiaCount, getRoleCounts } from './roles'

describe('role setup', () => {
  it('uses the locked mafia defaults', () => {
    expect(defaultMafiaCount(7)).toBe(2)
    expect(defaultMafiaCount(11)).toBe(3)
    expect(defaultMafiaCount(15)).toBe(4)
  })

  it('creates a roleless game with only mafia and civilians', () => {
    expect(getRoleCounts({ playerCount: 8, variant: 'roleless' })).toEqual({
      mafia: 2,
      doctor: 0,
      detective: 0,
      sheriff: 0,
      civilian: 6
    })
  })

  it('keeps the role table as the default preset', () => {
    expect(getRoleCounts({ playerCount: 7, variant: 'roles' })).toEqual({
      mafia: 2,
      doctor: 1,
      detective: 0,
      sheriff: 0,
      civilian: 4
    })
  })

  it('supports the roles variant and sheriff choice', () => {
    expect(getRoleCounts({
      playerCount: 10,
      variant: 'roles',
      doctorEnabled: true,
      detectiveEnabled: false,
      sheriffEnabled: true,
    })).toEqual({
      mafia: 3,
      doctor: 1,
      detective: 0,
      sheriff: 1,
      civilian: 5
    })
  })

  it('allows every special role to be configured at any valid player count', () => {
    expect(getRoleCounts({
      playerCount: 7,
      variant: 'roles',
      doctorEnabled: true,
      detectiveEnabled: true,
      sheriffEnabled: true
    })).toEqual({
      mafia: 2,
      doctor: 1,
      detective: 1,
      sheriff: 1,
      civilian: 2
    })
  })
})
