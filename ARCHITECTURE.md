# Mafia Architecture

## Purpose

This document is the implementation contract for the Mafia GM cockpit described in [PRD.md](PRD.md). It favors a small, offline-first single-page app with a pure rules engine that is independently testable and authoritative.

## Product boundaries

- One GM-operated device, mobile-first, no accounts, no backend in v1.
- The UI is a state-machine view over one serializable game snapshot.
- The app may assist the GM with prompts, timers, randomization, tallies, and reveals; it never replaces the GM's real-world announcements.
- No secret role is rendered during group-visible screens. The role reveal surface is isolated and intentionally temporary; roleless games skip it entirely.

## Technology stack

| Area | Choice | Boundary |
| --- | --- | --- |
| Runtime | React 18 | View composition and user interaction only |
| Build | Vite | Fast local development and static production output |
| Language | TypeScript, strict | Domain types shared by engine and UI |
| Styling | Tailwind CSS v3 plus CSS variables | Mobile-first visual system and responsive layout |
| Rules | Pure TypeScript in `src/game/` | No React, DOM, storage, timers, or randomness hidden inside rules |
| Tests | Vitest | Unit and property-oriented tests for rules and reducers |
| Persistence | `localStorage` adapter | Snapshot after every accepted action; resume after reload |
| Offline | `vite-plugin-pwa` | Installable shell and cached static assets |
| Deployment | GitHub Pages via Actions | Static `dist/` deployment, base path configured for repository |

Dependencies should remain intentionally small. Add a library only when it removes meaningful complexity or is required by the locked stack.

## Repository structure

```text
.
├── .github/workflows/deploy.yml
├── public/
├── src/
│   ├── app/
│   │   ├── persistence.ts
│   │   └── types.ts
│   ├── game/
│   │   ├── actions.ts
│   │   ├── engine.ts
│   │   ├── roles.ts
│   │   ├── selectors.ts
│   │   ├── types.ts
│   │   └── __tests__/
│   ├── components/
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── ARCHITECTURE-ESSENTIALS.md
├── ARCHITECTURE.md
├── AGENTS.md
├── CLAUDE.md
├── PRD.md
├── index.html
├── package.json
├── postcss.config.cjs
├── tailwind.config.cjs
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

The initial scaffold may keep small surfaces in fewer files, but new behavior should move toward these ownership boundaries rather than putting game rules into components.

## Domain model

All identifiers are opaque strings. State must be JSON serializable so a snapshot can be saved and restored without class instances or functions.

```ts
interface Player {
  id: PlayerId
  name: string
  role: Role
  alive: boolean
}

type Variant = 'roleless' | 'roles'
type Role = 'mafia' | 'doctor' | 'detective' | 'sheriff' | 'civilian'

type Phase =
  | 'setup'
  | 'deal'
  | 'discussion'
  | 'voting'
  | 'defense'
  | 'runoff'
  | 'reveal'
  | 'night'
  | 'morning'
  | 'ended'

