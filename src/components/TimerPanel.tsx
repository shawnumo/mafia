import { useEffect } from 'react'
import { primeAudio, timerAlert } from '../app/alerts'
import { expireTimer, formatClock, hasStarted, isRunning, pauseTimer, remainingMs, startTimer } from '../app/timer'
import { useNow } from '../app/useNow'
import { useWakeLock } from '../app/wakeLock'
import { useGame } from './GameContext'

/** Alerts only fire if the deadline passed moments ago, not when a long-expired timer is reloaded. */
const ALERT_WINDOW_MS = 5000

export function TimerPanel({ dark = false }: { dark?: boolean }) {
  const { session, setTimer } = useGame()
  const { timer, settings } = session
  const running = isRunning(timer)
  const now = useNow(running)
  const remaining = remainingMs(timer, now)
  const expired = !running && remaining === 0
  // Keep the screen on while the clock runs, so the phone does not lock mid-discussion.
  useWakeLock(running)

  useEffect(() => {
    if (!running || remaining > 0 || timer.endsAt === null) return
    const fresh = Date.now() - timer.endsAt < ALERT_WINDOW_MS
    setTimer(expireTimer(timer))
    if (fresh) timerAlert({ sound: settings.soundAlerts, vibration: settings.vibrationAlerts })
  }, [running, remaining, timer, setTimer, settings.soundAlerts, settings.vibrationAlerts])

  const toggle = () => {
    if (running) {
      setTimer(pauseTimer(timer, Date.now()))
      return
    }
    primeAudio()
    setTimer(startTimer(timer, Date.now()))
  }

  const label = running ? 'Pause timer' : expired ? 'Restart timer' : hasStarted(timer, now) ? 'Resume timer' : 'Start timer'

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <strong className="block font-display text-6xl tabular-nums" role="timer" aria-label={`${formatClock(remaining)} remaining`}>{formatClock(remaining)}</strong>
        <p aria-live="polite" className={`mt-1 min-h-6 text-sm font-bold ${dark ? 'text-brass' : 'text-ember'}`} role="status">{expired ? 'Time is up.' : ''}</p>
      </div>
      <button className={`min-h-12 rounded-xl px-5 py-3 font-bold ${dark ? 'bg-paper text-ink' : 'bg-ink text-paper'}`} onClick={toggle} type="button">{label}</button>
    </div>
  )
}
