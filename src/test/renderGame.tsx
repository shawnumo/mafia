import { render } from '@testing-library/react'
import { commitGame, createSession, DEFAULT_SETTINGS, describeAction } from '../app/session'
import type { Session } from '../app/session'
import { createStore } from '../app/store'
import { ConfirmProvider } from '../components/ConfirmProvider'
import { GameSession } from '../components/GameSession'
import { applyAction, createGame } from '../game/engine'
import type { GameAction, NewGameOptions } from '../game/engine'
import { createSeededRandom } from '../game/random'

export const ROLE_WORDS = /\b(?:mafia|doctor|detective|sheriff|civilian)\b/i

/** Everything a sighted or screen-reader user could perceive: text plus accessible-name attributes. */
export function perceivableText(root: ParentNode = document.body): string {
  const attributes = [...root.querySelectorAll('*')].flatMap((element) => ['aria-label', 'title', 'alt', 'placeholder', 'aria-description']
    .map((name) => element.getAttribute(name) ?? ''))
  return `${root.textContent ?? ''} ${attributes.join(' ')}`
}

export function newSession(options: Partial<NewGameOptions> = {}, seed = 'component-tests'): Session {
  const playerNames = options.playerNames ?? ['Ada', 'Ben', 'Cleo', 'Dara', 'Eli', 'Faye', 'Gus']
  const game = createGame({ variant: 'roles', playerCount: playerNames.length, ...options, playerNames }, createSeededRandom(seed))
  return createSession(game, DEFAULT_SETTINGS, `session-${seed}`)
}

/** Applies actions through the real engine and session layer, exactly as the app does. */
export function advance(session: Session, ...actions: GameAction[]): Session {
  const random = createSeededRandom('advance')
  return actions.reduce((current, action) => {
    const next = applyAction(current.game, action, random)
    return commitGame(current, next, describeAction(action, current.game, next), Date.now())
  }, session)
}

export function finishDeal(session: Session): Session {
  let current = session
  for (let index = 0; index < current.game.players.length; index += 1) {
    current = advance(current, { type: 'confirmRoleViewed' }, { type: 'advanceReveal' })
  }
  return current
}

export function renderGame(session: Session) {
  const store = createStore<Session | null>(session)
  const errors: string[] = []
  let left = false
  const utils = render(
    <ConfirmProvider>
      <GameSession
        onError={(message) => { if (message) errors.push(message) }}
        onLeave={() => { left = true }}
        onOpenRules={() => undefined}
        onOpenStats={() => undefined}
        random={createSeededRandom('render')}
        store={store}
      />
    </ConfirmProvider>
  )
  return { ...utils, store, errors, hasLeft: () => left }
}
