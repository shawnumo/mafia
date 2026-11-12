import { useEffect, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'

interface HoldToRevealProps {
  label: string
  hiddenText: string
  disabledText: string
  disabled: boolean
  onReveal?: () => void
  children: ReactNode
  className?: string
}

const HOLD_KEYS = new Set([' ', 'Enter'])

/**
 * Shows secret content only while held (pointer or Space/Enter). The secret hides again on release,
 * pointer cancel, lost capture, window blur, or when the page is backgrounded, and the button is
 * disabled once the viewer has confirmed. Its accessible name never contains the secret.
 */
export function HoldToReveal({ label, hiddenText, disabledText, disabled, onReveal, children, className = '' }: HoldToRevealProps) {
  const [holding, setHolding] = useState(false)
  const visible = holding && !disabled

  useEffect(() => {
    if (disabled) setHolding(false)
  }, [disabled])

  useEffect(() => {
    if (!holding) return
    const hide = () => setHolding(false)
    const onVisibility = () => { if (document.visibilityState !== 'visible') hide() }
    window.addEventListener('blur', hide)
    window.addEventListener('pointerup', hide)
    window.addEventListener('pointercancel', hide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('blur', hide)
      window.removeEventListener('pointerup', hide)
      window.removeEventListener('pointercancel', hide)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [holding])

  const start = () => {
    if (disabled) return
    setHolding(true)
    onReveal?.()
  }
  const stop = () => setHolding(false)

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    start()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!HOLD_KEYS.has(event.key)) return
    event.preventDefault()
    if (!event.repeat) start()
  }

  const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (HOLD_KEYS.has(event.key)) stop()
  }

  return (
    <button
      aria-label={disabled ? disabledText : label}
      className={`flex min-h-32 w-full select-none items-center justify-center rounded-2xl border-2 px-6 text-xl font-bold touch-none [-webkit-touch-callout:none] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      disabled={disabled}
      onBlur={stop}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onLostPointerCapture={stop}
      onPointerCancel={stop}
      onPointerDown={onPointerDown}
      onPointerUp={stop}
      type="button"
    >
      {visible ? children : disabled ? disabledText : hiddenText}
    </button>
  )
}
