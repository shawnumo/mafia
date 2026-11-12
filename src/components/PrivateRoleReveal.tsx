import { useEffect, useState } from 'react'
import { currentDealPlayer } from '../game/core'
import { useConfirm } from './ConfirmProvider'
import { useGame } from './GameContext'
import { HoldToReveal } from './HoldToReveal'
import { roleTextClass } from './roleStyles'

/**
 * Pass-the-phone reveal. There is deliberately no Undo or Exit here: the phone is in a player's hands.
 * The peek turns off once the player confirms, and only a confirmed GM pause leads anywhere else.
 */
export function PrivateRoleReveal() {
  const { session, run, leaveGame } = useGame()
  const confirm = useConfirm()
  const game = session.game
  const player = currentDealPlayer(game)
  const [viewed, setViewed] = useState(false)
  const [paused, setPaused] = useState(false)
  const isLast = game.revealIndex === game.players.length - 1
  const finalLabel = game.variant === 'roles' ? 'Start night' : 'Start discussion'

  useEffect(() => setViewed(false), [game.revealIndex])

  const pause = async () => {
    const ok = await confirm({
      title: 'Pause the reveal?',
      body: 'GM only. The reveal is hidden until you resume it. No role is shown on the pause screen.',
      confirmLabel: 'Pause reveal'
    })
    if (ok) setPaused(true)
  }

  const advance = async () => {
    if (isLast) {
      const ok = await confirm({
        title: game.variant === 'roles' ? 'Everyone has their role. Start Night 1?' : 'Everyone has their role. Open the discussion?',
        body: 'The private reveal closes for good once the game moves on.',
        confirmLabel: finalLabel
      })
      if (!ok) return
    }
    run({ type: 'advanceReveal' })
  }

  const abandon = async () => {
    const ok = await confirm({
      title: 'Abandon this game?',
      body: 'Every role assignment is discarded. Player names are kept for the next game.',
      confirmLabel: 'Abandon game',
      tone: 'danger'
    })
    if (ok) leaveGame()
  }

  if (paused) {
    return (
      <main className="screen bg-ink text-paper">
        <div className="mx-auto flex min-h-[80dvh] max-w-md flex-col justify-center gap-4 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brass">Reveal paused</p>
          <h1 className="font-display text-4xl font-bold">The reveal is hidden.</h1>
          <p className="text-paper/75">Player {game.revealIndex + 1} of {game.players.length} is next.</p>
          <button className="min-h-12 rounded-xl bg-paper px-5 font-bold text-ink" onClick={() => setPaused(false)} type="button">Resume reveal</button>
          <button className="min-h-12 rounded-xl border border-paper/25 px-5 font-bold" onClick={abandon} type="button">Abandon game</button>
        </div>
      </main>
    )
  }

  return (
    <main className="screen bg-ink text-paper">
      <div className="mx-auto flex min-h-[85dvh] max-w-2xl flex-col">
        <header className="border-b border-paper/15 pb-5">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brass">Private role reveal</p>
          <h1 className="font-display text-3xl font-bold">Pass the phone.</h1>
        </header>

        <section className="flex flex-1 flex-col justify-center py-10 text-center">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-paper/65">Player {game.revealIndex + 1} of {game.players.length}</p>
          <h2 className="break-words font-display text-5xl font-bold sm:text-7xl">{player.name}</h2>
          <p className="mx-auto mt-6 max-w-md text-lg leading-8 text-paper/75">
            {game.revealConfirmed ? 'Done. Hand the phone back to the GM.' : 'Only this player should look. Press and hold the button to see your secret role.'}
          </p>

          <div className="mx-auto mt-10 w-full max-w-sm">
            <HoldToReveal
              className="border-brass/70 bg-brass/10 text-brass"
              disabled={game.revealConfirmed}
              disabledText="Role hidden"
              hiddenText="Hold to peek"
              label="Press and hold to peek at role"
              onReveal={() => setViewed(true)}
            >
              <span className={`text-4xl font-bold capitalize ${roleTextClass(player.role, true)}`}>{player.role}</span>
            </HoldToReveal>
          </div>

          <div className="mx-auto mt-8 w-full max-w-sm">
            {!game.revealConfirmed ? (
              <button className="min-h-12 w-full rounded-xl bg-paper px-5 py-3 font-bold text-ink disabled:cursor-not-allowed disabled:opacity-35" disabled={!viewed} onClick={() => run({ type: 'confirmRoleViewed' })} type="button">
                I am done viewing
              </button>
            ) : (
              <button className="min-h-12 w-full rounded-xl bg-ember px-5 py-3 font-bold text-paper" onClick={advance} type="button">
                {isLast ? finalLabel : 'Next player'} <span aria-hidden="true">→</span>
              </button>
            )}
          </div>
        </section>

        <footer className="flex justify-center border-t border-paper/15 pt-4">
          <button className="min-h-11 rounded-lg px-4 text-sm font-bold text-paper/70 underline-offset-4 hover:underline" onClick={pause} type="button">Pause reveal (GM)</button>
        </footer>
      </div>
    </main>
  )
}
