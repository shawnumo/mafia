import { useEffect } from 'react'
import { morningNarration, narrationText } from '../app/narration'
import { speak, speakOnce, speechAvailable } from '../app/speech'
import { useConfirm } from './ConfirmProvider'
import { GameBoard } from './GameBoard'
import { useGame } from './GameContext'
import { GameHeader } from './GameHeader'

/** Public morning announcement: deaths by name, a successful doctor save, nothing about roles or the detective. */
export function MorningReport() {
  const { session, run } = useGame()
  const confirm = useConfirm()
  const game = session.game
  const readAloud = session.settings.readAloud

  // Queued after the night's closing lines, so the table hears the whole hand-off in order.
  useEffect(() => {
    if (!readAloud || game.variant !== 'roles' || game.phase !== 'morning') return
    speakOnce(`morning:${session.id}:${game.round}`, morningNarration(game), { append: true })
  }, [readAloud, game, session.id])

  if (game.variant !== 'roles') return null

  const nameOf = (id: string | null | undefined) => game.players.find((player) => player.id === id)?.name ?? 'Unknown player'
  const deaths = (game.nightSummary?.deaths ?? []).map(nameOf)
  const savedName = game.nightSummary?.savedPlayerId ? nameOf(game.nightSummary.savedPlayerId) : null
  const script = morningNarration(game)
  const nextLabel = game.winner ? 'Show final board' : `Start Day ${game.round}`

  const advance = async () => {
    const ok = await confirm({
      title: game.winner ? 'The night decided the game. Show the final board?' : `Start Day ${game.round}?`,
      body: game.winner ? 'Every role will be shown to the table.' : 'Announce the deaths first. Discussion opens next.',
      confirmLabel: nextLabel
    })
    if (ok) run({ type: 'startDay' })
  }

  return (
    <main className="screen bg-ink text-paper" data-phase="morning">
      <div className="mx-auto max-w-3xl">
        <GameHeader dark eyebrow={`Morning after Night ${game.round}`} title="What happened overnight?" />

        <section className="space-y-6 rounded-2xl border border-paper/15 bg-paper/5 p-5 sm:p-8">
          <div>
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-paper/65">Deaths</p>
            {deaths.length > 0
              ? <ul className="space-y-2 text-2xl font-bold">{deaths.map((name) => <li key={name}>{name}</li>)}</ul>
              : <p className="text-xl text-paper/80">No one died overnight.</p>}
          </div>

          {savedName && (
            <div className="rounded-xl bg-sage/25 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-paper/75">Doctor save</p>
              <p className="mt-1 text-xl font-bold">{savedName} was protected.</p>
            </div>
          )}

          <div className="rounded-xl border border-brass/40 bg-brass/10 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-brass">Suggested script</p>
              {speechAvailable() && <button className="min-h-11 rounded-lg border border-paper/25 px-3 text-sm font-bold" onClick={() => speak(script)} type="button"><span aria-hidden="true">🔊 </span>Read aloud</button>}
            </div>
            <p className="mt-2 text-lg leading-8" data-testid="morning-script">{narrationText(script)}</p>
          </div>
        </section>

        <button className="mt-6 min-h-12 rounded-xl bg-paper px-5 py-3 font-bold text-ink" onClick={advance} type="button">{nextLabel} <span aria-hidden="true">→</span></button>

        <GameBoard dark game={game} />
      </div>
    </main>
  )
}
