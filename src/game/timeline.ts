export const TIMELINE_LIMIT = 100

/** One checkpoint per accepted game action. The last entry always mirrors the current state. */
export interface TimelineEntry<Game, Timer> {
  id: string
  timestamp: string
  label: string
  note: string
  game: Game
  timer: Timer
}

export interface TimelineSnapshot<Game, Timer> {
  game: Game
  timer: Timer
}

export function appendTimelineEntry<Game, Timer>(
  entries: readonly TimelineEntry<Game, Timer>[],
  entry: TimelineEntry<Game, Timer>
): TimelineEntry<Game, Timer>[] {
  return [...entries, entry].slice(-TIMELINE_LIMIT)
}

export function updateTimelineNote<Game, Timer>(
  entries: readonly TimelineEntry<Game, Timer>[],
  id: string,
  note: string
): TimelineEntry<Game, Timer>[] {
  return entries.map((entry) => entry.id === id ? { ...entry, note } : entry)
}

/** Restoring a checkpoint drops every later checkpoint, so history never branches. */
export function restoreTimelineEntry<Game, Timer>(
  entries: readonly TimelineEntry<Game, Timer>[],
  id: string
): { entries: TimelineEntry<Game, Timer>[]; snapshot: TimelineSnapshot<Game, Timer> | null } {
  const index = entries.findIndex((entry) => entry.id === id)
  if (index < 0) return { entries: [...entries], snapshot: null }

  const entry = entries[index]
  return { entries: entries.slice(0, index + 1), snapshot: { game: entry.game, timer: entry.timer } }
}

/** Undo is a restore of the checkpoint before the current one. */
export function previousTimelineEntry<Game, Timer>(entries: readonly TimelineEntry<Game, Timer>[]): TimelineEntry<Game, Timer> | null {
  return entries.length >= 2 ? entries[entries.length - 2] : null
}
