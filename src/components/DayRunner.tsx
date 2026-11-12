import { haptic } from '../app/alerts'
import { createTimer } from '../app/timer'
import { joinNames } from '../game/core'
import type { GameState, PlayerId } from '../game/types'
import { activeVotes, currentVoter, isVoteComplete, lastVoter, remainingVoters, tallyEntries, voteProgress, voteTargets } from '../game/voting'
import { useConfirm } from './ConfirmProvider'
import { GameBoard } from './GameBoard'
import { useGame } from './GameContext'
import { GameHeader } from './GameHeader'
import { roleTextClass } from './roleStyles'
import { TimerPanel } from './TimerPanel'

function nameOf(game: GameState, id: PlayerId | null | undefined): string {
  return game.players.find((player) => player.id === id)?.name ?? 'Unknown player'
}

const titles: Record<string, string> = {
  discussion: 'Open discussion',
  voting: 'Live vote',
  runoff: 'Runoff vote',
  defense: 'Defense',
  reveal: 'Elimination reveal'
}

/** Discussion, live vote, tie defenses, runoffs, and the voted-out reveal for both variants. */
export function DayRunner() {
  const { session } = useGame()
  const game = session.game
  const dayLabel = game.variant === 'roles' ? `Day ${game.round}` : `No roles · Round ${game.round}`
  const voting = game.phase === 'voting' || game.phase === 'runoff'
  const defenseCandidates = game.runoff?.candidates ?? []
  const highlightId = voting
    ? currentVoter(game)
    : game.phase === 'defense'
      ? defenseCandidates[Math.min(session.timer.defenseCandidateIndex, defenseCandidates.length - 1)] ?? null
      : null

  return (
    <main className="screen bg-paper text-ink" data-phase={game.phase}>
      <div className="mx-auto max-w-5xl">
        <GameHeader eyebrow={dayLabel} showActivity={game.variant === 'roleless'} title={titles[game.phase] ?? 'Day'} />
        {game.phase === 'discussion' && <Discussion />}
        {(game.phase === 'voting' || game.phase === 'runoff') && <Voting />}
        {game.phase === 'defense' && <Defense />}
        {game.phase === 'reveal' && <Reveal />}
        <GameBoard game={game} highlightId={highlightId} votes={voting ? activeVotes(game) : undefined} />
      </div>
    </main>
  )
}

function Discussion() {
  const { run } = useGame()
  const confirm = useConfirm()

  const startVoting = async () => {
    const ok = await confirm({
      title: 'Start the vote?',
      body: 'The discussion ends and the living players are shuffled into a fresh voting order.',
      confirmLabel: 'Start voting'
    })
    if (ok) run({ type: 'startVoting' })
  }

  return (
    <section className="rounded-2xl border border-ink/15 bg-white/55 p-5 sm:p-8">
      <p className="mb-6 max-w-xl text-lg leading-8 text-ink/75">The room is talking. The GM controls the clock and starts the vote when the room is ready.</p>
      <TimerPanel />
      <button className="mt-6 min-h-12 rounded-xl border border-ink/25 px-5 py-3 font-bold" onClick={startVoting} type="button">Start voting <span aria-hidden="true">→</span></button>
    </section>
  )
}

