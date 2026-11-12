import type { NarrationLine } from './narration'

/**
 * Read-aloud narration with the browser's built-in speech. On-device voices are preferred so it keeps
 * working offline. Lines play in order with their pauses; a new call replaces whatever is playing unless
 * `append` is set.
 */

let queue: NarrationLine[] = []
let speaking = false
let pauseTimer: number | null = null
let generation = 0
const spokenKeys = new Set<string>()

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null
}

export function speechAvailable(): boolean {
  return synth() !== null && typeof window.SpeechSynthesisUtterance === 'function'
}

function pickVoice(engine: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = engine.getVoices()
  const language = (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 2)
  return voices.find((voice) => voice.localService && voice.lang.startsWith(language))
    ?? voices.find((voice) => voice.localService)
    ?? voices.find((voice) => voice.lang.startsWith(language))
    ?? null
}

function playNext(token: number): void {
  const engine = synth()
  const next = queue.shift()
  if (!engine || !next || token !== generation) {
    speaking = false
    return
  }
  speaking = true
  const utterance = new SpeechSynthesisUtterance(next.text)
  const voice = pickVoice(engine)
  if (voice) utterance.voice = voice
  utterance.rate = 0.92
  const finish = () => {
    if (token !== generation) return
    pauseTimer = window.setTimeout(() => playNext(token), next.pauseAfterMs)
  }
  utterance.onend = finish
  utterance.onerror = finish
  engine.speak(utterance)
}

export function stopSpeaking(): void {
  generation += 1
  queue = []
  speaking = false
  if (pauseTimer !== null) window.clearTimeout(pauseTimer)
  pauseTimer = null
  synth()?.cancel()
}

export function speak(lines: readonly NarrationLine[], options: { append?: boolean } = {}): void {
  if (!speechAvailable() || lines.length === 0) return
  if (options.append && speaking) {
    queue.push(...lines)
    return
  }
  stopSpeaking()
  queue = [...lines]
  playNext(generation)
}

/**
 * Speaks a script at most once per key, so re-renders, StrictMode double effects, and going Back to an
 * earlier night step never repeat lines to the table.
 */
export function speakOnce(key: string, lines: readonly NarrationLine[], options: { append?: boolean } = {}): void {
  if (spokenKeys.has(key)) return
  spokenKeys.add(key)
  if (spokenKeys.size > 200) spokenKeys.delete(spokenKeys.values().next().value as string)
  speak(lines, options)
}
