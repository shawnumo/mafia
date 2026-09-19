import { useEffect, useRef, useState } from 'react'
import { clearActiveGame, loadRolelessSession, loadRolesGame, saveRolelessSession, saveRolesGame } from './app/persistence'
import type { RolelessTimerSnapshot } from './app/persistence'
import { castVote, confirmReveal, createRolelessGame, resolveRunoff, resolveVote, startRunoff, startVoting } from './game/roleless'
import { defaultMafiaCount, getRoleCounts } from './game/roles'
import {
  advanceRoleReveal,
  castRoleVote,
  confirmRoleReveal,
  confirmRoleViewed,
  createRolesGame,
  currentRevealPlayer,
  resolveNight,
  resolveRolesRunoff,
  resolveRolesVote,
  startNight,
  startRolesRunoff,
  startRolesVoting
} from './game/rolesEngine'
import type { NightActions, RolesGameState } from './game/rolesEngine'
import type { RolelessGameState, Variant } from './game/types'

const starterNames = Array.from({ length: 15 }, (_, index) => `Player ${String(index + 1).padStart(2, '0')}`)

type SpecialRoleOption = {
  id: string
  label: string
  enabled: boolean
  setEnabled: (enabled: boolean) => void
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function GameBoard({ game }: { game: RolelessGameState | RolesGameState }) {
  const alivePlayers = game.players.filter((player) => player.alive)
  const mafiaAlive = alivePlayers.filter((player) => player.role === 'mafia').length
  const townAlive = alivePlayers.filter((player) => player.role !== 'mafia').length

  return (
    <section className="mt-8 rounded-[1.75rem] border border-ink/10 bg-[#f9f5ee] p-5 shadow-[0_18px_38px_rgba(19,33,34,0.08)] sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-ink/55">Game board</p>
          <h2 className="mt-2 font-display text-3xl font-bold">Table status</h2>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-ink/10 bg-ink px-3 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-paper">
          <span>{mafiaAlive}</span>
          <span className="text-paper/55">vs</span>
          <span>{townAlive}</span>
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-ink p-4 text-paper"><span className="block text-[10px] uppercase tracking-[0.2em] text-paper/60">Alive</span><strong className="font-display text-3xl">{alivePlayers.length}</strong></div>
        <div className="rounded-2xl border border-ink/10 bg-white/80 p-4"><span className="block text-[10px] uppercase tracking-[0.2em] text-ink/60">Mafia</span><strong className="font-display text-3xl">{mafiaAlive}</strong></div>
        <div className="rounded-2xl border border-ink/10 bg-white/80 p-4"><span className="block text-[10px] uppercase tracking-[0.2em] text-ink/60">Town</span><strong className="font-display text-3xl">{townAlive}</strong></div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {game.players.map((player) => (
          <div className={`flex items-center justify-between rounded-2xl border px-3 py-2.5 text-sm ${player.alive ? 'border-ink/10 bg-white/80' : 'border-ink/10 bg-ink/5 text-ink/45 line-through'}`} key={player.id}>
            <span className="font-bold">{player.name}</span>
            <span className="ml-3 capitalize text-ink/60">{player.role}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function RulesReferenceModal({ onClose }: { onClose: () => void }) {
  const rules = [
    {
      title: 'Setup',
      body: 'Choose roleless or roles, set the roster, tune mafia count and timers, and confirm the game before play begins.'
    },
    {
      title: 'Voting',
      body: 'Each round shuffles the alive players into a fresh randomized order. The GM enters one vote per voter, and the tally plus vote attribution stay visible live.'
    },
    {
      title: 'Ties',
      body: 'Tied players each get up to their own defense window. Then the remaining players vote to eliminate exactly one tied player, repeating until the tie is broken.'
    },
    {
      title: 'Roles',
      body: 'Night order is mafia, sheriff, detective, then doctor. Detective and doctor actions are private; doctor saves are announced publicly when they work.'
    },
    {
      title: 'Win check',
      body: 'Town wins when mafia are extinct. Mafia wins when alive mafia equals alive town. Results are checked after every death event.'
    },
    {
      title: 'Reveal rules',
      body: 'Voted-out players reveal their role publicly. Night-dead players do not reveal. At game end, all roles are revealed on one board.'
    }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-[2rem] border border-ink/10 bg-[#f9f5ee] p-5 shadow-[0_25px_60px_rgba(19,33,34,0.25)] sm:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-ember">House rules</p>
            <h2 className="mt-2 font-display text-4xl font-bold">Mafia reference</h2>
          </div>
          <button className="min-h-11 rounded-full border border-ink/15 bg-white px-4 text-sm font-bold" onClick={onClose}>Close</button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {rules.map((rule) => (
            <div className="rounded-2xl border border-ink/10 bg-white/75 p-4" key={rule.title}>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink/55">{rule.title}</p>
              <p className="mt-3 text-base leading-7 text-ink/75">{rule.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function RolesReveal({ initialGame, onExit }: { initialGame: RolesGameState; onExit: () => void }) {
  const [game, setGame] = useState(initialGame)
  const [peeking, setPeeking] = useState(false)
  const [viewed, setViewed] = useState(false)
  const player = currentRevealPlayer(game)

  const confirmViewed = () => {
    setGame(confirmRoleViewed(game))
    setPeeking(false)
    setViewed(false)
  }

  const advance = () => setGame(advanceRoleReveal(game))

  return (
    <main className="min-h-screen bg-ink px-5 py-8 text-paper sm:px-10">
      <div className="mx-auto flex min-h-[85vh] max-w-2xl flex-col">
        <header className="flex items-center justify-between border-b border-paper/15 pb-5">
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-brass">Private role reveal</p><h1 className="font-display text-3xl font-bold">Pass the phone.</h1></div>
          <button className="min-h-11 rounded-lg border border-paper/20 px-4 text-sm font-bold" onClick={onExit}>Exit</button>
        </header>

        <section className="flex flex-1 flex-col justify-center py-12 text-center">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-paper/55">Player {game.revealIndex + 1} of {game.players.length}</p>
          <h2 className="font-display text-5xl font-bold sm:text-7xl">{player.name}</h2>
          <p className="mx-auto mt-6 max-w-md text-lg leading-8 text-paper/65">Only this player should look. Press and hold the button to peek at the role.</p>
          <button
            aria-label="Press and hold to peek at role"
            className="mx-auto mt-10 flex min-h-32 w-full max-w-sm select-none items-center justify-center rounded-2xl border-2 border-brass/70 bg-brass/10 px-6 text-xl font-bold text-brass touch-none"
            onPointerDown={() => { setPeeking(true); setViewed(true) }}
            onPointerLeave={() => setPeeking(false)}
            onPointerUp={() => setPeeking(false)}
          >
            {peeking ? <span className="text-4xl font-bold capitalize">{player.role}</span> : 'Hold to peek'}
          </button>

          <div className="mx-auto mt-8 w-full max-w-sm">
            {!game.revealConfirmed ? <button className="min-h-12 w-full rounded-xl bg-paper px-5 py-3 font-bold text-ink disabled:cursor-not-allowed disabled:opacity-35" disabled={!viewed} onClick={confirmViewed}>I am done viewing</button> : <div className="space-y-3"><p className="text-sm font-bold text-sage">Role confirmed. Hide the screen before handing over.</p><button className="min-h-12 w-full rounded-xl bg-ember px-5 py-3 font-bold text-paper" onClick={advance}>{game.revealIndex === game.players.length - 1 ? 'Start discussion' : 'Next player'} <span aria-hidden="true">→</span></button></div>}
          </div>
        </section>
      </div>
    </main>
  )
}

function RolesNightWizard({ initialGame, onExit }: { initialGame: RolesGameState; onExit: () => void }) {
  const [game, setGame] = useState(initialGame)
  const [nightActions, setNightActions] = useState<Partial<NightActions>>({})
  const alivePlayers = game.players.filter((player) => player.alive)
  const mafiaPlayers = alivePlayers.filter((player) => player.role === 'mafia')
  const detective = alivePlayers.find((player) => player.role === 'detective')
  const sheriff = alivePlayers.find((player) => player.role === 'sheriff')
  const doctor = alivePlayers.find((player) => player.role === 'doctor')
  const deadPlayers = game.players.filter((player) => !player.alive)

  const chooseTarget = (role: keyof Pick<NightActions, 'mafiaTargetId' | 'sheriffTargetId' | 'detectiveGuessId' | 'doctorTargetId'>, targetId: string) => {
    setNightActions((current) => ({ ...current, [role]: targetId }))
  }

  const resolveCurrentNight = () => {
    if (!nightActions.mafiaTargetId) return
    const result = resolveNight(game, {
      mafiaTargetId: nightActions.mafiaTargetId,
      sheriffTargetId: nightActions.sheriffTargetId,
      detectiveGuessId: nightActions.detectiveGuessId,
      doctorTargetId: nightActions.doctorTargetId
    })
    setGame(result.state)
    setNightActions({})
  }

  if (game.phase === 'night') {
    return (
      <main className="min-h-screen bg-paper px-5 py-8 text-ink sm:px-10">
        <div className="mx-auto max-w-5xl">
          <header className="mb-8 flex items-center justify-between border-b border-ink/15 pb-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-ember">Night wizard</p>
              <h1 className="font-display text-4xl font-bold">Resolve tonight</h1>
            </div>
            <button className="min-h-11 rounded-lg border border-ink/20 px-4 text-sm font-bold" onClick={onExit}>Exit</button>
          </header>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-2xl border border-ink/15 bg-white/55 p-5">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-ink/55">Mafia</p>
              <div className="grid gap-2">
                {mafiaPlayers.map((player) => (
                  <button key={player.id} className={`min-h-12 rounded-xl border px-3 text-left font-bold ${nightActions.mafiaTargetId === player.id ? 'border-ember bg-ember/10' : 'border-ink/15 bg-white'}`} onClick={() => chooseTarget('mafiaTargetId', player.id)}>{player.name}</button>
                ))}
              </div>
            </section>

            {sheriff && <section className="rounded-2xl border border-ink/15 bg-white/55 p-5">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-ink/55">Sheriff</p>
              <div className="grid gap-2">
                {alivePlayers.filter((player) => player.id !== sheriff.id).map((player) => (
                  <button key={player.id} className={`min-h-12 rounded-xl border px-3 text-left font-bold ${nightActions.sheriffTargetId === player.id ? 'border-ember bg-ember/10' : 'border-ink/15 bg-white'}`} onClick={() => chooseTarget('sheriffTargetId', player.id)}>{player.name}</button>
                ))}
              </div>
            </section>}

            {detective && <section className="rounded-2xl border border-ink/15 bg-white/55 p-5">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-ink/55">Detective</p>
              <div className="grid gap-2">
                {alivePlayers.map((player) => (
                  <button key={player.id} className={`min-h-12 rounded-xl border px-3 text-left font-bold ${nightActions.detectiveGuessId === player.id ? 'border-ember bg-ember/10' : 'border-ink/15 bg-white'}`} onClick={() => chooseTarget('detectiveGuessId', player.id)}>{player.name}</button>
                ))}
              </div>
            </section>}

            {doctor && <section className="rounded-2xl border border-ink/15 bg-white/55 p-5">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-ink/55">Doctor</p>
              <div className="grid gap-2">
                {alivePlayers.map((player) => (
                  <button key={player.id} className={`min-h-12 rounded-xl border px-3 text-left font-bold ${nightActions.doctorTargetId === player.id ? 'border-ember bg-ember/10' : 'border-ink/15 bg-white'}`} onClick={() => chooseTarget('doctorTargetId', player.id)}>{player.name}</button>
                ))}
              </div>
            </section>}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <button className="min-h-12 rounded-xl bg-ink px-5 py-3 font-bold text-paper disabled:cursor-not-allowed disabled:opacity-40" disabled={!nightActions.mafiaTargetId} onClick={resolveCurrentNight}>Resolve night</button>
            <button className="min-h-12 rounded-xl border border-ink/20 px-5 py-3 font-bold" onClick={() => setNightActions({})}>Clear picks</button>
          </div>
        </div>
      </main>
    )
  }

  if (game.phase === 'morning') {
    const summary = game.nightSummary
    const deaths = summary?.deaths ?? game.players.filter((player) => !player.alive).map((player) => player.id)
    const savedName = summary?.savedPlayerId ? game.players.find((player) => player.id === summary.savedPlayerId)?.name : undefined
    const detectiveName = summary?.detectiveResult === null ? undefined : game.players.find((player) => player.role === 'detective')?.name
    const detectiveLine = summary?.detectiveResult === null
      ? 'No detective result this night.'
      : summary?.detectiveResult
        ? `${detectiveName ?? 'Detective'} correctly identified a mafia target.`
        : `${detectiveName ?? 'Detective'} checked an innocent player.`

    const script = summary?.savedPlayerId
      ? `The doctor saved ${savedName ?? 'a player'} tonight. The remaining night deaths were ${deaths.map((id) => game.players.find((player) => player.id === id)?.name ?? 'unknown').join(', ') || 'no one'}.`
      : `The night was quiet except for ${deaths.map((id) => game.players.find((player) => player.id === id)?.name ?? 'unknown').join(', ') || 'no one'}.`

    return (
      <main className="min-h-screen bg-paper px-5 py-8 text-ink sm:px-10">
        <div className="mx-auto max-w-3xl">
          <header className="mb-8 border-b border-ink/15 pb-5">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-ember">Morning report</p>
            <h1 className="mt-2 font-display text-4xl font-bold">What happened overnight?</h1>
          </header>

          <section className="space-y-6 rounded-2xl border border-ink/15 bg-white/55 p-6">
            <div>
              <p className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-ink/55">Deaths</p>
              {deaths.length > 0 ? (
                <ul className="space-y-2 text-lg font-bold">
                  {deaths.map((id) => <li key={id}>{game.players.find((player) => player.id === id)?.name}</li>)}
                </ul>
              ) : (
                <p className="text-lg text-ink/65">No one died overnight.</p>
              )}
            </div>

            {savedName && <div className="rounded-xl bg-sage/15 px-4 py-3"><p className="text-xs font-bold uppercase tracking-[0.2em] text-ink/60">Doctor save</p><p className="mt-2 text-lg font-bold">{savedName} was protected.</p></div>}

            {summary?.detectiveResult !== null && <div className="rounded-xl border border-ink/15 bg-ink/5 px-4 py-3"><p className="text-xs font-bold uppercase tracking-[0.2em] text-ink/60">Detective result</p><p className="mt-2 text-lg font-bold">{detectiveLine}</p></div>}

            <div className="rounded-xl border border-amber-300/40 bg-amber-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink/60">Suggested script</p>
              <p className="mt-2 text-lg leading-8 text-ink/75">{script}</p>
            </div>
          </section>

          <div className="mt-8 flex flex-wrap gap-3">
            <button className="min-h-12 rounded-xl bg-ink px-5 py-3 font-bold text-paper" onClick={() => setGame({ ...game, phase: 'discussion', round: game.round + 1, nightSummary: null })}>Start next day</button>
            <button className="min-h-12 rounded-xl border border-ink/20 px-5 py-3 font-bold" onClick={onExit}>Exit game</button>
          </div>

          <GameBoard game={game} />
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-ink px-5 py-8 text-paper sm:px-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 border-b border-paper/15 pb-5">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brass">Game over</p>
          <h1 className="mt-2 font-display text-5xl font-bold capitalize">{game.winner} wins</h1>
        </header>

        <div className="grid gap-2 sm:grid-cols-2">
          {game.players.map((player) => (
            <div className="flex items-center justify-between rounded-xl border border-paper/15 px-4 py-3" key={player.id}>
              <span>{player.name}</span>
              <strong className="capitalize text-paper/70">{player.role}</strong>
            </div>
          ))}
        </div>

        <button className="mt-8 min-h-12 rounded-xl bg-brass px-5 py-3 font-bold text-ink" onClick={onExit}>New game</button>
      </div>
    </main>
  )
}

function RolesDayRunner({ initialGame, discussionSeconds, defenseSeconds, onExit }: { initialGame: RolesGameState; discussionSeconds: number; defenseSeconds: number; onExit: () => void }) {
  const [game, setGame] = useState(initialGame)
  const [timerSeconds, setTimerSeconds] = useState(discussionSeconds)
  const [timerRunning, setTimerRunning] = useState(false)
  const [defenseCandidateIndex, setDefenseCandidateIndex] = useState(0)
  const previousPhase = useRef(initialGame.phase)
  const alivePlayers = game.players.filter((player) => player.alive)
  const currentVoter = game.phase === 'runoff'
    ? game.runoff?.eligibleVoters.find((id) => game.runoff?.votes[id] === undefined)
    : game.votingOrder.find((id) => game.votes[id] === undefined)
  const currentVoterName = game.players.find((player) => player.id === currentVoter)?.name
  const revealedPlayer = game.players.find((player) => player.id === game.revealedPlayerId)
  const runoffCandidates = new Set(game.runoff?.candidates ?? [])
  const currentDefenseCandidateId = game.runoff?.candidates[defenseCandidateIndex]
  const currentDefenseCandidate = game.players.find((player) => player.id === currentDefenseCandidateId)

  const vote = (targetId: string) => {
    if (!currentVoter) return
    setGame(castRoleVote(game, currentVoter, targetId))
  }

  const votingComplete = game.phase === 'voting' && Object.keys(game.votes).length === game.votingOrder.length
  const runoffComplete = game.phase === 'runoff' && game.runoff !== null && Object.keys(game.runoff.votes).length === game.runoff.eligibleVoters.length

  useEffect(() => {
    if (!timerRunning || timerSeconds <= 0) return
    const timer = window.setInterval(() => setTimerSeconds((current) => Math.max(0, current - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [timerRunning, timerSeconds])

  useEffect(() => {
    if (timerSeconds === 0) setTimerRunning(false)
  }, [timerSeconds])

  useEffect(() => {
    if (game.phase === 'defense' && previousPhase.current !== 'defense') {
      setTimerSeconds(defenseSeconds)
      setTimerRunning(false)
      setDefenseCandidateIndex(0)
    }

    if (game.phase === 'discussion' && previousPhase.current !== 'discussion') {
      setTimerSeconds(discussionSeconds)
      setTimerRunning(false)
    }

    previousPhase.current = game.phase
  }, [defenseSeconds, discussionSeconds, game.phase])

  const beginVoting = () => {
    setTimerRunning(false)
    setGame(startRolesVoting(game))
  }

  const beginRunoff = () => {
    setTimerSeconds(defenseSeconds)
    setTimerRunning(false)
    setGame(startRolesRunoff(game))
  }

  const advanceDefense = () => {
    if (!game.runoff) return
    setTimerRunning(false)
    if (defenseCandidateIndex < game.runoff.candidates.length - 1) {
      setDefenseCandidateIndex((index) => index + 1)
      setTimerSeconds(defenseSeconds)
      return
    }

    beginRunoff()
  }

  const toggleDefenseTimer = () => {
    if (timerSeconds === 0) {
      setTimerSeconds(defenseSeconds)
      setTimerRunning(false)
      return
    }

    setTimerRunning((running) => !running)
  }

  if (game.phase === 'discussion') {
    return (
      <main className="min-h-screen bg-paper px-5 py-8 text-ink sm:px-10">
        <div className="mx-auto max-w-3xl">
          <header className="mb-8 flex items-center justify-between border-b border-ink/15 pb-5">
            <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-ember">Day phase</p><h1 className="font-display text-4xl font-bold">Open discussion</h1></div>
            <button className="min-h-11 rounded-lg border border-ink/20 px-4 text-sm font-bold" onClick={onExit}>Exit</button>
          </header>
          <section className="rounded-2xl border border-ink/15 bg-white/55 p-6">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div>
                <p className="mb-4 max-w-xl text-lg leading-8 text-ink/70">The room is talking. When the GM is ready, start the randomized live vote.</p>
              </div>
              <strong className="font-display text-6xl tabular-nums">{formatTime(timerSeconds)}</strong>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <button className="min-h-12 rounded-xl bg-ink px-5 py-3 font-bold text-paper" onClick={() => setTimerRunning((running) => !running)}>{timerRunning ? 'Pause timer' : timerSeconds === discussionSeconds ? 'Start timer' : 'Resume timer'}</button>
              <button className="min-h-12 rounded-xl bg-ink px-5 py-3 font-bold text-paper" onClick={beginVoting}>Start voting <span aria-hidden="true">→</span></button>
            </div>
          </section>
        </div>
      </main>
    )
  }

  if (game.phase === 'voting' || game.phase === 'runoff') {
    return (
      <main className="min-h-screen bg-paper px-5 py-8 text-ink sm:px-10">
        <div className="mx-auto max-w-5xl">
          <header className="mb-8 border-b border-ink/15 pb-5"><p className="text-xs font-bold uppercase tracking-[0.2em] text-ember">{game.phase === 'runoff' ? 'Runoff vote' : 'Live vote'}</p><h1 className="font-display text-4xl font-bold">{currentVoterName ?? 'Vote complete'}</h1></header>
          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-2xl bg-ink p-6 text-paper"><p className="mb-3 text-sm uppercase tracking-[0.2em] text-brass">Queue</p><p className="text-lg leading-8 text-paper/70">{currentVoterName ? 'Who is this voter accusing?' : 'Review the tally and resolve the vote.'}</p>{votingComplete && <button className="mt-8 min-h-12 rounded-xl bg-ember px-5 py-3 font-bold text-paper" onClick={() => setGame(resolveRolesVote(game))}>Resolve vote</button>}{runoffComplete && <button className="mt-8 min-h-12 rounded-xl bg-ember px-5 py-3 font-bold text-paper" onClick={() => setGame(resolveRolesRunoff(game))}>Resolve runoff</button>}</div>
            <div className="rounded-2xl border border-ink/15 bg-white/55 p-6"><p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-ink/55">Accuse</p><div className="grid gap-2 sm:grid-cols-2">{alivePlayers.filter((player) => game.phase !== 'runoff' || runoffCandidates.has(player.id)).map((player) => <button className="min-h-12 rounded-xl border border-ink/15 bg-white px-3 text-left font-bold" key={player.id} onClick={() => vote(player.id)}>{player.name}</button>)}</div><div className="mt-6 border-t border-ink/10 pt-4"><p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-ink/50">Votes entered</p><div className="space-y-2">{Object.entries(game.phase === 'runoff' ? game.runoff?.votes ?? {} : game.votes).map(([voterId, targetId]) => <p className="text-sm" key={voterId}>{game.players.find((player) => player.id === voterId)?.name} → {game.players.find((player) => player.id === targetId)?.name}</p>)}</div></div></div>
          </div>
        </div>
      </main>
    )
  }

  if (game.phase === 'defense') {
    return (
      <main className="min-h-screen bg-paper px-5 py-8 text-ink sm:px-10">
        <div className="mx-auto max-w-3xl">
          <header className="mb-8 border-b border-ink/15 pb-5"><p className="text-xs font-bold uppercase tracking-[0.2em] text-ember">Defense</p><h1 className="font-display text-4xl font-bold">{game.runoff?.candidates.map((id) => game.players.find((player) => player.id === id)?.name).join(', ')}</h1></header>
          <section className="rounded-2xl border border-brass/40 bg-brass/10 p-6 sm:p-10">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-brass">Defense {defenseCandidateIndex + 1} of {game.runoff?.candidates.length}</p>
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div>
                <h2 className="font-display text-4xl font-bold">{currentDefenseCandidate?.name}</h2>
                <p className="mt-4 max-w-lg leading-7 text-ink/70">This player has up to {defenseSeconds} seconds. The GM can move on early if the defense ends or if they waive it.</p>
              </div>
              <strong className="font-display text-6xl tabular-nums">{formatTime(timerSeconds)}</strong>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <button className="min-h-12 rounded-xl bg-ink px-5 py-3 font-bold text-paper" onClick={toggleDefenseTimer}>{timerRunning ? 'Pause timer' : timerSeconds === 0 ? 'Restart timer' : 'Start timer'}</button>
              <button className="min-h-12 rounded-xl border border-ink/20 px-5 py-3 font-bold" onClick={advanceDefense}>{defenseCandidateIndex < (game.runoff?.candidates.length ?? 1) - 1 ? 'Next defense' : 'Start runoff'} <span aria-hidden="true">→</span></button>
            </div>
          </section>
        </div>
      </main>
    )
  }

  if (game.phase === 'reveal' && revealedPlayer) {
    return (
      <main className="min-h-screen bg-paper px-5 py-8 text-ink sm:px-10">
        <div className="mx-auto max-w-3xl">
          <header className="mb-8 border-b border-ink/15 pb-5"><p className="text-xs font-bold uppercase tracking-[0.2em] text-ember">Elimination reveal</p><h1 className="font-display text-5xl font-bold">{revealedPlayer.name}</h1></header>
          <p className="mb-8 text-2xl font-bold capitalize">{revealedPlayer.role}</p>
          <button className="min-h-12 rounded-xl bg-ink px-5 py-3 font-bold text-paper" onClick={() => setGame(confirmRoleReveal(game))}>{game.winner ? 'Show final board' : 'Start night'} <span aria-hidden="true">→</span></button>
        </div>
      </main>
    )
  }

  return null
}

function RolelessRunner({ initialGame, initialTimer, discussionSeconds, defenseSeconds, onTimerChange, onExit }: { initialGame: RolelessGameState; initialTimer: RolelessTimerSnapshot; discussionSeconds: number; defenseSeconds: number; onTimerChange: (timer: RolelessTimerSnapshot) => void; onExit: () => void }) {
  const [game, setGame] = useState(initialGame)
  const restoredTimerMode = initialGame.phase === 'defense' ? 'defense' : 'discussion'
  const [timerSeconds, setTimerSeconds] = useState(initialTimer.mode === restoredTimerMode ? initialTimer.secondsRemaining : discussionSeconds)
  const [timerRunning, setTimerRunning] = useState(initialTimer.mode === restoredTimerMode && initialTimer.running)
  const [defenseCandidateIndex, setDefenseCandidateIndex] = useState(initialTimer.mode === 'defense' && initialGame.phase === 'defense' ? initialTimer.defenseCandidateIndex : 0)
  const previousPhase = useRef(initialGame.phase)
  const alivePlayers = game.players.filter((player) => player.alive)
  const currentVoter = game.phase === 'runoff'
    ? game.runoff?.eligibleVoters.find((id) => game.runoff?.votes[id] === undefined)
    : game.votingOrder.find((id) => game.votes[id] === undefined)
  const currentVoterName = game.players.find((player) => player.id === currentVoter)?.name
  const revealedPlayer = game.players.find((player) => player.id === game.revealedPlayerId)
  const runoffCandidates = new Set(game.runoff?.candidates ?? [])
  const currentDefenseCandidateId = game.runoff?.candidates[defenseCandidateIndex]
  const currentDefenseCandidate = game.players.find((player) => player.id === currentDefenseCandidateId)
  const defenseComplete = game.phase === 'defense' && timerSeconds === 0

  const vote = (targetId: string) => {
    if (!currentVoter) return
    setGame(castVote(game, currentVoter, targetId))
  }

  const votingComplete = game.phase === 'voting' && Object.keys(game.votes).length === game.votingOrder.length
  const runoffComplete = game.phase === 'runoff' && game.runoff !== null && Object.keys(game.runoff.votes).length === game.runoff.eligibleVoters.length

  useEffect(() => {
    if (!timerRunning || timerSeconds <= 0) return
    const timer = window.setInterval(() => setTimerSeconds((current) => Math.max(0, current - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [timerRunning, timerSeconds])

  useEffect(() => {
    if (timerSeconds === 0) setTimerRunning(false)
  }, [timerSeconds])

  useEffect(() => {
    if (game.phase === 'defense' && previousPhase.current !== 'defense') {
      setTimerSeconds(defenseSeconds)
      setTimerRunning(false)
      setDefenseCandidateIndex(0)
    }
    previousPhase.current = game.phase
  }, [game.phase, defenseSeconds])

  useEffect(() => {
    onTimerChange({
      mode: game.phase === 'defense' ? 'defense' : 'discussion',
      secondsRemaining: timerSeconds,
      running: timerRunning,
      defenseCandidateIndex
    })
  }, [game.phase, timerSeconds, timerRunning, defenseCandidateIndex, onTimerChange])

  const beginVoting = () => {
    setTimerRunning(false)
    setGame(startVoting(game))
  }

  const beginRunoff = () => {
    setTimerSeconds(defenseSeconds)
    setTimerRunning(false)
    setGame(startRunoff(game))
  }

  const advanceDefense = () => {
    if (!game.runoff) return
    setTimerRunning(false)
    if (defenseCandidateIndex < game.runoff.candidates.length - 1) {
      setDefenseCandidateIndex((index) => index + 1)
      setTimerSeconds(defenseSeconds)
      return
    }

    beginRunoff()
  }

  const toggleDefenseTimer = () => {
    if (timerSeconds === 0) {
      setTimerSeconds(defenseSeconds)
      setTimerRunning(false)
      return
    }

    setTimerRunning((running) => !running)
  }

  return (
    <main className="min-h-screen bg-paper px-5 py-6 text-ink sm:px-10 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between border-b border-ink/15 pb-5">
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-ember">Roleless game / round {game.round}</p><h1 className="font-display text-3xl font-bold">Keep the room moving.</h1></div>
          <button className="min-h-11 rounded-lg border border-ink/20 px-4 text-sm font-bold" onClick={onExit}>Exit game</button>
        </header>

        <div className="mb-8 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-ink p-4 text-paper"><span className="block text-xs uppercase tracking-wider text-paper/60">Alive</span><strong className="font-display text-3xl">{alivePlayers.length}</strong></div>
          <div className="rounded-xl border border-ink/15 bg-white/50 p-4"><span className="block text-xs uppercase tracking-wider text-ink/60">Round</span><strong className="font-display text-3xl">{game.round}</strong></div>
          <div className="rounded-xl border border-ink/15 bg-white/50 p-4"><span className="block text-xs uppercase tracking-wider text-ink/60">Status</span><strong className="font-display text-xl capitalize">{game.phase}</strong></div>
        </div>

        {game.phase === 'discussion' && <section className="rounded-2xl border border-ink/15 bg-white/45 p-6 sm:p-10"><p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-ember">Discussion</p><div className="flex flex-wrap items-end justify-between gap-5"><div><h2 className="max-w-xl font-display text-4xl font-bold leading-tight">Give the room time to find a story.</h2><p className="mt-4 max-w-lg leading-7 text-ink/65">The GM controls the clock. Start, pause, or resume it whenever the room needs.</p></div><strong className="font-display text-6xl tabular-nums">{formatTime(timerSeconds)}</strong></div><div className="mt-8 flex flex-wrap gap-3"><button className="min-h-12 rounded-xl bg-ink px-5 py-3 font-bold text-paper" onClick={() => setTimerRunning((running) => !running)}>{timerRunning ? 'Pause timer' : timerSeconds === discussionSeconds ? 'Start timer' : 'Resume timer'}</button><button className="min-h-12 rounded-xl border border-ink/20 px-5 py-3 font-bold" onClick={beginVoting}>Start voting <span aria-hidden="true">→</span></button></div></section>}

        {(game.phase === 'voting' || game.phase === 'runoff') && <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-2xl bg-ink p-6 text-paper sm:p-8"><p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-brass">{game.phase === 'runoff' ? `Runoff ${game.runoff?.number}` : 'Live vote'}</p><h2 className="font-display text-4xl font-bold">{currentVoterName ?? 'All votes entered'}</h2><p className="mt-3 leading-7 text-paper/65">{currentVoterName ? 'Who is this player accusing?' : 'Review the tally, then resolve the vote.'}</p>{votingComplete && <button className="mt-8 min-h-12 rounded-xl bg-ember px-5 py-3 font-bold text-paper" onClick={() => setGame(resolveVote(game))}>Resolve vote</button>}{runoffComplete && <button className="mt-8 min-h-12 rounded-xl bg-ember px-5 py-3 font-bold text-paper" onClick={() => setGame(resolveRunoff(game))}>Resolve runoff</button>}</div>
          <div className="rounded-2xl border border-ink/15 bg-white/50 p-6 sm:p-8"><p className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-ink/50">Choose accused player</p><div className="grid gap-2 sm:grid-cols-2">{alivePlayers.filter((player) => game.phase !== 'runoff' || runoffCandidates.has(player.id)).map((player) => <button className="flex min-h-14 items-center justify-between rounded-xl border border-ink/15 px-4 text-left font-bold transition hover:border-ember hover:bg-ember/5 disabled:cursor-not-allowed disabled:opacity-40" disabled={!currentVoter} key={player.id} onClick={() => vote(player.id)}><span>{player.name}</span><span className="text-xs uppercase tracking-wider text-ink/45">{game.votes[player.id] ? 'voted for' : 'accuse'}</span></button>)}</div><div className="mt-8 border-t border-ink/10 pt-5"><p className="mb-3 text-xs font-bold uppercase tracking-wider text-ink/50">Votes entered</p><div className="space-y-2">{Object.entries(game.phase === 'runoff' ? game.runoff?.votes ?? {} : game.votes).map(([voterId, targetId]) => <p className="text-sm" key={voterId}>{game.players.find((player) => player.id === voterId)?.name} <span className="text-ink/45">→</span> {game.players.find((player) => player.id === targetId)?.name}</p>)}</div></div></div>
        </section>}

        {game.phase === 'defense' && <section className="rounded-2xl border border-brass/40 bg-brass/10 p-6 sm:p-10"><p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-brass">Defense {defenseCandidateIndex + 1} of {game.runoff?.candidates.length}</p><div className="flex flex-wrap items-end justify-between gap-5"><div><h2 className="font-display text-4xl font-bold">{currentDefenseCandidate?.name}</h2><p className="mt-4 max-w-lg leading-7 text-ink/70">This player has up to {defenseSeconds} seconds. The GM can move on early if they finish or waive their defense.</p></div><strong className="font-display text-6xl tabular-nums">{formatTime(timerSeconds)}</strong></div><div className="mt-8 flex flex-wrap gap-3"><button className="min-h-12 rounded-xl bg-ink px-5 py-3 font-bold text-paper" onClick={toggleDefenseTimer}>{timerRunning ? 'Pause timer' : timerSeconds === 0 ? 'Restart timer' : 'Start timer'}</button><button className="min-h-12 rounded-xl border border-ink/20 px-5 py-3 font-bold" onClick={advanceDefense}>{defenseCandidateIndex < (game.runoff?.candidates.length ?? 1) - 1 ? 'Next defense' : 'Start runoff'} <span aria-hidden="true">→</span></button></div></section>}

        {game.phase === 'reveal' && revealedPlayer && <section className="rounded-2xl border border-ink/15 bg-white/50 p-6 sm:p-10"><p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-ember">Elimination reveal</p><h2 className="font-display text-5xl font-bold">{revealedPlayer.name}</h2><p className="mt-4 text-2xl font-bold capitalize">{revealedPlayer.role}</p><p className="mt-3 leading-7 text-ink/65">Confirm the public reveal, then continue to the next round.</p><button className="mt-8 min-h-12 rounded-xl bg-ink px-5 py-3 font-bold text-paper" onClick={() => setGame(confirmReveal(game))}>{game.winner ? 'Show final board' : 'Start next round'} <span aria-hidden="true">→</span></button></section>}

        {game.phase === 'ended' && <section className="rounded-2xl bg-ink p-6 text-paper sm:p-10"><p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-brass">Game over</p><h2 className="font-display text-5xl font-bold capitalize">{game.winner} wins.</h2><div className="mt-8 grid gap-2 sm:grid-cols-2">{game.players.map((player) => <div className="flex justify-between rounded-lg border border-paper/15 px-4 py-3" key={player.id}><span>{player.name}</span><strong className="capitalize text-paper/65">{player.role}</strong></div>)}</div><button className="mt-8 min-h-12 rounded-xl bg-ember px-5 py-3 font-bold text-paper" onClick={onExit}>New game</button></section>}

        <GameBoard game={game} />

        <section className="mt-8 border-t border-ink/15 pt-6"><p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-ink/50">Players</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{game.players.map((player) => <div className={`rounded-lg border px-3 py-3 text-sm ${player.alive ? 'border-ink/10 bg-white/35' : 'border-ink/10 bg-ink/10 text-ink/45 line-through'}`} key={player.id}>{player.name}</div>)}</div></section>
      </div>
    </main>
  )
}

function App() {
  const [restoredSession] = useState(() => loadRolelessSession())
  const [restoredRolesGame] = useState(() => loadRolesGame())
  const [variant, setVariant] = useState<Variant>('roleless')
  const [playerCount, setPlayerCount] = useState(7)
  const [doctorEnabled, setDoctorEnabled] = useState(true)
  const [detectiveEnabled, setDetectiveEnabled] = useState(false)
  const [sheriffEnabled, setSheriffEnabled] = useState(false)
  const [playerNames, setPlayerNames] = useState(starterNames)
  const [mafiaOverride, setMafiaOverride] = useState<number | null>(null)
  const [discussionMinutes, setDiscussionMinutes] = useState((restoredSession?.discussionSeconds ?? 300) / 60)
  const [defenseSeconds, setDefenseSeconds] = useState(restoredSession?.defenseSeconds ?? 30)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [rolelessGame, setRolelessGame] = useState<RolelessGameState | null>(() => restoredSession?.game ?? null)
  const [rolesGame, setRolesGame] = useState<RolesGameState | null>(() => restoredRolesGame ?? null)
  const [timerSnapshot, setTimerSnapshot] = useState<RolelessTimerSnapshot>(() => restoredSession?.timer ?? { mode: 'discussion', secondsRemaining: 300, running: false, defenseCandidateIndex: 0 })
  const names = playerNames.slice(0, playerCount)
  const defaultMafia = defaultMafiaCount(playerCount)
  const selectedMafia = mafiaOverride !== null && mafiaOverride >= defaultMafia - 1 && mafiaOverride <= defaultMafia + 1 ? mafiaOverride : undefined
  const roles = getRoleCounts({ playerCount, variant, mafiaOverride: selectedMafia, doctorEnabled, detectiveEnabled, sheriffEnabled })

  const updatePlayerName = (index: number, name: string) => {
    setPlayerNames((current) => current.map((currentName, currentIndex) => currentIndex === index ? name : currentName))
    setSetupError(null)
  }

  const startConfiguredGame = () => {
    try {
      const game = createRolelessGame(names, selectedMafia)
      setTimerSnapshot({ mode: 'discussion', secondsRemaining: discussionMinutes * 60, running: false, defenseCandidateIndex: 0 })
      setRolelessGame(game)
      setSetupError(null)
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : 'Check the setup and try again.')
    }
  }

  const startConfiguredRolesGame = () => {
    try {
      const game = createRolesGame({ playerNames: names, playerCount, mafiaOverride: selectedMafia, doctorEnabled, detectiveEnabled, sheriffEnabled })
      setRolesGame(game)
      setSetupError(null)
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : 'Check the setup and try again.')
    }
  }

  useEffect(() => {
    if (rolelessGame) {
      saveRolelessSession({ game: rolelessGame, discussionSeconds: discussionMinutes * 60, defenseSeconds, timer: timerSnapshot })
      return
    }

    if (rolesGame) {
      saveRolesGame(rolesGame)
      return
    }

    clearActiveGame()
  }, [rolelessGame, rolesGame, discussionMinutes, defenseSeconds, timerSnapshot])

  const resetToSetup = () => {
    clearActiveGame()
    setRolelessGame(null)
    setRolesGame(null)
    setStarted(false)
    setVariant('roleless')
    setDoctorEnabled(true)
    setDetectiveEnabled(false)
    setSheriffEnabled(false)
    setMafiaOverride(null)
    setDiscussionMinutes(5)
    setDefenseSeconds(30)
    setTimerSnapshot({ mode: 'discussion', secondsRemaining: 300, running: false, defenseCandidateIndex: 0 })
    setPlayerCount(7)
  }

  const exitRolelessGame = () => {
    resetToSetup()
  }

  const exitRolesGame = () => {
    resetToSetup()
  }

  if (rolelessGame) {
    return (
      <>
        {showRules && <RulesReferenceModal onClose={() => setShowRules(false)} />}
        <RolelessRunner initialGame={rolelessGame} initialTimer={timerSnapshot} discussionSeconds={discussionMinutes * 60} defenseSeconds={defenseSeconds} onTimerChange={setTimerSnapshot} onExit={exitRolelessGame} />
      </>
    )
  }

  if (rolesGame) {
    if (rolesGame.phase === 'reveal' && rolesGame.revealedPlayerId === null) {
      return (
        <>
          {showRules && <RulesReferenceModal onClose={() => setShowRules(false)} />}
          <RolesReveal initialGame={rolesGame} onExit={exitRolesGame} />
        </>
      )
    }

    if (rolesGame.phase === 'discussion' || rolesGame.phase === 'voting' || rolesGame.phase === 'defense' || rolesGame.phase === 'runoff' || (rolesGame.phase === 'reveal' && rolesGame.revealedPlayerId !== null)) {
      return (
        <>
          {showRules && <RulesReferenceModal onClose={() => setShowRules(false)} />}
          <RolesDayRunner initialGame={rolesGame} discussionSeconds={discussionMinutes * 60} defenseSeconds={defenseSeconds} onExit={exitRolesGame} />
        </>
      )
    }

    return (
      <>
        {showRules && <RulesReferenceModal onClose={() => setShowRules(false)} />}
        <RolesNightWizard initialGame={rolesGame} onExit={exitRolesGame} />
      </>
    )
  }

  if (started) {
    return (
      <>
        {showRules && <RulesReferenceModal onClose={() => setShowRules(false)} />}
        <main className="min-h-screen bg-[#efe6d8] px-5 py-8 text-ink sm:px-10">
          <div className="mx-auto flex min-h-[80vh] max-w-3xl flex-col justify-between rounded-[2rem] border border-ink/10 bg-[#f9f5ee] p-6 shadow-[0_18px_38px_rgba(19,33,34,0.06)] sm:p-8">
            <header className="flex items-center justify-between border-b border-ink/10 pb-5">
              <span className="font-display text-2xl font-bold">Mafia</span>
              <div className="flex items-center gap-2">
                <button className="rounded-full border border-ink/15 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]" onClick={() => setShowRules(true)}>Rules</button>
                <span className="rounded-full bg-sage/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-ink">Setup ready</span>
              </div>
            </header>
            <section className="py-12">
              <p className="mb-3 text-sm font-bold uppercase tracking-[0.25em] text-ember">Round zero</p>
              <h1 className="max-w-xl font-display text-5xl font-bold leading-[0.95] sm:text-7xl">The room is ready.</h1>
              <p className="mt-6 max-w-md text-lg leading-8 text-ink/70">Your roster is staged for {playerCount} players, and the board is waiting for the first decision.</p>
            </section>
            <button className="min-h-12 w-full rounded-xl bg-ink px-5 py-4 font-bold text-paper transition hover:bg-ink/90" onClick={() => setStarted(false)}>Edit setup</button>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      {showRules && <RulesReferenceModal onClose={() => setShowRules(false)} />}
      <main className="min-h-screen bg-[#efe6d8] text-ink">
        <div className="mx-auto max-w-6xl px-5 py-8 sm:px-10 sm:py-12">
          <header className="mb-12 flex items-start justify-between gap-6">
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.25em] text-ember">GM cockpit</p>
              <h1 className="font-display text-5xl font-bold leading-none sm:text-7xl">Set the table.</h1>
            </div>
            <button className="rounded-full border border-ink/15 bg-white/70 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em]" onClick={() => setShowRules(true)}>Rules</button>
          </header>

          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="space-y-7 rounded-[2rem] border border-ink/10 bg-[#f9f5ee] p-5 shadow-[0_20px_42px_rgba(19,33,34,0.06)] sm:p-7">
              <div>
                <h2 className="mb-3 font-display text-2xl font-bold">Choose the game</h2>
                <div className="grid grid-cols-2 gap-3" role="group" aria-label="Game variant">
                  {(['roleless', 'roles'] as Variant[]).map((option) => (
                    <button key={option} className={`min-h-14 rounded-2xl border px-4 text-left font-bold transition ${variant === option ? 'border-ink bg-ink text-paper shadow-[0_8px_20px_rgba(19,33,34,0.18)]' : 'border-ink/15 bg-white/70 hover:border-ink/40'}`} onClick={() => setVariant(option)}>
                      <span className="block capitalize">{option}</span>
                      <span className={`text-xs font-normal ${variant === option ? 'text-paper/70' : 'text-ink/55'}`}>{option === 'roles' ? 'Doctor, detective, sheriff' : 'Mafia and civilians'}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-3 block font-display text-2xl font-bold" htmlFor="mafia-count">Mafia count</label>
                <select className="min-h-12 w-full rounded-2xl border border-ink/15 bg-white/80 px-4 font-bold" id="mafia-count" onChange={(event) => setMafiaOverride(event.target.value === 'default' ? null : Number(event.target.value))} value={selectedMafia ?? 'default'}>
                  <option value="default">Default: {defaultMafia}</option>
                  {defaultMafia > 1 && <option value={defaultMafia - 1}>{defaultMafia - 1} mafia</option>}
                  <option value={defaultMafia + 1}>{defaultMafia + 1} mafia</option>
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className="mb-2 block text-sm font-bold uppercase tracking-[0.15em] text-ink/60">Discussion</span><input className="min-h-12 w-full rounded-2xl border border-ink/15 bg-white/80 px-4 font-bold" min="1" max="30" onChange={(event) => setDiscussionMinutes(Number(event.target.value))} type="number" value={discussionMinutes} /></label>
                <label className="block"><span className="mb-2 block text-sm font-bold uppercase tracking-[0.15em] text-ink/60">Defense</span><input className="min-h-12 w-full rounded-2xl border border-ink/15 bg-white/80 px-4 font-bold" min="5" max="300" onChange={(event) => setDefenseSeconds(Number(event.target.value))} type="number" value={defenseSeconds} /></label>
              </div>

              <div>
                <label className="mb-3 block font-display text-2xl font-bold" htmlFor="player-count">Players</label>
                <div className="flex items-center gap-4">
                  <input className="h-2.5 flex-1 accent-ember" id="player-count" max="15" min="7" onChange={(event) => setPlayerCount(Number(event.target.value))} type="range" value={playerCount} />
                  <output className="w-14 text-right font-display text-4xl font-bold" htmlFor="player-count">{playerCount}</output>
                </div>
              </div>

              {variant === 'roles' && <div className="space-y-2">
                <p className="font-display text-2xl font-bold">Special roles</p>
                <p className="text-sm leading-6 text-ink/60">The table sets the defaults. Adjust only what this game needs.</p>
                {([
                  { id: 'doctor', label: 'Doctor', enabled: doctorEnabled, setEnabled: setDoctorEnabled },
                  { id: 'detective', label: 'Detective', enabled: detectiveEnabled, setEnabled: setDetectiveEnabled },
                  { id: 'sheriff', label: 'Sheriff', enabled: sheriffEnabled, setEnabled: setSheriffEnabled }
                ] as SpecialRoleOption[]).map(({ id, label, enabled, setEnabled }) => <label className="flex min-h-12 cursor-pointer items-center justify-between rounded-2xl border border-ink/15 bg-white/70 px-4 font-bold" htmlFor={id} key={id}><span>{label}</span><input checked={enabled} className="h-5 w-5 accent-ember" id={id} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" /></label>)}
              </div>}
              {setupError && <p className="rounded-2xl border border-ember/30 bg-ember/10 px-4 py-3 text-sm font-bold text-ember" role="alert">{setupError}</p>}
              <button className="min-h-14 w-full rounded-2xl bg-ink px-5 py-4 text-lg font-bold text-paper shadow-[0_12px_28px_rgba(19,33,34,0.18)] transition hover:-translate-y-0.5 hover:bg-ink/95" onClick={variant === 'roleless' ? startConfiguredGame : startConfiguredRolesGame}>{variant === 'roleless' ? 'Start roleless game' : 'Assign roles'} <span aria-hidden="true">→</span></button>
            </section>

            <aside className="rounded-[2rem] border border-ink/10 bg-[#f4efea] p-5 shadow-[0_18px_38px_rgba(19,33,34,0.04)] sm:p-6">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-ink/50">Tonight's mix</p>
              <div className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink/10 bg-ink/10">
                {Object.entries(roles).filter(([, count]) => count > 0).map(([role, count]) => <div className="bg-white/80 p-4" key={role}><strong className="block font-display text-3xl">{count}</strong><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink/60">{role}</span></div>)}
              </div>
              <p className="font-display text-2xl font-bold leading-tight">Every vote visible.<br />Every secret protected.</p>
              <p className="mt-4 leading-7 text-ink/65">A quiet control surface for the person keeping the room moving.</p>
            </aside>
          </div>

          <section className="mt-12 rounded-[2rem] border border-ink/10 bg-[#f9f5ee] p-5 shadow-[0_18px_38px_rgba(19,33,34,0.04)] sm:p-6">
            <div className="mb-4 flex items-baseline justify-between gap-4"><h2 className="font-display text-2xl font-bold">Roster</h2><span className="text-sm text-ink/55">{names.length} seats ready</span></div>
            <div className="grid gap-2 sm:grid-cols-2">{names.map((name, index) => <label className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white/70 px-3 py-2" key={index}><span className="w-7 text-sm text-ink/40">{String(index + 1).padStart(2, '0')}</span><input aria-label={`Player ${index + 1} name`} className="min-h-10 min-w-0 flex-1 bg-transparent font-bold outline-none placeholder:text-ink/35" onChange={(event) => updatePlayerName(index, event.target.value)} placeholder={`Player ${index + 1}`} type="text" value={name} /></label>)}</div>
          </section>
        </div>
      </main>
    </>
  )
}

export default App
