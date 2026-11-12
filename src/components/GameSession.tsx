import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { haptic } from '../app/alerts'
import { appRandom } from '../app/random'
import { canUndo, commitGame, describeAction, restoreCheckpoint, setCheckpointNote, setNightDraft, setTimer, undoSession } from '../app/session'
import type { NightDraft, Session } from '../app/session'
import type { Store } from '../app/store'
import type { TimerState } from '../app/timer'
import { applyAction } from '../game/engine'
import type { GameAction } from '../game/engine'
import type { RandomSource } from '../game/types'
import { DayRunner } from './DayRunner'
import { EndScreen } from './EndScreen'
import { GameContext } from './GameContext'
import type { GameControls } from './GameContext'
import { MorningReport } from './MorningReport'
import { NightWizard } from './NightWizard'
import { PrivateRoleReveal } from './PrivateRoleReveal'

interface GameSessionProps {
  store: Store<Session | null>
  onLeave: () => void
  onOpenRules: () => void
  onOpenStats: () => void
  onError: (message: string | null) => void
  random?: RandomSource
  children?: ReactNode
}

/**
 * Builds the game controls over a session store: every action goes through the engine, then
 * commitGame records the checkpoint. App and component tests share this so they behave the same.
 */
export function GameSession({ store, onLeave, onOpenRules, onOpenStats, onError, random = appRandom, children }: GameSessionProps) {
  const session = useSyncExternalStore(store.subscribe, store.getState)

  const run = useCallback((action: GameAction) => {
    const current = store.getState()
    if (!current) return
    try {
      const next = applyAction(current.game, action, random)
      store.setState(commitGame(current, next, describeAction(action, current.game, next), Date.now()))
      onError(null)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'That action is not allowed right now.')
    }
  }, [store, random, onError])

  const update = useCallback((change: (current: Session) => Session) => {
    store.setState((current) => current ? change(current) : current)
  }, [store])

  const controls = useMemo<GameControls | null>(() => session && {
    session,
    run,
    undo: () => {
      haptic()
      update(undoSession)
    },
    canUndo: canUndo(session),
    setTimer: (timer: TimerState) => update((current) => setTimer(current, timer)),
    setNightDraft: (draft: NightDraft) => update((current) => setNightDraft(current, draft)),
    restoreCheckpoint: (id: string) => update((current) => restoreCheckpoint(current, id)),
    setCheckpointNote: (id: string, note: string) => update((current) => setCheckpointNote(current, id, note)),
    leaveGame: onLeave,
    openRules: onOpenRules,
    openStats: onOpenStats
  }, [session, run, update, onLeave, onOpenRules, onOpenStats])

  if (!controls) return null
  return (
    <GameContext.Provider value={controls}>
      <GameScreen session={controls.session} />
      {children}
    </GameContext.Provider>
  )
}

function GameScreen({ session }: { session: Session }) {
  const { game } = session
  const screenKey = `${game.phase}:${game.round}:${game.revealIndex}:${game.runoff?.number ?? 0}`

  // Each new screen starts at the top instead of inheriting the previous screen's scroll position.
  useEffect(() => {
    window.scrollTo?.({ top: 0 })
  }, [screenKey])

  if (game.phase === 'deal') return <PrivateRoleReveal />
  if (game.phase === 'ended') return <EndScreen />
  if (game.phase === 'night') return <NightWizard />
  if (game.phase === 'morning') return <MorningReport />
  return <DayRunner />
}
