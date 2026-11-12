import { useEffect, useState } from 'react'

/** Re-renders on a short interval while active, and immediately when the page becomes visible again. */
export function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setNow(Date.now())
    if (!active) return
    const tick = () => setNow(Date.now())
    const interval = window.setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [active, intervalMs])

  return now
}
