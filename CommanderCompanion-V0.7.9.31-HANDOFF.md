# Commander Companion V0.7.9.31 — Handoff / Save Point

## Authoritative build
V0.7.9.31 is the current continuation build, based directly on V0.7.9.30.

## Scope of this hotfix
The screenshot showed the game in Cleanup with a tracked hand of 8 and the toast “A required confirmation is still pending.” The game log also contained a completed no-attack combat acknowledgement, which initially made the stale combat gate suspicious.

The actual failure had two related paths:
1. `phaseGates` could remain stale if combat code changed `game.phase` directly rather than through the normal phase transaction.
2. Cleanup correctly required a discard when hand size was over seven, but `advancePhase()` checked the lock before opening the cleanup discard UI. That created an unactionable soft lock, especially outside Fully Tracked mode.

## Fixes
- `phaseLocked()` now rebuilds the gates for the current phase before deciding whether the game is locked. Old combat gates therefore cannot linger into later phases.
- `advancePhase()` reconciles gates first and routes an unsatisfied Cleanup discard gate to `openCleanupDiscard()` instead of the generic warning.
- After cleanup discard finishes, phase progression continues into the normal End Turn confirmation flow.
- `endTurn()` now enforces the tracked hand-size cleanup requirement in Cleanup regardless of whether the overall mode is Fully Tracked.

## Preserve from V0.7.9.30
Do not alter unrelated visual or interaction code. In particular preserve:
- Graveyard / Exile / Tokens / Attachments card zones.
- Empty battlefield placeholder rectangles removed.
- Continuous battlefield playmat treatment and enlarged battlefield cards.
- No floating DRAW label/button.
- Player-specific full-card palette treatment.
- Heart/life icon red for all players; life number color-coded by player palette.
- Card ID search input hotfix.
- Basic lands enter untapped unless a real rule/card effect says otherwise.
- Battlefield cards are tappable for card details.
- Game Log Undo behavior and protected bottom actions.
- Home confirmation behavior.
- Conditional Secondary Commander setup behavior.

## Packaging rule
Future builds must use upload folders of at most 99 files named `Uploaded 1st`, `Uploaded 2nd`, etc.

## Verification performed for V0.7.9.31
- `node --check app.js` passed.
- `node --check phase.js` passed.
- Static source verification confirms Cleanup discard routing occurs before generic phase-lock toast.
- Static source verification confirms current-phase gate reconciliation.
- ZIP integrity verified after packaging.
