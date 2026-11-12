import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface DialogProps {
  title: string
  onClose: () => void
  children: ReactNode
  role?: 'dialog' | 'alertdialog'
  size?: 'sm' | 'md' | 'lg'
  eyebrow?: string
  initialFocusRef?: RefObject<HTMLElement>
  description?: string
}

const sizes = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' }

/** Modal with a focus trap, Escape to close, scroll lock, and focus returned to the opener on close. */
export function Dialog({ title, onClose, children, role = 'dialog', size = 'md', eyebrow, initialFocusRef, description }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    const target = initialFocusRef?.current ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel
    target?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      if (opener?.isConnected) opener.focus()
    }
    // Runs once per open: focus moves in on mount and returns to the opener on close.
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !panelRef.current) return
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-3 backdrop-blur-sm sm:items-center sm:p-4"
      onKeyDown={onKeyDown}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`max-h-[90dvh] w-full ${sizes[size]} overflow-auto rounded-[1.75rem] border border-ink/10 bg-panel p-5 text-ink shadow-[0_25px_60px_rgba(19,33,34,0.25)] outline-none sm:p-7`}
        ref={panelRef}
        role={role}
        tabIndex={-1}
      >
        <header className="mb-5">
          {eyebrow && <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-ember">{eyebrow}</p>}
          <h2 className="mt-1 font-display text-3xl font-bold" id={titleId}>{title}</h2>
          {description && <p className="mt-2 text-sm leading-6 text-ink/70" id={descriptionId}>{description}</p>}
        </header>
        {children}
      </div>
    </div>,
    document.body
  )
}
