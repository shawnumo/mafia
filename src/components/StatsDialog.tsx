import { computeStats } from '../app/history'
import type { GameRecord } from '../app/history'
import type { Role } from '../game/types'
import { useConfirm } from './ConfirmProvider'
import { Dialog } from './Dialog'

const roleOrder: Role[] = ['mafia', 'civilian', 'doctor', 'detective', 'sheriff']

function percent(wins: number, games: number): string {
  return games === 0 ? '–' : `${Math.round((wins / games) * 100)}%`
}

/** Local-only history: kept on this device, a first step toward the planned shared game history. */
export function StatsDialog({ history, onClear, onClose }: { history: readonly GameRecord[]; onClear: () => void; onClose: () => void }) {
  const confirm = useConfirm()
  const stats = computeStats(history)

  const clear = async () => {
    const ok = await confirm({
      title: 'Clear the game history?',
      body: 'Every finished game recorded on this device is deleted. This cannot be undone.',
      confirmLabel: 'Clear history',
      tone: 'danger'
    })
    if (ok) onClear()
  }

  return (
    <Dialog description="Finished games recorded on this device only." eyebrow="Local stats" onClose={onClose} size="lg" title="Game history">
      <div className="mb-5 flex flex-wrap gap-2">
        <button className="min-h-11 rounded-full border border-ink/20 bg-white px-4 text-sm font-bold" onClick={onClose} type="button">Close</button>
        {stats.games > 0 && <button className="min-h-11 rounded-full border border-ember/40 px-4 text-sm font-bold text-ember" onClick={clear} type="button">Clear history</button>}
      </div>

      {stats.games === 0 ? (
        <p className="rounded-xl bg-white/70 p-4 text-sm text-ink/70">No finished games yet. Results appear here once a game reaches its final board.</p>
      ) : (
        <div className="space-y-6">
          <dl className="grid grid-cols-3 gap-2">
            {[
              { label: 'Games', value: String(stats.games) },
              { label: 'Town wins', value: percent(stats.townWins, stats.games) },
              { label: 'Mafia wins', value: percent(stats.mafiaWins, stats.games) }
            ].map((tile) => (
              <div className="rounded-2xl border border-ink/10 bg-white/75 p-3" key={tile.label}>
                <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink/65">{tile.label}</dt>
                <dd className="mt-1 font-display text-3xl font-bold tabular-nums">{tile.value}</dd>
              </div>
            ))}
          </dl>

          <section>
            <h3 className="mb-2 font-display text-xl font-bold">Win rate by role</h3>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {roleOrder.filter((role) => stats.byRole[role]).map((role) => {
                const entry = stats.byRole[role]!
                return (
                  <li className="flex items-center justify-between rounded-xl border border-ink/10 bg-white/75 px-4 py-2 text-sm" key={role}>
                    <span className="font-bold capitalize">{role}</span>
                    <span className="tabular-nums">{percent(entry.wins, entry.games)} <span className="text-ink/60">of {entry.games}</span></span>
                  </li>
                )
              })}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 font-display text-xl font-bold">Players</h3>
            <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white/75">
              <table className="w-full min-w-[26rem] text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.12em] text-ink/60">
                    <th className="px-3 py-2" scope="col">Player</th>
                    <th className="px-3 py-2" scope="col">Games</th>
                    <th className="px-3 py-2" scope="col">Win rate</th>
                    <th className="px-3 py-2" scope="col">Survived</th>
                    <th className="px-3 py-2" scope="col">Roles played</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.players.map((player) => (
                    <tr className="border-t border-ink/10" key={player.name}>
                      <th className="px-3 py-2 font-bold" scope="row">{player.name}</th>
                      <td className="px-3 py-2 tabular-nums">{player.games}</td>
                      <td className="px-3 py-2 tabular-nums">{percent(player.wins, player.games)}</td>
                      <td className="px-3 py-2 tabular-nums">{percent(player.survived, player.games)}</td>
                      <td className="px-3 py-2 text-ink/75">{roleOrder.filter((role) => player.roles[role]).map((role) => `${role} ${player.roles[role]}`).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </Dialog>
  )
}
