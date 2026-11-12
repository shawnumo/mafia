import { useState } from 'react'
import type { FormEvent } from 'react'
import { applyGroup, GROUP_LIMIT, moveEntry, nextPlaceholder, playingNames, ROSTER_LIMIT, rosterId } from '../app/roster'
import type { RosterEntry, SavedGroup } from '../app/roster'
import type { GameSettings } from '../app/session'
import { speechAvailable } from '../app/speech'
import type { NewGameOptions } from '../game/engine'
import { defaultDetectiveEnabled, defaultMafiaCount, getRoleCounts, MAX_PLAYERS, MIN_PLAYERS } from '../game/roles'
import { validateSetup } from '../game/setup'
import type { RoleCounts, Variant } from '../game/types'
import { UpdateBanner } from './UpdateBanner'

interface SetupScreenProps {
  initialRoster: RosterEntry[]
  groups: SavedGroup[]
  recovered: boolean
  onRosterChange: (roster: RosterEntry[]) => void
  onGroupsChange: (groups: SavedGroup[]) => void
  onStart: (options: NewGameOptions, settings: GameSettings) => void
  onOpenRules: () => void
  onOpenStats: () => void
}

const stepTitles = ['The table', 'Game rules', 'Review setup']

function safeRoleCounts(options: Parameters<typeof getRoleCounts>[0]): RoleCounts | null {
  try {
    return getRoleCounts(options)
  } catch {
    return null
  }
}

