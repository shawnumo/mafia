import { describe, expect, it } from 'vitest'
import { applyAction, createGame } from '../game/engine'
import type { GameAction } from '../game/engine'
import { currentVoter, voteTargets } from '../game/voting'
import { canUndo, commitGame, createSession, DEFAULT_SETTINGS, describeAction, restoreCheckpoint, setNightDraft, undoSession } from './session'
import type { Session } from './session'
import { isRunning, startTimer } from './timer'

const names = ['Ada', 'Ben', 'Cleo', 'Dara', 'Eli', 'Faye', 'Gus']
const stableRandom = () => 0.999999
const roleWords = /\b(mafia|doctor|detective|sheriff|civilian)\b/i

function run(session: Session, action: GameAction, now = 1_000): Session {
  const next = applyAction(session.game, action, stableRandom)
  return commitGame(session, next, describeAction(action, session.game, next), now)
}

function dealtSession(variant: 'roleless' | 'roles'): Session {
  let session = createSession(createGame({ variant, playerCount: 7, playerNames: names }, stableRandom), DEFAULT_SETTINGS)
  for (let index = 0; index < names.length; index += 1) {
    session = run(run(session, { type: 'confirmRoleViewed' }), { type: 'advanceReveal' })
  }
  return session
}

function voteRound(session: Session): Session {
  let current = run(session, { type: 'startVoting' })
  while (currentVoter(current.game)) {
    const voter = currentVoter(current.game)!
    const target = voteTargets(current.game).find((id) => current.game.players.find((player) => player.id === id)?.role !== 'mafia') ?? voteTargets(current.game)[0]
    current = run(current, { type: 'castVote', voterId: voter, targetId: target })
  }
  return current
}

describe('session checkpoints', () => {
  it('never creates a checkpoint during the private deal', () => {
    let session = createSession(createGame({ variant: 'roleless', playerCount: 7, playerNames: names }, stableRandom), DEFAULT_SETTINGS)
    session = run(session, { type: 'confirmRoleViewed' })
    session = run(session, { type: 'advanceReveal' })
    expect(session.timeline).toHaveLength(0)

    const dealt = dealtSession('roleless')
    expect(dealt.timeline.map((entry) => entry.label)).toEqual(['Game started · 7 players · no roles'])
    expect(canUndo(dealt)).toBe(false)
  })

  it('undo and restore step back through game actions but never into the deal', () => {
    const dealt = dealtSession('roleless')
    const voting = run(dealt, { type: 'startVoting' }, 2_000)
    const voter = currentVoter(voting.game)!
    const voted = run(voting, { type: 'castVote', voterId: voter, targetId: voteTargets(voting.game)[0] }, 3_000)

    expect(canUndo(voted)).toBe(true)
    const undone = undoSession(voted)
    expect(undone.game).toEqual(voting.game)
    expect(undone.timeline).toHaveLength(2)

    const corrected = run(voted, { type: 'retractVote' }, 4_000)
    expect(corrected.timeline.at(-1)?.label).toMatch(/^Correction: .+'s vote for .+ withdrawn$/)
    expect(corrected.game.votes).toEqual({})

    const restored = restoreCheckpoint(voted, voted.timeline[0].id)
    expect(restored.game.phase).toBe('discussion')
    expect(restored.timeline).toHaveLength(1)
    expect(canUndo(restored)).toBe(false)
    expect(undoSession(restored)).toBe(restored)

    const tampered = { ...voted, timeline: [{ ...voted.timeline[0], game: { ...voted.timeline[0].game, phase: 'deal' as const } }, ...voted.timeline.slice(1)] }
    expect(restoreCheckpoint(tampered, tampered.timeline[0].id)).toBe(tampered)
  })

  it('resets the timer on phase changes and stores checkpoints with a paused timer', () => {
    const dealt = dealtSession('roleless')
    const running = { ...dealt, timer: startTimer(dealt.timer, 0) }
    const voting = run(running, { type: 'startVoting' }, 10_000)

    expect(isRunning(voting.timer)).toBe(false)
    expect(voting.timer.remainingMs).toBe(DEFAULT_SETTINGS.discussionSeconds * 1000)
    expect(voting.timeline.every((entry) => entry.timer.endsAt === null)).toBe(true)
  })

  it('keeps night picks only while the night lasts', () => {
    const night = dealtSession('roles')
    expect(night.game.phase).toBe('night')
    expect(night.nightDraft).toEqual({ stepIndex: 0 })

    const target = night.game.players.find((player) => player.role === 'civilian')!.id
    const drafted = setNightDraft(night, { stepIndex: 1, mafiaTargetId: target })
    expect(drafted.nightDraft?.mafiaTargetId).toBe(target)

    const morning = run(drafted, { type: 'resolveNight', actions: { mafiaTargetId: target } })
    expect(morning.nightDraft).toBeNull()
    expect(setNightDraft(morning, { stepIndex: 0 })).toBe(morning)
  })

  it('labels checkpoints without ever naming a secret role before the game ends', () => {
    let session = dealtSession('roles')
    const target = session.game.players.find((player) => player.role === 'civilian')!.id
    session = run(session, { type: 'resolveNight', actions: { mafiaTargetId: target } })
    session = run(session, { type: 'startDay' })
    session = voteRound(session)
    session = run(session, { type: 'resolveVote' })

    const labels = session.timeline.map((entry) => entry.label)
    expect(labels).toEqual(expect.arrayContaining(['Night 1 resolved', 'Day 1 started', 'Day 1 · voting started']))
    labels.forEach((label) => expect(label).not.toMatch(roleWords))
  })
})
