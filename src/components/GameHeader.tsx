import { useState } from 'react'
import type { ReactNode } from 'react'
import { useConfirm } from './ConfirmProvider'
import { useGame } from './GameContext'
import { TimelineDialog } from './TimelineDialog'

interface GameHeaderProps {
  eyebrow: string
  title: ReactNode
  dark?: boolean
  showActivity?: boolean
  notesAllowed?: boolean
  showUndo?: boolean
  showExit?: boolean
}

/** Screen header. Title and actions stack on narrow phones so nothing overflows at 320px. */
export function GameHeader({ eyebrow, title, dark = false, showActivity = false, notesAllowed = false, showUndo = true, showExit = true }: GameHeaderProps) {
  const { canUndo, undo, openRules, leaveGame, session } = useGame()
  const confirm = useConfirm()
  const [activityOpen, setActivityOpen] = useState(false)
  const button = `min-h-11 rounded-lg border px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 ${dark ? 'border-paper/25 text-paper' : 'border-ink/20 text-ink'}`

  const exit = async () => {
    const ok = await confirm({
      title: 'Leave this game?',
      body: 'The current game is cleared from this device. Player names are kept for the next game.',
      confirmLabel: 'Leave game',
      tone: 'danger'
    })
    if (ok) leaveGame()
  }

  return (
    <header className={`mb-6 flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between ${dark ? 'border-paper/15' : 'border-ink/15'}`}>
      <div className="min-w-0">
        <p className={`text-xs font-bold uppercase tracking-[0.2em] ${dark ? 'text-brass' : 'text-ember'}`}>{eyebrow}</p>
        <h1 className="mt-1 break-words font-display text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {showUndo && <button aria-label="Undo last action" className={button} disabled={!canUndo} onClick={undo} type="button">Undo</button>}
        {showActivity && (
          <button aria-haspopup="dialog" className={button} onClick={() => setActivityOpen(true)} type="button">
            Activity <span className="ml-1 text-xs opacity-65">{session.timeline.length}</span>
          </button>
        )}
        <button aria-haspopup="dialog" className={button} onClick={openRules} type="button">Rules</button>
        {showExit && <button className={button} onClick={exit} type="button">Exit game</button>}
      </div>
      {activityOpen && <TimelineDialog notesAllowed={notesAllowed} onClose={() => setActivityOpen(false)} />}
    </header>
  )
}
