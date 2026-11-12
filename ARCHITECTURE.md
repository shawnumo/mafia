# Mafia Architecture

## Purpose

This document is the implementation contract for the Mafia GM cockpit described in [PRD.md](PRD.md). It favors a small, offline-first single-page app with a pure rules engine that is independently testable and authoritative.

## Product boundaries

- One GM-operated device, mobile-first, no accounts, no backend in v1.
- The UI is a state-machine view over one serializable session snapshot.
- The app may assist the GM with prompts, timers, randomization, tallies, and reveals; it never replaces the GM's real-world announcements.
- No secret role is rendered during group-visible screens. The private role reveal is isolated and temporary, in both variants.

## Technology stack

| Area | Choice | Boundary |
| --- | --- | --- |
| Runtime | React 18 | View composition and user interaction only |
| Build | Vite | Fast local development and static production output |
| Language | TypeScript, strict (`noUnusedLocals`, `noUnusedParameters`) | Domain types shared by engine and UI |
| Styling | Tailwind CSS v3 plus a few CSS layers | Mobile-first visual system and responsive layout |
| Rules | Pure TypeScript in `src/game/` | No React, DOM, storage, timers, or randomness inside rules |
| Tests | Vitest (unit), Playwright (end-to-end) | Engine, session, persistence, privacy, and full flows |
| Persistence | `localStorage` adapter | Snapshot after every accepted change; resume after reload |
| Offline | `vite-plugin-pwa` (prompt mode) | Installable shell and cached static assets |
| Deployment | Cloudflare Pages (primary, served at `/`) and GitHub Pages via Actions (built with `MAFIA_BASE_PATH=/mafia/`) | Type check, unit tests, then static `dist/` deployment; GitHub Pages is blocked in some regions |

Dependencies are pinned to exact versions and should remain intentionally small. Add a library only when it removes meaningful complexity or is required by the locked stack. npm is the only package manager; `package-lock.json` is the lockfile CI uses.

## Repository structure

```text
.
├── .github/workflows/deploy.yml
├── public/                     icons (SVG, PNG, maskable, Apple touch)
├── src/
│   ├── game/                   pure rules engine (no React, DOM, storage, clock, or randomness)
│   │   ├── types.ts            GameState, phases, players, actions input types
│   │   ├── roles.ts            role table, mafia and detective defaults
│   │   ├── setup.ts            setup validation
│   │   ├── core.ts             shuffle, names, deal steps, win check
│   │   ├── voting.ts           tally, vote order, casting, ties, runoffs, elimination
│   │   ├── roleless.ts         roleless transitions
│   │   ├── rolesEngine.ts      roles transitions, night steps, night resolution
│   │   ├── engine.ts           GameAction union and applyAction / createGame entry points
│   │   └── timeline.ts         generic checkpoint list helpers
│   ├── app/                    app boundary: session, persistence, clock, randomness, platform
│   │   ├── session.ts          Session model, commitGame, undo/restore, checkpoint labels
│   │   ├── persistence.ts      versioned save/load, validation, v1 migration, roster
│   │   ├── timer.ts            deadline-based timer functions
│   │   ├── store.ts            tiny external store for useSyncExternalStore
│   │   ├── random.ts           crypto-backed RandomSource
│   │   ├── alerts.ts           Web Audio chime and vibration
│   │   ├── pwa.ts              service-worker update signal
│   │   └── useNow.ts           clock hook for timer display
│   ├── components/             one file per screen or shared control
│   ├── App.tsx                 store wiring, persistence effect, routing
│   ├── index.css
│   └── main.tsx
├── tests/e2e/                  Playwright flows
├── ARCHITECTURE-ESSENTIALS.md
├── ARCHITECTURE.md
├── PRD.md
└── TEST-CASE-DOCUMENT.md
```

## Domain model

All identifiers are opaque strings. State is JSON serializable so a snapshot can be saved and restored without class instances or functions.

