import { useCallback, useEffect, useState } from 'react'
import { setHapticsEnabled } from './app/alerts'
import { loadHistory, recordFromSession, removeRecord, saveHistory, upsertRecord } from './app/history'
import type { GameRecord } from './app/history'
import { clearActiveGame, loadSession, saveSession } from './app/persistence'
import { appRandom } from './app/random'
import { defaultRoster, loadGroups, loadRoster, rosterFromNames, saveGroups, saveRoster } from './app/roster'
import type { RosterEntry, SavedGroup } from './app/roster'
import { createSession } from './app/session'
import type { GameSettings, Session } from './app/session'
import { createStore } from './app/store'
import { ConfirmProvider } from './components/ConfirmProvider'
import { GameSession } from './components/GameSession'
import { RulesReference } from './components/RulesReference'
import { SetupScreen } from './components/SetupScreen'
import { StatsDialog } from './components/StatsDialog'
import { createGame } from './game/engine'
import type { NewGameOptions } from './game/engine'

function initialRoster(session: Session | null): RosterEntry[] {
  return loadRoster() ?? (session ? rosterFromNames(session.game.players.map((player) => player.name)) : defaultRoster())
}

function App() {
  const [boot] = useState(() => {
    const loaded = loadSession()
    return {
      store: createStore<Session | null>(loaded.session),
      recovered: loaded.recovered,
      roster: initialRoster(loaded.session),
      groups: loadGroups(),
      history: loadHistory()
    }
  })
  const { store } = boot
  const [roster, setRoster] = useState(boot.roster)
  const [groups, setGroups] = useState(boot.groups)
  const [history, setHistory] = useState<GameRecord[]>(boot.history)
  const [recovered, setRecovered] = useState(boot.recovered)
  const [storageFailed, setStorageFailed] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [setupKey, setSetupKey] = useState(0)
  const [inGame, setInGame] = useState(boot.store.getState() !== null)

  // Save after every accepted change, and keep the local history in step with how the game ended.
  // Timer ticks are derived from the clock and never written.
  useEffect(() => store.subscribe(() => {
    const current = store.getState()
    setInGame(current !== null)
    setHapticsEnabled(current?.settings.haptics ?? true)
    if (!current) {
      clearActiveGame()
      setStorageFailed(false)
      return
    }
    setStorageFailed(!saveSession(current))
    setHistory((previous) => {
      const record = recordFromSession(current, Date.now())
      const known = previous.some((entry) => entry.id === current.id)
      if (!record && !known) return previous
      const next = record ? upsertRecord(previous, record) : removeRecord(previous, current.id)
      saveHistory(next)
      return next
    })
  }), [store])

  useEffect(() => setHapticsEnabled(store.getState()?.settings.haptics ?? true), [store])

  const leaveGame = useCallback(() => {
    store.setState(null)
    setActionError(null)
    setRecovered(false)
    setSetupKey((key) => key + 1)
  }, [store])

  const openRules = useCallback(() => setRulesOpen(true), [])
  const openStats = useCallback(() => setStatsOpen(true), [])

  const startGame = (options: NewGameOptions, settings: GameSettings) => {
    try {
      const game = createGame(options, appRandom)
      store.setState(createSession(game, settings))
      setActionError(null)
      setRecovered(false)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Check the setup and try again.')
    }
  }

  const changeRoster = (next: RosterEntry[]) => {
    setRoster(next)
    saveRoster(next)
  }

  const changeGroups = (next: SavedGroup[]) => {
    setGroups(next)
    saveGroups(next)
  }

  const clearHistory = () => {
    setHistory([])
    saveHistory([])
  }

  return (
    <ConfirmProvider>
      {inGame
        ? <GameSession onError={setActionError} onLeave={leaveGame} onOpenRules={openRules} onOpenStats={openStats} store={store} />
        : (
          <SetupScreen
            groups={groups}
            initialRoster={roster}
            key={setupKey}
            onGroupsChange={changeGroups}
            onOpenRules={openRules}
            onOpenStats={openStats}
            onRosterChange={changeRoster}
            onStart={startGame}
            recovered={recovered}
          />
        )}

      {rulesOpen && <RulesReference onClose={() => setRulesOpen(false)} />}
      {statsOpen && <StatsDialog history={history} onClear={clearHistory} onClose={() => setStatsOpen(false)} />}

      <div aria-live="assertive" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {actionError && (
          <div className="pointer-events-auto flex w-full max-w-lg items-start justify-between gap-3 rounded-xl bg-ember px-4 py-3 text-sm font-bold text-paper shadow-lg" role="alert">
            <span>{actionError}</span>
            <button className="min-h-8 shrink-0 rounded-md border border-paper/40 px-2" onClick={() => setActionError(null)} type="button">Dismiss</button>
          </div>
        )}
        {storageFailed && (
          <div className="pointer-events-auto w-full max-w-lg rounded-xl bg-ink px-4 py-3 text-sm font-bold text-paper shadow-lg" role="status">
            This device could not save the game. Keep this tab open; a reload would lose recent changes.
          </div>
        )}
      </div>
    </ConfirmProvider>
  )
}

export default App