interface GameState {
  version: 1
  gameId: string
  variant: Variant
  phase: Phase
  round: number
  players: Player[]
  votingOrder: PlayerId[]
  votes: Record<PlayerId, PlayerId>
  runoff: RunoffState | null
  night: NightState | null
  lastEvent: GameEvent | null
  winner: 'mafia' | 'town' | null
  timer: TimerState | null
}
```

Supporting models:

- `SetupConfig`: player names, variant, mafia override, special-role choice, sheriff toggle, discussion and defense durations.
- `RunoffState`: tied candidate IDs, eligible voter IDs, current votes, and runoff number. Tied candidates never vote in their own runoff. The UI tracks defense progress separately from the immutable engine state: each candidate receives up to the full configured defense duration in sequence, and the GM may advance early before the runoff starts.
- `NightState`: mafia target, sheriff target, detective guess/result, doctor target, and resolution status. Secret inputs are held only until resolution and are never included in group-visible selectors.
- `TimerState`: purpose, duration, started-at timestamp, paused elapsed time, and running status. The timer is derived from timestamps rather than decrementing persisted counters.
- `GameEvent`: typed audit-friendly event for explicit GM corrections and user-visible outcomes. Events must not expose role data to group-visible views.

## State and transition architecture

The roleless slice currently exposes pure transitions from `src/game/roleless.ts`:

```ts
createRolelessGame(names, mafiaOverride, random): RolelessGameState
startVoting(state, random): RolelessGameState
castVote(state, voterId, targetId): RolelessGameState
resolveVote(state): RolelessGameState
startRunoff(state, random): RolelessGameState
resolveRunoff(state): RolelessGameState
confirmReveal(state): RolelessGameState
```

The roles slice now exposes the first night-phase boundary from `src/game/rolesEngine.ts`:

```ts
createRolesGame(options, random): RolesGameState
startRolesDiscussion(state): RolesGameState
startNight(state): RolesGameState
resolveNight(state, actions): NightResolution
publicRolesView(state): PublicPlayer[]
```

Role assignment uses the configured role table, while night resolution owns independent mafia and sheriff kills, doctor protection, detective feedback, sheriff self-kills, deaths, and win checks. The private reveal UI and guided night wizard still remain to be wired.

The private reveal UI is now wired in `src/App.tsx`: the current player's role is rendered only during an active pointer hold, the player must confirm they are finished, and the GM manually advances to the next player. Peek visibility is transient UI state and is never part of a persisted game snapshot. Group-visible role views remain redacted.

These functions are the first concrete implementation of the eventual common game transition boundary. They accept immutable state, validate the current phase, and return a new state without React, DOM, storage, timers, or hidden randomness.

Rules:

1. Validate action against the current phase and alive players.
2. Apply one atomic transition.
3. Recompute derived outcomes through selectors or engine helpers.
4. Check win conditions after every death event.
5. Return a new state; never mutate input.
6. Throw or return a typed domain error for impossible actions. The UI presents the error and does not invent a fallback.

Randomness is injected through `RandomSource` so deal and voting-order tests can use deterministic sequences. Clock access is also injected at the app boundary; the engine receives timestamps, not `Date.now()` calls.

The engine owns:

- role counts, assignment, and validation for 7-15 players;
- the role table as a starting preset, with independent Doctor, Detective, and Sheriff configuration at every player count;
- roleless setup validation, deterministic role assignment, discussion-to-vote transitions, vote attribution, plurality elimination, repeated runoffs, reveal progression, and win checks;
- mafia, town, special-role, and alive/dead invariants;
- night resolution, including doctor-save announcement, sheriff self-kill override, independent kills, and no feedback for doctor failures;
- randomized voting order, live vote attribution, plurality elimination, repeated tied runoffs, and excluded tied voters;
- reveal policy: voted-out roles, no night-death roles, all roles at game end;
- parity and zero-mafia win checks after each death event.

The UI owns:

- rendering, focus management, touch targets, accessible labels, and animation;
- timer display and chime scheduling;
- passing the phone and preventing accidental role exposure, including hold, player confirmation, and manual GM advance;
- confirmation dialogs for every phase advance, elimination, and new-game reset;
- storage calls and recovery messaging.

## Reveal and privacy model

The renderer receives a purpose-specific view model, not the raw `GameState`, whenever possible. Group-visible selectors omit roles entirely and roleless live-game views also omit mafia/town counts because roleless games have no GM. The role reveal screen renders only the current player's role during an active hold gesture, clears the role after confirmation, and advances only after an explicit GM action. It cannot be navigated backward without an explicit GM reset. Roleless games have no role reveal screen. End-game selectors may return every role.

Tests must assert both positive behavior and non-leakage: group board text, accessible labels, and serialized public view models must not contain role names.

## Persistence and recovery

- Storage key: `mafia-game:v1:active`.
- Save after every successful action, including timer pause/resume and explicit corrections.
- Validate the snapshot version and required fields before hydration.
- If the snapshot is corrupt or incompatible, preserve it under a recovery key and start at setup with a clear message.
- Do not persist transient hold-to-peek visibility or unredacted detective feedback beyond the active secret flow.
- `beforeunload` is not the primary save mechanism; action-level writes are.

The roleless slice implements this boundary in `src/app/persistence.ts`: it hydrates a versioned active snapshot on startup, saves each `RolelessGameState` change plus the active timer session, and preserves incompatible data under a recovery key before clearing the active slot. Reloading during a roleless game resumes the phase, votes, players, winner state, timer mode, remaining seconds, running state, and current defense candidate.

## UI information architecture

1. Setup: fixed-capacity editable roster and rule configuration with inline validation; invalid setup blocks start.
2. Assign roles and reveal roles: one-player-at-a-time hold-to-peek flow with player confirmation and manual GM advance; roleless games skip this stage.
3. Board: alive/dead seat list, round, parity, and current phase.
4. Discussion and vote: GM-controlled timer, randomized order, GM-only live attribution and tally, per-candidate sequential defense timers for ties with early GM advance, and explicit confirmation before phase changes or elimination.
5. Tie flow: defense timer, tied candidates, eligible voters, repeatable runoff.
6. Night wizard: one-step-at-a-time mafia, sheriff, detective, doctor sequence.
7. Morning: deaths, public save announcement when applicable, and suggested script.
8. End: winner, one-board full role reveal, and new-game action preserving names only.
9. Rules: searchable or scannable house-rule reference.

Every screen must be usable at 320px wide, keep primary touch targets at least 44px, show visible focus states, and respect reduced motion.

## Testing strategy

- Engine unit tests cover every locked house rule and invalid action.
- Table-driven tests cover player counts 7 through 15, roleless/roles variants, overrides, sheriff toggles, and 9-11 special-role selection.
- Privacy tests inspect public selectors and rendered text for role leakage.
- Persistence tests cover round-trip serialization, corrupt snapshots, and version mismatch.
- Component tests focus on setup validation, hold-to-peek lifecycle, live tally attribution, runoff exclusion, and end-game reveal.
- Browser smoke tests should verify installable shell, reload resume, mobile layout, and the complete happy path for both variants.

## Delivery sequence

1. Scaffold and deployable PWA shell.
2. Complete pure engine and tests.
3. Setup and leak-proof deal.
4. Day loop, voting, tie flow, and reveal policy.
5. Night wizard and morning announcement.
6. Rules reference, offline audit, accessibility pass, and GitHub Pages deployment.
