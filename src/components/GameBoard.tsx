import { useId, useSyncExternalStore } from 'react'
import { prefsStore, setPrefs } from '../app/prefs'
import type { GameState, PlayerId } from '../game/types'

interface GameBoardProps {
  game: GameState
  dark?: boolean
  /** The player currently voting or defending, ringed in both views. */
  highlightId?: PlayerId | null
  /** Live votes (voter → target), drawn as arrows in the circle view. */
  votes?: Readonly<Record<PlayerId, PlayerId>>
}

const RADIUS = 40

function seatPosition(index: number, count: number) {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / count
  return { x: 50 + RADIUS * Math.cos(angle), y: 50 + RADIUS * Math.sin(angle) }
}

/** Status-only table: names and alive/out in seating order. Never shows roles or faction counts. */
export function GameBoard({ game, dark = false, highlightId = null, votes = {} }: GameBoardProps) {
  const { boardView } = useSyncExternalStore(prefsStore.subscribe, prefsStore.getState)
  const alive = game.players.filter((player) => player.alive).length
  const headingId = useId()
  const markerId = useId().replace(/:/g, '')
  const counts = new Map<PlayerId, number>()
  Object.values(votes).forEach((target) => counts.set(target, (counts.get(target) ?? 0) + 1))

  const toggle = `min-h-11 rounded-full px-3 text-xs font-bold uppercase tracking-[0.14em]`
  const active = dark ? 'bg-paper text-ink' : 'bg-ink text-paper'
  const inactive = dark ? 'border border-paper/25' : 'border border-ink/20'

  return (
    <section aria-labelledby={headingId} className={`mt-8 rounded-[1.75rem] border p-4 sm:p-6 ${dark ? 'border-paper/15 bg-paper/5' : 'border-ink/10 bg-panel shadow-[0_18px_38px_rgba(19,33,34,0.08)]'}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold" id={headingId}>Table status</h2>
          <p className={`text-xs font-bold uppercase tracking-[0.16em] ${dark ? 'text-paper/65' : 'text-ink/60'}`}>{alive} / {game.players.length} alive</p>
        </div>
        <div aria-label="Board view" className="flex gap-1" role="group">
          <button aria-pressed={boardView === 'list'} className={`${toggle} ${boardView === 'list' ? active : inactive}`} onClick={() => setPrefs({ boardView: 'list' })} type="button">List</button>
          <button aria-pressed={boardView === 'circle'} className={`${toggle} ${boardView === 'circle' ? active : inactive}`} onClick={() => setPrefs({ boardView: 'circle' })} type="button">Circle</button>
        </div>
      </div>

      {boardView === 'list' ? (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {game.players.map((player) => (
            <li
              aria-current={player.id === highlightId ? 'true' : undefined}
              className={`flex items-center justify-between rounded-2xl border px-3 py-2.5 text-sm ${player.id === highlightId ? 'ring-2 ring-brass' : ''} ${player.alive
                ? (dark ? 'border-paper/15 bg-paper/10' : 'border-ink/10 bg-white/80')
                : (dark ? 'border-paper/10 text-paper/45' : 'border-ink/10 bg-ink/5 text-ink/50')}`}
              key={player.id}
            >
              <span className={`font-bold ${player.alive ? '' : 'line-through'}`}>{player.name}</span>
              <span className="ml-3 text-xs font-bold uppercase tracking-wide">{player.alive ? 'Alive' : 'Out'}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="relative mx-auto aspect-square w-full max-w-[26rem]" data-testid="seat-circle">
          <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 100 100">
            <defs>
              <marker id={markerId} markerHeight="4" markerWidth="4" orient="auto-start-reverse" refX="3" refY="2">
                <path d="M0,0 L4,2 L0,4 z" fill={dark ? '#d8b276' : '#bf5b3d'} />
              </marker>
            </defs>
            <ellipse cx="50" cy="50" fill="none" rx={RADIUS} ry={RADIUS} stroke={dark ? 'rgba(245,239,228,0.12)' : 'rgba(19,33,34,0.1)'} strokeWidth="0.4" />
            {Object.entries(votes).map(([voterId, targetId]) => {
              const from = game.players.findIndex((player) => player.id === voterId)
              const to = game.players.findIndex((player) => player.id === targetId)
              if (from < 0 || to < 0) return null
              const start = seatPosition(from, game.players.length)
              const end = seatPosition(to, game.players.length)
              const length = Math.hypot(end.x - start.x, end.y - start.y) || 1
              const trim = 7 / length
              return (
                <line
                  key={voterId}
                  markerEnd={`url(#${markerId})`}
                  opacity="0.6"
                  stroke={dark ? '#d8b276' : '#bf5b3d'}
                  strokeWidth="0.5"
                  x1={start.x + (end.x - start.x) * trim}
                  x2={end.x - (end.x - start.x) * trim}
                  y1={start.y + (end.y - start.y) * trim}
                  y2={end.y - (end.y - start.y) * trim}
                />
              )
            })}
          </svg>
          <p className={`absolute inset-0 flex items-center justify-center text-center text-xs font-bold uppercase tracking-[0.16em] ${dark ? 'text-paper/55' : 'text-ink/50'}`}>Seating<br />order</p>
          <ol aria-label="Seats around the table" className="absolute inset-0">
            {game.players.map((player, index) => {
              const { x, y } = seatPosition(index, game.players.length)
              const highlighted = player.id === highlightId
              return (
                <li
                  aria-current={highlighted ? 'true' : undefined}
                  className={`absolute flex max-w-[5.75rem] -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border px-2 py-1 text-xs font-bold ${highlighted ? 'ring-2 ring-brass' : ''} ${player.alive
                    ? (dark ? 'border-paper/25 bg-ink text-paper' : 'border-ink/15 bg-white text-ink')
                    : (dark ? 'border-paper/10 bg-ink text-paper/45' : 'border-ink/10 bg-panel text-ink/45')}`}
                  key={player.id}
                  style={{ left: `${x}%`, top: `${y}%` }}
                >
                  <span className={`truncate ${player.alive ? '' : 'line-through'}`}>{player.name}</span>
                  <span className="sr-only">{player.alive ? ', alive' : ', out'}</span>
                  {counts.get(player.id) ? <span className="rounded-full bg-ember px-1.5 text-[10px] text-paper">{counts.get(player.id)}</span> : null}
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </section>
  )
}
