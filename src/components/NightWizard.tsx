import { useEffect } from 'react'
import { haptic } from '../app/alerts'
import { afterStepNarration, narrationText, stepNarration } from '../app/narration'
import type { NightDraft } from '../app/session'
import { speak, speakOnce, speechAvailable } from '../app/speech'
import { joinNames } from '../game/core'
import { detectiveAnswer, nightSteps, nightTargetIds } from '../game/rolesEngine'
import type { NightStep } from '../game/rolesEngine'
import type { NightActions, RolesGameState } from '../game/types'
import { useConfirm } from './ConfirmProvider'
import { GameBoard } from './GameBoard'
import { useGame } from './GameContext'
import { GameHeader } from './GameHeader'
import { HoldToReveal } from './HoldToReveal'

const stepLabels: Record<NightStep, string> = {
  mafia: 'Mafia kill',
  sheriff: 'Sheriff shot',
  detective: 'Detective check',
  doctor: 'Doctor protection'
}

const fields = {
  mafia: 'mafiaTargetId',
  sheriff: 'sheriffTargetId',
  detective: 'detectiveGuessId',
  doctor: 'doctorTargetId'
} as const satisfies Record<NightStep, keyof NightDraft>

function actorNames(game: RolesGameState, step: NightStep): string {
  return joinNames(game.players.filter((player) => player.alive && player.role === step).map((player) => player.name))
}

function buildActions(draft: NightDraft, steps: NightStep[]): NightActions | null {
  if (!draft.mafiaTargetId) return null
  return {
    mafiaTargetId: draft.mafiaTargetId,
    ...(steps.includes('sheriff') ? (draft.sheriffAbstained ? { sheriffAbstained: true } : { sheriffTargetId: draft.sheriffTargetId }) : {}),
    ...(steps.includes('detective') && draft.detectiveGuessId ? { detectiveGuessId: draft.detectiveGuessId } : {}),
    ...(steps.includes('doctor') && draft.doctorTargetId ? { doctorTargetId: draft.doctorTargetId } : {})
  }
}

function isStepComplete(draft: NightDraft, step: NightStep): boolean {
  return Boolean(draft[fields[step]]) || (step === 'sheriff' && draft.sheriffAbstained === true)
}

