# Mafia GM Cockpit — Comprehensive Functional Test Case Document

## Purpose
This document is the manual QA checklist for validating the Mafia GM Cockpit end-to-end. It covers setup, game flow, rules enforcement, privacy safeguards, persistence, and offline behavior.

Use this as a pass/fail test sheet during live manual testing in the browser. Record results as: Pass / Fail / N/A, with notes where needed.

---

## Test environment
- Browser: latest Chrome or Edge on desktop and/or mobile
- Device: one phone-sized viewport is recommended for the GM workflow
- Local storage enabled
- Optional: refresh browser or background app to test persistence/resume behavior

---

## Test data set
Use at least these roster buckets during validation:
- 7 players
- 9 players
- 12 players
- 15 players

Suggested names for quick testing:
- Player 01: Ava
- Player 02: Ben
- Player 03: Cara
- Player 04: Diego
- Player 05: Elena
- Player 06: Felix
- Player 07: Gina
- Player 08: Hugo
- Player 09: Iris
- Player 10: Jules
- Player 11: Kai
- Player 12: Lina
- Player 13: Milo
- Player 14: Noor
- Player 15: Omar

---

## Test execution checklist
For each scenario, validate:
- visibility of the correct screen/state
- visible truth in the board and timers
- no secret role leak in public UI
- correct flow progression
- correct persistence after reload
- any invalid state is blocked with an inline error

---

## A. Setup & configuration

### TC-01: App loads and initial setup view renders
- Steps:
  1. Open the app.
  2. Confirm the setup view appears.
- Expected:
  - GM cockpit heading is visible.
  - roster is present with 15 editable seats.
  - game variant choices are visible.
  - role tables and timer fields are available.

### TC-02: Variant switching
- Steps:
  1. Select Roleless.
  2. Select Roles.
- Expected:
  - selected variant changes visibly.
  - roles-specific configuration appears only for Roles.
  - roleless mode hides special-role configuration.

### TC-03: Player count range enforcement
- Steps:
  1. Set player count to 7.
  2. Set player count to 15.
  3. Try values below 7 and above 15.
- Expected:
  - accepted range stays between 7 and 15.
  - invalid values are blocked or corrected.

### TC-04: Roster editing and naming
- Steps:
  1. Change a few player names.
  2. Confirm the roster updates immediately.
  3. Change names across multiple seats.
- Expected:
  - names reflect exact input.
  - edited names persist in the session state.

### TC-05: Default mafia count logic
- Steps:
  1. Test at 7 players, 9 players, 12 players, 15 players.
- Expected:
  - default mafia count matches the locked rules table.
  - the value shown in the setup panel is consistent with the role mix summary.

### TC-06: Mafia override is limited to valid range
- Steps:
  1. Set mafia override to default.
  2. Set mafia override to one lower than default.
  3. Set mafia override to one higher than default.
  4. Try an invalid value outside the allowed adjustment.
- Expected:
  - valid values are accepted.
  - invalid values are rejected or effectively prevented.

### TC-07: Special role toggle behavior in Roles mode
- Steps:
  1. Set variant to Roles.
  2. Toggle Doctor, Detective, Sheriff on and off.
  3. Change player count and recheck role counts.
- Expected:
  - toggles work correctly.
  - the role mix updates consistently.
  - invalid combinations are blocked.

### TC-08: Setup error handling
- Steps:
  1. Attempt to start a game with an invalid configuration.
- Expected:
  - an inline error is shown.
  - game does not start until the setup is valid.

### TC-09: Start roleless game
- Steps:
  1. Configure a valid roleless setup.
  2. Tap Start roleless game.
- Expected:
  - game starts into the discussion phase.
  - no role reveal sequence is triggered.

### TC-10: Start roles game
- Steps:
  1. Configure a valid roles setup.
  2. Tap Assign roles.
- Expected:
  - game moves into role assignment/reveal flow.
  - no public role information appears during this process.

---

## B. Roleless game flow

### TC-11: Roleless discussion timer starts and pauses
- Steps:
  1. Start a roleless game.
  2. Start the discussion timer.
  3. Pause it.
- Expected:
  - timer counts down correctly.
  - start/pause controls change state as expected.
  - timer is manually controlled, not auto-skipped.

### TC-12: Roleless voting order is randomized per round
- Steps:
  1. Start a round.
  2. Begin voting.
  3. Observe the voter queue.
- Expected:
  - the ordering is randomized each round.
  - each alive player is included exactly once.

### TC-13: Live vote tally and attribution are visible
- Steps:
  1. Cast several votes.
- Expected:
  - each voter appears in the live tally with the target they chose.
  - tally updates immediately and remains accurate.

### TC-14: Plurality elimination for roleless rounds
- Steps:
  1. Create a simple vote split where one target has the most votes.