/** Three-step setup. Settings live only here, so every new game starts from the defaults; the roster persists. */
export function SetupScreen({ initialRoster, groups, recovered, onRosterChange, onGroupsChange, onStart, onOpenRules, onOpenStats }: SetupScreenProps) {
  const [roster, setRoster] = useState(initialRoster)
  const [newName, setNewName] = useState('')
  const [groupName, setGroupName] = useState('')
  const [reordering, setReordering] = useState(false)
  const [variant, setVariant] = useState<Variant>('roleless')
  const [mafiaOverride, setMafiaOverride] = useState<number | null>(null)
  const [doctorEnabled, setDoctorEnabled] = useState(true)
  const [detectiveChoice, setDetectiveChoice] = useState<boolean | null>(null)
  const [sheriffEnabled, setSheriffEnabled] = useState(false)
  const [discussionMinutes, setDiscussionMinutes] = useState(5)
  const [defenseSeconds, setDefenseSeconds] = useState(30)
  const [soundAlerts, setSoundAlerts] = useState(true)
  const [vibrationAlerts, setVibrationAlerts] = useState(true)
  const [readAloud, setReadAloud] = useState(false)
  const [haptics, setHaptics] = useState(true)
  const [step, setStep] = useState(0)
  const canSpeak = speechAvailable()

  const activeNames = playingNames(roster)
  const playerCount = activeNames.length
  const tableCount = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, playerCount))
  const defaultMafia = defaultMafiaCount(tableCount)
  const selectedMafia = mafiaOverride !== null && Math.abs(mafiaOverride - defaultMafia) <= 1 ? mafiaOverride : undefined
  const detectiveEnabled = detectiveChoice ?? defaultDetectiveEnabled(playerCount)
  const options = { playerCount, variant, mafiaOverride: selectedMafia, doctorEnabled, detectiveEnabled, sheriffEnabled }
  const roles = playerCount >= MIN_PLAYERS && playerCount <= MAX_PLAYERS ? safeRoleCounts(options) : null
  const errors = validateSetup(options, activeNames, discussionMinutes, defenseSeconds)

  const changeRoster = (next: RosterEntry[]) => {
    setRoster(next)
    onRosterChange(next)
  }
  const updateEntry = (id: string, change: Partial<RosterEntry>) => changeRoster(roster.map((entry) => entry.id === id ? { ...entry, ...change } : entry))

  const addPlayer = (event: FormEvent) => {
    event.preventDefault()
    if (roster.length >= ROSTER_LIMIT) return
    const name = newName.trim() || nextPlaceholder(roster)
    changeRoster([...roster, { id: rosterId(), name, playing: playerCount < MAX_PLAYERS }])
    setNewName('')
  }

  const saveGroup = (event: FormEvent) => {
    event.preventDefault()
    const name = groupName.trim()
    if (!name || activeNames.length === 0) return
    const existing = groups.find((group) => group.name.toLocaleLowerCase() === name.toLocaleLowerCase())
    const group: SavedGroup = { id: existing?.id ?? rosterId('g'), name, players: activeNames.map((player) => player.trim()) }
    onGroupsChange([group, ...groups.filter((entry) => entry.id !== group.id)].slice(0, GROUP_LIMIT))
    setGroupName('')
  }

  const start = () => {
    if (errors.length > 0) return
    onStart(
      { ...options, playerNames: activeNames.map((name) => name.trim()) },
      { discussionSeconds: discussionMinutes * 60, defenseSeconds, soundAlerts, vibrationAlerts, readAloud: readAloud && canSpeak, haptics }
    )
  }

  const nightOrder = [
    'Mafia choose one kill.',
    ...(sheriffEnabled ? ['Sheriff shoots or abstains.'] : []),
    ...(detectiveEnabled ? ['Detective checks one player.'] : []),
    ...(doctorEnabled ? ['Doctor protects one player.'] : [])
  ]

  const card = 'rounded-2xl border border-ink/15 bg-white/70'
  const smallButton = 'min-h-11 min-w-11 rounded-lg border border-ink/15 bg-white px-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-35'
  const seatNumbers = new Map(roster.filter((entry) => entry.playing).map((entry, index) => [entry.id, index + 1]))

  return (
    <main className="screen bg-[#efe6d8] text-ink" data-phase="setup">
      <div className="mx-auto max-w-6xl">
        <UpdateBanner />
        {recovered && (
          <div className="mb-6 rounded-xl border border-ember/30 bg-ember/10 px-4 py-3 text-sm font-bold text-ink" role="alert">
            The saved game could not be read, so it was set aside on this device and a fresh setup was opened.
          </div>
        )}

        <header className="mb-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-6xl font-black leading-[0.85] sm:text-8xl">Mafia</h1>
            <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.25em] text-ember">Set the table</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button aria-haspopup="dialog" className="min-h-11 rounded-full border border-ink/15 bg-white/70 px-4 text-xs font-bold uppercase tracking-[0.2em]" onClick={onOpenStats} type="button">Stats</button>
            <button aria-haspopup="dialog" className="min-h-11 rounded-full border border-ink/15 bg-white/70 px-4 text-xs font-bold uppercase tracking-[0.2em]" onClick={onOpenRules} type="button">Rules</button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <section className="min-w-0 space-y-7 rounded-[2rem] border border-ink/10 bg-panel p-4 shadow-[0_20px_42px_rgba(19,33,34,0.06)] sm:p-7">
            <div>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-2xl font-bold">{stepTitles[step]}</h2>
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-ink/60">Step {step + 1} of 3</span>
              </div>
              <ol aria-label="Setup progress" className="grid grid-cols-3 gap-2">
                {['Table', 'Rules', 'Review'].map((label, index) => (
                  <li aria-current={step === index ? 'step' : undefined} className={`rounded-full px-3 py-2 text-center text-xs font-bold ${step === index ? 'bg-ink text-paper' : step > index ? 'bg-sage/20' : 'bg-ink/5 text-ink/60'}`} key={label}>{label}</li>
                ))}
              </ol>
            </div>

            {step === 0 && <>
              <div>
                <h3 className="mb-3 font-display text-xl font-bold">Choose the game</h3>
                <div aria-label="Game variant" className="grid grid-cols-2 gap-3" role="group">
                  {(['roleless', 'roles'] as Variant[]).map((option) => (
                    <button aria-pressed={variant === option} className={`min-h-14 rounded-2xl border px-4 py-2 text-left font-bold transition ${variant === option ? 'border-ink bg-ink text-paper' : 'border-ink/15 bg-white/70 hover:border-ink/40'}`} key={option} onClick={() => setVariant(option)} type="button">
                      <span className="block">{option === 'roleless' ? 'No roles' : 'Roles'}</span>
                      <span className={`text-xs font-normal ${variant === option ? 'text-paper/75' : 'text-ink/65'}`}>{option === 'roles' ? 'Doctor, detective, sheriff' : 'Mafia and civilians'}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={`${card} p-3 sm:p-4`}>
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
                  <h3 className="font-display text-xl font-bold">Tonight's players</h3>
                  <span aria-live="polite" className={`text-sm font-bold ${playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS ? 'text-ember' : 'text-ink/65'}`} data-testid="playing-count">{playerCount} playing · 7–15</span>
                </div>
                <p className="mb-3 text-sm leading-6 text-ink/70">Tick who is playing. The list order is the seating order around the table.</p>

                {groups.length > 0 && (
                  <div className="mb-4">
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-ink/60">Saved groups</p>
                    <ul className="flex flex-wrap gap-2">
                      {groups.map((group) => (
                        <li className="flex items-center overflow-hidden rounded-full border border-ink/15 bg-white" key={group.id}>
                          <button className="min-h-11 px-4 text-sm font-bold" onClick={() => changeRoster(applyGroup(roster, group))} type="button">Load {group.name} ({group.players.length})</button>
                          <button aria-label={`Delete group ${group.name}`} className="min-h-11 min-w-11 border-l border-ink/10 text-ink/60" onClick={() => onGroupsChange(groups.filter((entry) => entry.id !== group.id))} type="button">✕</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mb-2 flex justify-end">
                  <button aria-pressed={reordering} className="min-h-11 rounded-lg px-3 text-sm font-bold text-ink/75 underline-offset-4 hover:underline" onClick={() => setReordering((current) => !current)} type="button">{reordering ? 'Done seating' : 'Change seating'}</button>
                </div>

                <ol className="space-y-2" aria-label="Roster">
                  {roster.map((entry, index) => {
                    const seatNumber = seatNumbers.get(entry.id) ?? null
                    const label = entry.name.trim() || `player ${index + 1}`
                    return (
                      <li className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border px-2 py-1 ${entry.playing ? 'border-ink/15 bg-white/90' : 'border-ink/10 bg-ink/5'}`} key={entry.id}>
                        {reordering ? (
                          <span className="w-8 text-center text-sm font-bold text-ink/60">{seatNumber ?? '–'}</span>
                        ) : (
                          <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                            <input aria-label={`Playing tonight: ${label}`} checked={entry.playing} className="h-5 w-5 accent-ember" onChange={(event) => updateEntry(entry.id, { playing: event.target.checked })} type="checkbox" />
                          </label>
                        )}
                        {reordering
                          ? <span className="truncate font-bold">{label}</span>
                          : <input aria-label={`Player ${index + 1} name`} autoComplete="off" className="min-h-11 min-w-0 rounded-md bg-transparent px-1 text-base font-bold outline-none placeholder:text-ink/40 focus:bg-ember/10" maxLength={24} onChange={(event) => updateEntry(entry.id, { name: event.target.value })} placeholder={`Player ${index + 1}`} type="text" value={entry.name} />}
                        <div className="flex gap-1">
                          {reordering ? <>
                            <button aria-label={`Move ${label} up`} className={smallButton} disabled={index === 0} onClick={() => changeRoster(moveEntry(roster, entry.id, -1))} type="button">↑</button>
                            <button aria-label={`Move ${label} down`} className={smallButton} disabled={index === roster.length - 1} onClick={() => changeRoster(moveEntry(roster, entry.id, 1))} type="button">↓</button>
                          </> : (
                            <button aria-label={`Remove ${label}`} className={smallButton} onClick={() => changeRoster(roster.filter((candidate) => candidate.id !== entry.id))} type="button">✕</button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>

                <form className="mt-3 flex gap-2" onSubmit={addPlayer}>
                  <input aria-label="New player name" autoComplete="off" className="min-h-11 min-w-0 flex-1 rounded-lg border border-ink/15 bg-white px-3 text-base" maxLength={24} onChange={(event) => setNewName(event.target.value)} placeholder="Add a player" type="text" value={newName} />
                  <button className="min-h-11 shrink-0 rounded-lg bg-ink px-4 text-sm font-bold text-paper disabled:opacity-40" disabled={roster.length >= ROSTER_LIMIT} type="submit">Add player</button>
                </form>

                <form className="mt-3 flex gap-2" onSubmit={saveGroup}>
                  <input aria-label="Group name" autoComplete="off" className="min-h-11 min-w-0 flex-1 rounded-lg border border-ink/15 bg-white px-3 text-base" maxLength={30} onChange={(event) => setGroupName(event.target.value)} placeholder="Name tonight's group" type="text" value={groupName} />
                  <button className="min-h-11 shrink-0 rounded-lg border border-ink/20 px-4 text-sm font-bold disabled:opacity-40" disabled={!groupName.trim() || activeNames.length === 0} type="submit">Save group</button>
                </form>
              </div>
            </>}

            {step === 1 && <>
              <div>
                <div className="mb-3 flex items-baseline justify-between gap-4">
                  <h3 className="font-display text-2xl font-bold">Mafia count</h3>
                  <span className="text-xs font-bold uppercase tracking-[0.15em] text-ink/60">Default: {defaultMafia}</span>
                </div>
                <div aria-label="Mafia count" className="grid grid-cols-3 gap-2" role="group">
                  {[defaultMafia - 1, defaultMafia, defaultMafia + 1].map((count) => {
                    const selected = (selectedMafia ?? defaultMafia) === count
                    return (
                      <button aria-pressed={selected} className={`min-h-12 rounded-xl border px-3 font-display text-2xl font-bold ${selected ? 'border-ink bg-ink text-paper' : 'border-ink/15 bg-white/70 hover:border-ink/40'}`} key={count} onClick={() => setMafiaOverride(count === defaultMafia ? null : count)} type="button">
                        {count}<span className="ml-1 font-sans text-xs font-bold uppercase tracking-[0.12em]">mafia</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {variant === 'roles' && (
                <fieldset className="space-y-2">
                  <legend className="font-display text-2xl font-bold">Special roles</legend>
                  <p className="text-sm leading-6 text-ink/70">The table sets the defaults. Adjust only what this game needs.</p>
                  {[
                    { id: 'doctor', label: 'Doctor', checked: doctorEnabled, onChange: setDoctorEnabled, hint: null },
                    { id: 'detective', label: 'Detective', checked: detectiveEnabled, onChange: (value: boolean) => setDetectiveChoice(value), hint: detectiveChoice === null ? 'Table default' : null },
                    { id: 'sheriff', label: 'Sheriff', checked: sheriffEnabled, onChange: setSheriffEnabled, hint: null }
                  ].map((role) => (
                    <label className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 ${card} px-4 font-bold`} htmlFor={role.id} key={role.id}>
                      <span>{role.label}{role.hint && <span className="ml-2 text-xs font-normal text-ink/60">{role.hint}</span>}</span>
                      <input checked={role.checked} className="h-5 w-5 accent-ember" id={role.id} onChange={(event) => role.onChange(event.target.checked)} type="checkbox" />
                    </label>
                  ))}
                </fieldset>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold uppercase tracking-[0.15em] text-ink/70">Discussion time (minutes)</span>
                  <input className="min-h-12 w-full rounded-2xl border border-ink/15 bg-white/80 px-4 text-base font-bold" inputMode="numeric" max="30" min="1" onChange={(event) => setDiscussionMinutes(Number(event.target.value))} step="1" type="number" value={discussionMinutes} />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-bold uppercase tracking-[0.15em] text-ink/70">Defense time (seconds)</span>
                  <input className="min-h-12 w-full rounded-2xl border border-ink/15 bg-white/80 px-4 text-base font-bold" inputMode="numeric" max="300" min="5" onChange={(event) => setDefenseSeconds(Number(event.target.value))} step="1" type="number" value={defenseSeconds} />
                </label>
              </div>

              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-bold uppercase tracking-[0.15em] text-ink/70">When a timer reaches zero</legend>
                <label className={`flex min-h-12 cursor-pointer items-center justify-between ${card} px-4 font-bold`}>
                  <span>Play a sound</span>
                  <input checked={soundAlerts} className="h-5 w-5 accent-ember" onChange={(event) => setSoundAlerts(event.target.checked)} type="checkbox" />
                </label>
                <label className={`flex min-h-12 cursor-pointer items-center justify-between ${card} px-4 font-bold`}>
                  <span>Vibrate <span className="ml-1 text-xs font-normal text-ink/60">where the phone supports it</span></span>
                  <input checked={vibrationAlerts} className="h-5 w-5 accent-ember" onChange={(event) => setVibrationAlerts(event.target.checked)} type="checkbox" />
                </label>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-bold uppercase tracking-[0.15em] text-ink/70">Narration and feedback</legend>
                <label className={`flex min-h-12 items-center justify-between gap-3 ${card} px-4 font-bold ${canSpeak ? 'cursor-pointer' : 'opacity-60'}`}>
                  <span>Read the narration aloud <span className="ml-1 block text-xs font-normal text-ink/65 sm:inline">{canSpeak ? 'Uses the phone\'s built-in voice' : 'This browser has no built-in voice'}</span></span>
                  <input checked={readAloud && canSpeak} className="h-5 w-5 accent-ember" disabled={!canSpeak} onChange={(event) => setReadAloud(event.target.checked)} type="checkbox" />
                </label>
                <label className={`flex min-h-12 cursor-pointer items-center justify-between ${card} px-4 font-bold`}>
                  <span>Tap feedback on confirmations</span>
                  <input checked={haptics} className="h-5 w-5 accent-ember" onChange={(event) => setHaptics(event.target.checked)} type="checkbox" />
                </label>
              </fieldset>
            </>}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h3 className="font-display text-xl font-bold">Role balance</h3>
                  <RoleGrid roles={roles} />
                </div>
                <div>
                  <h3 className="font-display text-xl font-bold">Roster check</h3>
                  <p className="mt-2 text-sm leading-6 text-ink/70">{playerCount} players · {discussionMinutes} minute discussion · {defenseSeconds} second defenses</p>
                  <ol className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    {activeNames.map((name, index) => <li className="rounded-lg bg-white/70 px-3 py-2" key={index}>Seat {index + 1} · {name.trim() || 'Name required'}</li>)}
                  </ol>
                </div>
                <div aria-live="polite" className={`rounded-xl px-4 py-3 text-sm font-bold ${errors.length ? 'border border-ember/30 bg-ember/10 text-ink' : 'bg-sage/15 text-ink'}`}>
                  {errors.length
                    ? <ul className="list-inside list-disc space-y-1">{errors.map((error) => <li key={error}>{error}</li>)}</ul>
                    : 'Setup checks passed. This game is ready to start.'}
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-between gap-3 border-t border-ink/10 pt-5">
              <button className="min-h-12 rounded-xl border border-ink/20 px-5 py-3 font-bold disabled:cursor-not-allowed disabled:opacity-40" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))} type="button">Back</button>
              {step < 2
                ? <button className="min-h-12 rounded-xl bg-ink px-5 py-3 font-bold text-paper" onClick={() => setStep((current) => Math.min(2, current + 1))} type="button">Continue <span aria-hidden="true">→</span></button>
                : <button className="min-h-12 rounded-xl bg-ink px-5 py-3 font-bold text-paper disabled:cursor-not-allowed disabled:opacity-40" disabled={errors.length > 0} onClick={start} type="button">{variant === 'roleless' ? 'Start no-roles game' : 'Assign roles'} <span aria-hidden="true">→</span></button>}
            </div>
          </section>

          <aside className="min-w-0 rounded-[2rem] border border-ink/10 bg-[#f4efea] p-5 sm:p-6">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-ink/60">Tonight's mix</p>
            <RoleGrid roles={roles} />
            <div className="pt-8">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-ink/60">Game plan</p>
              <p className="font-display text-2xl font-bold leading-tight">{variant === 'roles' ? 'Night order' : 'Round flow'}</p>
              <ol className="mt-4 space-y-3 text-sm font-bold text-ink/80">
                {(variant === 'roles' ? nightOrder : ['Open discussion.', 'Live vote in random order.', 'Elimination reveal.']).map((item, index) => (
                  <li className="flex gap-3" key={item}><span className="font-display text-lg text-ember">{String(index + 1).padStart(2, '0')}</span><span>{item}</span></li>
                ))}
              </ol>
              <p className="mt-5 text-sm leading-6 text-ink/70">
                {variant === 'roles'
                  ? 'After each night: morning announcement, discussion, and a live vote.'
                  : 'Everyone sees their role privately first. Faction counts stay hidden during play; only voted-out roles are revealed.'}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}

function RoleGrid({ roles }: { roles: RoleCounts | null }) {
  if (!roles) return <p className="mt-3 text-sm font-bold text-ember">Pick 7 to 15 players to see the role mix.</p>
  return (
    <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-ink/10 bg-ink/10 sm:grid-cols-3">
      {Object.entries(roles).filter(([, count]) => count > 0).map(([role, count]) => (
        <div className="bg-white/80 p-3" key={role}>
          <strong className="block font-display text-2xl">{count}</strong>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink/65">{role}</span>
        </div>
      ))}
    </div>
  )
}