/** GM-only night screen, dark so it does not light up the room. One step at a time, in the fixed order. */
export function NightWizard() {
  const { session, run, setNightDraft } = useGame()
  const confirm = useConfirm()
  const game = session.game
  const draftStep = session.nightDraft?.stepIndex ?? 0
  const readAloud = session.settings.readAloud

  // Each night step starts at the top of the screen, like a new page.
  useEffect(() => {
    window.scrollTo?.({ top: 0 })
  }, [draftStep])

  // Read-aloud mode speaks each step's script once, when the GM first reaches it.
  useEffect(() => {
    if (!readAloud || game.variant !== 'roles' || game.phase !== 'night') return
    const index = Math.min(draftStep, nightSteps(game).length - 1)
    speakOnce(`night:${session.id}:${game.round}:${index}`, stepNarration(game, index))
  }, [readAloud, draftStep, game, session.id])

  if (game.variant !== 'roles') return null

  const draft = session.nightDraft ?? { stepIndex: 0 }
  const steps = nightSteps(game)
  const stepIndex = Math.min(draft.stepIndex, steps.length - 1)
  const step = steps[stepIndex]
  const field = fields[step]
  const selected = draft[field]
  const complete = isStepComplete(draft, step)
  const isLast = stepIndex === steps.length - 1
  const nameOf = (id: string | undefined) => game.players.find((player) => player.id === id)?.name ?? ''
  const script = stepNarration(game, stepIndex)
  const after = afterStepNarration(game, step, steps[stepIndex + 1] ?? null)
  const canSpeak = speechAvailable()

  const update = (changes: Partial<NightDraft>) => setNightDraft({ ...draft, stepIndex, ...changes })
  const choose = (id: string) => {
    haptic()
    update(step === 'sheriff' ? { sheriffTargetId: id, sheriffAbstained: undefined } : { [field]: id })
  }
  const clearStep = () => update(step === 'sheriff' ? { sheriffTargetId: undefined, sheriffAbstained: undefined } : { [field]: undefined })

  const answer = (() => {
    if (step !== 'detective' || !draft.detectiveGuessId) return null
    try {
      return detectiveAnswer(game, draft.detectiveGuessId)
    } catch {
      return null
    }
  })()

  const next = async () => {
    if (!complete) return
    if (!isLast) {
      update({ stepIndex: stepIndex + 1 })
      return
    }
    const actions = buildActions(draft, steps)
    const missing = steps.find((candidate) => !isStepComplete(draft, candidate))
    if (!actions || missing) {
      update({ stepIndex: missing ? steps.indexOf(missing) : 0 })
      return
    }
    const ok = await confirm({
      title: `Resolve Night ${game.round}?`,
      body: 'Deaths and any doctor save are applied. The morning report comes next.',
      confirmLabel: 'Resolve night'
    })
    if (!ok) return
    if (readAloud) speakOnce(`night-end:${session.id}:${game.round}`, after)
    run({ type: 'resolveNight', actions })
  }

  return (
    <main className="screen bg-ink text-paper" data-phase="night">
      <div className="mx-auto max-w-5xl">
        <GameHeader dark eyebrow={`Night ${game.round} · GM only`} title="Night time" />

        <ol aria-label="Night order" className="mb-6 flex flex-wrap gap-2 text-sm font-bold">
          {steps.map((candidate, index) => (
            <li
              aria-current={index === stepIndex ? 'step' : undefined}
              className={`rounded-full px-3 py-1.5 ${index === stepIndex ? 'bg-brass text-ink' : isStepComplete(draft, candidate) ? 'bg-paper/15 text-paper' : 'border border-paper/20 text-paper/65'}`}
              key={candidate}
            >
              {index + 1}. {stepLabels[candidate]}
            </li>
          ))}
        </ol>

        <section className="max-w-3xl rounded-2xl border border-paper/15 bg-paper/5 p-5 sm:p-8">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-brass">Step {stepIndex + 1} of {steps.length}</p>
          <h2 className="font-display text-3xl font-bold sm:text-4xl">{stepLabels[step]}</h2>
          <div className="mt-4 rounded-xl border border-brass/40 bg-brass/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-brass">Say this</p>
              {canSpeak && <button className="min-h-11 rounded-lg border border-paper/25 px-3 text-sm font-bold" onClick={() => speak(script)} type="button"><span aria-hidden="true">🔊 </span>Read aloud</button>}
            </div>
            <p className="mt-2 text-lg leading-8" data-testid="night-script">{narrationText(script)}</p>
          </div>
          <p className="mt-3 text-sm text-paper/65">Awake: {actorNames(game, step)}</p>

          {step === 'sheriff' && (
            <button
              aria-pressed={draft.sheriffAbstained === true}
              className={`mt-5 min-h-11 rounded-xl border px-4 text-sm font-bold ${draft.sheriffAbstained ? 'border-brass bg-brass text-ink' : 'border-paper/25'}`}
              onClick={() => update({ sheriffTargetId: undefined, sheriffAbstained: true })}
              type="button"
            >
              {draft.sheriffAbstained ? 'Sheriff abstains tonight' : 'Sheriff abstains'}
            </button>
          )}

          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {nightTargetIds(game, step).map((id) => (
              <button
                aria-pressed={selected === id}
                className={`min-h-12 rounded-xl border px-3 text-left font-bold ${selected === id ? 'border-brass bg-brass/20 text-paper' : 'border-paper/20 bg-paper/5'}`}
                data-testid="night-target"
                key={id}
                onClick={() => choose(id)}
                type="button"
              >
                {nameOf(id)}
              </button>
            ))}
          </div>

          {answer !== null && (
            <div className="mt-6 max-w-sm">
              <p className="mb-2 text-sm text-paper/75">Private answer for the detective's check on {nameOf(draft.detectiveGuessId)}:</p>
              <HoldToReveal
                className="min-h-24 border-sky-300/60 bg-sky-300/10 text-sky-200"
                disabled={false}
                disabledText=""
                hiddenText="Hold for the answer"
                label="Press and hold to see the detective's answer"
              >
                <span className="text-3xl">{answer ? '👍 Mafia' : '👎 Innocent'}</span>
              </HoldToReveal>
            </div>
          )}

          <p className="mt-6 text-sm leading-6 text-paper/75" data-testid="night-after">
            <span className="font-bold text-paper">Then say: </span>{narrationText(after)}{isLast ? ' The morning report comes next.' : ''}
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button className="min-h-12 rounded-xl bg-paper px-5 py-3 font-bold text-ink disabled:cursor-not-allowed disabled:opacity-40" disabled={!complete} onClick={next} type="button">
              {isLast ? 'Resolve night' : `Confirm ${stepLabels[step].toLowerCase()}`} <span aria-hidden="true">→</span>
            </button>
            {stepIndex > 0 && <button className="min-h-12 rounded-xl border border-paper/25 px-5 py-3 font-bold" onClick={() => update({ stepIndex: stepIndex - 1 })} type="button">Back</button>}
            <button className="min-h-12 rounded-xl border border-paper/25 px-5 py-3 font-bold disabled:opacity-40" disabled={!complete} onClick={clearStep} type="button">Clear this step</button>
          </div>
        </section>

        <GameBoard dark game={game} />
      </div>
    </main>
  )
}
