import { describe, expect, it } from 'vitest'
import { createTimer, expireTimer, formatClock, freezeTimer, hasStarted, isRunning, pauseTimer, remainingMs, startTimer } from './timer'

describe('deadline timer', () => {
  it('derives remaining time from the clock while running', () => {
    const running = startTimer(createTimer('discussion', 300_000), 1_000)
    expect(isRunning(running)).toBe(true)
    expect(remainingMs(running, 61_000)).toBe(240_000)
    // A locked or backgrounded phone does not pause the deadline.
    expect(remainingMs(running, 400_000)).toBe(0)
  })

  it('pauses, resumes, and freezes without losing time', () => {
    const running = startTimer(createTimer('defense', 30_000), 0)
    const paused = pauseTimer(running, 10_000)
    expect(isRunning(paused)).toBe(false)
    expect(remainingMs(paused, 99_999)).toBe(20_000)
    expect(hasStarted(paused, 99_999)).toBe(true)

    const resumed = startTimer(paused, 50_000)
    expect(remainingMs(resumed, 55_000)).toBe(15_000)
    expect(freezeTimer(resumed, 55_000)).toMatchObject({ endsAt: null, remainingMs: 15_000 })
  })

  it('restarts an expired timer from its full duration', () => {
    const expired = expireTimer(startTimer(createTimer('defense', 30_000), 0))
    expect(remainingMs(expired, 0)).toBe(0)
    expect(remainingMs(startTimer(expired, 100), 100)).toBe(30_000)
    expect(hasStarted(createTimer('discussion', 60_000), 0)).toBe(false)
  })

  it('formats whole seconds and never shows fractions', () => {
    expect(formatClock(300_000)).toBe('5:00')
    expect(formatClock(79_980)).toBe('1:20')
    expect(formatClock(400)).toBe('0:01')
    expect(formatClock(-5)).toBe('0:00')
  })
})