- Expected:
  - the target with the plurality is eliminated.
  - the reveal screen appears with the removed player and role.

### TC-15: Tie defense and runoff flow in roleless game
- Steps:
  1. Force a tie among multiple players.
  2. Verify defense screens appear.
  3. Advance defense timers.
  4. Start runoff.
- Expected:
  - tied players get defense turns.
  - timer is reset for each defense candidate when needed.
  - runoff excludes tied players and repeats until a winner is resolved.

### TC-16: Runoff repeat until broken
- Steps:
  1. Cause a runoff tie.
- Expected:
  - the runoff repeats rather than silently resolving.
  - the same tie logic continues until one candidate survives.

### TC-17: Reveal confirms and game proceeds to next round
- Steps:
  1. Resolve a vote or runoff.
  2. Confirm reveal.
- Expected:
  - game continues to discussion for the next round.
  - winner is not declared unless the win condition is met.

### TC-18: Win detection in roleless mode
- Steps:
  1. Reduce mafia alive to zero.
  2. Then create equality between mafia and town alive.
- Expected:
  - town win triggers when mafia count reaches zero.
  - mafia win triggers when alive mafia equals alive town.

### TC-19: End screen shows full role reveal
- Steps:
  1. Reach end-of-game state.
- Expected:
  - final board appears.
  - all roles are visible on one board.

---

## C. Roles assignment and private reveal

### TC-20: Role assignment screen appears for roles game
- Steps:
  1. Start a roles game.
- Expected:
  - role reveal flow loads.
  - the first player is shown and the GM is prompted to hand over the phone.

### TC-21: Secret role stays hidden in public UI
- Steps:
  1. Start reveal flow.
  2. Check the screen while another player is viewing.
- Expected:
  - the role is hidden until the player holds to peek.
  - no public screen exposes role text during group-visible phases.

### TC-22: Hold-to-peek interaction works correctly
- Steps:
  1. Press and hold the reveal button.
  2. Release it.
- Expected:
  - the role appears only while the button is being held.
  - it disappears after release.

### TC-23: Player confirms they are finished viewing
- Steps:
  1. Hold to peek and then tap I am done viewing.
- Expected:
  - the player’s reveal is confirmed.
  - the next player is not revealed until the GM advances.

### TC-24: GM can manually advance through players
- Steps:
  1. Confirm multiple players sequentially.
- Expected:
  - each player is revealed one by one.
  - the GM must advance manually.

### TC-25: Final reveal transition to discussion begins correctly
- Steps:
  1. Complete the final role reveal.
- Expected:
  - the game transitions into the discussion phase.
  - no extra role leak occurs.

---

## D. Night wizard and morning announcement

### TC-26: Night order is fixed and sequential
- Steps:
  1. Start a roles game night.
  2. Confirm the wizard prompts in order.
- Expected:
  - mafia target selection appears first.
  - sheriff, detective, and doctor follow in the correct order.

### TC-27: Mafia target selection works
- Steps:
  1. Select a mafia target.
- Expected:
  - selection is recorded.
  - the target appears in the night action summary.

### TC-28: Sheriff kill logic is enforced
- Steps:
  1. Set sheriff target to a mafia.
  2. Set sheriff target to an innocent player.
- Expected:
  - mafia sheriff kill kills the mafia and keeps the sheriff alive.
  - innocent target kills the sheriff.

### TC-29: Detective guess flow stays private
- Steps:
  1. Select a detective guess.
  2. Complete the night.
- Expected:
  - detective result is stored privately.
  - no public reveal shows the result before the GM chooses how to narrate it.

### TC-30: Doctor protection works and is publicly announced only on successful save
- Steps:
  1. Protect the intended victim from mafia kill.
  2. Confirm the morning report.
- Expected:
  - save is announced publicly when the doctor prevents a death.
  - unsuccessful protection does not trigger a public announcement.

### TC-31: Failures and no-op protections remain silent
- Steps:
  1. Choose a doctor target that does not save a death.
- Expected:
  - no public save announcement appears.
  - no misleading feedback is presented.

### TC-32: Morning report shows deaths and script
- Steps:
  1. Resolve a full night with one or more deaths.
- Expected:
  - names of dead players appear in the report.
  - doctor save, if any, is included.
  - script is displayed for the GM to read aloud.

### TC-33: Night-dead players never reveal their role
- Steps:
  1. End night with deaths.
- Expected:
  - dead players do not reveal their role during the public day flow.

### TC-34: End-of-game reveal shows every role
- Steps:
  1. Reach a winner state.
- Expected:
  - final board includes full role reveal for all players.

---

## E. Day phase: discussion + live voting

### TC-35: Discussion timer starts and pauses manually
- Steps:
  1. Begin discussion.
  2. Start the timer.
  3. Pause it.
