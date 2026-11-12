import { createContext, useContext } from 'react'
import type { GameAction } from '../game/engine'
import type { NightDraft, Session } from '../app/session'
import type { TimerState } from '../app/timer'

export interface GameControls {
  session: Session
  /** Sends one action through the engine. Invalid actions surface as an error message, never a fallback. */
  run: (action: GameAction) => void
  undo: () => void
  canUndo: boolean
  setTimer: (timer: TimerState) => void
  setNightDraft: (draft: NightDraft) => void
  restoreCheckpoint: (id: string) => void
  setCheckpointNote: (id: string, note: string) => void
  /** Clears the active game and returns to setup. Callers confirm first. */
  leaveGame: () => void
  openRules: () => void
  openStats: () => void
}

export const GameContext = createContext<GameControls | null>(null)

export function useGame(): GameControls {
  const controls = useContext(GameContext)
  if (!controls) throw new Error('useGame must be used inside a game screen.')
  return controls
}