```ts
type Variant = 'roleless' | 'roles'
type Role = 'mafia' | 'doctor' | 'detective' | 'sheriff' | 'civilian'

type RolelessPhase = 'deal' | 'discussion' | 'voting' | 'defense' | 'runoff' | 'reveal' | 'ended'
type RolesPhase = 'deal' | 'night' | 'morning' | 'discussion' | 'voting' | 'defense' | 'runoff' | 'reveal' | 'ended'

interface BaseGameState {
  phase: Phase
  round: number
  players: Player[]               // { id, name, role, alive }
  revealIndex: number             // private deal position
  revealConfirmed: boolean
  votingOrder: PlayerId[]
  votes: Record<PlayerId, PlayerId>
  runoff: RunoffState | null      // { candidates, eligibleVoters, votes, number }
  revealedPlayerId: PlayerId | null
  winner: 'mafia' | 'town' | null
}

interface RolesGameState extends BaseGameState {
  variant: 'roles'
  nightSummary: { deaths: PlayerId[]; savedPlayerId: PlayerId | null } | null
  eventLog: string[]              // GM-only record, rendered only after the game ends
}
```

`deal` is the private pass-the-phone reveal. `reveal` is only ever the public voted-out reveal; the two are never the same phase.

The app wraps the game in a `Session` (`src/app/session.ts`):

- `game`: the current `GameState`.
- `settings`: discussion and defense durations plus sound and vibration alert toggles.
- `timer`: `{ mode, durationMs, endsAt, remainingMs, defenseCandidateIndex }`. While running, `endsAt` is an epoch-ms deadline and the remaining time is derived from the clock, so the display stays true when the phone locks, backgrounds, or reloads. Defense progress lives here, outside the engine.
- `nightDraft`: in-progress night picks and the current step. Saved so a reload mid-night keeps them; cleared when the night resolves. Never part of the engine state.
- `timeline`: up to 100 checkpoints `{ id, timestamp, label, note, game, timer }`, one per accepted game action. The last entry mirrors the current state.

## State and transition architecture

The UI sends every GM action through one entry point in `src/game/engine.ts`:

```ts
type GameAction =
  | { type: 'confirmRoleViewed' } | { type: 'advanceReveal' }
  | { type: 'startVoting' } | { type: 'castVote'; voterId; targetId }
  | { type: 'resolveVote' } | { type: 'startRunoff' } | { type: 'resolveRunoff' }
  | { type: 'confirmElimination' }
  | { type: 'resolveNight'; actions: NightActions } | { type: 'startDay' }

createGame(options, random): GameState
applyAction(state, action, random): GameState
```

`applyAction` dispatches to the variant engines (`roleless.ts`, `rolesEngine.ts`), which share `core.ts` and `voting.ts`. Roles-game flow: `deal → night → morning → discussion → voting → (defense ⇄ runoff) → reveal → night …`; roleless flow skips night and morning. Rounds run Night N, morning, Day N; the round advances when the next night (or the next roleless discussion) starts.

The engine also exposes read-only helpers the UI uses instead of re-deriving rules: `currentVoter`, `voteTargets`, `remainingVoters`, `tallyEntries`, `isVoteComplete`, `nightSteps`, `nightTargetIds`, and `detectiveAnswer`.

Rules:

1. Validate the action against the current phase and alive players.
2. Apply one atomic transition.
3. Recompute derived outcomes through engine helpers.
4. Check win conditions after every death event: town wins at zero mafia; mafia win when alive mafia equal or outnumber alive town.
5. Return a new state; never mutate input.
6. Throw a descriptive error for impossible actions. The UI shows the message and does not invent a fallback.

Randomness is injected through `RandomSource`; there is no `Math.random` default inside the engine. The app passes a crypto-backed source (`src/app/random.ts`); tests pass deterministic sequences. The clock is read only at the app boundary.

The engine owns:

- role counts, assignment, and validation for 7–15 players, with independent Doctor, Detective, and Sheriff configuration and the table's detective default from 9 players;
- the private deal for both variants;
- randomized voting order, live vote attribution and tally, self-vote rejection, plurality elimination, repeated tied runoffs with tied voters excluded, and a full revote when every living player is tied;
- night order, legal night targets, the detective's private answer, and night resolution: doctor-save announcement, sheriff abstention and self-kill, independent kills, no feedback for doctor failures;
- reveal policy: voted-out roles, no night-death roles, all roles at game end;
- the roles-game event record;
- win checks after each death event.

The UI owns:

- rendering, focus management, touch targets, accessible labels, and scroll position;
- timer display, expiry detection, and alerts;
- passing the phone and preventing accidental role exposure;
- confirmation dialogs for every phase advance, elimination, restore, and reset;
- storage calls and recovery messaging.

## Session, undo, and checkpoints

`App.tsx` keeps the session in a small external store (`src/app/store.ts`) read through `useSyncExternalStore`, so event handlers always act on the latest state. Each action calls `applyAction`, then `commitGame(session, next, label, now)`:

- A phase change resets the timer for the new phase and starts or clears the night draft.
- A checkpoint is appended with a neutral label and the timer frozen (checkpoints always restore paused).
- Private-deal steps never create checkpoints. The first checkpoint is "Game started", taken when the deal ends.

Undo restores the checkpoint before the current one. Restore truncates the timeline to the chosen checkpoint. Neither can land on a `deal` state, so no one can step back into a role reveal. Labels name public events only ("Vote: Ada → Ben", "Voted out: Cleo", "Night 2 resolved") and never a secret role.

## Reveal and privacy model

Group-visible screens render purpose-specific data: names and alive/out only, and no faction counts in either variant. The private reveal (`PrivateRoleReveal`) shows the current player's role only while the hold button is pressed. The role hides on release, pointer cancel, lost pointer capture, window blur, or backgrounding. The button is disabled once the player confirms. The reveal screen has no Undo or Exit; a confirmed "Pause reveal (GM)" leads to a role-free pause screen. The detective's answer uses the same hold control on the GM-only night screen. End-game screens may show every role.

Tests assert both positive behavior and non-leakage: rendered text, accessible names, checkpoint labels, and public view helpers must not contain role names during play.

## Persistence and recovery

- Active key: `mafia-game:v1:active`, holding `{ version: 2, session }`. Recovery key: `mafia-game:v1:active:recovery`. Roster key: `mafia-game:v1:roster` (names only, kept across games).
- Save after every accepted change: game actions, timer start/pause/expiry, night picks, and notes. Timer ticks are derived from the clock and are never written.
- Loading validates every field: phases, players, referenced IDs, phase/field consistency, timer, settings, night draft, and checkpoints.
- Version 1 saves are converted on load. The old roleless reveal flags become the `deal` phase. A roles `reveal` with no revealed player becomes `deal`. Stored detective results are dropped. Timers resume paused, and a "Resumed saved game" checkpoint is appended.
- If the snapshot is corrupt or incompatible, it is moved to the recovery key and the app opens setup with a visible notice.
- Storage writes never throw. A failed save shows a warning and the game keeps running.
- The service worker uses prompt mode. Updates are offered only on the setup and end screens, so a deploy never reloads a game in progress.

## UI information architecture

1. Setup: a three-step flow for table/roster, rules/timers/alerts, and final review. Setup validation checks roster count, blank and duplicate names, the mafia range, role fit, and whole-number timer bounds before game creation.
2. Private reveal (both variants): hold to peek, confirm, then a manual advance; the final advance is confirmed.
3. Day (`DayRunner`, shared by both variants): discussion timer, a confirmed start of voting, randomized order with the upcoming queue, live tally and attribution, sequential defenses with early advance and restart, repeatable runoffs, and the voted-out reveal.
4. Night wizard (roles): one step at a time in the fixed order, with Back and per-step Clear, a sheriff abstain option, and the private detective answer. The screen is dark so it does not light up the room.
5. Morning: deaths, the public save announcement when it applies, and a suggested script. No detective identity or result.
6. End: winner, a one-board full role reveal, the roles-game record, the activity timeline with editable notes, and a confirmed new game that keeps names only.
7. Rules: the house-rule reference, reachable from every screen.

Every screen must be usable at 320px wide, keep primary touch targets at least 44px, show visible focus states, respect safe-area insets, and respect reduced motion. Dialogs trap focus, close on Escape, and return focus to the opener.

The activity timeline is available during roleless play and only at the end of a roles game. GM notes are editable only after the game ends.

## Testing strategy

- Engine unit tests cover every locked house rule and invalid action, following the real flow (deal, night, morning, day, reveal).
- Table-driven tests cover player counts 7 through 15, both variants, overrides, and the detective default.
- Session tests cover checkpoint rules, undo/restore boundaries, timer resets, the night draft, and role-free labels.
- Persistence tests cover round trips, tampered and corrupt saves, storage failures, the roster, and version 1 migration.
- End-to-end tests cover both variants end to end, reload resume, privacy of the reveal (disabled after confirm, hidden on pointer cancel, no Undo or Exit), confirmations, the detective answer, mid-night reload, the 320px layout, and the offline PWA shell.

## Delivery sequence

1. Scaffold and deployable PWA shell.
2. Complete pure engine and tests.
3. Setup and leak-proof deal.
4. Day loop, voting, tie flow, and reveal policy.
5. Night wizard and morning announcement.
6. Rules reference, offline audit, accessibility pass, and GitHub Pages deployment.
