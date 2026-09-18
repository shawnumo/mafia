# Mafia — GM Cockpit · Project Brief

> **Status: LOCKED 2026-09-18.** House rules transcribed from the user and amended with his 2026-09-18 rulings (marked where they supersede the original transcription). Settled architecture decisions live in [ARCHITECTURE.md](ARCHITECTURE.md), with a concise reference in [ARCHITECTURE-ESSENTIALS.md](ARCHITECTURE-ESSENTIALS.md). This file is the product contract.

## Context

Mafia is a social-deduction party game played in person by the user's group (~7–15 players). Two house variants: **roleless** (mafia vs civilians only) and **with roles** (doctor, detective, optional sheriff, run by a game master). Physical whot cards, hand-tracking of votes, and manual timing make running the game slow and error-prone, and the user is almost always the game master.

**Purpose: a single-device web app ("GM cockpit") that replaces the cards and the bookkeeping — role assignment and private role reveal, night phase, round timers, randomized voting order with live tallies and vote attribution, tie-breaks, elimination reveals, win detection — so the GM only referees people, not state.**

## Project non-negotiables

1. **The app must never leak a secret role.** During group-visible phases the screen shows nothing role-related; the roles variant uses a hold-to-peek flow with player confirmation and manual GM advance. Leak-proofing is a hard rule with explicit tests.
2. **The rules engine is the single source of truth.** Every outcome (deaths, saves, eliminations, tie runoffs, parity, wins) is computed by one pure TypeScript engine; the UI never improvises game state. The engine's unit tests ARE the executable form of the house rules.
3. **The board always tells the truth.** Alive/dead state, tally, attribution, and timer are visibly accurate at all times; GM corrections are explicit actions, never silent.

## House rules (source of truth; transcribed 2026-09-18, amended same day by user rulings)

### Shared
- Players sit together; ~7–15 players. One player is the GM in the roles variant (GM is not a player; he runs nights and makes announcements). The roleless variant needs no GM.
- **Role assignment (variable count)** — physical cards are abandoned; the app assigns identities:

  | Players | Mafia | Doctor | Detective | Sheriff | Civilians |
  |---------|-------|--------|-----------|---------|-----------|
  | 7–8     | 2     | — (roles variant: 1) | — | — | rest |
  | 9–11    | 3     | 1      | 1 *or* Sheriff — GM picks one for the game | (that pick) | 4–6 |
  | 12–13   | 3     | 1      | 1 | optional toggle | 7–8 |
  | 14–15   | 4     | 1      | 1 | optional toggle | 8–9 |

  - Mafia defaults by count: 7–8 → 2, 9–13 → 3, 14–15 → 4. GM may override ±1 at setup.
  - **Roleless variant** uses the same mafia counts; everyone else is a plain civilian; no special roles.
  - **Special-role configuration:** the table above is the starting preset, but in the roles variant the GM may independently enable or disable Doctor, Detective, and Sheriff at every player count. The selected mix must still fit the roster; any remaining seats are civilians. The sheriff is off by default, and the table's detective defaults remain the starting point.

- **Voting order is randomized** *(amendment 2026-09-18 — supersedes the original clockwise-rotation rule)*: each round, the app shuffles the alive players into a fresh random voting order. Every alive player casts exactly one vote.
- **Live voting** *(ruling 2026-09-18)*: votes are entered in the displayed order and the tally **plus vote attribution** (exactly who voted for whom) is visible live while votes are cast.
- **Plurality elimination:** most votes = out.
- **Tie procedure:** each tied player gets up to their own 30-second defense period, sequentially, then all OTHER players (tied excluded) vote to eliminate exactly one of the tied. A defendant may finish early or waive their defense; the GM can advance to the next defense or start the runoff without waiting for the timer. If a defense timer expires, the GM may restart that player's timer. **If the runoff also ties, the runoff repeats among the still-tied (still excluding the tied from voting) until someone is eliminated** *(ruling 2026-09-18: revote until broken)*.
- **Win conditions:** alive mafia == alive town → **mafia win**; alive mafia == 0 → **town win**. Checked after every death event.

### Variant A — Roleless
- No night phase. Each round: 5-minute open discussion → randomized live vote → elimination reveals **mafia or civilian** → win check.
- Mafia objective: blend in and survive to parity. Civilians: root out the mafia on wits alone.

### Variant B — With roles
- Roles: **Doctor** (protects one player per night, self allowed, may repeat), **Detective** (may guess the mafia every night; GM answers privately thumbs-up = mafia / thumbs-down = innocent; result never publicly revealed), **Sheriff** (may kill each night when alive; a correct kill keeps him alive and armed; a wrong kill kills himself), **Mafia** (must agree on one kill target every night), **Civilians**.
- **Role reveal is secret**: pass-the-GM's-phone reveal; each player holds-to-peek their **role** (text only — no card faces; cards are fully abandoned), confirms they are finished, and waits for the GM to manually advance to the next player. Roleless games skip role assignment and role reveal entirely.

**Night sequence (fixed order):**
1. **Mafia** — wake, silently agree on one kill target, sleep.
2. **Sheriff** — wake, choose a kill target, sleep (only if in game and alive).
3. **Detective** — wake, point at one player; GM answers privately thumbs-up/down, detective sleeps. Never publicly revealed.
4. **Doctor** — wake, choose one player to protect (self allowed), no feedback of any kind, sleep.

