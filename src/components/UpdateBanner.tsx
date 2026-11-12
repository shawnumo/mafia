import { useSyncExternalStore } from 'react'
import { updateStore } from '../app/pwa'

/** Shown only on setup and end screens, so a new version never reloads the page mid-game. */
export function UpdateBanner({ dark = false }: { dark?: boolean }) {
  const update = useSyncExternalStore(updateStore.subscribe, updateStore.getState)
  if (!update.ready || !update.apply) return null

  return (
    <div className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-bold ${dark ? 'bg-paper/10 text-paper' : 'bg-sage/15 text-ink'}`} role="status">
      <span>A new version of the app is ready.</span>
      <button className={`min-h-11 rounded-lg px-4 ${dark ? 'bg-paper text-ink' : 'bg-ink text-paper'}`} onClick={update.apply} type="button">Update now</button>
    </div>
  )
}
