import { useEffect } from 'react'

interface WakeLockSentinelLike {
  released: boolean
  release: () => Promise<void>
}

interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>
}

/**
 * Keeps the screen on while `active` (for example while a timer runs), so the phone does not lock mid-discussion.
 * Browsers drop the lock when the page is hidden, so it is re-requested when the page becomes visible again.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    const wakeLock = (typeof navigator !== 'undefined' ? (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock : undefined)
    if (!active || !wakeLock) return

    let sentinel: WakeLockSentinelLike | null = null
    let cancelled = false
    const acquire = () => {
      if (document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return
      wakeLock.request('screen').then((lock) => {
        if (cancelled) void lock.release()
        else sentinel = lock
      }).catch(() => {
        // Not allowed (battery saver, unsupported context); the timer still works.
      })
    }

    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', acquire)
      if (sentinel && !sentinel.released) void sentinel.release()
    }
  }, [active])
}