- Expected:
  - timer follows manual control only.
  - proper pause/resume states are visible.

### TC-36: Start voting requires explicit GM action
- Steps:
  1. Attempt to move from discussion to voting.
- Expected:
  - voting starts only once the GM confirms the transition.

### TC-37: Voting queue is randomized and complete
- Steps:
  1. Begin live voting.
  2. Progress through the queue.
- Expected:
  - each alive player gets one vote.
  - queue is random each round.
  - no voter votes twice.

### TC-38: Live tally plus vote attribution is visible during voting
- Steps:
  1. Enter several votes in order.
- Expected:
  - tally updates dynamically.
  - source voter and target are both visible.

### TC-39: Resolve vote after all votes entered
- Steps:
  1. Complete the vote queue.
  2. Tap Resolve vote.
- Expected:
  - the game resolves the plurality outcome correctly.
  - if no tie, elimination proceeds immediately.

### TC-40: Tied players enter defense flow
- Steps:
  1. Force a tie.
- Expected:
  - defense mode activates.
  - each tied player receives their own defense window.

### TC-41: GM may advance defense early
- Steps:
  1. Start defense timer.
  2. Advance before expiration.
- Expected:
  - GM can move to the next player or begin runoff without waiting for the countdown.

### TC-42: Expired defense timer can be restarted
- Steps:
  1. Let defense timer reach zero.
  2. Restart it.
- Expected:
  - timer restarts cleanly.
  - state remains valid.

### TC-43: Runoff excludes tied players
- Steps:
  1. Enter runoff vote.
- Expected:
  - only non-tied players vote in the runoff.
  - tied players do not participate.

### TC-44: Repeated runoff until tie broken
- Steps:
  1. Force a runoff tie.
- Expected:
  - runoff continues again.
  - no silent deadlock resolution occurs.

### TC-45: Reveal-screen flow after elimination
- Steps:
  1. Confirm a vote or runoff result.
- Expected:
  - revealed player identity appears with role text.
  - GM can continue to night or next round based on game state.

---

## F. Win detection & final board

### TC-46: Town win after mafia elimination
- Steps:
  1. Eliminate the final mafia.
- Expected:
  - town victory banner appears.
  - final board shows all roles.

### TC-47: Mafia win on parity
- Steps:
  1. Reach a state where alive mafia equals alive town.
- Expected:
  - mafia win triggers immediately.

### TC-48: New game preserves names only
- Steps:
  1. Start a game.
  2. End the game and choose New game.
- Expected:
  - player names remain.
  - game settings and state reset.
  - previous in-progress state is cleared.

### TC-49: Exit game resets properly
- Steps:
  1. Exit a game from the in-progress state.
- Expected:
  - state clears correctly.
  - setup view returns.
  - old session data does not linger incorrectly.

---

## G. Persistence & resume behavior

### TC-50: Save occurs after each action
- Steps:
  1. Perform several actions in a game.
  2. Refresh the page.
- Expected:
  - game resumes from the latest state.
  - no action is lost after reload.

### TC-51: Resume mid-discussion
- Steps:
  1. Start a game and leave in discussion.
  2. Refresh.
- Expected:
  - discussion state is restored.
  - timer progress and running state are preserved according to the app’s saved state.

### TC-52: Resume during voting
- Steps:
  1. Leave the game after entering some votes.
  2. Refresh.
- Expected:
  - live vote state is restored.
  - votes entered remain.

### TC-53: Resume during defense
- Steps:
  1. Enter defense mode.
  2. Refresh.
- Expected:
  - defense candidate and timer state resume correctly.

### TC-54: Resume during night flow
- Steps:
  1. Start a night and leave before resolving it.
  2. Refresh.
- Expected:
  - in-progress night state resumes appropriately.
  - no role information is leaked in the public state.

### TC-55: Corrupt or stale local storage recovery
- Steps:
  1. Manually tamper with the local storage state.
  2. Reload the app.
- Expected:
  - app recovers gracefully.
  - no crashing or blank screen.
  - valid fallback state is restored.

---

## H. Privacy, correctness, and anti-leak checks

### TC-56: Secret roles remain hidden during group-visible phases
- Steps:
  1. Open the app during a game pause or discussion.
- Expected:
  - no player sees secret role text in public screens.

### TC-57: Role reveal uses hold-to-peek only
- Steps:
  1. Inspect reveal interaction.
- Expected:
  - role appears only during the hold action.
  - there is no permanent role display on the public screen.

### TC-58: Public announcements omit secret role data
- Steps:
  1. Resolve a night with doctor save and sheriff interaction.
- Expected:
  - the morning report names the affected player but not hidden role details unless game end requires full reveal.

