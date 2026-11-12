export type TimerMode = 'discussion' | 'defense'

/**
 * Deadline-based timer. While running, `endsAt` is an epoch-ms deadline and the remaining time is
 * derived from the clock, so the display stays true after the phone locks, backgrounds, or reloads.
 * While stopped, `remainingMs` holds the frozen value.
 */
export interface TimerState {
  mode: TimerMode
  durationMs: number
  endsAt: number | null
  remainingMs: number
  defenseCandidateIndex: number
}

export function createTimer(mode: TimerMode, durationMs: number, defenseCandidateIndex = 0): TimerState {
  return { mode, durationMs, endsAt: null, remainingMs: durationMs, defenseCandidateIndex }
}

export function isRunning(timer: TimerState): boolean {
  return timer.endsAt !== null
}

export function remainingMs(timer: TimerState, now: number): number {
  return timer.endsAt === null ? timer.remainingMs : Math.max(0, timer.endsAt - now)
}

export function hasStarted(timer: TimerState, now: number): boolean {
  return isRunning(timer) || remainingMs(timer, now) < timer.durationMs
}

export function startTimer(timer: TimerState, now: number): TimerState {
  if (isRunning(timer)) return timer
  const remaining = timer.remainingMs > 0 ? timer.remainingMs : timer.durationMs
  return { ...timer, endsAt: now + remaining, remainingMs: remaining }
}

export function pauseTimer(timer: TimerState, now: number): TimerState {
  if (!isRunning(timer)) return timer
  return { ...timer, endsAt: null, remainingMs: remainingMs(timer, now) }
}

/** Freezes a running timer at its current value; used for checkpoints, which always restore paused. */
export function freezeTimer(timer: TimerState, now: number): TimerState {
  return pauseTimer(timer, now)
}

export function expireTimer(timer: TimerState): TimerState {
  return { ...timer, endsAt: null, remainingMs: 0 }
}

export function formatClock(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`
}
