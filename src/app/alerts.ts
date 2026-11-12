type AudioContextConstructor = typeof AudioContext

let audioContext: AudioContext | null = null

function audioConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null
  const candidate = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext
  return candidate ?? null
}

/** Browsers only allow audio after a user gesture, so call this from the tap that starts a timer. */
export function primeAudio(): void {
  const Constructor = audioConstructor()
  if (!Constructor) return
  try {
    audioContext ??= new Constructor()
    if (audioContext.state === 'suspended') void audioContext.resume()
  } catch {
    audioContext = null
  }
}

/** Three short tones made with Web Audio, so no audio file is needed offline. */
export function playChime(): void {
  if (!audioContext) primeAudio()
  const context = audioContext
  if (!context) return
  try {
    const start = context.currentTime
    ;[0, 0.28, 0.56].forEach((offset, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = index === 2 ? 660 : 880
      gain.gain.setValueAtTime(0.0001, start + offset)
      gain.gain.exponentialRampToValueAtTime(0.35, start + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.22)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(start + offset)
      oscillator.stop(start + offset + 0.24)
    })
  } catch {
    // Audio is best-effort; the on-screen timer remains the source of truth.
  }
}

export function vibrate(pattern: number | number[] = [200, 100, 200]): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(pattern)
  } catch {
    // Unsupported or blocked; ignore.
  }
}

export function timerAlert(options: { sound: boolean; vibration: boolean }): void {
  if (options.sound) playChime()
  if (options.vibration) vibrate()
}

let hapticsEnabled = true

/** Set from the active game's settings; defaults on for setup screens. */
export function setHapticsEnabled(enabled: boolean): void {
  hapticsEnabled = enabled
}

/** A short tap of feedback on key confirmations, where the phone supports vibration. */
export function haptic(pattern: number | number[] = 15): void {
  if (hapticsEnabled) vibrate(pattern)
}
