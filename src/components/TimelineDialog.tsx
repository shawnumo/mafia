import { isRestorable } from '../app/session'
import { useConfirm } from './ConfirmProvider'
import { Dialog } from './Dialog'
import { useGame } from './GameContext'

/** Checkpoint list. Restoring drops later checkpoints; private-deal states are never restorable. */
export function TimelineDialog({ notesAllowed, onClose }: { notesAllowed: boolean; onClose: () => void }) {
  const { session, restoreCheckpoint, setCheckpointNote } = useGame()
  const confirm = useConfirm()
  const entries = [...session.timeline].reverse()

  const restore = async (id: string, label: string) => {
    const ok = await confirm({
      title: `Restore “${label}”?`,
      body: 'The game returns to this checkpoint. Every later checkpoint is removed.',
      confirmLabel: 'Restore checkpoint',
      tone: 'danger'
    })
    if (ok) {
      restoreCheckpoint(id)
      onClose()
    }
  }

  return (
    <Dialog description="Choose a checkpoint to restore. Later checkpoints will be removed." onClose={onClose} title="Game activity">
      <button className="mb-4 min-h-11 rounded-lg border border-ink/20 px-4 text-sm font-bold" onClick={onClose} type="button">Close</button>
      {entries.length === 0 ? (
        <p className="rounded-xl bg-white/70 p-4 text-sm text-ink/70">No checkpoints have been recorded yet.</p>
      ) : (
        <ol className="space-y-3">
          {entries.map((entry, index) => {
            const current = index === 0
            const restorable = !current && isRestorable(entry)
            return (
              <li className="rounded-2xl border border-ink/10 bg-white/75 p-4" key={entry.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-bold">{entry.label}</p>
                    <time className="mt-1 block text-xs text-ink/60" dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString()}</time>
                  </div>
                  <button
                    className="min-h-11 rounded-lg border border-ink/20 px-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!restorable}
                    onClick={() => restore(entry.id, entry.label)}
                    type="button"
                  >
                    {current ? 'Current' : 'Restore'}
                  </button>
                </div>
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-ink/60">GM note {notesAllowed ? '' : '(available after the game)'}</span>
                  <textarea
                    aria-label={`GM note for ${entry.label}`}
                    className="min-h-16 w-full resize-y rounded-lg border border-ink/15 bg-panel px-3 py-2 text-sm leading-6 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!notesAllowed}
                    onChange={(event) => setCheckpointNote(entry.id, event.target.value)}
                    placeholder={notesAllowed ? 'Add a reminder or correction note' : 'Notes stay locked during play to protect secret roles.'}
                    value={notesAllowed ? entry.note : ''}
                  />
                </label>
              </li>
            )
          })}
        </ol>
      )}
    </Dialog>
  )
}