function Voting() {
  const { session, run } = useGame()
  const confirm = useConfirm()
  const game = session.game
  const voter = currentVoter(game)
  const votes = activeVotes(game)
  const tally = tallyEntries(votes)
  const counts = new Map(tally.map((entry) => [entry.playerId, entry.count]))
  const highest = tally[0]?.count ?? 0
  const upcoming = remainingVoters(game).slice(1)
  const complete = isVoteComplete(game)
  const runoff = game.phase === 'runoff' ? game.runoff : null
  const everyoneVotes = runoff ? runoff.candidates.some((id) => runoff.eligibleVoters.includes(id)) : false
  const progress = voteProgress(game)
  const previousVoter = lastVoter(game)
  const leaderNames = joinNames(progress.leaders.map((id) => nameOf(game, id)))
  const status = progress.clinchedId
    ? `${nameOf(game, progress.clinchedId)} can no longer be caught.`
    : progress.leaders.length > 1
      ? `Tied at ${progress.leaderCount}: ${leaderNames}.`
      : progress.leaders.length === 1
        ? `${leaderNames} leads with ${progress.leaderCount}.`
        : 'No votes yet.'

  const castVote = (targetId: PlayerId) => {
    if (!voter) return
    haptic()
    run({ type: 'castVote', voterId: voter, targetId })
  }

  const changeLastVote = async () => {
    if (!previousVoter) return
    const target = nameOf(game, votes[previousVoter])
    const ok = await confirm({
      title: `Change ${nameOf(game, previousVoter)}'s vote?`,
      body: `Their vote for ${target} is withdrawn and they vote again. The correction is recorded.`,
      confirmLabel: 'Change vote'
    })
    if (ok) run({ type: 'retractVote' })
  }

  const resolve = async () => {
    const ok = await confirm({
      title: runoff ? 'Resolve the runoff?' : 'Resolve the vote?',
      body: 'The most votes is out. A tie goes to defenses and a runoff.',
      confirmLabel: runoff ? 'Resolve runoff' : 'Resolve vote'
    })
    if (ok) run({ type: runoff ? 'resolveRunoff' : 'resolveVote' })
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="rounded-2xl bg-ink p-5 text-paper sm:p-8">
        <p className="mb-2 text-sm uppercase tracking-[0.2em] text-brass">{runoff ? `Runoff ${runoff.number}` : 'Now voting'}</p>
        {runoff && (
          <p className="mb-4 text-sm leading-6 text-paper/75">
            Tied: {runoff.candidates.map((id) => nameOf(game, id)).join(', ')}. {everyoneVotes ? 'Everyone is tied, so everyone votes again.' : 'Tied players do not vote.'}
          </p>
        )}
        <h2 aria-live="polite" className="break-words font-display text-4xl font-bold" data-testid="current-voter">{voter ? nameOf(game, voter) : 'All votes entered'}</h2>
        <p className="mt-3 text-sm font-bold tabular-nums text-brass" data-testid="vote-progress">
          {progress.cast} of {progress.total} votes cast · {progress.remaining} to go · majority {progress.majority}
        </p>
        <p aria-live="polite" className="mt-1 text-sm text-paper/80" data-testid="vote-status">{status}</p>
        <p className="mt-3 leading-7 text-paper/75">{voter ? 'Who is this player accusing?' : 'Check the tally, then resolve.'}</p>
        {complete && <button className="mt-6 min-h-12 rounded-xl bg-ember px-5 py-3 font-bold text-paper" onClick={resolve} type="button">{runoff ? 'Resolve runoff' : 'Resolve vote'}</button>}
        {upcoming.length > 0 && (
          <div className="mt-6 border-t border-paper/15 pt-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-paper/60">Up next</p>
            <ol className="flex flex-wrap gap-2 text-sm">
              {upcoming.map((id) => <li className="rounded-full border border-paper/20 px-3 py-1" key={id}>{nameOf(game, id)}</li>)}
            </ol>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-ink/15 bg-white/55 p-5 sm:p-8">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-ink/60">Choose accused player</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {voteTargets(game).map((id) => (
            <button
              className="flex min-h-14 items-center justify-between rounded-xl border border-ink/15 bg-white px-4 text-left font-bold transition hover:border-ember hover:bg-ember/5"
              data-testid="vote-target"
              key={id}
              onClick={() => castVote(id)}
              type="button"
            >
              <span data-testid="vote-target-name">{nameOf(game, id)}</span>
              {counts.get(id) ? <span className="ml-3 rounded-full bg-sage/15 px-2 text-sm text-sage">{counts.get(id)}</span> : null}
            </button>
          ))}
        </div>

        <div className="mt-6 border-t border-ink/10 pt-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-ink/60">Live tally</p>
          {tally.length === 0 ? <p className="text-sm text-ink/60">No votes yet.</p> : (
            <ol className="space-y-2" data-testid="live-tally">
              {tally.map((entry) => (
                <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm font-bold" key={entry.playerId}>
                  <span className="min-w-0">
                    <span className="block truncate">{nameOf(game, entry.playerId)}</span>
                    <span aria-hidden="true" className="mt-1 block h-1.5 rounded-full bg-ember/70" style={{ width: `${(entry.count / highest) * 100}%` }} />
                  </span>
                  <span className="tabular-nums">{entry.count} {entry.count === 1 ? 'vote' : 'votes'}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="mt-6 border-t border-ink/10 pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink/60">Votes entered</p>
            {previousVoter && <button className="min-h-11 rounded-lg border border-ink/20 px-3 text-sm font-bold" onClick={changeLastVote} type="button">Change last vote</button>}
          </div>
          <ol className="space-y-1.5">
            {Object.entries(votes).map(([voterId, targetId]) => (
              <li className="text-sm font-bold text-sage" key={voterId}>{nameOf(game, voterId)} voted for {nameOf(game, targetId)}</li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  )
}

function Defense() {
  const { session, run, setTimer } = useGame()
  const confirm = useConfirm()
  const game = session.game
  const candidates = game.runoff?.candidates ?? []
  const index = Math.min(session.timer.defenseCandidateIndex, Math.max(0, candidates.length - 1))
  const isLast = index >= candidates.length - 1

  const next = async () => {
    if (!isLast) {
      setTimer(createTimer('defense', session.settings.defenseSeconds * 1000, index + 1))
      return
    }
    const ok = await confirm({
      title: `Start runoff ${game.runoff?.number ?? 1}?`,
      body: 'Defenses are over. The other living players vote to eliminate exactly one tied player.',
      confirmLabel: 'Start runoff'
    })
    if (ok) run({ type: 'startRunoff' })
  }

  return (
    <section className="rounded-2xl border border-brass/40 bg-brass/10 p-5 sm:p-8">
      <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-yellow-800">Defense {index + 1} of {candidates.length}</p>
      <h2 className="break-words font-display text-4xl font-bold">{nameOf(game, candidates[index])}</h2>
      <p className="mt-3 max-w-lg leading-7 text-ink/75">Up to {session.settings.defenseSeconds} seconds. Move on early if they finish or waive their defense.</p>
      <ol className="my-5 flex flex-wrap gap-2 text-sm font-bold">
        {candidates.map((id, position) => (
          <li aria-current={position === index ? 'step' : undefined} className={`rounded-full px-3 py-1 ${position === index ? 'bg-ink text-paper' : position < index ? 'bg-ink/10 text-ink/60 line-through' : 'border border-ink/20'}`} key={id}>{nameOf(game, id)}</li>
        ))}
      </ol>
      <TimerPanel />
      <button className="mt-6 min-h-12 rounded-xl border border-ink/25 px-5 py-3 font-bold" onClick={next} type="button">{isLast ? 'Start runoff' : 'Next defense'} <span aria-hidden="true">→</span></button>
    </section>
  )
}

function Reveal() {
  const { session, run } = useGame()
  const confirm = useConfirm()
  const game = session.game
  const player = game.players.find((candidate) => candidate.id === game.revealedPlayerId)
  if (!player) return null

  const nextLabel = game.winner ? 'Show final board' : game.variant === 'roles' ? `Start Night ${game.round + 1}` : `Start round ${game.round + 1}`

  const advance = async () => {
    const ok = await confirm({
      title: game.winner ? 'The game is decided. Show the final board?' : `${nextLabel}?`,
      body: game.winner ? 'Every role will be shown to the table.' : 'Make sure the table has seen the reveal.',
      confirmLabel: nextLabel
    })
    if (ok) run({ type: 'confirmElimination' })
  }

  return (
    <section className="rounded-2xl border border-ink/15 bg-white/55 p-5 sm:p-8">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-ember">Voted out</p>
      <h2 className="mt-2 break-words font-display text-5xl font-bold">{player.name}</h2>
      <p className={`mt-4 text-2xl font-bold capitalize ${roleTextClass(player.role)}`}>{player.role}</p>
      <p className="mt-3 leading-7 text-ink/75">Voted-out players always reveal their role.</p>
      <button className="mt-6 min-h-12 rounded-xl bg-ink px-5 py-3 font-bold text-paper" onClick={advance} type="button">{nextLabel} <span aria-hidden="true">→</span></button>
    </section>
  )
}