**Night resolution:**
- Mafia target dies unless doctor-protected.
- **Doctor saves are announced** *(amendment 2026-09-18 — corrects the original omission)*: when the doctor's protection prevents a death, the GM **publicly announces the save**. Failures and no-op protections are never announced — the doctor gets zero feedback, ever. The announcement screen shows the full truth with a suggested script naming the saved player; how the GM narrates it is his call.
- Sheriff's target: if mafia → that mafia dies and joins the morning deaths; sheriff lives and may kill again each night while alive (unless voted out). If innocent → **the sheriff dies**, and doctor protection **cannot** prevent this self-kill.
- All actions resolve independently (e.g. sheriff kills a mafia the same night the mafia kill someone → two deaths announced).
- **Night-dead players never reveal their roles.** Voted-out players always reveal. **At game end, every role is revealed** *(ruling 2026-09-18)*.

**Day:** GM wakes everyone, announces night deaths by name (no roles) plus the doctor's save if one occurred, then 5-minute discussion → randomized live vote → tie flow if needed → voted-out reveals → win check.

## Product shape (v1)

Single-page, mobile-first app on the GM's phone; no accounts; fully offline.

1. **Setup** — fixed 15-seat editable roster, variant toggle (roleless / roles), player count 7–15 with the role table used as a starting preset (mafia override ±1 and independent Doctor/Detective/Sheriff configuration at any count), timer lengths (defaults 5:00 discussion / 0:30 defense), and **Assign roles** for the roles variant. Roleless games skip assignment and begin at discussion.
2. **Game board** — seat list with alive/dead, round counter, mafia-vs-town parity counter.
3. **Day runner** — 5:00 discussion timer (GM-controlled pause/resume, optional sound/vibration at zero), then voting mode: randomized order shown player-by-player, GM taps the accused per voter, **live tally + who-voted-for-whom** visible to the GM, automatic plurality elimination, tie flow (up to 30s per-player defense timer, sequentially → runoff excluding tied → repeat runoff until broken), reveal confirmation, win check. Defendants may finish or waive their defense early; the GM can advance without waiting. An expired defense timer can be restarted. The GM explicitly starts voting after discussion and confirms each phase advance.
4. **Night wizard** (roles variant) — guided fixed-order prompts shown one step at a time; GM records mafia target, sheriff target, detective guess + private thumbs UI, doctor target; engine resolves; **morning announcement screen** (deaths by name + doctor save announcement when one occurred, suggested script included).
5. **End screen** — victory banner, **full role reveal** on one board, one-tap new game that preserves names but resets game settings and state.
6. **Rules reference** — the house rules formatted for teaching new players.
7. **Persistence** — full state snapshot to localStorage after every action; reload/crash resumes mid-game automatically. Installable PWA; fully offline. Timer behavior is GM-controlled rather than automatically pausing or advancing when the app backgrounds.

**Out of scope v1:** multi-device play, accounts/auth, stats & history backend, custom role sets beyond the table above, AI night narration.

**Phase 2 candidates:** Supabase-backed game history/stats, per-player secret screens (Supabase Realtime), AI narrator voice for the night.

## Tech stack (locked)

- **React 18 + Vite + TypeScript (strict) + Tailwind v3** — same toolchain as the user's Pertinence dashboard. No router: the game is one state machine; screens are engine states.
- **Pure TS game engine** in `src/game/` (no React imports), unit-tested with **Vitest**.
- **No backend in v1.** localStorage persistence; offline PWA (`vite-plugin-pwa`).
- **Deploy:** GitHub Pages via Actions (repo is public; confirmed by user 2026-09-18).

## Build order

1. **Docs + scaffold** — Vite + TS + Tailwind + PWA shell; CLAUDE.md; dark mobile-first design tokens; Pages deploy pipeline (empty shell live on day one).
2. **Rules engine** — `src/game/`: role table, deal, night resolution (silent vs announced saves, sheriff self-kill override), randomized voting order, live tally model, tie runoffs (repeat until broken), win detection; exhaustive unit tests encoding every rule above.
3. **Setup flow + role assignment/reveal** (leak-proof private role reveal).
4. **Day loop** — timer, randomized live voting with attribution, tie flow, reveals, win screens.
5. **Night wizard** (roles variant) + morning announcements.
6. **Rules reference + polish + offline audit + PWA install.**

## Ruling log (2026-09-18)

All open items resolved by the user: GM-only single device; variable 7–15 players with the table above as the starting preset; fixed 15-seat editable roster; roles variant allows independent Doctor, Detective, and Sheriff configuration at every player count, with remaining seats civilian and invalid mixes blocked; roleless games skip role assignment and begin at discussion, have no GM, and hide live mafia/town counts; roles variant uses “Assign roles” and “Reveal roles” terminology; role reveal requires hold plus player confirmation and manual GM advance; first discussion starts by explicit GM action; sheriff omission = role absent; full game-end reveals on one board; runoff deadlock = revote until broken; randomized voting order (supersedes rotation); live voting with attribution is GM-only (supersedes sequential group-visible voting); invalid setup blocks start with inline errors; every phase advance, elimination, and new game requires confirmation; tie defenses are sequential, each tied player receives up to the full configured defense duration, and the GM may advance early or waive a defense; expired defense timers can be restarted; engine defaults adopted (detective guesses nightly, doctor repeats incl. self, mafia must kill nightly, timers configurable with 5:00 discussion and 0:30 defense defaults); timer alerts support optional sound and vibration; GitHub Pages confirmed; doctor save success announced publicly (correction to original transcription); reveals show role text only (cards abandoned); new games preserve names only.