### TC-59: Day winner checks happen after every death event
- Steps:
  1. Progress through sequences causing deaths.
- Expected:
  - win state is evaluated after each event.

---

## I. Offline/PWA checks

### TC-60: App loads without network access
- Steps:
  1. Disconnect from the network after first load.
  2. Reload the app.
- Expected:
  - app still loads in offline mode.

### TC-61: State persists offline
- Steps:
  1. Play a game with browser offline.
  2. Reload.
- Expected:
  - local state remains available without a server.

### TC-62: Installability/PWA shell works
- Steps:
  1. Trigger install flow or browser install prompt if available.
- Expected:
  - app can install as a standalone app.

---

## J. Regression / edge scenarios

### TC-63: 7-player setup with roleless game
- Expected: valid start, no invalid role mix errors.

### TC-64: 15-player setup with roles and full role set
- Expected: all role combinations remain valid and manageable.

### TC-65: Determine winning parity when one mafia remains and town count matches
- Expected: mafia win triggers exactly at parity threshold.

### TC-66: Doctor repeats self-protection allowed
- Expected: doctor can protect self without error.

### TC-67: Sheriff self-kill override
- Expected: when the sheriff targets an innocent player, the sheriff dies despite doctor protection not applying.

### TC-68: Detective result is not publicly revealed
- Expected: no public UI leaks the detective result at the time it is determined.

### TC-69: Morning report with no deaths
- Expected: message states no one died overnight.

### TC-70: Morning report with multiple deaths
- Expected: all names are shown correctly and in order.

---

## Pass/fail record template

| Test ID | Result | Date | Tester | Notes |
|---|---|---|---|---|
| TC-01 |  |  |  |  |
| TC-02 |  |  |  |  |
| TC-03 |  |  |  |  |
| TC-04 |  |  |  |  |
| TC-05 |  |  |  |  |
| TC-06 |  |  |  |  |
| TC-07 |  |  |  |  |
| TC-08 |  |  |  |  |
| TC-09 |  |  |  |  |
| TC-10 |  |  |  |  |
| TC-11 |  |  |  |  |
| TC-12 |  |  |  |  |
| TC-13 |  |  |  |  |
| TC-14 |  |  |  |  |
| TC-15 |  |  |  |  |
| TC-16 |  |  |  |  |
| TC-17 |  |  |  |  |
| TC-18 |  |  |  |  |
| TC-19 |  |  |  |  |
| TC-20 |  |  |  |  |
| TC-21 |  |  |  |  |
| TC-22 |  |  |  |  |
| TC-23 |  |  |  |  |
| TC-24 |  |  |  |  |
| TC-25 |  |  |  |  |
| TC-26 |  |  |  |  |
| TC-27 |  |  |  |  |
| TC-28 |  |  |  |  |
| TC-29 |  |  |  |  |
| TC-30 |  |  |  |  |
| TC-31 |  |  |  |  |
| TC-32 |  |  |  |  |
| TC-33 |  |  |  |  |
| TC-34 |  |  |  |  |
| TC-35 |  |  |  |  |
| TC-36 |  |  |  |  |
| TC-37 |  |  |  |  |
| TC-38 |  |  |  |  |
| TC-39 |  |  |  |  |
| TC-40 |  |  |  |  |
| TC-41 |  |  |  |  |
| TC-42 |  |  |  |  |
| TC-43 |  |  |  |  |
| TC-44 |  |  |  |  |
| TC-45 |  |  |  |  |
| TC-46 |  |  |  |  |
| TC-47 |  |  |  |  |
| TC-48 |  |  |  |  |
| TC-49 |  |  |  |  |
| TC-50 |  |  |  |  |
| TC-51 |  |  |  |  |
| TC-52 |  |  |  |  |
| TC-53 |  |  |  |  |
| TC-54 |  |  |  |  |
| TC-55 |  |  |  |  |
| TC-56 |  |  |  |  |
| TC-57 |  |  |  |  |
| TC-58 |  |  |  |  |
| TC-59 |  |  |  |  |
| TC-60 |  |  |  |  |
| TC-61 |  |  |  |  |
| TC-62 |  |  |  |  |
| TC-63 |  |  |  |  |
| TC-64 |  |  |  |  |
| TC-65 |  |  |  |  |
| TC-66 |  |  |  |  |
| TC-67 |  |  |  |  |
| TC-68 |  |  |  |  |
| TC-69 |  |  |  |  |
| TC-70 |  |  |  |  |

---

## Acceptance criteria
The app is considered ready for full use when:
- all setup checks pass
- roleless and roles gameplay both pass
- privacy rules are never violated
- the app survives reloads and restores state correctly
- tie/runoff logic resolves without silent errors
- end-game reveal and new game behavior are correct
- offline and install behavior are acceptable
