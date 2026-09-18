import { useEffect, useRef, useState } from 'react'
import { clearActiveGame, loadRolelessSession, saveRolelessSession } from './app/persistence'
import type { RolelessTimerSnapshot } from './app/persistence'
import { castVote, confirmReveal, createRolelessGame, resolveRunoff, resolveVote, startRunoff, startVoting } from './game/roleless'
import { defaultMafiaCount, getRoleCounts } from './game/roles'
import { advanceRoleReveal, confirmRoleViewed, createRolesGame, currentRevealPlayer } from './game/rolesEngine'
import type { RolelessGameState, Variant } from './game/types'
import type { RolesGameState } from './game/rolesEngine'

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

        <section className="mt-8 border-t border-ink/15 pt-6"><p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-ink/50">Players</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{game.players.map((player) => <div className={`rounded-lg border px-3 py-3 text-sm ${player.alive ? 'border-ink/10 bg-white/35' : 'border-ink/10 bg-ink/10 text-ink/45 line-through'}`} key={player.id}>{player.name}</div>)}</div></section>
      </div>
    </main>
  )
}

function App() {
  const [restoredSession] = useState(() => loadRolelessSession())
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
  const [rolelessGame, setRolelessGame] = useState<RolelessGameState | null>(() => restoredSession?.game ?? null)
  const [rolesGame, setRolesGame] = useState<RolesGameState | null>(null)
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
    if (rolelessGame) saveRolelessSession({ game: rolelessGame, discussionSeconds: discussionMinutes * 60, defenseSeconds, timer: timerSnapshot })
  }, [rolelessGame, discussionMinutes, defenseSeconds, timerSnapshot])

  const exitRolelessGame = () => {
    clearActiveGame()
    setRolelessGame(null)
  }

  if (rolelessGame) {
    return <RolelessRunner initialGame={rolelessGame} initialTimer={timerSnapshot} discussionSeconds={discussionMinutes * 60} defenseSeconds={defenseSeconds} onTimerChange={setTimerSnapshot} onExit={exitRolelessGame} />
  }

  if (rolesGame) {
    return <RolesReveal initialGame={rolesGame} onExit={() => setRolesGame(null)} />
  }

  if (started) {
    return (
      <main className="min-h-screen bg-paper px-5 py-8 text-ink sm:px-10">
        <div className="mx-auto flex min-h-[80vh] max-w-3xl flex-col justify-between">
          <header className="flex items-center justify-between border-b border-ink/15 pb-5">
            <span className="font-display text-2xl font-bold">Mafia</span>
            <span className="rounded-full bg-sage/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em]">Setup complete</span>
          </header>
          <section className="py-12">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.25em] text-ember">Round zero</p>
            <h1 className="max-w-xl font-display text-5xl font-bold leading-[0.95] sm:text-7xl">The room is ready.</h1>
            <p className="mt-6 max-w-md text-lg leading-8 text-ink/70">The game board and secret deal flow will land here next. Your roster is staged for {playerCount} players.</p>
          </section>
          <button className="min-h-12 w-full rounded-xl bg-ink px-5 py-4 font-bold text-paper transition hover:bg-ink/85" onClick={() => setStarted(false)}>Edit setup</button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-10 sm:py-12">
        <header className="mb-14 flex items-start justify-between gap-6">
          <div>
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.25em] text-ember">GM cockpit / 01</p>
            <h1 className="font-display text-5xl font-bold leading-none sm:text-7xl">Set the table.</h1>
          </div>
          <span className="hidden rounded-full border border-ink/20 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] sm:block">Offline ready</span>
        </header>

        <div className="grid gap-10 lg:grid-cols-[1fr_0.75fr]">
          <section className="space-y-8">
            <div>
              <h2 className="mb-3 font-display text-2xl font-bold">Choose your night</h2>
              <div className="grid grid-cols-2 gap-3" role="group" aria-label="Game variant">
                {(['roleless', 'roles'] as Variant[]).map((option) => (
                  <button key={option} className={`min-h-14 rounded-xl border px-4 text-left font-bold transition ${variant === option ? 'border-ink bg-ink text-paper' : 'border-ink/20 bg-white/40 hover:border-ink/50'}`} onClick={() => setVariant(option)}>
                    <span className="block capitalize">{option}</span>
                    <span className={`text-xs font-normal ${variant === option ? 'text-paper/70' : 'text-ink/55'}`}>{option === 'roles' ? 'Doctor, detective, sheriff' : 'Mafia and civilians'}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-3 block font-display text-2xl font-bold" htmlFor="mafia-count">Mafia count</label>
              <select className="min-h-12 w-full rounded-xl border border-ink/15 bg-white/50 px-4 font-bold" id="mafia-count" onChange={(event) => setMafiaOverride(event.target.value === 'default' ? null : Number(event.target.value))} value={selectedMafia ?? 'default'}>
                <option value="default">Default: {defaultMafia}</option>
                {defaultMafia > 1 && <option value={defaultMafia - 1}>{defaultMafia - 1} mafia</option>}
                <option value={defaultMafia + 1}>{defaultMafia + 1} mafia</option>
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="mb-2 block text-sm font-bold uppercase tracking-wider text-ink/60">Discussion minutes</span><input className="min-h-12 w-full rounded-xl border border-ink/15 bg-white/50 px-4 font-bold" min="1" max="30" onChange={(event) => setDiscussionMinutes(Number(event.target.value))} type="number" value={discussionMinutes} /></label>
              <label className="block"><span className="mb-2 block text-sm font-bold uppercase tracking-wider text-ink/60">Defense seconds</span><input className="min-h-12 w-full rounded-xl border border-ink/15 bg-white/50 px-4 font-bold" min="5" max="300" onChange={(event) => setDefenseSeconds(Number(event.target.value))} type="number" value={defenseSeconds} /></label>
            </div>

            <div>
              <label className="mb-3 block font-display text-2xl font-bold" htmlFor="player-count">Players</label>
              <div className="flex items-center gap-4">
                <input className="h-3 flex-1 accent-ember" id="player-count" max="15" min="7" onChange={(event) => setPlayerCount(Number(event.target.value))} type="range" value={playerCount} />
                <output className="w-14 text-right font-display text-4xl font-bold" htmlFor="player-count">{playerCount}</output>
              </div>
            </div>

            {variant === 'roles' && <div className="space-y-2">
              <p className="font-display text-2xl font-bold">Special roles</p>
              <p className="text-sm leading-6 text-ink/60">The role table sets the defaults. Adjust any role for this game.</p>
              {([
                { id: 'doctor', label: 'Doctor', enabled: doctorEnabled, setEnabled: setDoctorEnabled },
                { id: 'detective', label: 'Detective', enabled: detectiveEnabled, setEnabled: setDetectiveEnabled },
                { id: 'sheriff', label: 'Sheriff', enabled: sheriffEnabled, setEnabled: setSheriffEnabled }
              ] as SpecialRoleOption[]).map(({ id, label, enabled, setEnabled }) => <label className="flex min-h-12 cursor-pointer items-center justify-between rounded-xl border border-ink/15 bg-white/40 px-4 font-bold" htmlFor={id} key={id}><span>{label}</span><input checked={enabled} className="h-5 w-5 accent-ember" id={id} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" /></label>)}
            </div>}
            {setupError && <p className="rounded-lg border border-ember/30 bg-ember/10 px-4 py-3 text-sm font-bold text-ember" role="alert">{setupError}</p>}
            <button className="min-h-14 w-full rounded-xl bg-ember px-5 py-4 text-lg font-bold text-paper shadow-lg shadow-ember/20 transition hover:-translate-y-0.5" onClick={variant === 'roleless' ? startConfiguredGame : startConfiguredRolesGame}>{variant === 'roleless' ? 'Start roleless game' : 'Assign roles'} <span aria-hidden="true">→</span></button>
          </section>

          <aside className="border-t border-ink/15 pt-8 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-ink/50">Tonight's mix</p>
            <div className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-ink/10 bg-ink/10">
              {Object.entries(roles).filter(([, count]) => count > 0).map(([role, count]) => <div className="bg-white/60 p-4" key={role}><strong className="block font-display text-3xl">{count}</strong><span className="text-xs font-bold uppercase tracking-wider text-ink/60">{role}</span></div>)}
            </div>
            <p className="font-display text-2xl font-bold leading-tight">Every vote visible.<br />Every secret protected.</p>
            <p className="mt-4 leading-7 text-ink/65">A quiet control surface for the person keeping the room moving.</p>
          </aside>
        </div>

        <section className="mt-16 border-t border-ink/15 pt-8">
          <div className="mb-4 flex items-baseline justify-between"><h2 className="font-display text-2xl font-bold">Roster</h2><span className="text-sm text-ink/55">{names.length} seats ready</span></div>
          <div className="grid gap-2 sm:grid-cols-2">{names.map((name, index) => <label className="flex items-center gap-3 rounded-lg border border-ink/10 bg-white/35 px-3 py-2" key={index}><span className="w-7 text-sm text-ink/40">{String(index + 1).padStart(2, '0')}</span><input aria-label={`Player ${index + 1} name`} className="min-h-10 min-w-0 flex-1 bg-transparent font-bold outline-none placeholder:text-ink/35" onChange={(event) => updatePlayerName(index, event.target.value)} placeholder={`Player ${index + 1}`} type="text" value={name} /></label>)}</div>
        </section>
      </div>
    </main>
  )
}

export default App
