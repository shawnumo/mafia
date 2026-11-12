import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { haptic } from '../app/alerts'
import { Dialog } from './Dialog'

export interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Confirm | null>(null)

/** Every phase advance, elimination, and reset goes through this dialog, as the PRD requires. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<{ options: ConfirmOptions; resolve: (value: boolean) => void } | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  const confirm = useCallback<Confirm>((options) => new Promise<boolean>((resolve) => {
    setRequest((current) => {
      current?.resolve(false)
      return { options, resolve }
    })
  }), [])

  const settle = (value: boolean) => {
    if (value) haptic()
    request?.resolve(value)
    setRequest(null)
  }

  const danger = request?.options.tone === 'danger'

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <Dialog
          description={request.options.body}
          initialFocusRef={danger ? cancelRef : confirmRef}
          onClose={() => settle(false)}
          role="alertdialog"
          size="sm"
          title={request.options.title}
        >
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="min-h-12 rounded-xl border border-ink/20 px-5 font-bold" onClick={() => settle(false)} ref={cancelRef} type="button">
              {request.options.cancelLabel ?? 'Cancel'}
            </button>
            <button
              className={`min-h-12 rounded-xl px-5 font-bold text-paper ${danger ? 'bg-ember' : 'bg-ink'}`}
              onClick={() => settle(true)}
              ref={confirmRef}
              type="button"
            >
              {request.options.confirmLabel}
            </button>
          </div>
        </Dialog>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('useConfirm must be used inside ConfirmProvider.')
  return confirm
}
