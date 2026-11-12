// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HoldToReveal } from './HoldToReveal'

afterEach(cleanup)

function renderHold(props: Partial<Parameters<typeof HoldToReveal>[0]> = {}): HTMLButtonElement {
  render(
    <HoldToReveal disabled={false} disabledText="Role hidden" hiddenText="Hold to peek" label="Press and hold to peek at role" {...props}>
      <span>mafia</span>
    </HoldToReveal>
  )
  return screen.getByRole('button') as HTMLButtonElement
}

describe('HoldToReveal', () => {
  it('shows the secret only while held and never in its accessible name', () => {
    const onReveal = vi.fn()
    const button = renderHold({ onReveal })
    expect(button.textContent).toBe('Hold to peek')

    fireEvent.pointerDown(button)
    expect(button.textContent).toBe('mafia')
    // The accessible name stays generic while the role is on screen.
    expect(screen.getByRole('button', { name: 'Press and hold to peek at role' })).toBe(button)
    expect(onReveal).toHaveBeenCalledTimes(1)

    fireEvent.pointerUp(button)
    expect(button.textContent).toBe('Hold to peek')
  })

  it.each([
    ['pointer cancel', (button: HTMLElement) => fireEvent.pointerCancel(button)],
    ['lost pointer capture', (button: HTMLElement) => fireEvent.lostPointerCapture(button)],
    ['window blur', () => fireEvent.blur(window)],
    ['a release anywhere on the page', () => fireEvent.pointerUp(window)]
  ])('hides the secret on %s', (_label, end) => {
    const button = renderHold()
    fireEvent.pointerDown(button)
    expect(button.textContent).toBe('mafia')
    act(() => { end(button) })
    expect(button.textContent).toBe('Hold to peek')
  })

  it('hides the secret when the page is backgrounded', () => {
    const button = renderHold()
    fireEvent.pointerDown(button)
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(button.textContent).toBe('Hold to peek')
    visibility.mockRestore()
  })

  it('supports holding Space or Enter from the keyboard', () => {
    const button = renderHold()
    fireEvent.keyDown(button, { key: ' ' })
    expect(button.textContent).toBe('mafia')
    fireEvent.keyUp(button, { key: ' ' })
    expect(button.textContent).toBe('Hold to peek')
    fireEvent.keyDown(button, { key: 'Enter' })
    expect(button.textContent).toBe('mafia')
    fireEvent.blur(button)
    expect(button.textContent).toBe('Hold to peek')
  })

  it('cannot reveal anything once disabled', () => {
    const button = renderHold({ disabled: true })
    expect(button.disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Role hidden' })).toBe(button)
    fireEvent.pointerDown(button)
    expect(button.textContent).toBe('Role hidden')
  })
})
