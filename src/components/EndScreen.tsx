import { useState } from 'react'
import { buildGameReport } from '../app/report'
import { useConfirm } from './ConfirmProvider'
import { Dialog } from './Dialog'
import { useGame } from './GameContext'
import { GameHeader } from './GameHeader'
import { roleTextClass } from './roleStyles'
import { UpdateBanner } from './UpdateBanner'

/** Victory banner, every role on one board, and (roles games) the GM-only record, shown only now. */
export function EndScreen() {
  const { session, leaveGame, openStats } = useGame()
  const confirm = useConfirm()
  const [shareStatus, setShareStatus] = useState('')
  const [manualText, setManualText] = useState<string | null>(null)
  const game = session.game
  const winner = game.winner === 'mafia' ? 'Mafia' : 'Town'

  const newGame = async () => {
    const ok = await confirm({
      title: 'Start a new game?',
      body: 'This game is cleared. Player names are kept; every other setting goes back to its default.',
      confirmLabel: 'New game'
    })
    if (ok) leaveGame()
  }

  /** Share sheet first, then the clipboard, then a text box to copy by hand. All work offline. */
  const share = async () => {
    const text = buildGameReport(session)
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `Mafia: ${winner} wins`, text })
        setShareStatus('Shared.')
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      setShareStatus('Copied the game record to the clipboard.')
    } catch {
      setManualText(text)
    }
  }

  return (
    <main className="screen bg-ink text-paper" data-phase="ended">
      <div className="mx-auto max-w-3xl">
        <UpdateBanner dark />
        <GameHeader dark eyebrow="Game over" notesAllowed showActivity showExit={false} title={`${winner} wins`} />

        <section aria-label="Final roles" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {game.players.map((player) => (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-paper/15 px-4 py-3" key={player.id}>
              <span className={player.alive ? '' : 'text-paper/65 line-through'}>{player.name}</span>
              <strong className={`capitalize ${roleTextClass(player.role, true)}`}>{player.role}</strong>
            </div>
          ))}
        </section>

        {game.variant === 'roles' && (
          <section className="mt-8 border-t border-paper/15 pt-6">
            <h2 className="font-display text-3xl font-bold">Game record</h2>
            {game.eventLog.length > 0
              ? <ol className="mt-4 space-y-3">{game.eventLog.map((event, index) => <li className="border-l border-brass/60 pl-4 leading-7 text-paper/85" key={`${index}-${event}`}>{event}</li>)}</ol>
              : <p className="mt-3 text-paper/70">No recorded events.</p>}
          </section>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <button className="min-h-12 rounded-xl bg-brass px-5 py-3 font-bold text-ink" onClick={newGame} type="button">New game</button>
          <button className="min-h-12 rounded-xl border border-paper/25 px-5 py-3 font-bold" onClick={share} type="button">Share record</button>
          <button aria-haspopup="dialog" className="min-h-12 rounded-xl border border-paper/25 px-5 py-3 font-bold" onClick={openStats} type="button">Stats</button>
        </div>
        <p aria-live="polite" className="mt-3 min-h-6 text-sm font-bold text-brass" role="status">{shareStatus}</p>
      </div>

      {manualText !== null && (
        <Dialog description="Sharing is not available here. Select the text and copy it." onClose={() => setManualText(null)} title="Game record">
          <textarea
            aria-label="Game record text"
            className="min-h-64 w-full rounded-lg border border-ink/15 bg-white p-3 font-mono text-sm"
            onFocus={(event) => event.currentTarget.select()}
            readOnly
            value={manualText}
          />
          <button className="mt-4 min-h-11 rounded-lg border border-ink/20 px-4 text-sm font-bold" onClick={() => setManualText(null)} type="button">Close</button>
        </Dialog>
      )}
    </main>
  )
}
